#!/usr/bin/env node
/**
 * @file ui24r-audit.js
 * @description Audits all 24 channels of a Soundcraft Ui24R digital mixer.
 * Captures routing, analog preamp gain, phantom power, fader positions,
 * dynamic processing (gate & comp), and live VU meter telemetry.
 */

'use strict';

const { SoundcraftUi24R, converters } = require('../lib/ui24r');

const args = process.argv.slice(2);
const IP = process.env.UI24R_IP || '192.168.100.200';
const asJson = args.includes('--json');
const durationMs = 3000;

async function main() {
  if (!asJson) {
    console.log(`📡 Connecting to Soundcraft Ui24R at ${IP}...`);
  }

  const mixer = new SoundcraftUi24R(IP);

  try {
    await mixer.connect();
    if (!asJson) {
      console.log(`✅ Connected successfully. Sampling live telemetry for ${durationMs / 1000}s...`);
    }

    const livePeaks = Array.from({ length: 24 }, () => ({
      preMax: -100,
      postMax: -100,
      gateOpenCount: 0,
      samples: 0
    }));

    mixer.onVU((meters) => {
      meters.forEach((m) => {
        const idx = m.channel - 1;
        if (idx < 24) {
          const lp = livePeaks[idx];
          lp.samples++;
          if (m.preDB > lp.preMax) lp.preMax = m.preDB;
          if (m.postDB > lp.postMax) lp.postMax = m.postDB;
          if (m.gateOpen) lp.gateOpenCount++;
        }
      });
    });

    await new Promise((resolve) => setTimeout(resolve, durationMs));

    const channels = [];
    for (let i = 0; i < 24; i++) {
      const p = `i.${i}.`;
      const name = mixer.get(`${p}name`) || `CH ${i + 1}`;
      const src = mixer.get(`${p}src`) || 'none';
      const isMuted = mixer.get(`${p}mute`) === '1';
      const faderVal = parseFloat(mixer.get(`${p}mix`) || '0');
      const faderDB = faderVal <= 0 ? -100 : converters.VtoDB(faderVal);
      const phantom = mixer.get(`hw.${i}.phantom`) === '1';
      const hwGainVal = mixer.get(`hw.${i}.gain`);
      const gainDB = hwGainVal !== undefined ? converters.VtoGAIN24(parseFloat(hwGainVal)) : null;

      // Noise Gate
      const gateBypass = mixer.get(`${p}gate.bypass`) === '1';
      const gateThresh = converters.VtoGATE_THRESH(parseFloat(mixer.get(`${p}gate.thresh`) || '0'));
      const gateHold = converters.VtoGATE_HOLD(parseFloat(mixer.get(`${p}gate.hold`) || '0'));

      // Compressor
      const compBypass = mixer.get(`${p}dyn.bypass`) === '1';
      const compRatio = converters.VtoRATIO(parseFloat(mixer.get(`${p}dyn.ratio`) || '0'));
      const compGain = converters.VtoDYNOUTGAIN(parseFloat(mixer.get(`${p}dyn.outgain`) || '0.3333'));

      const lp = livePeaks[i];

      channels.push({
        channel: i + 1,
        name: name,
        source: src,
        preampGainDB: gainDB,
        phantom48V: phantom,
        muted: isMuted,
        faderDB: Math.round(faderDB * 10) / 10,
        prePeakDBFS: Math.round(lp.preMax * 10) / 10,
        postPeakDBFS: Math.round(lp.postMax * 10) / 10,
        gate: {
          bypass: gateBypass,
          thresholdDB: Math.round(gateThresh),
          holdMs: gateHold
        },
        compressor: {
          bypass: compBypass,
          ratio: Math.round(compRatio * 10) / 10,
          makeupGainDB: Math.round(compGain * 10) / 10
        }
      });
    }

    if (asJson) {
      console.log(JSON.stringify({ ip: IP, timestamp: new Date().toISOString(), channels }, null, 2));
      return;
    }

    console.log('\n================================================================================================');
    console.log(`                     SOUNDCRAFT Ui24R CHANNEL CONFIGURATION AUDIT (${IP})                      `);
    console.log('================================================================================================');
    console.log(
      `${'CH'.padEnd(4)} ` +
      `${'NAME'.padEnd(12)} ` +
      `${'SRC'.padEnd(8)} ` +
      `${'GAIN'.padEnd(7)} ` +
      `${'+48V'.padEnd(6)} ` +
      `${'MUTE'.padEnd(6)} ` +
      `${'FADER'.padEnd(8)} ` +
      `${'PEAK(PRE)'.padEnd(11)} ` +
      `${'GATE'.padEnd(16)} ` +
      `${'COMP'}`
    );
    console.log('------------------------------------------------------------------------------------------------');

    for (const c of channels) {
      const chStr = String(c.channel).padStart(2, '0');
      const nameStr = c.name.slice(0, 11).padEnd(12);
      const srcStr = c.source.padEnd(8);
      const gainStr = (c.preampGainDB !== null ? `${c.preampGainDB}dB` : 'N/A').padEnd(7);
      const p48Str = (c.phantom48V ? 'ON' : 'OFF').padEnd(6);
      const muteStr = (c.muted ? 'MUTED' : 'LIVE').padEnd(6);
      const faderStr = (c.faderDB <= -99 ? '-inf' : `${c.faderDB}dB`).padEnd(8);
      const peakStr = (c.prePeakDBFS <= -99 ? '-inf' : `${c.prePeakDBFS}dB`).padEnd(11);
      const gateStr = (c.gate.bypass ? 'BYPASS' : `${c.gate.thresholdDB}dB/${c.gate.holdMs}ms`).padEnd(16);
      const compStr = c.compressor.bypass ? 'BYPASS' : `${c.compressor.ratio}:1/+${c.compressor.makeupGainDB}dB`;

      console.log(
        `${chStr.padEnd(4)} ` +
        `${nameStr} ` +
        `${srcStr} ` +
        `${gainStr} ` +
        `${p48Str} ` +
        `${muteStr} ` +
        `${faderStr} ` +
        `${peakStr} ` +
        `${gateStr} ` +
        `${compStr}`
      );
    }
    console.log('================================================================================================\n');

  } catch (err) {
    console.error('❌ Audit Error:', err.message);
    process.exit(1);
  } finally {
    mixer.disconnect();
    process.exit(0);
  }
}

main();
