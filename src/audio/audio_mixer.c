/**
 * @file audio_mixer.c
 * @brief High-performance multi-track audio summing and normalization engine implementation.
 */

#include "audio_mixer.h"
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <math.h>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

#ifndef M_SQRT2
#define M_SQRT2 1.41421356237309504880
#endif

/**
 * Clamps floating point sample value to int16 range [-32768, 32767].
 */
static inline int16_t clamp16(float v) {
    if (v > 32767.0f) return 32767;
    if (v < -32768.0f) return -32768;
    return (int16_t)roundf(v);
}

void mix_audio(
    const int16_t **tracks,
    const float *gains,
    const float *pans,
    int num_tracks,
    size_t start_frame,
    size_t num_frames,
    float target_peak_dbfs,
    int16_t *out_stereo,
    int16_t *out_mono,
    float *measured_peak_dbfs,
    float *applied_gain_db
) {
    if (!tracks || num_tracks <= 0 || num_frames == 0) {
        if (measured_peak_dbfs) *measured_peak_dbfs = -100.0f;
        if (applied_gain_db) *applied_gain_db = 0.0f;
        return;
    }

    float *temp_l = (float *)calloc(num_frames, sizeof(float));
    float *temp_r = (float *)calloc(num_frames, sizeof(float));

    if (!temp_l || !temp_r) {
        if (temp_l) free(temp_l);
        if (temp_r) free(temp_r);
        return;
    }

    // Accumulate each track into left and right 32-bit float buses
    for (int t = 0; t < num_tracks; t++) {
        const int16_t *src = tracks[t];
        if (!src) continue;

        float g = gains ? gains[t] : 1.0f;
        float p = pans ? pans[t] : 0.0f; // -1.0 (Left) to +1.0 (Right)

        // Constant power pan law (-3 dB at center)
        // pan_angle maps [-1, +1] to [0, pi/2]
        float angle = (p + 1.0f) * 0.25f * (float)M_PI;
        float gain_l = g * cosf(angle) * (float)M_SQRT2;
        float gain_r = g * sinf(angle) * (float)M_SQRT2;

        const int16_t *track_data = src + start_frame;

        for (size_t i = 0; i < num_frames; i++) {
            float s = (float)track_data[i];
            temp_l[i] += s * gain_l;
            temp_r[i] += s * gain_r;
        }
    }

    // Scan for true peak amplitude in the unnormalized mix
    float max_peak = 0.0f;
    for (size_t i = 0; i < num_frames; i++) {
        float abs_l = fabsf(temp_l[i]);
        float abs_r = fabsf(temp_r[i]);
        if (abs_l > max_peak) max_peak = abs_l;
        if (abs_r > max_peak) max_peak = abs_r;
    }

    float raw_peak_db = (max_peak > 0.0f) ? (20.0f * log10f(max_peak / 32768.0f)) : -100.0f;
    if (measured_peak_dbfs) {
        *measured_peak_dbfs = raw_peak_db;
    }

    // Calculate normalizer gain factor to hit target_peak_dbfs
    float target_linear = 32768.0f * powf(10.0f, target_peak_dbfs / 20.0f);
    float norm_factor = (max_peak > 0.0f) ? (target_linear / max_peak) : 1.0f;
    
    if (applied_gain_db) {
        *applied_gain_db = 20.0f * log10f(norm_factor);
    }

    // Apply normalization and render to destination buffers
    for (size_t i = 0; i < num_frames; i++) {
        float l = temp_l[i] * norm_factor;
        float r = temp_r[i] * norm_factor;

        if (out_stereo) {
            out_stereo[2 * i] = clamp16(l);
            out_stereo[2 * i + 1] = clamp16(r);
        }

        if (out_mono) {
            float m = (l + r) * 0.5f;
            out_mono[i] = clamp16(m);
        }
    }

    free(temp_l);
    free(temp_r);
}

void analyze_track_stats(
    const int16_t *samples,
    size_t num_samples,
    float *out_peak_dbfs,
    float *out_rms_dbfs,
    int16_t *out_peak_raw
) {
    if (!samples || num_samples == 0) {
        if (out_peak_dbfs) *out_peak_dbfs = -100.0f;
        if (out_rms_dbfs) *out_rms_dbfs = -100.0f;
        if (out_peak_raw) *out_peak_raw = 0;
        return;
    }

    int16_t max_val = 0;
    double sum_sq = 0.0;

    for (size_t i = 0; i < num_samples; i++) {
        int16_t s = samples[i];
        int16_t a = (s < 0) ? (int16_t)(-s) : s;
        if (a > max_val) max_val = a;
        sum_sq += (double)s * (double)s;
    }

    float peak_db = (max_val > 0) ? (float)(20.0 * log10((double)max_val / 32768.0)) : -100.0f;
    double mean_sq = sum_sq / (double)num_samples;
    double rms = sqrt(mean_sq);
    float rms_db = (rms > 0.0) ? (float)(20.0 * log10(rms / 32768.0)) : -100.0f;

    if (out_peak_dbfs) *out_peak_dbfs = peak_db;
    if (out_rms_dbfs) *out_rms_dbfs = rms_db;
    if (out_peak_raw) *out_peak_raw = max_val;
}

