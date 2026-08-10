import { describe, it, expect } from 'vitest';
import { SPEECH_RATE, pickCalibrationVoice, scoreVoice, type VoiceLike } from './voicePick';

/**
 * "The voice sounded creepy" was a real verdict on a real build, and the cause
 * was picking the first English voice the platform offered. On macOS and iOS
 * that list still contains the novelty voices. These cases are drawn from the
 * actual inventories those platforms report.
 */

const v = (name: string, lang = 'en-US', extra: Partial<VoiceLike> = {}): VoiceLike => ({ name, lang, ...extra });

const MACOS = [
  v('Albert'), v('Bad News'), v('Bahh'), v('Bells'), v('Bubbles'), v('Trinoids'),
  v('Whisper'), v('Zarvox'), v('Fred'), v('Kathy'), v('Victoria'),
  v('Daniel', 'en-GB'), v('Karen', 'en-AU'), v('Samantha'),
  v('Serena (Premium)', 'en-GB'),
];

describe('the novelty voices can never be chosen', () => {
  it('rejects every one of them outright', () => {
    for (const name of ['Albert', 'Bad News', 'Bahh', 'Bells', 'Bubbles', 'Trinoids', 'Whisper', 'Zarvox', 'Fred', 'Kathy', 'Victoria', 'Grandma']) {
      expect(scoreVoice(v(name)), name).toBeLessThan(0);
    }
  });

  it('picks the premium voice out of a real macOS inventory', () => {
    expect(pickCalibrationVoice(MACOS)?.name).toBe('Serena (Premium)');
  });

  it('would rather have nothing than a novelty voice', () => {
    expect(pickCalibrationVoice([v('Zarvox'), v('Trinoids')])).toBeNull();
  });
});

describe('quality beats accent', () => {
  it('prefers a natural American voice over a robotic British one', () => {
    // The previous picker did the opposite, and that is what made it sound odd.
    const chosen = pickCalibrationVoice([v('Daniel', 'en-GB'), v('Ava (Neural)', 'en-US')]);
    expect(chosen?.name).toBe('Ava (Neural)');
  });

  it('still leans British/Australian between two voices of the same tier', () => {
    const chosen = pickCalibrationVoice([v('Nicky (Enhanced)', 'en-US'), v('Serena (Enhanced)', 'en-GB')]);
    expect(chosen?.name).toBe('Serena (Enhanced)');
  });

  it('ranks the tiers the way the platforms mean them', () => {
    expect(scoreVoice(v('Zoe (Neural)'))).toBeGreaterThan(scoreVoice(v('Zoe (Premium)')));
    expect(scoreVoice(v('Zoe (Premium)'))).toBeGreaterThan(scoreVoice(v('Zoe (Enhanced)')));
    expect(scoreVoice(v('Zoe (Enhanced)'))).toBeGreaterThan(scoreVoice(v('Zoe')));
  });

  it('takes Google and Siri voices seriously — they are the modern models', () => {
    expect(scoreVoice(v('Google UK English Female', 'en-GB', { localService: false }))).toBeGreaterThan(scoreVoice(v('Daniel', 'en-GB')));
  });
});

describe('the boring guarantees', () => {
  it('ignores non-English voices entirely', () => {
    expect(scoreVoice(v('Amélie', 'fr-CA'))).toBeLessThan(0);
    expect(pickCalibrationVoice([v('Amélie', 'fr-CA'), v('Yuna', 'ko-KR')])).toBeNull();
  });

  it('survives an empty inventory, which is what a fresh Chrome reports', () => {
    expect(pickCalibrationVoice([])).toBeNull();
  });

  it('reads slightly faster than conversation, because this is rapid-fire', () => {
    expect(SPEECH_RATE).toBeGreaterThan(1);
    expect(SPEECH_RATE).toBeLessThan(1.35); // past this it stops sounding relaxed
  });
});
