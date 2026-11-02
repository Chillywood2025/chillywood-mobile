"""Local synthetic-workload supervision, not a production/cgroup resource limit.

RSS and process CPU are sampled at 100 ms and can miss short-lived peaks. A
large memory reserve supplements the sampled stop guard. CPU affinity is an
execution bound, not evidence equivalent to dedicated or shared provider vCPUs.
"""

import math
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
import time

MIB = 1024 ** 2
GIB = 1024 ** 3
SAMPLE_SECONDS = 0.1


def _read(path):
    try:
        return Path(path).read_text().strip()
    except (OSError, UnicodeError):
        return None


def collect_host(root):
    """Inspect only local public resource metadata; unavailable quotas stay unknown."""
    root = Path(root).resolve(strict=True)
    if not root.is_dir():
        raise ValueError('scratch_root_not_directory')
    memory = {}
    for line in (_read('/proc/meminfo') or '').splitlines():
        parts = line.split()
        if len(parts) >= 2 and parts[0] in ('MemAvailable:', 'MemTotal:'):
            memory[parts[0][:-1]] = int(parts[1]) * 1024
    affinity = sorted(os.sched_getaffinity(0)) if hasattr(os, 'sched_getaffinity') else []
    filesystem = os.statvfs(root)
    memory_max = _read('/sys/fs/cgroup/memory.max')
    memory_current = _read('/sys/fs/cgroup/memory.current')
    cpu_max = _read('/sys/fs/cgroup/cpu.max')
    membership = _read('/proc/self/cgroup')
    # Root observations cannot establish the effective limit of a nested cgroup.
    # Do not guess a mount-relative path or accidentally qualify a larger host.
    root_membership = membership == '0::/'
    cgroup_memory_available = None
    if root_membership and memory_max and memory_max.isdigit() and memory_current and memory_current.isdigit():
        cgroup_memory_available = max(0, int(memory_max) - int(memory_current))
    cpu_quota_cores = None
    if root_membership and cpu_max:
        parts = cpu_max.split()
        if len(parts) == 2 and all(part.isdigit() for part in parts) and int(parts[1]) > 0:
            cpu_quota_cores = int(parts[0]) / int(parts[1])
    available = memory.get('MemAvailable')
    if available is not None and cgroup_memory_available is not None:
        available = min(available, cgroup_memory_available)
    return {
        'memory_available_bytes': available,
        'memory_total_bytes': memory.get('MemTotal'),
        'cpu_affinity': affinity,
        'disk_free_bytes': filesystem.f_bavail * filesystem.f_frsize,
        'disk_total_bytes': filesystem.f_blocks * filesystem.f_frsize,
        'cgroup': {
            'membership': membership,
            'memory_max': memory_max,
            'memory_current': memory_current,
            'cpu_max': cpu_max,
            'cpu_quota_cores': cpu_quota_cores,
            'root_files_only': True,
            'nested_effective_limit_unresolved': not root_membership,
            'status': ('quota_unknown_nested_root_only' if not root_membership else
                'observed_v2_root_files' if memory_max is not None and cpu_max is not None else 'quota_unknown_not_exposed'),
        },
        'sampling_note': 'Process-tree RSS is sampled, not cgroup peak memory. CPU affinity is not provider-vCPU equivalence.',
    }


def validate_budget(host, budget):
    """Fail before starting work when explicit resources or safety reserves are missing."""
    required = {'cpu_count', 'memory_mib', 'disk_mib', 'wall_seconds'}
    if not isinstance(budget, dict) or not required.issubset(budget):
        raise ValueError('explicit_resource_budget_required')
    for key in required:
        if isinstance(budget[key], bool) or not isinstance(budget[key], (int, float)) or not math.isfinite(budget[key]):
            raise ValueError('invalid_resource_budget:' + key)
    cpu_count = budget['cpu_count']
    if int(cpu_count) != cpu_count or not 1 <= cpu_count <= 8:
        raise ValueError('cpu_budget_out_of_range')
    if len(host.get('cpu_affinity') or []) < cpu_count:
        raise ValueError('cpu_affinity_budget_unavailable')
    quota = host.get('cgroup', {}).get('cpu_quota_cores')
    if quota is not None and cpu_count > quota:
        raise ValueError('cpu_cgroup_quota_below_budget')
    if int(budget['memory_mib']) != budget['memory_mib'] or budget['memory_mib'] < 256:
        raise ValueError('memory_budget_out_of_range')
    if int(budget['disk_mib']) != budget['disk_mib'] or budget['disk_mib'] < 1:
        raise ValueError('disk_budget_out_of_range')
    if not 1 <= budget['wall_seconds'] <= 7200:
        raise ValueError('deadline_budget_out_of_range')
    memory_bytes = int(budget['memory_mib']) * MIB
    disk_bytes = int(budget['disk_mib']) * MIB
    available = host.get('memory_available_bytes')
    if available is None or available < 2 * memory_bytes + GIB:
        raise ValueError('memory_budget_and_reserve_unavailable')
    if host.get('disk_free_bytes', 0) < disk_bytes + 2 * GIB:
        raise ValueError('disk_budget_and_reserve_unavailable')
    return {
        **budget, 'cpu_count': int(cpu_count),
        'selected_cpus': host['cpu_affinity'][:int(cpu_count)],
        'memory_bytes': memory_bytes, 'disk_bytes': disk_bytes,
        'memory_reserve_bytes': GIB, 'disk_reserve_bytes': 2 * GIB,
        'sample_seconds': SAMPLE_SECONDS,
    }


def _processes():
    result = []
    for entry in Path('/proc').iterdir():
        if not entry.name.isdigit():
            continue
        try:
            raw = (entry / 'stat').read_text()
            end = raw.rindex(')')
            values = raw[end + 2:].split()
            command = (entry / 'cmdline').read_bytes().split(b'\0')
            result.append({
                'pid': int(entry.name), 'state': values[0],
                'group': int(values[2]), 'session': int(values[3]),
                'ticks': int(values[11]) + int(values[12]),
                'start_ticks': int(values[19]),
                'rss': max(0, int(values[21])) * os.sysconf('SC_PAGE_SIZE'),
                'transcode': bool(command) and Path(os.fsdecode(command[0])).name == 'ffmpeg'
                    and b'-filter_complex' in command,
            })
        except (OSError, UnicodeError, ValueError, IndexError):
            continue  # A process may exit between /proc directory and stat reads.
    return result


def _disk_usage(root):
    logical = allocated = 0
    for directory, _, files in os.walk(root, followlinks=False):
        for filename in files:
            try:
                info = os.stat(os.path.join(directory, filename), follow_symlinks=False)
                if stat.S_ISREG(info.st_mode):
                    logical += info.st_size
                    allocated += info.st_blocks * 512
            except FileNotFoundError:
                pass
    free = os.statvfs(root)
    return logical, allocated, free.f_bavail * free.f_frsize


def _members(processes, leader):
    return [item for item in processes if item['group'] == leader and item['session'] == leader and item['state'] != 'Z']


def _kill_group(leader, sig):
    try:
        os.killpg(leader, sig)
    except ProcessLookupError:
        pass


def _cleanup_groups(leaders):
    """Only process groups created by this run are targeted."""
    leaders = set(leaders)
    for leader in leaders:
        _kill_group(leader, signal.SIGTERM)
    deadline = time.monotonic() + 0.5
    remaining = []
    while time.monotonic() < deadline:
        processes = _processes()
        remaining = [leader for leader in leaders if _members(processes, leader)]
        if not remaining:
            return
        time.sleep(0.025)
    for leader in remaining:
        _kill_group(leader, signal.SIGKILL)


def run_batch(commands, *, root, budget, concurrency=1, cancel_job=None):
    """Run trusted local synthetic commands with bounded admission and owned cleanup.

    Commands write their own sanitized evidence; stdout/stderr are /dev/null.
    A cancellation signal is only an observation. The caller must also verify its
    render result says canceled, and must not credit supervisor cleanup as a
    successful production cancellation.
    """
    host = collect_host(root)
    limits = validate_budget(host, budget)
    root = Path(root).resolve(strict=True)
    if not isinstance(concurrency, int) or isinstance(concurrency, bool) or not 1 <= concurrency <= limits['cpu_count']:
        raise ValueError('concurrency_outside_cpu_budget')
    ids = set()
    for command in commands:
        identity = command.get('id')
        args = command.get('args')
        if not isinstance(identity, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,100}', identity) or identity in ids:
            raise ValueError('invalid_or_duplicate_command_id')
        if not isinstance(args, list) or not args or not all(isinstance(arg, str) and '\0' not in arg for arg in args):
            raise ValueError('invalid_command_arguments')
        if not isinstance(command.get('env', {}), dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in command.get('env', {}).items()):
            raise ValueError('invalid_command_environment')
        exits = command.get('expected_exit', [0])
        if not isinstance(exits, list) or not exits or not all(isinstance(code, int) for code in exits):
            raise ValueError('invalid_expected_exit')
        ids.add(identity)
    if cancel_job is not None and cancel_job not in ids:
        raise ValueError('cancel_job_missing')
    started = time.monotonic()
    active = {}
    results = []
    groups = set()
    seen_ticks = {}
    next_index = 0
    failure = None
    peak_rss = peak_logical = peak_allocated = max_active = transcodes_peak = 0
    min_free = host['disk_free_bytes']
    min_memory_available = host['memory_available_bytes']
    samples = 0
    cleanup_groups = set()

    def launch(command):
        env = os.environ.copy()
        env['TMPDIR'] = str(root / 'tmp')
        env.update(command.get('env', {}))
        Path(env['TMPDIR']).mkdir(mode=0o700, parents=True, exist_ok=True)
        launched = time.monotonic()
        process = subprocess.Popen(command['args'], cwd=root, env=env,
            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            start_new_session=True,
            preexec_fn=lambda: os.sched_setaffinity(0, set(limits['selected_cpus'])))
        groups.add(process.pid)
        active[process.pid] = {
            'process': process, 'command': command, 'launched': launched,
            'id': command['id'], 'queue_wait_seconds': launched - started,
            'peak_sampled_rss_bytes': 0, 'sampled_cpu_seconds': 0,
            'observed_processes': set(), 'cancel_signal_sent': False,
            'cancel_signal_after_seconds': None, 'live_descendants_after_exit': 0,
            'supervisor_cleanup_performed': False,
        }

    def finish(leader, status, usage):
        nonlocal failure
        item = active.pop(leader)
        process = item.pop('process')
        process.returncode = os.waitstatus_to_exitcode(status)
        command = item.pop('command')
        item['wall_seconds'] = time.monotonic() - item.pop('launched')
        item['return_code'] = process.returncode
        item['expected_exit'] = command.get('expected_exit', [0])
        item['exit_rusage_user_seconds'] = usage.ru_utime
        item['exit_rusage_system_seconds'] = usage.ru_stime
        item['exit_rusage_maxrss_kib'] = usage.ru_maxrss
        item['observed_process_count'] = len(item.pop('observed_processes'))
        remaining = _members(_processes(), leader)
        item['live_descendants_after_exit'] = len(remaining)
        if remaining:
            item['supervisor_cleanup_performed'] = True
            cleanup_groups.add(leader)
            _cleanup_groups([leader])
            failure = failure or 'descendants_left_after_exit:' + item['id']
        # Retire empty groups after reaping their leader. Historical numeric
        # PGIDs must never enter later exception cleanup after PID reuse.
        if not _members(_processes(), leader):
            groups.discard(leader)
        if process.returncode not in item['expected_exit']:
            failure = failure or 'unexpected_exit:' + item['id']
        if item['id'] == cancel_job and not item['cancel_signal_sent']:
            failure = failure or 'cancel_transcode_not_observed:' + item['id']
        item['status'] = 'passed' if process.returncode in item['expected_exit'] and not remaining and not item['supervisor_cleanup_performed'] else 'failed'
        results.append(item)

    try:
        while active or next_index < len(commands):
            if time.monotonic() - started >= limits['wall_seconds']:
                failure = failure or 'wall_deadline_exceeded'
            logical, allocated, free = _disk_usage(root)
            peak_logical, peak_allocated = max(peak_logical, logical), max(peak_allocated, allocated)
            min_free = min(min_free, free)
            if max(logical, allocated) > limits['disk_bytes']:
                failure = failure or 'scratch_disk_budget_exceeded'
            if free < limits['disk_reserve_bytes']:
                failure = failure or 'scratch_free_reserve_exhausted'
            memory_available = collect_host(root)['memory_available_bytes']
            if memory_available is None or memory_available < limits['memory_reserve_bytes']:
                failure = failure or 'available_memory_reserve_exhausted'
            if memory_available is not None:
                min_memory_available = min(min_memory_available, memory_available)
            if failure:
                break
            while next_index < len(commands) and len(active) < concurrency:
                launch(commands[next_index])
                next_index += 1
            max_active = max(max_active, len(active))
            processes = _processes()
            aggregate_rss = transcodes = 0
            for leader, item in list(active.items()):
                members = _members(processes, leader)
                rss = sum(member['rss'] for member in members)
                aggregate_rss += rss
                transcodes += sum(member['transcode'] for member in members)
                item['peak_sampled_rss_bytes'] = max(item['peak_sampled_rss_bytes'], rss)
                for member in members:
                    key = (member['pid'], member['start_ticks'])
                    previous = seen_ticks.get(key, 0)
                    item['sampled_cpu_seconds'] += max(0, member['ticks'] - previous) / os.sysconf('SC_CLK_TCK')
                    seen_ticks[key] = member['ticks']
                    item['observed_processes'].add(key)
                elapsed = time.monotonic() - item['launched']
                if item['id'] == cancel_job:
                    if not item['cancel_signal_sent'] and any(member['transcode'] for member in members):
                        try:
                            os.kill(leader, signal.SIGUSR1)
                            item['cancel_signal_sent'] = True
                            item['cancel_signal_after_seconds'] = elapsed
                        except ProcessLookupError:
                            pass  # A short job can finish between observation and signal.
                    elif not item['cancel_signal_sent'] and elapsed > 30:
                        failure = failure or 'cancel_transcode_observation_timeout'
                    elif item['cancel_signal_sent'] and elapsed - item['cancel_signal_after_seconds'] > 10:
                        failure = failure or 'cancel_completion_timeout'
                waited, status, usage = os.wait4(leader, os.WNOHANG)
                if waited:
                    finish(leader, status, usage)
            peak_rss = max(peak_rss, aggregate_rss)
            transcodes_peak = max(transcodes_peak, transcodes)
            samples += 1
            if aggregate_rss > limits['memory_bytes']:
                failure = failure or 'sampled_memory_budget_exceeded'
            if failure:
                break
            if active or next_index < len(commands):
                time.sleep(SAMPLE_SECONDS)
    except BaseException:
        _cleanup_groups(groups)
        raise
    finally:
        if active:
            cleanup_groups.update(active)
            for item in active.values():
                item['supervisor_cleanup_performed'] = True
            _cleanup_groups(active)
            for leader in list(active):
                waited, status, usage = os.wait4(leader, 0)
                finish(waited, status, usage)
    for command in commands[next_index:]:
        results.append({'id': command['id'], 'status': 'not_started', 'reason': failure})
    logical, allocated, free = _disk_usage(root)
    remaining = [member for member in _processes() if member['group'] in groups and member['session'] in groups and member['state'] != 'Z']
    if remaining:
        failure = failure or 'owned_processes_still_alive_after_cleanup'
    by_id = {item['id']: item for item in results}
    return {
        'ok': failure is None, 'failure': failure, 'host': host, 'budget': limits,
        'wall_seconds': time.monotonic() - started,
        'max_active_jobs': max_active, 'active_transcodes_peak': transcodes_peak,
        'peak_sampled_process_tree_rss_bytes': peak_rss,
        'sampled_process_cpu_seconds': sum(seen_ticks.values()) / os.sysconf('SC_CLK_TCK'),
        'scratch_logical_bytes_peak': max(peak_logical, logical),
        'scratch_allocated_bytes_peak': max(peak_allocated, allocated),
        'scratch_free_bytes_min': min(min_free, free),
        'memory_available_bytes_min': min_memory_available,
        'sample_count': samples, 'sample_interval_seconds': SAMPLE_SECONDS,
        'owned_live_processes_after_cleanup': len(remaining),
        'supervisor_cleaned_group_count': len(cleanup_groups),
        'metrics_note': 'RSS/CPU are sampled process-group observations, not cgroup peaks or guaranteed hard memory limits. Sampled CPU can miss short-lived children; exit rusage is separately reported by wait4.',
        'jobs': [by_id[command['id']] for command in commands],
    }
