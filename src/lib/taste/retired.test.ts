import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * THE TASTE INTERVIEW IS RETIRED.
 *
 * Removing a feature is easy to do incompletely: a link survives in one menu, a
 * route still renders, a component nobody imports keeps compiling. These pin
 * the removal so it cannot creep back, and pin what was DELIBERATELY KEPT — the
 * taste-modelling code now serves imports and ordinary product feedback, and
 * deleting it would take real capability with it.
 */

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

/** Every source file, so "gone" can be checked across the whole tree. */
function sourceFiles(dir = 'src', out: string[] = []): string[] {
  for (const entry of readdirSync(join(root, dir))) {
    const rel = `${dir}/${entry}`;
    if (statSync(join(root, rel)).isDirectory()) sourceFiles(rel, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(rel);
  }
  return out;
}

describe('the interview is gone', () => {
  const files = sourceFiles();

  it('TESTS 1-5: none of its names survive in the source', () => {
    const banned = [
      'Witness Testimony', 'Taste Interview', 'Voice DNA',
      'Quick Interview', 'Full Interview', 'answer out loud',
    ];
    const offenders: string[] = [];
    for (const f of files) {
      // The retired route explains itself; that is the one allowed mention.
      if (f === 'src/app/voice-dna/page.tsx') continue;
      if (f === 'src/components/RetiredInterviewNotice.tsx') continue;
      if (f === 'src/lib/taste/retired.test.ts') continue;
      const body = read(f);
      for (const b of banned) if (body.includes(b)) offenders.push(`${f}: ${b}`);
    }
    expect(offenders).toEqual([]);
  });

  it('its components, session engine and API routes are deleted', () => {
    for (const p of [
      'src/components/voicedna',
      'src/lib/voicedna',
      'src/app/api/voicedna',
      'src/lib/actions/voiceDna.ts',
      'tests/mobile/voice-dna.spec.ts',
    ]) {
      expect(existsSync(join(root, p)), p).toBe(false);
    }
  });

  it('TEST 9+10: no transcription status or dead microphone control remains', () => {
    for (const f of files) {
      if (f === 'src/lib/taste/retired.test.ts') continue;
      const body = read(f);
      expect(body, f).not.toMatch(/awaiting transcription|no transcription service|coming soon.*voice/i);
      expect(body, f).not.toContain('record-button');
    }
  });

  it('TEST 6: the retired URL redirects instead of rendering', () => {
    const page = read('src/app/voice-dna/page.tsx');
    expect(page).toContain('redirect(');
    expect(page).toContain('/app/dna');
    // No interview UI is imported by it.
    expect(page).not.toMatch(/InterviewIntro|VoiceDnaClient|VoiceDnaInterview/);
  });

  it('TEST 7+8: no entry point remains in navigation or the DNA hub', () => {
    const nav = read('src/components/Nav.tsx');
    expect(nav).not.toContain('/voice-dna');
    const dna = read('src/app/app/dna/page.tsx');
    expect(dna).not.toContain('href="/voice-dna"');
  });

  it('TEST 22: no interview-only table can accumulate data', () => {
    // Registered migrations are the only ones that ever run.
    expect(read('src/lib/pendingMigrations.ts')).not.toContain('0033_voice_dna');
    const sql = read('supabase/migrations/0033_voice_dna.sql');
    expect(sql).toMatch(/DEPRECATED/);
    // Every line is commented out, so even a manual run creates nothing.
    for (const line of sql.split('\n')) {
      if (line.trim()) expect(line.trimStart().startsWith('--'), line).toBe(true);
    }
  });
});

describe('what was deliberately kept', () => {
  it('the taste model survives — it serves imports and feedback, not the interview', () => {
    for (const p of [
      'src/lib/taste/types.ts', 'src/lib/taste/lexicon.ts', 'src/lib/taste/reasons.ts',
      'src/lib/taste/parse.ts', 'src/lib/taste/contradiction.ts', 'src/lib/taste/profile.ts',
      'src/lib/taste/toPreference.ts',
    ]) {
      expect(existsSync(join(root, p)), p).toBe(true);
    }
  });

  it('TEST 11-13: the quiz has its four real actions and no separate Save button', () => {
    // Superseded by the single-screen 4-button redesign: Looks good / Watchlist /
    // Not interested / Seen it, all visible at once (see DnaQuiz.tsx's doc
    // comment). "Watchlist" is a first-class quiz action now, not a bolted-on
    // Save — it both records the DNA event and saves the title, in one tap,
    // through the same one write path (src/lib/actions/dnaQuiz.ts) rather than a
    // second model or a separate <SaveButton>.
    const quiz = read('src/components/DnaQuiz.tsx');
    expect(quiz).toContain('btn-looks-good');
    expect(quiz).toContain('btn-watchlist');
    expect(quiz).toContain('btn-not-interested');
    expect(quiz).toContain('btn-seen');
    expect(quiz).not.toMatch(/<SaveButton/);
    expect(read('src/lib/actions/dnaQuiz.ts')).toContain('addToWatchlist');
  });

  it('TEST 14: the ordinary Watchlist save still exists elsewhere', () => {
    expect(read('src/components/ReleaseWall.tsx')).toContain('SaveButton');
  });

  it('TEST 15: importing history is still offered', () => {
    expect(existsSync(join(root, 'src/app/import-taste/page.tsx'))).toBe(true);
    expect(read('src/app/app/dna/page.tsx')).toContain('/import-taste');
  });

  it('TEST 8: Build Your Watch DNA offers exactly the quiz and the import', () => {
    const dna = read('src/app/app/dna/page.tsx');
    expect(dna).toContain('link-title-quiz');
    expect(dna).toContain('link-import-taste');
    expect(dna).not.toContain('link-voice-dna');
    // ...and says DNA keeps growing on its own, so neither is a gate.
    expect(dna).toContain('dna-grows');
  });

  it('TEST 16+17: tonight stays a separate, temporary thing', () => {
    const dna = read('src/app/app/dna/page.tsx');
    expect(dna).toContain('tonight-separate');
    expect(dna.slice(dna.indexOf('tonight-separate'))).toMatch(/does not change your DNA/i);
  });
});
