# Model Context Protocol (MCP) Server Roadmap: `mcp-soundcraft-ui24r`

This document defines the architecture, design specification, and tool interfaces for building a **Model Context Protocol (MCP)** server on top of the `soundcraft-ui24r-tools` suite.

The goal is to enable AI agents (such as Antigravity, Claude, or custom LLM orchestrators) to autonomously observe, audit, calibrate, and record audio on the **Soundcraft Ui24R** digital mixer via standard MCP JSON-RPC protocols.

---

## 1. Architectural Vision

```
+-------------------------------------------------------------+
|                     AI Agent / Assistant                    |
+-------------------------------------------------------------+
         |                                           ^
         | MCP JSON-RPC 2.0 (stdio or SSE)           |
         v                                           |
+-------------------------------------------------------------+
|          Soundcraft Ui24R MCP Server (Node.js)              |
|              (mcp-soundcraft-ui24r)                         |
+-------------------------------------------------------------+
         |                                           |
         +--------------------+                      |
         |                    |                      |
         v                    v                      v
+------------------+  +------------------+  +------------------+
|  Real-Time Client|  | C Audio Engine   |  | Session Slicer   |
|  (lib/ui24r.js)  |  | (audio_mixer.so) |  | (Python 3)       |
+------------------+  +------------------+  +------------------+
         |                                           |
         v                                           v
+-------------------------------------------------------------+
|                 Soundcraft Ui24R Hardware                   |
+-------------------------------------------------------------+
```

---

## 2. Proposed MCP Tools

### 2.1 Mixer Telemetry & State Tools

#### `ui24r_audit`
*Description:* Audits all 24 input channels, returns fader positions, gain staging, dynamic processor statuses, and live VU meter readings sampled over a specified window.
- **Parameters:**
  - `duration_seconds` (number, optional, default: 2.0): Sampling duration for peak telemetry.
  - `channel` (number, optional): Specific channel (1–24) to audit, or omit for all channels.
- **Returns:** Structured JSON object containing channel states, peaks, and active dynamic processors.

#### `ui24r_get_parameter`
*Description:* Retrieves the current value of any mixer parameter.
- **Parameters:**
  - `path` (string, required): Parameter address (e.g., `i.10.mix`, `i.10.mute`, `i.10.gain`, `var.mtk.rec`).
- **Returns:** Raw value and converted human-readable representation (e.g., `0.75` -> `-10.0 dBFS`).

#### `ui24r_set_parameter`
*Description:* Safely updates a mixer parameter with strict validation and safety clamps.
- **Parameters:**
  - `path` (string, required): Parameter address.
  - `value` (number | string, required): Desired value.
  - `confirm_high_risk` (boolean, optional): Required for dangerous operations (e.g., activating +48V phantom power or sudden fader jumps > +6 dB).

---

### 2.2 DSP Calibration & Channel Optimization Tools

#### `ui24r_calibrate_channel`
*Description:* Applies expert DSP calibration curves (analog preamp gain, noise gate bypass, vocal/speech compressor, HPF) to optimize dynamic speech or singing.
- **Parameters:**
  - `channel` (number, required): Channel index (1–24).
  - `preset` (string, required): One of `speech` (spoken word/orator), `vocal` (singing lead/choir), or `acoustic_guitar`.
  - `preamp_gain_db` (number, optional): Custom analog gain override in dB.

#### `ui24r_set_mute`
*Description:* Controls channel mute states.
- **Parameters:**
  - `channel` (number, required): Channel index (1–24).
  - `state` (string, required): One of `mute`, `unmute`, or `toggle`.

---

### 2.3 Multitrack USB Recording Tools

#### `ui24r_multitrack_status`
*Description:* Queries USB drive availability, formatted FAT32 storage, armed channel list, active recording time, and virtual soundcheck status.
- **Parameters:** None.
- **Returns:** Full transport and armed channel diagnostic report.

#### `ui24r_multitrack_control`
*Description:* Commands the USB multitrack recording engine.
- **Parameters:**
  - `action` (string, required): One of:
    - `arm_live`: Disarms muted channels and arms only active unmuted channels.
    - `arm_all`: Arms channels 1 to 22 + Line inputs.
    - `arm_channel`: Arms a specific channel index.
    - `disarm_channel`: Disarms a specific channel index.
    - `record`: Starts multitrack USB recording.
    - `stop`: Safely stops recording and flushes write buffers.
  - `channel` (number, optional): Channel index if action is `arm_channel` or `disarm_channel`.

---

### 2.4 Offline Audio Processing Tools

#### `ui24r_session_info`
*Description:* Reads a recorded session directory on the USB drive, parses `.uirecsession` metadata, and scans all WAV stems for peak and RMS metrics.
- **Parameters:**
  - `session_path` (string, required): Absolute path to the session folder.
- **Returns:** Track list, durations, channel labels, peak dBFS, and silence/activity status.

#### `ui24r_session_unify`
*Description:* High-speed multi-stem unifier and master generator using the native C audio engine.
- **Parameters:**
  - `session_path` (string, required): Path to recording directory.
  - `output_path` (string, required): Destination path for final master WAV.
  - `start_seconds` (number, optional): Starting cut offset.
  - `end_seconds` (number, optional): Ending cut offset.
  - `target_peak_dbfs` (number, optional, default: -1.0): Peak normalization target.
  - `gain_adjustments` (object, optional): Per-track gain multipliers (e.g., `{"01": 2.0}`).
  - `pan_positions` (object, optional): Per-track pan positions (-1.0 to 1.0).
  - `exclude_tracks` (array of strings, optional): Track names or numbers to omit.

---

## 3. Proposed MCP Resources

AI agents will have access to real-time streams and static states through MCP Resource URIs:

| Resource URI | MIME Type | Description |
| :--- | :--- | :--- |
| `ui24r://mixer/state` | `application/json` | Complete snapshot of mixer parameter hierarchy. |
| `ui24r://meters/live` | `application/json` | Snapshot of active 24-channel VU pre/post meters and dynamic reductions. |
| `ui24r://multitrack/status` | `application/json` | Current USB transport and armed stems status. |
| `ui24r://sessions/list` | `application/json` | Discovered recording sessions on mounted USB volumes. |

---

## 4. Safety Guardrails & Agent Protections

To avoid accidental disruptions in live production environments, the MCP server will implement mandatory safety guardrails:

1. **Virtual Soundcheck Lockdown:**
   The MCP server will strictly reject any command attempting to set `var.mtk.soundcheck = 1` unless an environment variable `ALLOW_SOUNDCHECK_OVERRIDE=true` is explicitly set.
2. **Gain/Fader Slew Rate Limiting:**
   Sudden fader changes exceeding +6 dBFS in a single step will trigger an error or be gracefully ramped over 500 ms to prevent acoustic feedback or speaker damage.
3. **Buffer Flush Enforcement:**
   When stopping multitrack recordings, the MCP tool will hold execution until `var.mtk.busy == 0` (or 5 seconds have elapsed) before returning completion to the agent.
4. **Environment Isolation:**
   Zero storage of passwords or tokens in configuration files; mixer IP is passed cleanly via standard CLI flags or the `UI24R_IP` environment variable.
