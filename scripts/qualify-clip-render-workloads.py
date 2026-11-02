#!/usr/bin/env python3
"""Opt-in, local-only synthetic render qualification; never host capacity proof."""
import argparse
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import time

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
REPO = HERE.parent
module = importlib.util.spec_from_file_location('supervisor', HERE / 'lib/clip-workload-supervisor.py')
supervisor = importlib.util.module_from_spec(module)
module.loader.exec_module(supervisor)
MAX_BYTES = 5 * 1024 ** 3
TIERS = {
    'smoke': {'long_seconds': 30, 'phone_seconds': 4, 'large_seconds': 1,
              'minimum': {'cpu_count': 2, 'memory_mib': 1536, 'disk_mib': 2048, 'wall_seconds': 180}},
    'representative': {'long_seconds': 600, 'phone_seconds': 12, 'large_seconds': 10,
                       'minimum': {'cpu_count': 2, 'memory_mib': 1536, 'disk_mib': 4096, 'wall_seconds': 600}},
    'maximum-contract': {'long_seconds': 9000, 'phone_seconds': 120, 'large_seconds': 90,
                         'minimum': {'cpu_count': 4, 'memory_mib': 4096, 'disk_mib': 18432, 'wall_seconds': 3600}},
}
NOT_QUALIFIED = [
    'Actual Hetzner or other production hardware capacity',
    'Sustained load, maximum concurrency, p95 latency or millions of users',
    'Production queue/lease/pool disk admission and full worker lifecycle',
    'Source download, malware scan, storage-provider upload or network transfer',
    'Real creator media distribution, HDR/Dolby Vision or every codec/profile',
    '150-minute whole-source export and full 5-GiB/16384-pixel cross-product',
]


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def source_identities():
    names = ['scripts/qualify-clip-render-workloads.py', 'scripts/lib/clip-workload-supervisor.py',
             'scripts/lib/clip-workload-media-wrapper.py', 'scripts/lib/clip-render-workload-job.mjs',
             'scripts/lib/clip-render-core.mjs', 'scripts/lib/clip-render-color.mjs']
    return {name: sha256(REPO / name) for name in names}


def make_plan(tier, budget):
    spec = TIERS[tier]
    for key, minimum in spec['minimum'].items():
        if budget[key] < minimum:
            raise ValueError('tier_budget_below_minimum:' + key)
    return {'tier': tier, 'requested_budget': budget, 'fixtures': [
        {'id': 'long-1080p', 'width': 1920, 'height': 1080, 'seconds': spec['long_seconds'],
         'codec': 'h264', 'audio': 'aac', 'vbr_maxrate_bps': 4000000 if tier == 'maximum-contract' else None},
        {'id': 'phone-h264-4k', 'width': 3840, 'height': 2160, 'seconds': spec['phone_seconds'],
         'codec': 'h264', 'audio': 'aac', 'rotation': 90, 'vfr': True},
        {'id': 'phone-hevc-vfr-4k', 'width': 3840, 'height': 2160, 'seconds': spec['phone_seconds'],
         'codec': 'hevc', 'audio': 'aac', 'rotation': 90, 'vfr': True, 'pixel_format': 'yuv420p10le'},
        {'id': 'large-lossless-h264', 'width': 1920, 'height': 1080, 'seconds': spec['large_seconds'],
         'codec': 'h264', 'audio': 'aac', 'content': 'encoded temporal uniform noise; no padding',
         'file_cap_bytes': int(4.5 * 1024 ** 3)},
    ], 'not_qualified': NOT_QUALIFIED, 'product_input_limit_bytes': MAX_BYTES,
        'product_input_duration_seconds': 9000, 'export_scope': 'short clips, not whole-source encoding'}


def generator_args(fixture, output):
    width, height = fixture['width'], fixture['height']
    video = f'testsrc2=size={width}x{height}:rate=30'
    if fixture['id'] == 'large-lossless-h264':
        video += ',noise=alls=100:allf=t+u:all_seed=37'
    args = ['-nostdin', '-v', 'error', '-n', '-filter_threads', '2', '-threads', '2',
            '-f', 'lavfi', '-i', video, '-f', 'lavfi', '-i', 'sine=frequency=523:sample_rate=48000',
            '-t', str(fixture['seconds']), '-map', '0:v:0', '-map', '1:a:0']
    filters = []
    if fixture.get('vfr'):
        filters.append("select='not(eq(mod(n,4),1))'")
    if fixture['codec'] == 'hevc':
        filters.append('format=yuv420p10le')
        args += ['-c:v', 'libx265', '-preset', 'ultrafast', '-tune', 'zerolatency', '-crf', '23',
                 '-x265-params', 'pools=none:frame-threads=1:wpp=0:ctu=64:ref=1', '-tag:v', 'hvc1']
    else:
        args += ['-c:v', 'libx264', '-preset', 'ultrafast']
        args += ['-qp', '0'] if fixture['id'] == 'large-lossless-h264' else ['-crf', '23']
    if filters:
        args += ['-vf', ','.join(filters)]
    if fixture.get('vfr'):
        args += ['-fps_mode', 'vfr']
    if fixture.get('vbr_maxrate_bps'):
        args += ['-maxrate', str(fixture['vbr_maxrate_bps']), '-bufsize', '8000000']
    args += ['-threads', '2', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart']
    if fixture.get('file_cap_bytes'):
        args += ['-fs', str(fixture['file_cap_bytes'])]
    return args + [str(output)]


def rotation_args(encoded, output):
    # Input display-matrix override survives stream copy. Setting an output
    # rotate tag alone did not produce side data in the measured FFmpeg 7 run.
    return ['-nostdin', '-v', 'error', '-n', '-display_rotation', '90', '-i', str(encoded),
            '-map', '0', '-c', 'copy', str(output)]


def execute(plan, root, budget, keep):
    started = time.monotonic()
    binaries = {name: shutil.which(name) for name in ['ffmpeg', 'ffprobe', 'node']}
    if not all(binaries.values()):
        raise ValueError('existing_media_or_node_binary_missing')
    root.mkdir(mode=0o700)
    media = root / 'media'
    media.mkdir(mode=0o700)
    report = {**plan, 'status': 'running', 'started_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
              'work_root': str(root), 'TMPDIR': str(root / 'tmp'), 'source_sha256': source_identities(),
              'versions': {'kernel': platform.release(), 'python': platform.python_version()},
              'host_preflight': supervisor.collect_host(root), 'stages': [], 'actual_fixtures': [],
              'render_jobs': [], 'unexecuted_local_jobs': ['serial', 'concurrent', 'cancel-direct', 'malformed-source', 'source-rehash']}
    for name in ['ffmpeg', 'ffprobe', 'node']:
        flag = '--version' if name == 'node' else '-version'
        report['versions'][name] = subprocess.check_output([binaries[name], flag], text=True, timeout=10).splitlines()[0]

    def save():
        pending = root / 'report.pending.json'
        pending.write_text(json.dumps(report, indent=2) + '\n')
        pending.replace(root / 'report.json')

    def batch(name, commands, concurrency=1, cancel=None):
        remaining = budget['wall_seconds'] - (time.monotonic() - started)
        if remaining < 1:
            raise ValueError('overall_wall_deadline_exceeded')
        result = supervisor.run_batch(commands, root=root, budget={**budget, 'wall_seconds': remaining},
                                      concurrency=concurrency, cancel_job=cancel)
        report['stages'].append({'name': name, **result})
        save()
        if not result['ok']:
            raise ValueError(result['failure'])
        return result

    def command(identity, args, env=None):
        return {'id': identity, 'args': args, 'env': env or {}}

    def ffmpeg(identity, args):
        return batch(identity, [command(identity, [binaries['ffmpeg'], *args])])

    def hash_measure(path):
        wall, cpu = time.monotonic(), time.process_time()
        digest = sha256(path)
        return {'sha256': digest, 'wall_seconds': time.monotonic() - wall,
                'cpu_seconds': time.process_time() - cpu, 'bytes': path.stat().st_size,
                'scope': 'local streaming read only, not provider transfer'}

    try:
        save()
        for fixture in plan['fixtures']:
            identity = fixture['id']
            output = media / (identity + '.mp4')
            encoded = media / (identity + '-unrotated.mp4') if fixture.get('rotation') else output
            ffmpeg('generate-' + identity, generator_args(fixture, encoded))
            if fixture.get('rotation'):
                ffmpeg('rotate-' + identity, rotation_args(encoded, output))
                encoded.unlink()
            metadata = root / (identity + '-probe.json')
            batch('probe-' + identity, [command('probe-' + identity, [binaries['ffprobe'], '-v', 'error',
                '-protocol_whitelist', 'file,pipe', '-format_whitelist', 'mov', '-show_streams', '-show_format',
                '-of', 'json', '-o', str(metadata), str(output)])])
            probe = json.loads(metadata.read_text())
            video = next(stream for stream in probe['streams'] if stream['codec_type'] == 'video')
            audio = next(stream for stream in probe['streams'] if stream['codec_type'] == 'audio')
            duration = float(probe['format']['duration'])
            rotation = next((item['rotation'] for item in video.get('side_data_list', []) if 'rotation' in item), 0)
            if not 0 < output.stat().st_size < MAX_BYTES or not 0 < duration <= 9000:
                raise ValueError('synthetic_fixture_outside_product_contract')
            if (video['width'], video['height'], video['codec_name']) != (fixture['width'], fixture['height'], fixture['codec']):
                raise ValueError('synthetic_fixture_video_mismatch')
            if fixture.get('rotation') and abs(rotation) != 90:
                raise ValueError('synthetic_fixture_rotation_missing')
            if fixture.get('vfr') and video['avg_frame_rate'] == video['r_frame_rate']:
                raise ValueError('synthetic_fixture_vfr_missing')
            if audio['codec_name'] != 'aac':
                raise ValueError('synthetic_fixture_audio_mismatch')
            ffmpeg('decode-' + identity, ['-nostdin', '-v', 'error', '-xerror', '-filter_threads', '2', '-threads', '2',
                    '-protocol_whitelist', 'file,pipe', '-format_whitelist', 'mov', '-i', str(output), '-f', 'null', '-'])
            report['actual_fixtures'].append({'id': identity, 'duration_seconds': duration,
                'video': {key: video.get(key) for key in ['codec_name', 'profile', 'width', 'height', 'pix_fmt', 'r_frame_rate', 'avg_frame_rate', 'sample_aspect_ratio']},
                'rotation': rotation, 'audio': {key: audio.get(key) for key in ['codec_name', 'sample_rate', 'channels']},
                'full_decode_passed': True, 'local_hash': hash_measure(output)})
            save()

        mark = media / 'mark.png'
        ffmpeg('generate-watermark', ['-nostdin', '-v', 'error', '-n', '-f', 'lavfi', '-i',
                'color=c=orange:size=96x32', '-frames:v', '1', '-threads', '1', str(mark)])
        bindir = root / 'bin'
        bindir.mkdir()
        wrapper = HERE / 'lib/clip-workload-media-wrapper.py'
        for name in ['ffmpeg', 'ffprobe']:
            (bindir / name).symlink_to(wrapper)

        def job(identity, fixture, direct=False, expected=None):
            source = media / (fixture['id'] + '.mp4')
            duration = fixture['duration_seconds']
            seconds = min(8 if fixture['id'] == 'long-1080p' else 3, duration)
            start = max(0, duration - seconds - 0.5)
            if direct:
                start, seconds = 0, min(30, duration)
            mark_enabled = fixture['id'] == 'long-1080p' and not direct
            edit = {'clip_format': 'vertical_9_16' if 'phone' in fixture['id'] else 'square_1_1',
                    'fit_mode': 'fit' if mark_enabled else 'fill', 'trim_start_ms': int(start * 1000),
                    'trim_end_ms': int((start + seconds) * 1000), 'brand_mark_enabled': mark_enabled,
                    'brand_asset_id': 'synthetic-mark' if mark_enabled else None}
            phases = root / (identity + '-phases')
            spec = {'resultPath': str(root / (identity + '-result.json')), 'expectedError': expected,
                    'render': {'inputPath': str(source), 'outputPath': str(media / (identity + '-export.mp4')),
                               'watermarkPath': str(mark) if mark_enabled else None, 'edit': edit,
                               'ffmpeg': binaries['ffmpeg'] if direct else str(bindir / 'ffmpeg'),
                               'ffprobe': binaries['ffprobe'] if direct else str(bindir / 'ffprobe')}}
            if expected == 'media_process_failed':
                malformed = media / 'malformed.mp4'
                malformed.write_bytes(b'not a media container\n')
                spec['render']['inputPath'] = str(malformed)
            path = root / (identity + '-spec.json')
            path.write_text(json.dumps(spec))
            env = {'CLIP_WORKLOAD_REAL_FFMPEG': binaries['ffmpeg'], 'CLIP_WORKLOAD_REAL_FFPROBE': binaries['ffprobe'],
                   'CLIP_WORKLOAD_PHASE_DIR': str(phases), 'CLIP_WORKLOAD_MEDIA_TIMEOUT_SECONDS': str(budget['wall_seconds'])}
            return command(identity, [binaries['node'], str(HERE / 'lib/clip-render-workload-job.mjs'), str(path)], env)

        def render_batch(name, commands, concurrency=1, cancel=None):
            result = batch(name, commands, concurrency, cancel)
            for cmd in commands:
                identity = cmd['id']
                measured = json.loads((root / (identity + '-result.json')).read_text())
                if not measured['ok']:
                    raise ValueError('render_job_result_failed:' + identity)
                spec = json.loads((root / (identity + '-spec.json')).read_text())
                phases = [json.loads(path.read_text()) for path in sorted(root.glob(identity + '-phases/*.json'))]
                report['render_jobs'].append({'id': identity, 'edit': spec['render']['edit'], **measured, 'phases': phases})
            report['unexecuted_local_jobs'].remove(name)
            save()
            return result

        fixtures = report['actual_fixtures']
        render_batch('serial', [job('serial-' + fixture['id'], fixture) for fixture in fixtures])
        concurrent = render_batch('concurrent', [job('parallel-' + fixture['id'], fixture) for fixture in fixtures], 2)
        if concurrent['active_transcodes_peak'] < 2:
            raise ValueError('two_actual_overlapping_transcodes_not_observed')
        render_batch('cancel-direct', [job('cancel-direct', fixtures[0], direct=True, expected='render_canceled')], cancel='cancel-direct')
        render_batch('malformed-source', [job('malformed-source', fixtures[0], expected='media_process_failed')])
        for fixture in fixtures:
            after = hash_measure(media / (fixture['id'] + '.mp4'))
            fixture['local_hash_after'] = after
            if after['sha256'] != fixture['local_hash']['sha256']:
                raise ValueError('source_mutated')
        report['unexecuted_local_jobs'].remove('source-rehash')
        report['status'] = 'passed_local_scope_only'
    except (Exception, KeyboardInterrupt) as error:
        report['status'] = 'failed_or_interrupted'
        report['failure'] = str(error) if isinstance(error, ValueError) else type(error).__name__
    finally:
        report['elapsed_seconds'] = time.monotonic() - started
        report['generated_media_retained'] = keep
        if not keep:
            shutil.rmtree(media)
        save()
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tier', choices=TIERS, required=True)
    parser.add_argument('--work-root', type=Path, required=True)
    for flag in ['cpu-count', 'memory-mib', 'disk-mib', 'wall-seconds']:
        parser.add_argument('--' + flag, type=int, required=True)
    parser.add_argument('--execute', action='store_true')
    parser.add_argument('--keep-fixtures', action='store_true')
    args = parser.parse_args()
    budget = {key: getattr(args, key) for key in ['cpu_count', 'memory_mib', 'disk_mib', 'wall_seconds']}
    root = args.work_root
    try:
        if not root.is_absolute() or root.exists() or root.parent.resolve() != root.parent or root.is_relative_to('/tmp'):
            raise ValueError('new_absolute_workspace_directory_required_not_tmp')
        plan = make_plan(args.tier, budget)
        host = supervisor.collect_host(root.parent)
        supervisor.validate_budget(host, budget)
        if not args.execute:
            print(json.dumps({**plan, 'status': 'plan_only_no_media_executed', 'host_preflight': host}, indent=2))
            return 0
        # All cooperating heavy suites use the same lock. Preflight again after
        # acquisition: a queued lock is not a reservation of available memory.
        with open('/tmp/renderer-heavy-tests.lock', 'a') as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise ValueError('heavy_test_lock_busy') from None
            supervisor.validate_budget(supervisor.collect_host(root.parent), budget)
            report = execute(plan, root, budget, args.keep_fixtures)
        print(json.dumps({'status': report['status'], 'failure': report.get('failure'), 'report': str(root / 'report.json')}))
        return 0 if report['status'] == 'passed_local_scope_only' else 1
    except ValueError as error:
        print(json.dumps({'status': 'preflight_refused', 'failure': str(error), 'no_workload_started': True}))
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
