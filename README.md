# 🎛️ Soundcraft Ui24R Automation & Audio Processing Suite

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/Node.js-%3E%3D20.0-green.svg)](package.json)
[![Language: C99](https://img.shields.io/badge/Engine-C99%20Native-orange.svg)](src/audio/audio_mixer.c)
[![Python Version](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](bin/ui24r-session-unify.py)

A production-grade automation suite, continuous telemetry monitor, and multi-track audio engine for the **Soundcraft Ui24R** digital mixer.

This toolkit reverse-engineers the mixer's embedded **Socket.IO v0.9 / WebSocket** control protocol, combines it with a high-rate binary telemetry decoder, and couples it with a **native C audio summing engine** for instant processing of USB multitrack WAV stems.

It is architected as the operational foundation for the upcoming **Model Context Protocol (MCP)** server ([`mcp-soundcraft-ui24r`](docs/MCP_ROADMAP.md)), allowing AI agents to monitor, calibrate, and orchestrate live audio workflows.

---

## ⚡ Features

- **Real-Time Control & Telemetry:** Connects directly to the mixer's port 80 WebSockets with zero third-party client dependencies.
- **Continuous Dropout & RF Monitoring:** Reads binary `VU2` meter frames at 25–40 fps to instantly detect wireless mic cutoffs, aggressive gate truncations, signal dips (>18 dB), and clipping (≥ -0.2 dBFS).
- **Safe USB Multitrack Manager:** Controls the 24-track USB recorder, arms only live (unmuted) channels, and protects stage sound by enforcing **Virtual Soundcheck Isolation** (`soundcheck = 0`).
- **Instant DSP Channel Calibration:** Injects tuned Gain Staging, Noise Gate Bypass, Soft-Knee Speech/Vocal Compression, and High-Pass filtering to eliminate word clipping.
- **High-Performance Audio Engine (`libaudio_mixer.so`):** Native C library implementing 64-bit float multi-track accumulation, constant-power stereo pan law (-3 dB center), true peak detection, and non-clipping gain normalization.
- **Multi-Stem Session Unifier & Slicer:** Python CLI tool to inspect, slice by time range, pan, balance, and export radio-ready stereo/mono masters from raw USB multi-stem recordings in seconds.

---

## 📁 Repository Structure

```
soundcraft-ui24r-tools/
├── bin/
│   ├── ui24r-audit.js          # Full channel state & live meter auditor
│   ├── ui24r-calibrate.js      # DSP dynamic calibrator (speech/vocal)
│   ├── ui24r-fix-karime.js     # Vocalist preset wrapper (Channel 12)
│   ├── ui24r-fix-orador.js     # Spoken word / orator wrapper (Channel 11)
│   ├── ui24r-monitor.js        # Continuous dropout and clipping daemon
│   ├── ui24r-multitrack.js     # USB multitrack transport & arming manager
│   ├── ui24r-mute.js           # Safe channel mute/unmute CLI
│   ├── ui24r-session-info.py   # Fast WAV stem & session metadata inspector
│   └── ui24r-session-unify.py  # Multi-stem unifier, slicer & normalizer
├── lib/
│   ├── converters.js           # Decibel, fader, preamp & VU mathematical formulas
│   └── ui24r.js                # Core WebSocket client & protocol implementation
├── src/
│   └── audio/
│       ├── audio_mixer.c       # Native C audio summing & normalization engine
│       └── audio_mixer.h       # C header definitions
├── docs/
│   ├── ARCHITECTURE.md         # Technical architecture & pipeline diagrams
│   ├── MCP_ROADMAP.md          # Model Context Protocol design & tool definitions
│   └── PROTOCOL.md             # Reverse-engineered Socket.IO / VU2 specification
├── Makefile                    # Compiles build/libaudio_mixer.so
├── package.json                # Node.js configuration & binary aliases
├── LICENSE                     # MIT License
└── README.md                   # This documentation
```

---

## 🛠️ Prerequisites & Installation

### Requirements:
- **Node.js** >= 20.0 (uses global native `WebSocket`).
- **Python** >= 3.10 (for multi-track session processing).
- **GCC / Clang & Make** (for compiling the C audio mixer library).
- Direct network connectivity to the Soundcraft Ui24R (Ethernet or Wi-Fi).

### Setup:

1. Clone the repository:
   ```bash
   git clone https://github.com/rafavg77/soundcraft-ui24r-tools.git
   cd soundcraft-ui24r-tools
   ```

2. Compile the native C audio mixing library:
   ```bash
   npm run build
   # or run: make
   ```

3. (Optional) Link CLI binaries globally:
   ```bash
   npm link
   ```

---

## 🚀 CLI Usage Guide

All tools default to the mixer IP `192.168.100.200`. You can override the target mixer IP at any time by passing an environment variable:
```bash
export UI24R_IP="10.10.2.1"
```

---

### 1. `ui24r-audit` — Complete Channel Matrix & Peak Metering

Samples live mixer telemetry over 3 seconds and displays routing, preamp gain, fader dBFS, phantom power, dynamics status, and peak levels for all 24 channels:

```bash
# Formatted terminal table
node bin/ui24r-audit.js

# Output as raw JSON for programmatic consumption
node bin/ui24r-audit.js --json
```

---

### 2. `ui24r-multitrack` — USB Multitrack Recording Controller

Manages multi-stem USB recording with safety checks to ensure the live room is never muted:

```bash
# Check USB transport, armed channels, and remaining flash space
node bin/ui24r-multitrack.js status

# Arm ONLY active (unmuted) channels for live recording
node bin/ui24r-multitrack.js arm-live

# Arm all 24 channels
node bin/ui24r-multitrack.js arm-all

# Arm a specific channel (e.g. Channel 11)
node bin/ui24r-multitrack.js arm-channel 11

# Start multitrack recording to USB
node bin/ui24r-multitrack.js record

# Safely stop recording and wait for flash write buffers to flush
node bin/ui24r-multitrack.js stop
```

---

### 3. `ui24r-monitor` — Continuous Dropout & Clipping Watchdog

Runs as a real-time background daemon tracking all channels at ~25 frames per second:

```bash
# Run monitor (outputs to console and writes to logs/dropouts.log)
node bin/ui24r-monitor.js

# Specify a custom log destination
node bin/ui24r-monitor.js /var/log/soundcraft_events.log
```

---

### 4. `ui24r-calibrate` — DSP Staging & Word-Cutoff Prevention

Applies acoustic dynamic presets directly into mixer DSP memory:

```bash
# Calibrate Channel 11 for Spoken Word / Preacher:
# (Preamp +24 dB, Noise Gate BYPASS, Soft-Knee Comp 2.7:1, HPF 90 Hz)
node bin/ui24r-calibrate.js 11 speech

# Calibrate Channel 12 for Lead Vocalist:
# (Noise Gate BYPASS, Soft-Knee Comp 3.0:1, HPF 105 Hz)
node bin/ui24r-calibrate.js 12 vocal
```

---

### 5. `ui24r-session-info.py` — Fast USB Session Inspector

Analyzes multi-gigabyte recording sessions from the FAT32 USB drive in seconds using native C acceleration:

```bash
python3 bin/ui24r-session-info.py /media/usb/Multitrack/0003
```

*Example output:*
```
====================================================================================================
 Soundcraft Ui24R Session Info: 0003
 Location: /media/usb/Multitrack/0003
 Duration: 147.28 sec (00:02:27) | Sample Rate: 48000 Hz | Bit Depth: 16-bit
 Acceleration: Native C Engine (libaudio_mixer.so)
====================================================================================================
CH    Track Name           Duration     Peak (dBFS)  RMS (dBFS)   Status
----------------------------------------------------------------------------------------------------
CH01  01 LU.wav            00:02:27       -11.83       -28.71     ACTIVE
CH02  02 PAO.wav           00:02:27       -15.01       -32.40     ACTIVE
CH11  11 ORADOR.wav        00:02:27       -4.10        -21.50     ACTIVE
CH12  12 KARIME.wav        00:02:27       -8.25        -24.12     ACTIVE
====================================================================================================
Summary: 14 total stems | 6 active stems | 8 silent stems
```

---

### 6. `ui24r-session-unify.py` — Multi-Track Slicer, Balancer & Master Generator

Stitches, pans, balances, slices, and normalizes multi-stem recordings into radio-ready masters:

```bash
# Export normalized stereo master of full session
python3 bin/ui24r-session-unify.py /media/usb/Multitrack/0003 \
  --out /home/user/Masters/0003_master.wav \
  --peak -1.0

# Extract a specific slice (e.g. from 120s to 450s) with custom vocal panning & gain boosts
python3 bin/ui24r-session-unify.py /media/usb/Multitrack/0003 \
  --start 120 --end 450 \
  --gain "11=2.0,12=1.5" \
  --pan "01=-0.3,02=0.3" \
  --out /home/user/Masters/0003_speech_segment.wav
```

---

## 🔒 Safety Architecture & Best Practices

1. **Live Room Protection (`soundcheck = 0`):**
   The mixer features a "Virtual Soundcheck" mode (`var.mtk.soundcheck = 1`) that routes USB audio back through the console. If activated during a live event, **all live stage microphones are muted**. All scripts in this suite enforce `soundcheck = 0` to safeguard live events.
2. **Buffer Flush Wait:**
   Stopping USB recording initiates a flash cache write on the mixer. The multitrack tools enforce a 5-second wait before exiting to prevent corrupt WAV file headers.
3. **No Hardcoded Secrets:**
   All configuration is driven through standard arguments and environment variables.

---

## 📚 Technical Documentation

- [Protocol Specification (`docs/PROTOCOL.md`)](docs/PROTOCOL.md) — Reverse-engineered Socket.IO v0.9 handshake, command framing, binary `VU2` stream, and conversion mathematics.
- [System Architecture (`docs/ARCHITECTURE.md`)](docs/ARCHITECTURE.md) — System design, component hierarchy, SIMD/C acceleration, and sequence diagrams.
- [MCP Server Roadmap (`docs/MCP_ROADMAP.md`)](docs/MCP_ROADMAP.md) — Tool specifications, resource endpoints, and security guardrails for AI agents.

---

## 📄 License

This project is licensed under the **MIT License**. See [LICENSE](LICENSE) for details.
