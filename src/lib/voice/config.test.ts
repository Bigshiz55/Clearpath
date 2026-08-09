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
 * The gating contract, pinned: THE KEY IS THE SWITCH. A configured
 * `OPENAI_API_KEY` means Realtime; no key means the keyless fallback.
 * `VOICE_INTERVIEW_ENABLED` is now an explicit OFF switch only — it was
 * previously a required second opt-in, which produced deployments that had
 * every ingredient for real speech and silently served the degraded path.
 * Nothing here ever throws: an absent key is a normal state, not an error.
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

describe('voiceInterviewMode — the key is the switch', () => {
  it('a key alone is enough: no second opt-in required', () => {
    process.env[KEY] = 'sk-test';
    delete process.env[ENABLED];
    expect(voiceInterviewMode()).toBe('realtime');
  });

  it('an explicit enable is still honoured', () => {
    process.env[KEY] = 'sk-test';
    process.env[ENABLED] = '1';
    expect(voiceInterviewMode()).toBe('realtime');
  });

  it('NO key → fallback, whatever the flag says', () => {
    delete process.env[KEY];
    for (const v of ['1', 'true', '', '0']) {
      process.env[ENABLED] = v;
      expect(voiceInterviewMode()).toBe('fallback');
    }
  });

  it('nothing configured → fallback, and never throws', () => {
    reset();
    expect(() => voiceInterviewMode()).not.toThrow();
    expect(voiceInterviewMode()).toBe('fallback');
  });

  it('the flag can still switch voice OFF without pulling the shared key', () => {
    process.env[KEY] = 'sk-test';
    for (const v of ['0', 'false', 'off', 'no', 'FALSE', 'Off']) {
      process.env[ENABLED] = v;
      expect(voiceInterviewEnabled(), `"${v}" should disable`).toBe(false);
      expect(voiceInterviewMode()).toBe('fallback');
    }
  });

  it('treats every other value — including blank — as ON', () => {
    process.env[KEY] = 'sk-test';
    for (const v of ['', '   ', '1', 'true', 'yes', 'on']) {
      process.env[ENABLED] = v;
      expect(voiceInterviewEnabled(), `"${v}" should not disable`).toBe(true);
      expect(voiceInterviewMode()).toBe('realtime');
    }
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
