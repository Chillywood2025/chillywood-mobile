#!/usr/bin/env python3
"""Test-only media phase meter. Cancellation proof must use direct binaries.

The supervisor owns the entire process group if this wrapper is killed before
it can reap its child. This wrapper is never installed in a production worker.
"""
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time


def main():
    kind = Path(sys.argv[0]).name
    if kind not in ('ffmpeg', 'ffprobe'):
        raise SystemExit('invoke_via_ffmpeg_or_ffprobe_symlink')
    binary = os.environ['CLIP_WORKLOAD_REAL_' + kind.upper()]
    directory = Path(os.environ['CLIP_WORKLOAD_PHASE_DIR'])
    deadline = float(os.environ['CLIP_WORKLOAD_MEDIA_TIMEOUT_SECONDS'])
    if not 0 < deadline <= 7200:
        raise SystemExit('invalid_inner_deadline')
    args = sys.argv[1:]
    phase = ('transcode' if '-filter_complex' in args else 'video_start_probe' if '-show_packets' in args
             else 'metadata_probe' if '-show_streams' in args else 'full_decode' if 'null' in args else 'other')
    started = time.monotonic()
    child = subprocess.Popen([binary, *args])
    interrupted = False

    def stop(*_):
        nonlocal interrupted
        interrupted = True
        try:
            child.kill()
        except ProcessLookupError:
            pass

    for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        signal.signal(sig, stop)
    timed_out = False
    while True:
        pid, status, usage = os.wait4(child.pid, os.WNOHANG)
        if pid:
            break
        if time.monotonic() - started >= deadline:
            timed_out = True
            stop()
        time.sleep(0.01)
    child.returncode = os.waitstatus_to_exitcode(status)
    directory.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w', dir=directory, suffix='.json', delete=False) as record:
        json.dump({'phase': phase, 'binary': kind, 'wall_seconds': time.monotonic() - started,
                   'cpu_user_seconds': usage.ru_utime, 'cpu_system_seconds': usage.ru_stime,
                   'child_peak_rss_kib': usage.ru_maxrss, 'exit_code': child.returncode,
                   'timed_out': timed_out, 'interrupted': interrupted}, record)
    return 124 if timed_out else child.returncode if child.returncode >= 0 else 128 - child.returncode


if __name__ == '__main__':
    raise SystemExit(main())
