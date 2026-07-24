import { describe, it, expect } from 'vitest';
import { detectOrigin, detectAudio, detectRuntimeMaxMinutes } from './detectors';

describe('international origin / audio / runtime detectors', () => {
  it('detects Spanish, Korean, French origin + language', () => {
    expect(detectOrigin('a Spanish film').countries).toEqual(['ES']);
    expect(detectOrigin('a Spanish film').languages).toEqual(['es']);
    expect(detectOrigin('a Korean thriller').countries).toEqual(['KR']);
    expect(detectOrigin('a French Christmas comedy').countries).toEqual(['FR']);
    expect(detectOrigin('a good movie').countries).toEqual([]);
  });

  it('flags foreign / non-US origin', () => {
    expect(detectOrigin('a foreign crime film').foreign).toBe(true);
    expect(detectOrigin('a Korean thriller').foreign).toBe(true);
    expect(detectOrigin('a British detective series').foreign).toBe(false); // GB treated domestic-language
    expect(detectOrigin('a good movie').foreign).toBe(false);
  });

  it('does not read "english" audio as British origin', () => {
    expect(detectOrigin('a movie with English audio').countries).toEqual([]);
  });

  it('detects English audio and English dub', () => {
    expect(detectAudio('with English audio').englishAudioRequired).toBe(true);
    expect(detectAudio('English dubbed, please').englishDubRequired).toBe(true);
    expect(detectAudio('English dubbed, please').englishAudioRequired).toBe(true);
    expect(detectAudio('a good movie').englishAudioRequired).toBe(false);
  });

  it('detects runtime ceilings from hours and minutes', () => {
    expect(detectRuntimeMaxMinutes('under two hours')).toBe(120);
    expect(detectRuntimeMaxMinutes('under 110 minutes')).toBe(110);
    expect(detectRuntimeMaxMinutes('less than 90 min')).toBe(90);
    expect(detectRuntimeMaxMinutes('two hours or less')).toBe(120);
    expect(detectRuntimeMaxMinutes('a crime movie')).toBeNull();
  });
});
