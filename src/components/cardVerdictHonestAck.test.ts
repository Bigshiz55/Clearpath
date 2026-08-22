/**
 * THE CARD'S FEEDBACK IS HONEST, pinned at source.
 *
 * The reported defect: tapping Against fired a content-free "VERD1CT DNA ·
 * Updating ↓" flourish (with a hard-coded magenta) and effectively nothing
 * meaningful was shown. The fix routes the ruling through `ruleAck` and shows a
 * plain confirmation via `RuleAckToast`. This guards that the old fake flourish
 * cannot creep back onto the card and that the honest ack stays wired.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, 'CardVerdict.tsx'), 'utf8');

describe('the card shows an honest ruling acknowledgement', () => {
  it('no longer renders the content-free DnaBurst flourish', () => {
    expect(SRC).not.toMatch(/DnaBurst/);
  });

  it('routes the ruling through the honest ack presenter', () => {
    expect(SRC).toMatch(/import \{ ruleAck \} from '@\/lib\/verdict\/dnaAck'/);
    expect(SRC).toMatch(/line: ruleAck\(next\)\.line/);
  });

  it('shows the confirmation via RuleAckToast', () => {
    expect(SRC).toMatch(/import \{ RuleAckToast \} from '@\/components\/RuleAckToast'/);
    expect(SRC).toMatch(/<RuleAckToast /);
  });

  it('carries no hard-coded magenta accent', () => {
    expect(SRC).not.toMatch(/ff1493/i);
  });
});

describe('the ack toast itself is on-system', () => {
  const TOAST = readFileSync(join(__dirname, 'RuleAckToast.tsx'), 'utf8');
  it('uses no magenta and no "DNA updating" branding', () => {
    expect(TOAST).not.toMatch(/ff1493/i);
    expect(TOAST).not.toMatch(/Updating/i);
  });
});
