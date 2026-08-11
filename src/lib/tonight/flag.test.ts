import { describe, it, expect } from 'vitest';
import { tonightMachineEnabled } from './flag';

/** A bare environment, without pretending it is a whole `ProcessEnv`. */
const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;

/**
 * A migration switch is only safe if OFF is the thing that happens by accident.
 */

describe('the Tonight Machine ships dark', () => {
  it('is off when the variable is unset', () => {
    expect(tonightMachineEnabled(env({}))).toBe(false);
  });

  it('is off for anything that is not an explicit yes', () => {
    // Including the values people reach for when they mean to disable something
    // and the empty string a hosting UI leaves behind when a var is cleared.
    for (const value of ['', ' ', '0', 'false', 'off', 'no', 'undefined', 'null', 'disabled']) {
      expect(tonightMachineEnabled(env({ TONIGHT_MACHINE: value })), value).toBe(false);
    }
  });

  it('is on only when someone deliberately says so', () => {
    for (const value of ['1', 'true', 'on', 'yes', 'TRUE', ' 1 ']) {
      expect(tonightMachineEnabled(env({ TONIGHT_MACHINE: value })), value).toBe(true);
    }
  });

  it('does not read a NEXT_PUBLIC_ variable', () => {
    // A build-time-inlined flag cannot be switched off without a redeploy,
    // which is the wrong property for the control you reach for in an incident.
    expect(
      tonightMachineEnabled(env({ NEXT_PUBLIC_TONIGHT_MACHINE: '1' })),
    ).toBe(false);
  });
});
