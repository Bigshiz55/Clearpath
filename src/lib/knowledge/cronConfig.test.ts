import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Proves the Vercel cron configuration is valid JSON, SCHEDULES the Knowledge
 * Layer warm job, and does NOT disturb the pre-existing crons.
 */
describe('vercel.json cron configuration', () => {
  const cfg = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as {
    crons: Array<{ path: string; schedule: string }>;
  };

  it('is valid JSON with a crons array', () => {
    expect(Array.isArray(cfg.crons)).toBe(true);
  });

  it('preserves the existing crons', () => {
    const paths = cfg.crons.map((c) => c.path);
    for (const p of ['/api/cron/tv-ingest', '/api/cron/daily-scan', '/api/cron/classify']) {
      expect(paths, `existing cron ${p} must remain`).toContain(p);
    }
  });

  it('SCHEDULES /api/cron/knowledge-warm with a valid 5-field cron expression', () => {
    const warm = cfg.crons.find((c) => c.path === '/api/cron/knowledge-warm');
    expect(warm, 'knowledge-warm cron must be registered').toBeTruthy();
    expect(warm!.schedule.trim().split(/\s+/)).toHaveLength(5);
  });

  it('every cron schedule is a well-formed 5-field expression', () => {
    for (const c of cfg.crons) {
      expect(c.schedule.trim().split(/\s+/), `${c.path} schedule`).toHaveLength(5);
    }
  });
});
