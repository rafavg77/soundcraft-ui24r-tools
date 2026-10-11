/**
 * @file converters.js
 * @description Parameter and telemetry conversion formulas for Soundcraft Ui digital mixers.
 * Reverse-engineered from Soundcraft Ui24R firmware Web UI engine.
 */

'use strict';

/**
 * Preamp gain table (64 steps) for Studer preamps on Soundcraft Ui24R (dB).
 * @constant {number[]}
 */
const UI24R_GAINS = [
  -5, -5, -3, -3, -1, -1, 1, 1, 3, 3, 5, 5, 7, 7, 9, 9, 11, 11, 13, 13, 15, 15, 17, 17, 19, 19, 21, 21, 23, 23,
  25, 25, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50,
  51, 52, 53, 54, 55, 56, 57, 58
];

/**
 * Converts a raw byte value from the VU2 meter packet to normalized meter value (0.0 to 1.0).
 * @param {number} a - Raw byte (0..240)
 * @returns {number}
 */
function deconvertVU(a) {
  return 0.004167508166392142 * a;
}

/**
 * Converts a compressor gain reduction byte from the VU2 packet to normalized value (0.0 to 1.0).
 * @param {number} a - Raw byte
 * @returns {number}
 */
function deconvertVU_comp(a) {
  let val = 1 - 0.004167508166392142 * (a | ((a >> 7) & 1));
  if (val < 0.008) val = 0;
  else if (val > 1) val = 1;
  return val;
}

/**
 * Converts normalized UI slider position (0.0 to 1.0) to linear gain multiplier.
 * Uses the piecewise logarithmic curve designed by Harman/Soundcraft.
 * @param {number} a - Normalized slider position (0.0 - 1.0)
 * @returns {number} Linear gain multiplier
 */
function VtoLIN(a) {
  return (
    2.676529517952372e-4 *
    Math.exp(a * (23.90844819639692 + a * (-26.23877598214595 + (12.195249692570245 - 0.4878099877028098 * a) * a))) *
    (a < 0.055 ? Math.sin(28.559933214452666 * a) : 1)
  );
}

/**
 * Converts normalized UI slider position (0.0 to 1.0) to decibels (dBFS / dB).
 * @param {number} a - Normalized slider position (0.0 - 1.0)
 * @returns {number} Decibels (-100 to +10 dB)
 */
function VtoDB(a) {
  if (a < 0.001) return -100;
  const lin = VtoLIN(a);
  return (20 * Math.log10(lin) * 10 + 0.45 | 0) / 10;
}

/**
 * Internal non-linear squaring curve for time and threshold parameters.
 * @private
 */
function desqr(a) {
  return 1 - (1 - a) * (1 - a);
}

/**
 * Converts normalized Noise Gate threshold value to dB (-90 to +6 dB).
 * @param {number} a - Normalized value (0.0 - 1.0)
 * @returns {number} Threshold in dB
 */
function VtoGATE_THRESH(a) {
  return 96 * a - 90;
}

/**
 * Converts normalized Noise Gate attack value to milliseconds (1 to 400 ms).
 * @param {number} a - Normalized value (0.0 - 1.0)
 * @returns {number} Attack in ms
 */
function VtoGATE_ATTACK(a) {
  return Math.round(1 * Math.pow(400, desqr(a)));
}

/**
 * Converts normalized Noise Gate release value to milliseconds (5 to 2000 ms).
 * @param {number} a - Normalized value (0.0 - 1.0)
 * @returns {number} Release in ms
 */
function VtoGATE_RELEASE(a) {
  return Math.round(5 * Math.pow(400, desqr(a)));
}

/**
 * Converts normalized Noise Gate hold value to milliseconds (1 to 2000 ms).
 * @param {number} a - Normalized value (0.0 - 1.0)
 * @returns {number} Hold in ms
 */
function VtoGATE_HOLD(a) {
  return Math.round(1 * Math.pow(2000, desqr(a)));
}

/**
 * Converts normalized Noise Gate depth (attenuation floor) to dB (-60 to 0 dB).
 * @param {number} a - Normalized value (0.0 - 1.0)
 * @returns {number} Depth in dB
 */
function VtoGATE_DEPTH(a) {
  return 60 * a - 60;
}

/**
 * Converts normalized Compressor threshold to dB (-90 to +6 dB).
 * @param {number} a - Normalized value (0.0 - 1.0)
 * @returns {number} Threshold in dB
 */
function VtoTHRESH(a) {
  return -90 + 96 * a;
}

/**
 * Converts normalized Compressor ratio (0.0 - 1.0) to ratio multiplier (1:1 to 50:1 / inf).
 * @param {number} a - Normalized value
 * @returns {number} Ratio
 */
function VtoRATIO(a) {
  return a <= 0 ? 50 : Math.min(50, 1 / a);
}

/**
 * Converts normalized Compressor attack time to milliseconds (1 to 400 ms).
 * @param {number} a - Normalized value (0.0 - 1.0)
 * @returns {number} Attack in ms
 */
function VtoATTACK(a) {
  return Math.round(1 * Math.pow(400, desqr(a)));
}

/**
 * Converts normalized Compressor release time to milliseconds (10 to 2000 ms).
 * @param {number} a - Normalized value (0.0 - 1.0)
 * @returns {number} Release in ms
 */
function VtoREL(a) {
  return Math.round(10 * Math.pow(200, desqr(a)));
}

/**
 * Converts normalized Compressor makeup gain to dB (-24 to +48 dB).
 * @param {number} a - Normalized value (0.0 - 1.0)
 * @returns {number} Output makeup gain in dB
 */
function VtoDYNOUTGAIN(a) {
  return 72 * a - 24;
}

/**
 * Converts normalized Parametric EQ frequency to Hz (20 Hz to 22.05 kHz).
 * @param {number} a - Normalized value (0.0 - 1.0)
 * @returns {number} Frequency in Hz
 */
function VtoFREQ(a) {
  return Math.round(20 * Math.pow(1102.5, a));
}

/**
 * Converts normalized Parametric EQ Q-factor (bandwidth).
 * @param {number} a - Normalized value (0.0 - 1.0)
 * @returns {number} Q factor
 */
function VtoQ(a) {
  return 0.05 * Math.pow(300, a);
}

/**
 * Converts normalized Parametric EQ band gain to dB (-20 to +20 dB).
 * @param {number} a - Normalized value (0.0 - 1.0)
 * @returns {number} Gain in dB
 */
function VtoEQGAIN20(a) {
  return 40 * a - 20;
}

/**
 * Converts normalized hardware gain parameter to Studer analog preamp dB value (-6 to +57 dB).
 * @param {number} a - Normalized parameter value (0.0 - 1.0)
 * @returns {number|null} Analog gain in dB
 */
function VtoGAIN24(a) {
  if (a === undefined || a === null) return null;
  let idx = (64 * a) | 0;
  if (idx < 0) idx = 0;
  if (idx > 63) idx = 63;
  return UI24R_GAINS[idx] - 1;
}

module.exports = {
  UI24R_GAINS,
  deconvertVU,
  deconvertVU_comp,
  VtoLIN,
  VtoDB,
  VtoGATE_THRESH,
  VtoGATE_ATTACK,
  VtoGATE_RELEASE,
  VtoGATE_HOLD,
  VtoGATE_DEPTH,
  VtoTHRESH,
  VtoRATIO,
  VtoATTACK,
  VtoREL,
  VtoDYNOUTGAIN,
  VtoFREQ,
  VtoQ,
  VtoEQGAIN20,
  VtoGAIN24
};
