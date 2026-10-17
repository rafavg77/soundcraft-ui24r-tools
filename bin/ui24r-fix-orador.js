#!/usr/bin/env node
/**
 * @file ui24r-fix-orador.js
 * @description Dedicated quick-fix script for Channel 15 (Speaker / Preacher / Spoken Word).
 * Applies speech intelligibility calibration: Preamp +24 dB, Noise Gate Bypass,
 * Smooth 2.7:1 Speech Compressor, and 90 Hz High-Pass filter.
 */

'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const calibrateScript = path.join(__dirname, 'ui24r-calibrate.js');
const res = spawnSync('node', [calibrateScript, '15', 'speech'], { stdio: 'inherit' });
process.exit(res.status || 0);
