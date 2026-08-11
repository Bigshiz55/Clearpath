import { describe, it, expect, afterEach } from 'vitest';
import TonightPage from '@/app/app/tonight/page';

const original = process.env.TONIGHT_MACHINE;
afterEach(() => {
  if (original === undefined) delete process.env.TONIGHT_MACHINE;
  else process.env.TONIGHT_MACHINE = original;
});

describe('the customer route is gated', () => {
  it('404s when the flag is off', () => {
    delete process.env.TONIGHT_MACHINE;
    expect(() => TonightPage()).toThrowError(/NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK/);
  });

  it('renders when the flag is on', () => {
    process.env.TONIGHT_MACHINE = '1';
    expect(() => TonightPage()).not.toThrow();
  });
});
