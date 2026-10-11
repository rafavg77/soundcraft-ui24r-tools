#!/usr/bin/env node
/**
 * @file ui24r-monitor.js
 * @description Real-time continuous monitoring daemon for Soundcraft Ui24R.
 * Tracks all 24 channels via high-rate binary VU2 telemetry frames (25 fps).
 * Detects RF cutoffs, noise gate truncations, signal dips, and digital clipping events.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { SoundcraftUi24R, converters } = require('../lib/ui24r');

const IP = process.env.UI24R_IP || '192.168.100.200';
const LOG_FILE = process.argv[2] || process.env.UI24R_LOG || path.join(__dirname, '..', 'logs', 'dropouts.log');

// Ensure log directory exists
fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });

function logEvent(type, ch, name, details, dbPrev, dbNow) {
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: true });
  const isoTime = new Date().toISOString();
  let icon = '🚨';
  if (type === 'CLIP') icon = '⚠️';
  if (type === 'INFO') icon = 'ℹ️';

  let msg = `[${timestamp}] ${icon} [${type}] CH ${String(ch).padStart(2, '0')} (${name}): `;
  if (dbPrev !== undefined && dbNow !== undefined) {
    msg += `Previous: ${dbPrev.toFixed(1)} dBFS -> Dropped to: ${dbNow.toFixed(1)} dBFS. `;
  }
  msg += `Detail: ${details}`;

  console.log(msg);

  const fileMsg = `[${isoTime}] [${type}] CH ${String(ch).padStart(2, '0')} (${name}) prev=${dbPrev !== undefined ? dbPrev.toFixed(1) : 'N/A'} now=${dbNow !== undefined ? dbNow.toFixed(1) : 'N/A'} detail="${details}"\n`;
  try {
    fs.appendFileSync(LOG_FILE, fileMsg);
  } catch (err) {
    console.error(`Error writing to log file: ${err.message}`);
  }
}

async function main() {
  console.log(`🚀 Starting Continuous Drop & Telemetry Monitor for Soundcraft Ui24R (${IP})...`);
  console.log(`📝 Writing diagnostic events to: ${LOG_FILE}\n`);

  const mixer = new SoundcraftUi24R(IP);

  try {
    await mixer.connect();
    console.log('✅ Connection established. Listening to live VU meters and parameter changes...\n');

    const history = Array.from({ length: 24 }, () => ({
      lastLevel: -100,
      lastGateOpen: false,
      lastUpdate: Date.now(),
      recentClipCount: 0,
      lastAlertTime: 0
    }));

    mixer.onVU((meters) => {
      const now = Date.now();

      meters.forEach((m) => {
        const idx = m.channel - 1;
        if (idx >= 24) return;

        const h = history[idx];
        const prevLevel = h.lastLevel;
        const curLevel = m.preDB;
        const p = `i.${idx}.`;
        const chName = mixer.get(`${p}name`) || `CH ${m.channel}`;
        const isMuted = mixer.get(`${p}mute`) === '1';

        // Skip detection on muted channels
        if (isMuted) {
          h.lastLevel = curLevel;
          h.lastGateOpen = m.gateOpen;
          return;
        }

        // 1. Digital Clipping Detection (0 dBFS or above)
        if (curLevel >= -0.2) {
          if (now - h.lastAlertTime > 2500) {
            logEvent('CLIP', m.channel, chName, `Peak signal at ${curLevel.toFixed(1)} dBFS (Digital clipping risk)`, prevLevel, curLevel);
            h.lastAlertTime = now;
          }
        }

        // 2. Sudden Total RF / Cable Drop (Signal drops from > -35 dBFS straight to -100 dBFS)
        if (prevLevel > -35 && curLevel <= -90) {
          if (now - h.lastAlertTime > 1500) {
            logEvent('RF_OR_SIGNAL_DROP', m.channel, chName, 'Total signal loss to silence (Possible RF loss, transmitter mute, or unplugged cable)', prevLevel, curLevel);
            h.lastAlertTime = now;
          }
        }

        // 3. Noise Gate Premature Cutoff (Gate closes while level drops abruptly near threshold)
        const gateBypass = mixer.get(`${p}gate.bypass`) === '1';
        if (!gateBypass && h.lastGateOpen && !m.gateOpen) {
          if (prevLevel > -48 && curLevel < -55) {
            if (now - h.lastAlertTime > 2000) {
              const gateThresh = converters.VtoGATE_THRESH(parseFloat(mixer.get(`${p}gate.thresh`) || '0')).toFixed(0);
              logEvent('GATE_CUTOFF', m.channel, chName, `Premature cutoff: Noise Gate slammed shut at threshold ${gateThresh} dB`, prevLevel, curLevel);
              h.lastAlertTime = now;
            }
          }
        }

        // 4. Sudden Severe Level Dip (> 20 dB plunge in single frame)
        if (prevLevel > -30 && (prevLevel - curLevel) > 22 && curLevel > -90) {
          if (now - h.lastAlertTime > 3000) {
            logEvent('LEVEL_DIP', m.channel, chName, 'Sudden acoustic level dip (Performer backed away or intermittent signal)', prevLevel, curLevel);
            h.lastAlertTime = now;
          }
        }

        h.lastLevel = curLevel;
        h.lastGateOpen = m.gateOpen;
      });
    });

    // Handle graceful shutdown
    const cleanup = () => {
      console.log('\n⏹️ Stopping monitoring daemon...');
      mixer.disconnect();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

  } catch (err) {
    console.error('❌ Monitor Error:', err.message);
    mixer.disconnect();
    process.exit(1);
  }
}

main();
