/**
 * @file ui24r.js
 * @description Soundcraft Ui24R Digital Mixer Client library.
 * Implements reverse-engineered Socket.IO v0.9 handshake, real-time bidirectional WebSocket protocol,
 * parameter state synchronization, and binary VU meter telemetry stream decoding.
 */

'use strict';

const http = require('http');
const EventEmitter = require('events');
const converters = require('./converters');

/**
 * SoundcraftUi24R Client
 * Manages full connection lifecycle, heartbeat, parameter synchronization, and telemetry.
 */
class SoundcraftUi24R extends EventEmitter {
  /**
   * Creates an instance of the Ui24R client.
   * @param {string} [ip='192.168.100.200'] - IP address of the Soundcraft Ui mixer.
   * @param {number} [port=80] - HTTP/WebSocket port.
   */
  constructor(ip = '192.168.100.200', port = 80) {
    super();
    this.ip = ip;
    this.port = port;
    this.ws = null;
    this.state = {};
    this.heartbeatTimer = null;
    this.vuListeners = [];
    this.connected = false;
  }

  /**
   * Establishes connection to the mixer.
   * Performs Socket.IO v0.9 polling handshake followed by upgrade to WebSocket.
   * @param {number} [timeoutMs=8000] - Connection timeout in milliseconds.
   * @returns {Promise<void>}
   */
  async connect(timeoutMs = 8000) {
    if (this.connected) return;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.disconnect();
        reject(new Error(`Connection to Soundcraft Ui24R at ${this.ip}:${this.port} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      // 1. Socket.IO v0.9 Handshake via HTTP GET
      const handshakeReq = http.get(
        `http://${this.ip}:${this.port}/socket.io/1/`,
        (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            const sessionId = data.split(':')[0];
            if (!sessionId) {
              clearTimeout(timer);
              return reject(new Error(`Failed to obtain Socket.IO session ID from ${this.ip}. Response: ${data}`));
            }

            // 2. Open WebSocket connection
            const wsUrl = `ws://${this.ip}:${this.port}/socket.io/1/websocket/${sessionId}`;
            try {
              this.ws = new WebSocket(wsUrl);
            } catch (err) {
              clearTimeout(timer);
              return reject(new Error(`WebSocket initialization failed: ${err.message}`));
            }

            this.ws.onopen = () => {
              // Initial heartbeat & sync commands
              this.send('ALIVE');
              this.send(`USERTIME^${Date.now()}^${new Date().getTimezoneOffset()}`);

              // Start 1-second keepalive timer
              this.heartbeatTimer = setInterval(() => {
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                  this.send('ALIVE');
                }
              }, 1000);

              // Allow 1.5 seconds for initial full state dump from mixer
              setTimeout(() => {
                clearTimeout(timer);
                this.connected = true;
                this.emit('connect');
                resolve();
              }, 1500);
            };

            this.ws.onerror = (err) => {
              clearTimeout(timer);
              this.emit('error', err);
              reject(err);
            };

            this.ws.onclose = () => {
              this.connected = false;
              this._cleanup();
              this.emit('disconnect');
            };

            this.ws.onmessage = (event) => {
              this._handleMessage(event.data);
            };
          });
        }
      );

      handshakeReq.on('error', (err) => {
        clearTimeout(timer);
        reject(new Error(`HTTP handshake failed: ${err.message}`));
      });
    });
  }

  /**
   * Processes raw WebSocket messages received from the mixer.
   * @private
   * @param {string} raw - Raw incoming message frame.
   */
  _handleMessage(raw) {
    if (typeof raw !== 'string' || !raw.startsWith('3:::')) return;
    const body = raw.slice(4);
    const lines = body.split('\n');

    for (const line of lines) {
      if (!line) continue;

      if (line.startsWith('SETS^') || line.startsWith('SETD^')) {
        const parts = line.split('^');
        if (parts.length >= 3) {
          const key = parts[1];
          const val = parts.slice(2).join('^');
          const oldVal = this.state[key];
          this.state[key] = val;
          if (oldVal !== val) {
            this.emit('stateChange', key, val, oldVal);
          }
        }
      } else if (line.startsWith('VU2^')) {
        this._handleVUPacket(line);
      }
    }
  }

  /**
   * Decodes binary VU2 telemetry frames (25 fps).
   * @private
   * @param {string} line - Raw frame string starting with VU2^<base64>
   */
  _handleVUPacket(line) {
    try {
      const payload = Buffer.from(line.slice(4), 'base64');
      if (payload.length < 8) return;

      const numInputs = payload[0];
      const offset = 8;
      const meters = [];

      for (let g = 0; g < numInputs && g < 24; g++) {
        const l = offset + 6 * g;
        if (l + 5 >= payload.length) break;

        const preVal = converters.deconvertVU(payload[l + 0]);
        const postVal = converters.deconvertVU(Math.max(payload[l + 1], payload[l + 2]));
        const compVal = converters.deconvertVU_comp(payload[l + 3]);
        const gateOpen = (payload[l + 4] & 0x01) !== 0;

        meters.push({
          channel: g + 1,
          pre: preVal,
          post: postVal,
          preDB: converters.VtoDB(preVal),
          postDB: converters.VtoDB(postVal),
          compReduction: compVal,
          gateOpen: gateOpen
        });
      }

      this.emit('vu', meters);
      for (const cb of this.vuListeners) {
        cb(meters);
      }
    } catch {
      // Ignore malformed packets gracefully
    }
  }

  /**
   * Registers a high-performance callback for real-time VU meter telemetry frames.
   * @param {function(Array):void} callback
   */
  onVU(callback) {
    if (typeof callback === 'function') {
      this.vuListeners.push(callback);
    }
  }

  /**
   * Sends a low-level command string to the mixer.
   * @param {string} cmd
   */
  send(cmd) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(`3:::${cmd}`);
    }
  }

  /**
   * Retrieves a cached parameter value from mixer state.
   * @param {string} key - Parameter key path (e.g. 'i.10.mute', 'var.mtk.rec.currentState')
   * @returns {string|undefined}
   */
  get(key) {
    return this.state[key];
  }

  /**
   * Sets a parameter value on the mixer.
   * Automatically uses SETD for numeric values and SETS for strings.
   * @param {string} key - Parameter key path
   * @param {number|string} val - Target value
   */
  set(key, val) {
    const isNum = typeof val === 'number';
    const cmd = isNum ? `SETD^${key}^${val}` : `SETS^${key}^${val}`;
    this.send(cmd);
    this.state[key] = String(val);
  }

  /**
   * Gets details for a specific physical input channel (1 to 24).
   * @param {number} ch - 1-based channel index (1 - 24)
   * @returns {object}
   */
  getChannel(ch) {
    const idx = ch - 1;
    const p = `i.${idx}.`;
    const fader = parseFloat(this.get(`${p}mix`) || '0');
    return {
      channel: ch,
      name: this.get(`${p}name`) || `CH ${ch}`,
      src: this.get(`${p}src`) || 'none',
      mute: this.get(`${p}mute`) === '1',
      solo: this.get(`${p}solo`) === '1',
      fader: fader,
      faderDB: fader <= 0 ? -100 : converters.VtoDB(fader),
      phantom: this.get(`hw.${idx}.phantom`) === '1',
      gain: converters.VtoGAIN24(parseFloat(this.get(`hw.${idx}.gain`) || '0')),
      gateBypass: this.get(`${p}gate.bypass`) === '1',
      compBypass: this.get(`${p}dyn.bypass`) === '1',
      mtkArmed: this.get(`${p}mtkrec`) === '1'
    };
  }

  /**
   * Sets mute state on an input channel.
   * @param {number} ch - 1-based channel index (1 - 24)
   * @param {boolean} muteState - true to mute, false to unmute
   */
  setMute(ch, muteState) {
    const idx = ch - 1;
    this.set(`i.${idx}.mute`, muteState ? 1 : 0);
  }

  /**
   * Retrieves the current USB multitrack recording status.
   * @returns {object}
   */
  getMultitrackStatus() {
    const armed = [];
    for (let i = 0; i < 24; i++) {
      if (this.get(`i.${i}.mtkrec`) === '1') {
        armed.push({
          channel: i + 1,
          name: this.get(`i.${i}.name`) || `CH ${i + 1}`
        });
      }
    }
    if (this.get('l.0.mtkrec') === '1') armed.push({ channel: 'Line L', name: 'LINE IN L' });
    if (this.get('l.1.mtkrec') === '1') armed.push({ channel: 'Line R', name: 'LINE IN R' });

    return {
      recording: this.get('var.mtk.rec.currentState') === '1',
      busy: this.get('var.mtk.rec.busy') === '1',
      timeSeconds: parseInt(this.get('var.mtk.rec.time') || '0', 10),
      freeSpaceGB: parseFloat(this.get('var.mtk.freespace') || '-1'),
      soundcheckActive: this.get('var.mtk.soundcheck') === '1',
      armedChannels: armed
    };
  }

  /**
   * Internal cleanup routine for sockets and intervals.
   * @private
   */
  _cleanup() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Closes connection to the mixer.
   */
  disconnect() {
    this._cleanup();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore close errors
      }
      this.ws = null;
    }
    this.connected = false;
  }
}

module.exports = {
  SoundcraftUi24R,
  converters
};
