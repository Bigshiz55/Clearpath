import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SPEAK_VERBATIM_PREFIX } from './client';

/**
 * WHO IS THE INTERVIEWER? — the turn-order contract, pinned.
 *
 * WatchVerd1ct's server is the director. OpenAI Realtime is a voice and a pair
 * of ears. The two ways that collapsed in practice, both fixed here and both
 * guarded below:
 *
 *  1. Server VAD defaults to `create_response: true`, so the model answered the
 *     instant the user stopped speaking — racing the round trip to
 *     `recordScriptedTurn` and improvising a question the director never chose.
 *  2. `steer()` ignored `speakLine` entirely and only called `response.create`
 *     on the opening turn, so every later question depended on exactly that
 *     autonomous behaviour to happen at all.
 *
 * Together those made the model a second interview director. These are source-
 * level assertions because the failure is in the CONFIGURATION we send, which no
 * amount of local mocking of a WebRTC data channel would prove.
 */

const ROOT = join(__dirname, '..', '..', '..', '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');

const routeSrc = () => read('src/app/api/voice/session/route.ts');
const clientSrc = () => read('src/lib/voice/realtime/client.ts');

/** The `turn_detection` object literal we send to OpenAI. */
function turnDetectionBlock(): string {
  const src = routeSrc();
  const at = src.indexOf('turn_detection:');
  expect(at, 'no turn_detection in the session config').toBeGreaterThan(-1);
  return src.slice(at, at + 260);
}

describe('the model may not answer on its own', () => {
  it('server VAD is configured with create_response: false', () => {
    expect(
      turnDetectionBlock(),
      'create_response must be false, or the model races recordScriptedTurn',
    ).toMatch(/create_response:\s*false/);
  });

  it('barge-in is kept: interrupt_response: true', () => {
    expect(turnDetectionBlock()).toMatch(/interrupt_response:\s*true/);
  });

  it('still uses server VAD, so turn boundaries are still detected', () => {
    expect(turnDetectionBlock()).toMatch(/type:\s*'server_vad'/);
  });

  it('does not leave create_response defaulted (absent means true at OpenAI)', () => {
    // An omitted flag is the dangerous case: the default is ON.
    expect(turnDetectionBlock()).toContain('create_response');
  });
});

describe('the model is not a second interpreter', () => {
  it('no tools are offered in the scripted session', () => {
    const src = routeSrc();
    expect(src).not.toMatch(/\btools:\s*REALTIME_TOOLS/);
    expect(src).not.toMatch(/tool_choice:/);
  });

  it('the session route does not import the tool schema at all', () => {
    expect(routeSrc()).not.toContain('REALTIME_TOOLS');
  });
});

describe('steer() speaks the director’s line', () => {
  it('uses speakLine rather than ignoring it', () => {
    const src = clientSrc();
    expect(src).toMatch(/const line = \(input\.speakLine \?\? ''\)\.trim\(\)/);
  });

  it('creates a response whenever there is a line to say', () => {
    const src = clientSrc();
    const at = src.indexOf('if (line) {');
    expect(at, 'steer must branch on having a line').toBeGreaterThan(-1);
    const branch = src.slice(at, at + 400);
    expect(branch).toContain("type: 'response.create'");
    expect(branch).toContain('SPEAK_VERBATIM_PREFIX');
  });

  it('does not gate response.create on kickoff alone', () => {
    // The old bug: the kickoff branch was the ONLY `response.create`, so
    // questions 2..n were never spoken unless the model volunteered. A kickoff
    // fallback is still legitimate for the no-line case — what matters is that
    // it is not the only trigger, and that the line branch fires first.
    const src = clientSrc();
    const steerAt = src.indexOf('const steer = (input: SteerInput): void =>');
    expect(steerAt).toBeGreaterThan(-1);
    const steerBody = src.slice(steerAt, src.indexOf('\n  };', steerAt));

    const triggers = steerBody.match(/type: 'response\.create'/g) ?? [];
    expect(triggers.length, 'steer must create a response outside kickoff too').toBeGreaterThanOrEqual(2);

    const lineBranch = steerBody.indexOf('if (line) {');
    const kickoffBranch = steerBody.indexOf('if (input.kickoff)');
    expect(lineBranch).toBeGreaterThan(-1);
    expect(kickoffBranch).toBeGreaterThan(-1);
    expect(lineBranch, 'the director line must be handled before the kickoff fallback').toBeLessThan(kickoffBranch);
  });

  it('instructs the model to speak the line verbatim and stop', () => {
    expect(SPEAK_VERBATIM_PREFIX).toMatch(/EXACTLY as written/i);
    expect(SPEAK_VERBATIM_PREFIX).toMatch(/do not rephrase/i);
    expect(SPEAK_VERBATIM_PREFIX).toMatch(/change the order of any list/i);
  });

  it('the verbatim instruction is what actually gets sent', () => {
    const src = clientSrc();
    expect(src).toMatch(/instructions: `\$\{SPEAK_VERBATIM_PREFIX\}/);
  });
});

describe('the spoken persona is a voice, not a director', () => {
  it('the system prompt tells the model it is not the interviewer', () => {
    const prompt = read('src/lib/voice/interview/prompts.ts');
    expect(prompt).toMatch(/You are NOT the interviewer/);
    expect(prompt).toMatch(/NEVER change a list of categories/);
    expect(prompt).toMatch(/Do not ask follow-ups of your own invention/);
  });

  it('asks for the intended delivery: brisk, understated, no announcer voice', () => {
    const prompt = read('src/lib/voice/interview/prompts.ts');
    expect(prompt).toMatch(/British\/Australian/);
    expect(prompt).toMatch(/BRISK/);
    expect(prompt).toMatch(/No announcer voice|no announcer voice/);
    expect(prompt).toMatch(/robotic cadence/);
    expect(prompt).toMatch(/FEW WORDS at most/);
  });
});

describe('the Realtime defaults are current', () => {
  it('uses the GA realtime model, not the 2024 preview', () => {
    const cfg = read('src/lib/voice/config.ts');
    expect(cfg).toMatch(/DEFAULT_REALTIME_MODEL = 'gpt-realtime'/);
    expect(cfg).not.toMatch(/DEFAULT_REALTIME_MODEL = 'gpt-4o-realtime-preview/);
  });

  it('defaults to the marin voice, still overridable', () => {
    const cfg = read('src/lib/voice/config.ts');
    expect(cfg).toMatch(/DEFAULT_REALTIME_VOICE = 'marin'/);
    expect(cfg).toContain('VOICE_INTERVIEW_VOICE');
    expect(cfg).toContain('VOICE_INTERVIEW_MODEL');
  });
});
