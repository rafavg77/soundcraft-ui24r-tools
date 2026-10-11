#!/usr/bin/env node
/**
 * @file ui24r-fix-karime.js
 * @description Dedicated quick-fix script for Channel 12 (Lead Vocalist).
 * Applies vocal dynamic calibration: Noise Gate Bypass, Soft-Knee Compressor, and HPF 105 Hz.
 */

'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const calibrateScript = path.join(__dirname, 'ui24r-calibrate.js');
const res = spawnSync('node', [calibrateScript, '12', 'vocal'], { stdio: 'inherit' });
process.exit(res.status || 0);
