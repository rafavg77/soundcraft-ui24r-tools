#!/usr/bin/env node
/**
 * @file ui24r-mute.js
 * @description Channel Mute and Unmute CLI controller for Soundcraft Ui24R digital mixer.
 */

'use strict';

const { SoundcraftUi24R } = require('../lib/ui24r');

const CMD = process.argv[2];
const CHANNEL = parseInt(process.argv[3], 10);
const IP = process.env.UI24R_IP || '192.168.100.200';

async function main() {
  if (!CMD || (CMD !== 'status' && CMD !== 'mute-all' && CMD !== 'unmute-all' && (!CHANNEL || CHANNEL < 1 || CHANNEL > 24))) {
    console.log('Usage:');
    console.log('  ui24r-mute mute <channel 1-24>');
    console.log('  ui24r-mute unmute <channel 1-24>');
    console.log('  ui24r-mute toggle <channel 1-24>');
    console.log('  ui24r-mute mute-all');
    console.log('  ui24r-mute unmute-all');
    console.log('  ui24r-mute status');
    process.exit(1);
  }

  const mixer = new SoundcraftUi24R(IP);

  try {
    await mixer.connect();

    if (CMD === 'status') {
      console.log(`\n=== CHANNEL MUTE STATUS (${IP}) ===`);
      for (let i = 0; i < 24; i++) {
        const name = mixer.get(`i.${i}.name`) || `CH ${i + 1}`;
        const isMuted = mixer.get(`i.${i}.mute`) === '1';
        console.log(`CH ${String(i + 1).padStart(2, '0')} (${name.padEnd(12)}): ${isMuted ? '🔴 MUTED' : '🟢 LIVE'}`);
      }
      console.log('====================================\n');
      return;
    }

    if (CMD === 'mute-all') {
      console.log('🔇 Muting all input channels...');
      for (let i = 0; i < 24; i++) {
        mixer.set(`i.${i}.mute`, 1);
      }
      console.log('✅ All 24 channels muted.');
      return;
    }

    if (CMD === 'unmute-all') {
      console.log('🔊 Unmuting all input channels...');
      for (let i = 0; i < 24; i++) {
        mixer.set(`i.${i}.mute`, 0);
      }
      console.log('✅ All 24 channels unmuted.');
      return;
    }

    const idx = CHANNEL - 1;
    const name = mixer.get(`i.${idx}.name`) || `CH ${CHANNEL}`;
    const curMute = mixer.get(`i.${idx}.mute`) === '1';

    let targetMute = curMute;
    if (CMD === 'mute') targetMute = true;
    else if (CMD === 'unmute') targetMute = false;
    else if (CMD === 'toggle') targetMute = !curMute;

    mixer.set(`i.${idx}.mute`, targetMute ? 1 : 0);
    await new Promise((r) => setTimeout(r, 200));

    console.log(`✅ CH ${CHANNEL} (${name}) is now: ${targetMute ? '🔴 MUTED' : '🟢 LIVE / UNMUTED'}`);

  } catch (err) {
    console.error('❌ Mute Error:', err.message);
    process.exit(1);
  } finally {
    mixer.disconnect();
    process.exit(0);
  }
}

main();
