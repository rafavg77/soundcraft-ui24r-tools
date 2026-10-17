#!/usr/bin/env node
/**
 * @file ui24r-calibrate.js
 * @description Universal DSP Channel Calibrator for Soundcraft Ui24R digital mixer.
 * Applies professionally tuned Gain Staging, Noise Gate Bypass, Vocal Compressor,
 * and High-Pass EQ curves to eliminate dropouts and enhance intelligibility.
 */

'use strict';

const { SoundcraftUi24R } = require('../lib/ui24r');

const CHANNEL = parseInt(process.argv[2], 10);
const PRESET = process.argv[3] || 'speech';
const IP = process.env.UI24R_IP || '192.168.100.200';

const PRESETS = {
  speech: {
    name: 'Spoken Word & Preacher / Orator',
    description: 'High speech intelligibility, wide dynamic range, dropout prevention',
    settings: {
      preampGain: 0.50,          // Approx +24 dB Studer analog preamp
      gateBypass: 1,             // Mandatory bypass to prevent cutting off words
      gateThresh: 0.2604,        // Fallback safety threshold: -65 dB
      gateHold: 0.1705,          // 350 ms hold
      gateRelease: 0.20,         // 400 ms release
      compBypass: 0,             // Compressor active
      compRatio: 0.37,           // ~2.7:1 smooth ratio
      compThreshold: 0.656,      // -27.0 dBFS threshold
      compAttack: 0.244,         // 25 ms attack (preserves speech consonants)
      compRelease: 0.283,        // 300 ms release (prevents unnatural pumping)
      compOutGain: 0.4028,       // +5.0 dB makeup gain
      compSoftKnee: 1,           // Musical gradual knee
      hpfFreq: 0.213,            // 90 Hz high-pass filter (removes stage rumble/plosives)
      lpfFreq: 1.0,              // 20 kHz fully open air
      eqBypass: 0
    }
  },
  vocal: {
    name: 'Lead / Worship Vocalist',
    description: 'Musical singing dynamic control, soft knee compression, open gate',
    settings: {
      gateBypass: 1,             // Mandatory bypass to prevent cutting off low phrases
      gateThresh: 0.229,         // Fallback safety threshold: -68 dB
      gateHold: 0.1705,          // 350 ms hold
      compBypass: 0,             // Compressor active
      compRatio: 0.333,          // ~3.0:1 ratio
      compThreshold: 0.645,      // -28.0 dBFS threshold
      compAttack: 0.27,          // 30 ms attack
      compRelease: 0.283,        // 300 ms release
      compOutGain: 0.4306,       // +7.0 dB makeup gain
      compSoftKnee: 1,           // Musical gradual knee
      hpfFreq: 0.244,            // 105 Hz high-pass filter
      eqBypass: 0
    }
  }
};

async function main() {
  if (!CHANNEL || CHANNEL < 1 || CHANNEL > 24) {
    console.log('Usage:');
    console.log('  ui24r-calibrate <channel 1-24> [speech | vocal]');
    console.log('\nAvailable Presets:');
    console.log('  speech - Optimized for spoken word, preaching, and podcasting (default)');
    console.log('  vocal  - Optimized for lead and backing vocalists');
    process.exit(1);
  }

  const presetConfig = PRESETS[PRESET];
  if (!presetConfig) {
    console.error(`❌ Unknown preset: ${PRESET}. Valid options are: speech, vocal`);
    process.exit(1);
  }

  const idx = CHANNEL - 1;
  const p = `i.${idx}.`;

  console.log(`\n================================================================`);
  console.log(` Soundcraft Ui24R Channel DSP Calibration (${IP})`);
  console.log(`================================================================`);
  console.log(` Target Channel: CH ${CHANNEL}`);
  console.log(` Preset:         ${presetConfig.name} (${PRESET})`);
  console.log(` Description:    ${presetConfig.description}`);
  console.log(`----------------------------------------------------------------`);

  const mixer = new SoundcraftUi24R(IP);

  try {
    await mixer.connect();
    const chName = mixer.get(`${p}name`) || `CH ${CHANNEL}`;
    console.log(` Connected. Applying calibrated DSP settings to "${chName}"...`);

    const s = presetConfig.settings;

    // 1. Studer Analog Preamp Gain (if defined)
    if (s.preampGain !== undefined) {
      mixer.set(`hw.${idx}.gain`, s.preampGain);
      console.log(`  [+] Analog Preamp: +24 dB nominal level`);
    }

    // 2. Noise Gate (Bypass & Safety Fallback)
    mixer.set(`${p}gate.bypass`, s.gateBypass);
    mixer.set(`${p}gate.thresh`, s.gateThresh);
    mixer.set(`${p}gate.hold`, s.gateHold);
    if (s.gateRelease) mixer.set(`${p}gate.release`, s.gateRelease);
    console.log(`  [+] Noise Gate:    BYPASS ENABLED (Fallback: -65 dB, 350ms Hold)`);

    // 3. Dynamic Compressor
    mixer.set(`${p}dyn.bypass`, s.compBypass);
    mixer.set(`${p}dyn.ratio`, s.compRatio);
    mixer.set(`${p}dyn.thresh`, s.compThreshold);
    mixer.set(`${p}dyn.attack`, s.compAttack);
    mixer.set(`${p}dyn.release`, s.compRelease);
    mixer.set(`${p}dyn.outgain`, s.compOutGain);
    mixer.set(`${p}dyn.softknee`, s.compSoftKnee);
    console.log(`  [+] Compressor:    ACTIVE (Soft-Knee ON, smooth attack/release, clean makeup gain)`);

    // 4. Equalizer / High-Pass Filter
    mixer.set(`${p}eq.bypass`, s.eqBypass);
    mixer.set(`${p}eq.hpffreq`, s.hpfFreq);
    mixer.set(`${p}eq.hpf.freq`, s.hpfFreq);
    mixer.set(`${p}eq.hpf.slope`, 1);
    if (s.lpfFreq) {
      mixer.set(`${p}eq.lpffreq`, s.lpfFreq);
      mixer.set(`${p}eq.lpf.freq`, s.lpfFreq);
    }
    console.log(`  [+] High-Pass EQ:  ACTIVE (Stage rumble filtered below HPF cutoff)`);

    // Ensure channel is unmuted and armed safely
    mixer.set(`${p}mute`, 0);

    await new Promise((r) => setTimeout(r, 800));
    console.log(`\n✅ Calibration completed successfully for CH ${CHANNEL} (${chName}).`);
    console.log(`================================================================\n`);

  } catch (err) {
    console.error('❌ Calibration Error:', err.message);
    process.exit(1);
  } finally {
    mixer.disconnect();
    process.exit(0);
  }
}

main();
