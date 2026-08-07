import { describe, it, expect, afterEach } from 'vitest';
import {
  voiceInterviewMode,
  voiceInterviewEnabled,
  realtimeModel,
  realtimeVoice,
  DEFAULT_REALTIME_MODEL,
  DEFAULT_REALTIME_VOICE,
} from './config';

/**
 * The gating contract, pinned: the Realtime path turns on ONLY when a key is
 * present AND the feature is explicitly enabled. Every other combination — no
 * key, disabled, both missing — degrades to the keyless fallback and never
 * throws. Model/voice are env-overridable with sane defaults.
 */

const KEY = 'OPENAI_API_KEY';
const ENABLED = 'VOICE_INTERVIEW_ENABLED';
const MODEL = 'VOICE_INTERVIEW_MODEL';
const VOICE = 'VOICE_INTERVIEW_VOICE';

function reset() {
  delete process.env[KEY];
  delete process.env[ENABLED];
  delete process.env[MODEL];
  delete process.env[VOICE];
}

afterEach(reset);

describe('voiceInterviewMode — the double gate', () => {
  it('key present AND enabled → realtime', () => {
    process.env[KEY] = 'sk-test';
    process.env[ENABLED] = '1';
    expect(voiceInterviewMode()).toBe('realtime');
  });

  it('key present but NOT enabled → fallback', () => {
    process.env[KEY] = 'sk-test';
    delete process.env[ENABLED];
    expect(voiceInterviewMode()).toBe('fallback');
  });

  it('enabled but NO key → fallback', () => {
    delete process.env[KEY];
    process.env[ENABLED] = '1';
    expect(voiceInterviewMode()).toBe('fallback');
  });

  it('neither → fallback, and never throws', () => {
    reset();
    expect(() => voiceInterviewMode()).not.toThrow();
    expect(voiceInterviewMode()).toBe('fallback');
  });

  it('ENABLED must be exactly "1" — "true"/"yes"/"0" do not enable', () => {
    process.env[KEY] = 'sk-test';
    for (const v of ['true', 'yes', '0', 'on', '']) {
      process.env[ENABLED] = v;
      expect(voiceInterviewEnabled()).toBe(false);
      expect(voiceInterviewMode()).toBe('fallback');
    }
    process.env[ENABLED] = '1';
    expect(voiceInterviewEnabled()).toBe(true);
  });
});

describe('realtimeModel / realtimeVoice — defaults + overrides', () => {
  it('fall back to sane defaults when unset', () => {
    expect(realtimeModel()).toBe(DEFAULT_REALTIME_MODEL);
    expect(realtimeVoice()).toBe(DEFAULT_REALTIME_VOICE);
  });

  it('honor env overrides', () => {
    process.env[MODEL] = 'gpt-4o-realtime-custom';
    process.env[VOICE] = 'verse';
    expect(realtimeModel()).toBe('gpt-4o-realtime-custom');
    expect(realtimeVoice()).toBe('verse');
  });

  it('treat blank/whitespace overrides as unset', () => {
    process.env[MODEL] = '   ';
    process.env[VOICE] = '';
    expect(realtimeModel()).toBe(DEFAULT_REALTIME_MODEL);
    expect(realtimeVoice()).toBe(DEFAULT_REALTIME_VOICE);
  });
});
