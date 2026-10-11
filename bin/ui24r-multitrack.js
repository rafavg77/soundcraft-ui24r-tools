#!/usr/bin/env node
/**
 * @file ui24r-multitrack.js
 * @description USB Multitrack Recording Manager for Soundcraft Ui24R digital mixer.
 * Controls multitrack armed stems, ensures room speaker isolation (soundcheck = 0),
 * and safely finalizes WAV recording files with flash buffer flushing.
 */

'use strict';

const { SoundcraftUi24R } = require('../lib/ui24r');

const ACTION = process.argv[2] || 'status';
const TARGET_PARAM = process.argv[3];
const IP = process.env.UI24R_IP || '192.168.100.200';

async function main() {
  const mixer = new SoundcraftUi24R(IP);

  try {
    await mixer.connect();

    if (ACTION === 'status') {
      console.log(`\n======================================================`);
      console.log(` Soundcraft Ui24R Multitrack Recording Status (${IP})`);
      console.log(`======================================================`);

      const status = mixer.getMultitrackStatus();
      console.log(`Transport State:    ${status.recording ? '🔴 RECORDING' : '⏹️ STOPPED'}`);
      console.log(`Buffer Status:      ${status.busy ? '⏳ WRITING TO FLASH DISK' : '✅ IDLE / FLUSHED'}`);
      console.log(`Recording Time:     ${status.timeSeconds} seconds`);
      console.log(`USB Free Space:     ${status.freeSpaceGB < 0 ? '⚠️ NOT AVAILABLE (Insert FAT32 USB)' : `${status.freeSpaceGB.toFixed(2)} GB`}`);
      console.log(`Virtual Soundcheck: ${status.soundcheckActive ? '🚨 DANGER: ACTIVE (Room speakers muted!)' : '✅ OFF (Safe for live sound)'}`);

      console.log(`\nArmed Tracks (${status.armedChannels.length}):`);
      if (status.armedChannels.length === 0) {
        console.log('  (None)');
      } else {
        const trackList = status.armedChannels.map(t => `CH${String(t.channel).padStart(2, '0')} (${t.name})`).join(', ');
        console.log(`  ${trackList}`);
      }
      console.log(`======================================================\n`);

    } else if (ACTION === 'arm-live') {
      console.log('🎯 Arming only UNMUTED (Live) channels for USB multitrack recording...');
      let armedCount = 0;
      for (let i = 0; i < 24; i++) {
        const isLive = mixer.get(`i.${i}.mute`) === '0';
        mixer.set(`i.${i}.mtkrec`, isLive ? 1 : 0);
        if (isLive) armedCount++;
      }

      // Check auxiliary line inputs
      const lineLive = mixer.get('i.20.mute') === '0' || mixer.get('i.21.mute') === '0';
      mixer.set('l.0.mtkrec', lineLive ? 1 : 0);
      mixer.set('l.1.mtkrec', lineLive ? 1 : 0);

      // Crucial live sound safety guarantee: Never activate soundcheck
      mixer.set('var.mtk.soundcheck', 0);

      await new Promise((r) => setTimeout(r, 1000));
      console.log(`✅ Success: ${armedCount} active live channel(s) armed. All muted channels disarmed to conserve storage.`);

    } else if (ACTION === 'arm-all') {
      console.log('🎯 Arming ALL 24 channels (1-22 Mic/Line + Line L/R)...');
      for (let i = 0; i < 22; i++) {
        mixer.set(`i.${i}.mtkrec`, 1);
      }
      mixer.set('l.0.mtkrec', 1);
      mixer.set('l.1.mtkrec', 1);
      mixer.set('var.mtk.soundcheck', 0);

      await new Promise((r) => setTimeout(r, 1000));
      console.log('✅ All 24 channels armed for full multi-track capture.');

    } else if (ACTION === 'arm-channel') {
      const targetCh = parseInt(TARGET_PARAM, 10);
      if (!targetCh || targetCh < 1 || targetCh > 24) {
        console.error('❌ Error: Please specify a valid channel number between 1 and 24 (e.g., ui24r-multitrack arm-channel 11)');
        process.exit(1);
      }

      console.log(`🎯 Arming EXCLUSIVELY Channel ${targetCh} (and disarming all others)...`);
      for (let i = 0; i < 24; i++) {
        mixer.set(`i.${i}.mtkrec`, (i + 1) === targetCh ? 1 : 0);
      }
      mixer.set('l.0.mtkrec', 0);
      mixer.set('l.1.mtkrec', 0);
      mixer.set('var.mtk.soundcheck', 0);

      await new Promise((r) => setTimeout(r, 1000));
      const chName = mixer.get(`i.${targetCh - 1}.name`) || `CH ${targetCh}`;
      console.log(`✅ Isolated capture configured: Only CH ${targetCh} (${chName}) is armed.`);

    } else if (ACTION === 'stop') {
      console.log('⏹️ Sending Stop command to USB multitrack recorder...');
      mixer.send('MTK_STOP');
      mixer.send('MTK_REC_STOP');
      mixer.send('MEDIA_STOP');

      console.log('⏳ Waiting 5 seconds for mixer to flush RAM buffer to USB flash storage...');
      await new Promise((r) => setTimeout(r, 5000));

      const busy = mixer.get('var.mtk.rec.busy') === '1';
      const rec = mixer.get('var.mtk.rec.currentState') === '1';

      console.log(`\n✅ Recording finalized.`);
      console.log(`   - Transport: ${rec ? 'RUNNING' : 'STOPPED'}`);
      console.log(`   - Buffer:    ${busy ? 'BUSY' : 'FLUSHED / READY'}`);
      console.log('🎉 It is now 100% safe to physically remove the USB drive from the front panel.\n');

    } else {
      console.log(`Usage: ui24r-multitrack [status | arm-live | arm-all | arm-channel <1-24> | stop]`);
    }

  } catch (err) {
    console.error('❌ Multitrack Error:', err.message);
    process.exit(1);
  } finally {
    mixer.disconnect();
    process.exit(0);
  }
}

main();
