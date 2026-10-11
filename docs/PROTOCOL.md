# Soundcraft Ui24R Protocol Specification

This document provides a comprehensive, reverse-engineered technical specification of the network control and real-time telemetry protocol utilized by the **Soundcraft Ui24R** (and related Ui-series digital mixers, including Ui12 and Ui16).

---

## 1. Protocol Architecture Overview

The Soundcraft Ui series uses an embedded web server running on port **80 (HTTP)**. The remote control protocol relies on an early version of Socket.IO (**Socket.IO v0.9**) layered over standard HTTP and WebSockets.

```
+-------------------------------------------------------------+
|                     Client Application                      |
+-------------------------------------------------------------+
         |                                           ^
         | HTTP GET /socket.io/1/                    |
         v                                           |
+-------------------------------------------------------------+
|           Soundcraft Ui24R Embedded Server (Port 80)        |
+-------------------------------------------------------------+
         |                                           ^
         | WebSocket Upgrade                         |
         v                                           |
+-------------------------------------------------------------+
|    Bidirectional WebSocket Connection (Frames: 3:::, VU2)   |
+-------------------------------------------------------------+
```

There are two primary channels of communication over the WebSocket connection:
1. **ASCII Control & State Stream:** Text-based command frames (`3:::...`) for reading, synchronizing, and setting mixer parameters.
2. **Binary VU2 Telemetry Stream:** High-speed binary frames prefixed with `VU2\n` broadcasting real-time pre/post peak meters, compressor gain reduction, and gate status at 25–40 frames per second.

---

## 2. Connection Lifecycle & Handshake

Connecting to the mixer requires a three-step sequence:

### Step 1: Socket.IO v0.9 HTTP Handshake

The client sends an HTTP `GET` request:
```http
GET /socket.io/1/?t=1728643200000 HTTP/1.1
Host: 192.168.100.200
Connection: keep-alive
```

The mixer responds with a handshake string in plain text:
```
<session_id>:<heartbeat_timeout>:<connection_timeout>:<supported_transports>
```
*Example response:* `1029384756:60:60:websocket,xhr-polling`

### Step 2: WebSocket Upgrade

The client immediately initiates a WebSocket upgrade using the session ID:
```
ws://192.168.100.200/socket.io/1/websocket/1029384756
```

### Step 3: Initialization & State Synchronization

Once the WebSocket connection is open, the client must send:
```
3:::INIT\n
3:::ALIVE\n
```

The mixer immediately responds with:
- An acknowledgment: `3:::B300`
- A burst of ASCII state frames containing every channel's routing, preamp gain, fader position, EQ curves, dynamics thresholds, and multitrack configuration.

### Step 4: Heartbeat Protocol

To prevent connection drops, the client must transmit a Socket.IO heartbeat ping every **25 seconds**:
```
2::\n
```
If the mixer does not receive a heartbeat within its configured timeout (typically 60 seconds), it closes the TCP socket.

---

## 3. Control Message Framing & Parameter Syntax

ASCII messages from client to mixer follow the Socket.IO data frame envelope:
```
3:::<COMMAND>^<PARAMETER_PATH>^<VALUE>
```

### 3.1 Commands

| Command | Description | Example |
| :--- | :--- | :--- |
| `SETD` | Sets a decimal or numeric parameter (faders, gains, bypass flags, mutes). | `3:::SETD^i.10.mix^0.75` |
| `SETS` | Sets a string value (channel names, preset labels). | `3:::SETS^i.10.name^Lead Vocal` |
| `INIT` | Requests initial state dump from mixer. | `3:::INIT` |
| `ALIVE` | Confirms active client session. | `3:::ALIVE` |

---

## 4. Key Parameter Namespace Reference

All parameters are organized in a dot-separated hierarchy. Input channels use index `0` through `23` (representing physical channels 1 to 24).

### 4.1 Input Channel Parameters (`i.<ch>.*`)

| Parameter | Type | Range | Description |
| :--- | :--- | :--- | :--- |
| `i.<ch>.name` | String | UTF-8 | Custom label assigned to the channel. |
| `i.<ch>.gain` | Float | `0.0` - `1.0` | Analog Studer preamp gain (mapped via lookup table). |
| `i.<ch>.phantom` | Int | `0` or `1` | +48V Phantom Power toggle. |
| `i.<ch>.phase` | Int | `0` or `1` | Phase inversion (polarity 180°). |
| `i.<ch>.mix` | Float | `0.0` - `1.0` | Main fader level (logarithmic curve to dBFS). |
| `i.<ch>.pan` | Float | `0.0` - `1.0` | Stereo pan position (`0.0` = Left, `0.5` = Center, `1.0` = Right). |
| `i.<ch>.mute` | Int | `0` or `1` | Channel mute status (`1` = Muted, `0` = Unmuted/Live). |
| `i.<ch>.solo` | Int | `0` or `1` | AFL/PFL Solo monitor toggle. |
| `i.<ch>.mtkrec` | Int | `0` or `1` | Multitrack USB arm flag (`1` = Armed to record, `0` = Disarmed). |

### 4.2 Dynamics: Noise Gate (`i.<ch>.gate.*`)

| Parameter | Type | Range | Default / Safe Setting | Description |
| :--- | :--- | :--- | :--- | :--- |
| `i.<ch>.gate.bypass` | Int | `0` or `1` | `1` (Bypass) | Gate bypass (`1` bypasses gate, eradicating speech cutoffs). |
| `i.<ch>.gate.threshold` | Float | `0.0` - `1.0` | `0.229` (-68 dB) | Opening signal threshold. |
| `i.<ch>.gate.attack` | Float | `0.0` - `1.0` | `0.0` (Fastest) | Gate opening speed. |
| `i.<ch>.gate.hold` | Float | `0.0` - `1.0` | `0.1705` (350 ms) | Hold duration before attenuation. |
| `i.<ch>.gate.release` | Float | `0.0` - `1.0` | `0.20` (400 ms) | Release envelope duration. |

### 4.3 Dynamics: Compressor (`i.<ch>.comp.*`)

| Parameter | Type | Range | Recommended | Description |
| :--- | :--- | :--- | :--- | :--- |
| `i.<ch>.comp.bypass` | Int | `0` or `1` | `0` (Active) | Compressor bypass flag. |
| `i.<ch>.comp.ratio` | Float | `0.0` - `1.0` | `0.37` (~2.7:1) | Compression ratio curve. |
| `i.<ch>.comp.threshold` | Float | `0.0` - `1.0` | `0.656` (-27 dBFS) | Compression threshold. |
| `i.<ch>.comp.attack` | Float | `0.0` - `1.0` | `0.244` (25 ms) | Attack time (allows consonants to pass). |
| `i.<ch>.comp.release` | Float | `0.0` - `1.0` | `0.283` (300 ms) | Release time (avoids unnatural breathing). |
| `i.<ch>.comp.outgain` | Float | `0.0` - `1.0` | `0.4028` (+5 dB) | Makeup gain. |
| `i.<ch>.comp.softknee` | Int | `0` or `1` | `1` (Soft) | Knee shape (`1` = Soft Knee, `0` = Hard Knee). |

### 4.4 Equalizer & Filters (`i.<ch>.eq.*`)

| Parameter | Type | Range | Value / Description |
| :--- | :--- | :--- | :--- |
| `i.<ch>.eq.bypass` | Int | `0` or `1` | Parametric EQ bypass flag (`0` = active). |
| `i.<ch>.eq.hpffreq` | Float | `0.0` - `1.0` | High-Pass Filter frequency (`0.213` ~ 90 Hz, `0.233` ~ 105 Hz). |
| `i.<ch>.eq.lpffreq` | Float | `0.0` - `1.0` | Low-Pass Filter frequency (`1.0` = 20 kHz fully open). |

### 4.5 Multitrack USB Transport (`var.mtk.*`)

| Parameter | Type | Values | Description |
| :--- | :--- | :--- | :--- |
| `var.mtk.rec` | Int | `0` or `1` | Transport state (`1` = Recording active, `0` = Stopped). |
| `var.mtk.busy` | Int | `0` or `1` | Flash write buffer status (`1` = Flashing buffers, `0` = Idle). |
| `var.mtk.soundcheck` | Int | `0` or `1` | **CRITICAL SAFETY FLAG:** When set to `1` (Virtual Soundcheck), the mixer disconnects physical inputs and routes USB playback to the room, **muting all live stage microphones**. Must always remain `0` in live production. |
| `var.mtk.rec_time` | Int | Seconds | Total elapsed recording time of active session. |
| `var.mtk.free_space` | Int | Megabytes | Free storage available on formatted FAT32 USB drive. |

---

## 5. Binary VU2 Telemetry Stream

The mixer streams high-resolution meter packets continuously as raw binary WebSocket frames.

### 5.1 Packet Structure

Each binary packet starts with a 4-byte ASCII header:
```
Offset 0: 0x56 ('V')
Offset 1: 0x55 ('U')
Offset 2: 0x32 ('2')
Offset 3: 0x0A ('\n')
```

Following the header is a continuous array of `uint8` byte values (0 to 240). Each input channel occupies 4 sequential metrics:
1. **Pre-fader meter** (raw signal from preamp/DSP input)
2. **Post-fader meter** (level after fader, EQ, and dynamics)
3. **Gate state meter** (indicates gate open/closed status)
4. **Compressor gain reduction meter** (indicates dB of attenuation applied)

### 5.2 Decoders & Normalization

```javascript
// Raw meter byte to normalized range [0.0, 1.0]
function deconvertVU(rawByte) {
  return 0.004167508166392142 * rawByte;
}

// Compressor Gain Reduction byte to normalized reduction [0.0, 1.0]
function deconvertVU_comp(rawByte) {
  let val = 1 - 0.004167508166392142 * (rawByte | ((rawByte >> 7) & 1));
  if (val < 0.008) return 0;
  if (val > 1) return 1;
  return val;
}
```

---

## 6. Mathematical Formulas & Value Scaling

### 6.1 Studer Preamp Gain Mapping

The analog preamps on channels 1–20 use a 64-step discrete resistor ladder controlled by the normalized slider range `[0.0, 1.0]`:

```javascript
const UI24R_GAINS = [
  -5, -5, -3, -3, -1, -1, 1, 1, 3, 3, 5, 5, 7, 7, 9, 9, 11, 11, 13, 13, 15, 15, 17, 17, 19, 19, 21, 21, 23, 23,
  25, 25, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50,
  51, 52, 53, 54, 55, 56, 57, 58
];

function gainFloatToDb(val) {
  const index = Math.round(val * 63);
  return UI24R_GAINS[Math.max(0, Math.min(63, index))];
}
```

### 6.2 Fader Normalized to Decibels (VtoDB)

The Soundcraft fader uses a custom logarithmic piecewise function matching physical console fader taper:

```javascript
function VtoDB(v) {
  if (v < 0.001) return -100;
  if (v <= 0.055) return -100 + (v / 0.055) * 40;     // -100 dB to -60 dB
  if (v <= 0.40)  return -60  + ((v - 0.055) / 0.345) * 30; // -60 dB to -30 dB
  if (v <= 0.75)  return -30  + ((v - 0.40) / 0.35) * 20;  // -30 dB to -10 dB
  if (v <= 0.85)  return -10  + ((v - 0.75) / 0.10) * 10;  // -10 dB to 0 dB (Unity)
  return ((v - 0.85) / 0.15) * 10;                         // 0 dB to +10 dB
}
```

### 6.3 Decibels to Normalized Fader (DBtoV)

```javascript
function DBtoV(db) {
  if (db <= -100) return 0;
  if (db <= -60)  return ((db + 100) / 40) * 0.055;
  if (db <= -30)  return 0.055 + ((db + 60) / 30) * 0.345;
  if (db <= -10)  return 0.40  + ((db + 30) / 20) * 0.35;
  if (db <= 0)    return 0.75  + ((db + 10) / 10) * 0.10;
  return Math.min(1.0, 0.85 + (db / 10) * 0.15);
}
```
