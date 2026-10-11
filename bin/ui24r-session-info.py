#!/usr/bin/env python3
"""
ui24r-session-info.py
Analyzes Soundcraft Ui24R USB multi-track recording sessions.
Parses .uirecsession metadata and measures stem dynamics (Peak dBFS, RMS dBFS, duration, silence detection).
Uses native C acceleration (libaudio_mixer.so) for instantaneous multi-gigabyte stem analysis.
"""

import os
import sys
import argparse
import wave
import json
import math
import ctypes
import subprocess

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
LIB_PATH = os.path.join(REPO_ROOT, 'build', 'libaudio_mixer.so')

def get_native_analyzer():
    if not os.path.exists(LIB_PATH):
        try:
            subprocess.run(['make', '-C', REPO_ROOT], capture_output=True, check=True)
        except Exception:
            return None

    try:
        lib = ctypes.CDLL(LIB_PATH)
        lib.analyze_track_stats.argtypes = [
            ctypes.POINTER(ctypes.c_int16),
            ctypes.c_size_t,
            ctypes.POINTER(ctypes.c_float),
            ctypes.POINTER(ctypes.c_float),
            ctypes.POINTER(ctypes.c_int16)
        ]
        return lib
    except Exception:
        return None

def analyze_wav_file(filepath, native_lib=None):
    """Calculates peak and RMS levels for a 16-bit mono WAV file."""
    with wave.open(filepath, 'rb') as w:
        n_channels = w.getnchannels()
        sampwidth = w.getsampwidth()
        framerate = w.getframerate()
        n_frames = w.getnframes()
        duration_sec = n_frames / framerate if framerate else 0

        if sampwidth != 2 or n_channels != 1:
            return {
                'channels': n_channels,
                'bit_depth': sampwidth * 8,
                'sample_rate': framerate,
                'frames': n_frames,
                'duration_sec': duration_sec,
                'peak_dbfs': None,
                'rms_dbfs': None,
                'status': 'UNSUPPORTED_FORMAT'
            }

        peak_dbfs = -100.0
        rms_dbfs = -100.0
        max_abs = 0

        raw_bytes = w.readframes(n_frames)

        if native_lib:
            c_buf = (ctypes.c_int16 * n_frames).from_buffer_copy(raw_bytes)
            p_peak = ctypes.c_float()
            p_rms = ctypes.c_float()
            p_raw = ctypes.c_int16()

            native_lib.analyze_track_stats(
                c_buf,
                n_frames,
                ctypes.byref(p_peak),
                ctypes.byref(p_rms),
                ctypes.byref(p_raw)
            )

            peak_dbfs = p_peak.value
            rms_dbfs = p_rms.value
            max_abs = p_raw.value
        else:
            # Fallback
            import array
            arr = array.array('h')
            arr.frombytes(raw_bytes)
            if len(arr) > 0:
                max_abs = max(abs(x) for x in arr)
                peak_dbfs = 20.0 * math.log10(max_abs / 32768.0) if max_abs > 0 else -100.0
                sum_sq = sum(x * x for x in arr)
                rms = math.sqrt(sum_sq / len(arr))
                rms_dbfs = 20.0 * math.log10(rms / 32768.0) if rms > 0 else -100.0

        if peak_dbfs < -70.0:
            status = 'SILENT_OR_DISCONNECTED'
        elif peak_dbfs < -30.0:
            status = 'LOW_GAIN'
        elif peak_dbfs > -0.5:
            status = 'HOT_OR_CLIPPING'
        else:
            status = 'NOMINAL'

        return {
            'channels': n_channels,
            'bit_depth': sampwidth * 8,
            'sample_rate': framerate,
            'frames': n_frames,
            'duration_sec': round(duration_sec, 2),
            'peak_dbfs': round(peak_dbfs, 2),
            'rms_dbfs': round(rms_dbfs, 2),
            'peak_raw': int(max_abs),
            'status': status
        }

def inspect_session(session_dir, as_json=False):
    if not os.path.isdir(session_dir):
        print(f"[!] Directory does not exist: {session_dir}", file=sys.stderr)
        return False

    native_lib = get_native_analyzer()

    session_file = os.path.join(session_dir, '.uirecsession')
    session_meta = {}
    if os.path.exists(session_file):
        try:
            with open(session_file, 'r', encoding='utf-8', errors='ignore') as f:
                session_meta['raw'] = f.read().strip()
        except Exception as e:
            session_meta['error'] = str(e)

    wav_files = sorted([f for f in os.listdir(session_dir) if f.lower().endswith('.wav')])
    tracks = []
    max_session_peak = -100.0
    total_duration = 0.0

    for fname in wav_files:
        fpath = os.path.join(session_dir, fname)
        info = analyze_wav_file(fpath, native_lib=native_lib)
        info['filename'] = fname
        tracks.append(info)
        if info.get('peak_dbfs') is not None and info['peak_dbfs'] > max_session_peak:
            max_session_peak = info['peak_dbfs']
        if info.get('duration_sec') and info['duration_sec'] > total_duration:
            total_duration = info['duration_sec']

    recommended_boost = round(-1.0 - max_session_peak, 2) if max_session_peak > -90 else 0.0

    result = {
        'session_dir': os.path.abspath(session_dir),
        'total_tracks': len(tracks),
        'duration_sec': round(total_duration, 2),
        'duration_formatted': f"{int(total_duration // 60)}m {int(total_duration % 60):02d}s",
        'max_session_peak_dbfs': max_session_peak,
        'recommended_master_gain_db': recommended_boost,
        'session_metadata': session_meta,
        'tracks': tracks
    }

    if as_json:
        print(json.dumps(result, indent=2))
        return True

    print("\n==========================================================================================")
    print(f" Soundcraft Ui24R Multi-Track Session Inspector: {os.path.basename(os.path.abspath(session_dir))}")
    print("==========================================================================================")
    print(f" Directory:        {result['session_dir']}")
    print(f" Total Duration:   {result['duration_formatted']} ({result['duration_sec']}s)")
    print(f" Tracks Found:     {result['total_tracks']}")
    print(f" Maximum Peak:     {result['max_session_peak_dbfs']:.2f} dBFS")
    print(f" Recommended Gain: {'+' if recommended_boost >= 0 else ''}{recommended_boost:.2f} dB (to hit -1.0 dBFS true peak)")
    print("------------------------------------------------------------------------------------------")
    print(f"{'TRACK FILE':<28} {'PEAK (dBFS)':<13} {'RMS (dBFS)':<13} {'PEAK RAW':<10} {'STATUS':<20}")
    print("------------------------------------------------------------------------------------------")

    for t in tracks:
        p_str = f"{t['peak_dbfs']:.2f} dBFS" if t['peak_dbfs'] is not None else "N/A"
        r_str = f"{t['rms_dbfs']:.2f} dBFS" if t['rms_dbfs'] is not None else "N/A"
        raw_str = str(t.get('peak_raw', 'N/A'))
        status = t['status']
        print(f"{t['filename']:<28} {p_str:<13} {r_str:<13} {raw_str:<10} {status:<20}")

    print("==========================================================================================\n")
    return True

def main():
    parser = argparse.ArgumentParser(
        description="Inspects Soundcraft Ui24R multi-track USB sessions and measures stem dynamics."
    )
    parser.add_argument('session_dir', help="Path to the session directory (e.g., Documents/Multitrack/0003)")
    parser.add_argument('--json', action='store_true', help="Output results in JSON format")

    args = parser.parse_args()
    success = inspect_session(args.session_dir, as_json=args.json)
    sys.exit(0 if success else 1)

if __name__ == '__main__':
    main()
