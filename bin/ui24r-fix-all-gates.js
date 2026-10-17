#!/usr/bin/env node
/**
 * @file ui24r-fix-all-gates.js
 * @description Bypasses noise gates across all active stage channels on the Soundcraft Ui24R.
 * Eliminates syllable truncations and digital zero dropouts during rehearsals and live recordings.
 */

'use strict';

const { SoundcraftUi24R } = require('../lib/ui24r');

const IP = process.env.UI24R_IP || '192.168.100.200';
// Target active vocals and band channels: 1, 2, 5, 6, 7, 9, 11, 12, 13, 14, 15, 16, 17, 20
const CHANNELS = [1, 2, 5, 6, 7, 9, 11, 12, 13, 14, 15, 16, 17, 20];

async function main() {
  console.log(`\n======================================================`);
  console.log(` Soundcraft Ui24R — Worship Channels Gate Bypass Fix`);
  console.log(` Mixer IP: ${IP}`);
  console.log(`======================================================`);

  const mixer = new SoundcraftUi24R(IP);

  try {
    await mixer.connect();
    console.log(' Connected. Bypassing noise gates on all stage channels...\n');

    for (const ch of CHANNELS) {
      const idx = ch - 1;
      const p = `i.${idx}.`;
      const name = mixer.get(`${p}name`) || `CH ${ch}`;

      // Bypass gate & set safe fallback thresholds
      mixer.set(`${p}gate.bypass`, 1);
      mixer.set(`${p}gate.thresh`, 0);      // -90 dB
      mixer.set(`${p}gate.hold`, 0.40);     // 400ms hold
      mixer.set(`${p}gate.release`, 0.35);  // 350ms release

      console.log(`  [+] CH ${String(ch).padStart(2, '0')} (${name.padEnd(12)}): Gate BYPASSED ✅`);
    }

    await new Promise((r) => setTimeout(r, 1000));
    console.log(`\n✅ All ${CHANNELS.length} worship channels now have Noise Gates bypassed.`);
    console.log(`🎉 Multitrack recordings will now be 100% continuous without syllable cutoffs!\n`);

  } catch (err) {
    console.error('❌ Error applying gate bypasses:', err.message);
    process.exit(1);
  } finally {
    mixer.disconnect();
    process.exit(0);
  }
}

main();
