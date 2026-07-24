import { describe, it, expect } from 'vitest';
import {
  resolveEnvironment,
  badgeText,
  isPublicProduction,
  shortSha,
  shortBranch,
  deployIdFrom,
  formatBuildTime,
  type BuildInfo,
} from './buildInfo';

const info: BuildInfo = {
  appVersion: '0.9.18',
  buildTimeIso: '2026-07-24T18:24:00Z',
  buildTimeLabel: '',
  gitSha: '7e0e3ba5d34840152871bf3bb8f3b892c57ba637',
  gitShaShort: '7e0e3ba',
  gitBranch: 'feature/watch-dna',
  vercelEnv: 'preview',
  deployUrl: 'clearpath-pearl-chi-git-feature-team.vercel.app',
  deployId: 'clearpath-pearl-chi',
  schemaVersion: '0025_founder_test',
  apiVersion: 'v1',
  supabaseProject: 'abcdxyz',
  databaseEnv: 'abcdxyz',
};

describe('buildInfo (pure)', () => {
  it('resolves founder routes over the Vercel env', () => {
    expect(resolveEnvironment('/TestScott', 'production')).toBe('TestScott');
    expect(resolveEnvironment('/testheather', 'preview')).toBe('TestHeather');
    expect(resolveEnvironment('/TestAmy/anything', 'development')).toBe('TestAmy');
  });

  it('maps Vercel env when not on a founder route', () => {
    expect(resolveEnvironment('/app/quiz', 'production')).toBe('Production');
    expect(resolveEnvironment('/app', 'preview')).toBe('Preview');
    expect(resolveEnvironment('/', '')).toBe('Development');
  });

  it('production shows ONLY the minimal public badge', () => {
    expect(isPublicProduction('Production')).toBe(true);
    expect(badgeText('Production', info)).toBe('WatchVerdict v0.9.18');
    // no branch / commit / deploy details leak to normal users
    expect(badgeText('Production', info)).not.toMatch(/7e0e3ba|feature|preview/i);
  });

  it('preview / founder show full identification', () => {
    expect(badgeText('Preview', info)).toBe('Preview • feature/watch-dna • 7e0e3ba • v0.9.18');
    expect(badgeText('TestScott', info)).toBe('TestScott • feature/watch-dna • 7e0e3ba • v0.9.18');
  });

  it('short helpers', () => {
    expect(shortSha('7e0e3ba5d34840')).toBe('7e0e3ba');
    expect(shortBranch('refs/heads/main')).toBe('main');
    expect(deployIdFrom('clearpath-pearl-chi-git-feature-team.vercel.app')).toBe('clearpath-pearl-chi');
    expect(deployIdFrom('clearpath-pearl-chi.vercel.app')).toBe('clearpath-pearl-chi');
    expect(deployIdFrom('')).toBe('');
  });

  it('formats a build timestamp', () => {
    const s = formatBuildTime('2026-07-24T18:24:00Z');
    expect(s).toMatch(/2026/);
    expect(s).not.toBe('unknown');
    expect(formatBuildTime('')).toBe('unknown');
  });
});
