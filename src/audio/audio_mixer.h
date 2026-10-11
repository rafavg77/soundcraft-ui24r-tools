/**
 * @file audio_mixer.h
 * @brief High-performance multi-track audio summing and normalization engine for Soundcraft Ui WAV stems.
 *
 * Implements constant-power pan law (-3 dB center), 64-bit double precision accumulation,
 * true peak scanning, and non-clipping gain normalization.
 */

#ifndef AUDIO_MIXER_H
#define AUDIO_MIXER_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Mixes multiple mono 16-bit PCM audio tracks into a normalized stereo or mono output buffer.
 *
 * @param tracks Array of pointers to mono 16-bit PCM buffers for each track.
 * @param gains Array of linear gain multipliers for each track (1.0 = unity).
 * @param pans Array of stereo pan positions for each track (-1.0 = 100% Left, 0.0 = Center, +1.0 = 100% Right).
 * @param num_tracks Total number of audio tracks.
 * @param start_frame Starting sample frame offset (for cutting/slicing).
 * @param num_frames Number of sample frames to process.
 * @param target_peak_dbfs Desired target peak level in dBFS (e.g., -1.0f).
 * @param out_stereo Interleaved 16-bit stereo destination buffer (size: num_frames * 2 int16), or NULL.
 * @param out_mono Mono 16-bit destination buffer (size: num_frames int16), or NULL.
 * @param measured_peak_dbfs Output pointer returning the measured raw peak level before normalization.
 * @param applied_gain_db Output pointer returning the gain boost/attenuation in dB applied during normalization.
 */
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
);

/**
 * Rapidly scans a mono 16-bit PCM buffer to calculate true peak and RMS metrics.
 *
 * @param samples Pointer to mono 16-bit PCM sample array.
 * @param num_samples Number of samples to scan.
 * @param out_peak_dbfs Output pointer returning peak level in dBFS.
 * @param out_rms_dbfs Output pointer returning RMS level in dBFS.
 * @param out_peak_raw Output pointer returning absolute maximum raw int16 sample value.
 */
void analyze_track_stats(
    const int16_t *samples,
    size_t num_samples,
    float *out_peak_dbfs,
    float *out_rms_dbfs,
    int16_t *out_peak_raw
);

#ifdef __cplusplus
}
#endif

#endif /* AUDIO_MIXER_H */
