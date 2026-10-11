#!/usr/bin/env python3
"""
ui24r-session-unify.py
High-performance multi-track session unifier and mixer for Soundcraft Ui24R USB recordings.
Stitches, slices, pans, balances, and normalizes multi-stem WAV sessions into stereo/mono masters.
"""

import os
import sys
import argparse
import wave
import ctypes
import math
import subprocess

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
LIB_PATH = os.path.join(REPO_ROOT, 'build', 'libaudio_mixer.so')

def ensure_native_library():
    """Compiles the native C audio mixing library if it doesn't already exist."""
    if not os.path.exists(LIB_PATH):
        print(f"[*] Compiling native C audio mixer library at {LIB_PATH}...")
        res = subprocess.run(['make', '-C', REPO_ROOT], capture_output=True, text=True)
        if res.returncode != 0:
            print(f"[!] Compilation failed:\n{res.stderr}", file=sys.stderr)
            sys.exit(1)
        print("[+] Native library compiled successfully.")

def parse_track_adjustments(arg_str):
    """Parses comma-separated key=value strings like '01 LU=2.5,16 ROBERTH=1.5'."""
    adjustments = {}
    if not arg_str:
        return adjustments
    for item in arg_str.split(','):
        if '=' in item:
            k, v = item.strip().split('=', 1)
            try:
                adjustments[k.strip()] = float(v.strip())
            except ValueError:
                pass
    return adjustments

def unify_session(
    session_dir,
    output_path=None,
    start_sec=0.0,
    end_sec=None,
    target_peak_dbfs=-1.0,
    pan_rules=None,
    gain_rules=None,
    exclude_tracks=None,
    mono_output_path=None
):
    ensure_native_library()

    if not os.path.isdir(session_dir):
        print(f"[!] Error: Session directory does not exist: {session_dir}", file=sys.stderr)
        return False

    exclude_patterns = ['Mezcla', 'Mix', 'full_mix']
    if exclude_tracks:
        exclude_patterns.extend([t.strip() for t in exclude_tracks.split(',')])

    # Discover candidate WAV stem files
    candidate_files = sorted([
        f for f in os.listdir(session_dir)
        if f.lower().endswith('.wav') and not any(p in f for p in exclude_patterns)
    ])

    if not candidate_files:
        print(f"[!] No valid WAV stem tracks found in {session_dir}", file=sys.stderr)
        return False

    print(f"\n=======================================================")
    print(f" Soundcraft Ui24R Multi-Track Session Unifier")
    print(f"=======================================================")
    print(f" Session directory: {session_dir}")
    print(f" Found {len(candidate_files)} audio stem(s):")

    buffers = []
    track_names = []
    total_frames = None
    sample_rate = None

    for fname in candidate_files:
        path = os.path.join(session_dir, fname)
        with wave.open(path, 'rb') as w:
            channels = w.getnchannels()
            sampwidth = w.getsampwidth()
            sr = w.getframerate()
            frames = w.getnframes()

            if channels != 1 or sampwidth != 2:
                print(f"  [-] Skipping {fname}: non-mono or non-16bit PCM ({channels}ch, {sampwidth*8}bit)")
                continue

            if total_frames is None:
                total_frames = frames
                sample_rate = sr
            else:
                total_frames = min(total_frames, frames)

            print(f"  [+] Loading track: {fname} ({frames} frames, {sr} Hz)")
            raw = w.readframes(frames)
            buf = (ctypes.c_int16 * frames).from_buffer_copy(raw)
            buffers.append(buf)
            track_names.append(fname)

    if not buffers:
        print("[!] No compatible 16-bit mono tracks could be loaded.", file=sys.stderr)
        return False

    # Calculate frame window
    start_frame = int(start_sec * sample_rate)
    start_frame = max(0, min(start_frame, total_frames - 1))

    if end_sec is not None and end_sec > 0:
        end_frame = int(end_sec * sample_rate)
        end_frame = min(end_frame, total_frames)
    else:
        end_frame = total_frames

    frames_to_process = max(0, end_frame - start_frame)
    duration_sec = frames_to_process / sample_rate

    print(f"\n Processing Window:")
    print(f"  - Start: {start_sec:.2f}s (frame {start_frame})")
    print(f"  - End:   {end_frame / sample_rate:.2f}s (frame {end_frame})")
    print(f"  - Slice duration: {duration_sec:.2f}s ({frames_to_process} frames)")

    # Prepare C function arguments
    num_tracks = len(buffers)
    track_ptrs = (ctypes.POINTER(ctypes.c_int16) * num_tracks)(*[
        ctypes.cast(b, ctypes.POINTER(ctypes.c_int16)) for b in buffers
    ])

    parsed_pans = parse_track_adjustments(pan_rules)
    parsed_gains = parse_track_adjustments(gain_rules)

    gains = (ctypes.c_float * num_tracks)()
    pans = (ctypes.c_float * num_tracks)()

    for i, tname in enumerate(track_names):
        # Default gain unity, pan center
        g_val = 1.0
        p_val = 0.0

        for rule_key, rule_val in parsed_gains.items():
            if rule_key in tname:
                g_val = rule_val
                break

        for rule_key, rule_val in parsed_pans.items():
            if rule_key in tname:
                p_val = rule_val
                break

        gains[i] = g_val
        pans[i] = p_val
        pan_str = f"L {abs(p_val)*100:.0f}%" if p_val < 0 else (f"R {p_val*100:.0f}%" if p_val > 0 else "Center")
        print(f"    * {tname:<25} -> Gain: {g_val:.2f}x | Pan: {pan_str}")

    stereo_out = (ctypes.c_int16 * (frames_to_process * 2))()
    mono_out = (ctypes.c_int16 * frames_to_process)() if mono_output_path else None

    measured_peak = ctypes.c_float()
    applied_gain = ctypes.c_float()

    lib = ctypes.CDLL(LIB_PATH)
    lib.mix_audio.argtypes = [
        ctypes.POINTER(ctypes.POINTER(ctypes.c_int16)),
        ctypes.POINTER(ctypes.c_float),
        ctypes.POINTER(ctypes.c_float),
        ctypes.c_int,
        ctypes.c_size_t,
        ctypes.c_size_t,
        ctypes.c_float,
        ctypes.POINTER(ctypes.c_int16),
        ctypes.POINTER(ctypes.c_int16),
        ctypes.POINTER(ctypes.c_float),
        ctypes.POINTER(ctypes.c_float)
    ]

    print("\n[*] Summing tracks and calculating normalization factor...")
    lib.mix_audio(
        track_ptrs,
        gains,
        pans,
        num_tracks,
        start_frame,
        frames_to_process,
        target_peak_dbfs,
        stereo_out,
        mono_out,
        ctypes.byref(measured_peak),
        ctypes.byref(applied_gain)
    )

    print(f"\n Master Bus Analytics:")
    print(f"  - Unprocessed raw peak: {measured_peak.value:.2f} dBFS")
    print(f"  - Applied normalization: {'+' if applied_gain.value >= 0 else ''}{applied_gain.value:.2f} dB")
    print(f"  - Output true peak:     {target_peak_dbfs:.2f} dBFS")

    if not output_path:
        output_path = os.path.join(session_dir, "full_mix_stereo.wav")

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    with wave.open(output_path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.setnframes(frames_to_process)
        w.writeframes(stereo_out)

    print(f"\n[+] Master Stereo WAV saved: {output_path}")

    if mono_output_path and mono_out:
        with wave.open(mono_output_path, 'wb') as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(sample_rate)
            w.setnframes(frames_to_process)
            w.writeframes(mono_out)
        print(f"[+] Master Mono WAV saved:   {mono_output_path}")

    return True

def main():
    parser = argparse.ArgumentParser(
        description="Soundcraft Ui24R Multi-Track Session Unifier and Mastering Tool."
    )
    parser.add_argument('session_dir', help="Path to the Soundcraft USB session directory (e.g., /path/to/0003)")
    parser.add_argument('-o', '--output', help="Output file path for the stereo master WAV (default: session_dir/full_mix_stereo.wav)")
    parser.add_argument('--mono-output', help="Optional output file path for mono master WAV")
    parser.add_argument('--start', type=float, default=0.0, help="Start offset in seconds (default: 0.0)")
    parser.add_argument('--end', type=float, default=None, help="End offset in seconds (default: entire session)")
    parser.add_argument('--target-peak', type=float, default=-1.0, help="Target peak level in dBFS (default: -1.0)")
    parser.add_argument('--exclude', default="LineL,LineR", help="Comma-separated track name substrings to exclude (default: LineL,LineR)")
    parser.add_argument('--pan', help="Comma-separated pan rules, e.g., '01 LU=-0.25,02 WINS=-0.35,05 RAFA=0.25'")
    parser.add_argument('--gain', help="Comma-separated linear gain trims, e.g., '01 LU=2.8,06 ROBERTH=1.8'")

    args = parser.parse_args()
    success = unify_session(
        session_dir=args.session_dir,
        output_path=args.output,
        start_sec=args.start,
        end_sec=args.end,
        target_peak_dbfs=args.target_peak,
        pan_rules=args.pan,
        gain_rules=args.gain,
        exclude_tracks=args.exclude,
        mono_output_path=args.mono_output
    )

    sys.exit(0 if success else 1)

if __name__ == '__main__':
    main()
