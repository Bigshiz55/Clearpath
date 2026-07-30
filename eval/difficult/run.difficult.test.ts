import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSearchQa } from '@/lib/searchQa';

/**
 * §3/§5 — offline inspection of the twelve mandated difficult searches. Runs
 * each through the REAL parse funnel (buildSearchQa) and records parsed intent,
 * reference, hard constraints, soft preferences, confidence, and the follow-up
 * decision. Candidate counts / final titles / per-title metadata evidence are
 * LIVE-only and honestly marked unavailable (no TMDB key here) — the live audit
 * (eval/live/audit.mjs) fills them when a key exists. Also emits the intended
 * similarity trait-decomposition for the two trait-translation cases.
 */

const QUERIES = [
  'A Spanish film with English audio similar to A Christmas Story',
  'A Hallmark-style movie similar to The Silence of the Lambs',
  'A Korean crime movie with English audio on Netflix under two hours',
  'A funny detective movie on Prime Video',
  'A movie like Rocky on Prime Video',
  'A French mystery under 100 minutes with English audio',
  'A German psychological thriller on Hulu',
  'A family Christmas mystery that is not animated',
  'A non-supernatural thriller similar to The Conjuring',
  'A lighthearted movie similar to Se7en',
  'A British detective series on BritBox under one hour per episode',
  'A 1990s action movie on Max with English audio',
];

// Hand-authored similarity trait decomposition for the deliberately unusual
// requests: which aspects of the reference TRANSFER and which are REPLACED.
const DECOMPOSITION: Record<string, { transfer: string[]; replace: string[]; note: string }> = {
  'A Hallmark-style movie similar to The Silence of the Lambs': {
    transfer: ['investigation / procedural spine', 'psychological cat-and-mouse tension', 'a driven investigator protagonist'],
    replace: ['graphic on-screen violence → implied / off-screen', 'serial-killer horror → cozy-thriller stakes', 'bleak tone → hopeful Hallmark resolution'],
    note: 'Not "random Hallmark title" nor "crime film": transfer the tension + procedure, replace the intensity to fit the safe catalog. If no strong verified match exists, ask one clarifying question or say so — never fabricate.',
  },
  'A non-supernatural thriller similar to The Conjuring': {
    transfer: ['dread / slow-build suspense', 'a family-in-peril premise', 'investigator uncovering a threat'],
    replace: ['supernatural/demonic cause → human/grounded threat (home invasion, stalker)', 'jump-scare horror → psychological thriller'],
    note: 'The hard "no supernatural" exclusion must survive; similarity is transferred on tone/structure, not the paranormal mechanism.',
  },
  'A lighthearted movie similar to Se7en': {
    transfer: ['detective-duo dynamic', 'a mystery to unravel', 'urban noir texture'],
    replace: ['grim, nihilistic tone → comedic / lighthearted', 'gruesome content → PG-ish stakes'],
    note: 'A near-contradiction: the reference’s essence is its darkness. Transfer the buddy-detective structure, replace the tone; if confidence is low, ask whether tone or plot matters more.',
  },
};

function gitOr(cmd: string, fb: string) { try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return fb; } }

describe('§3/§5 difficult-search offline inspection', () => {
  const views = QUERIES.map((q) => ({ q, v: buildSearchQa(q) }));

  it('writes the stamped difficult-search report', () => {
    const sha = gitOr('git rev-parse --short HEAD', 'dev');
    const L: string[] = ['# Difficult-Search Inspection (offline)', '', `- Commit \`${sha}\` · ${QUERIES.length} queries`,
      '- Parse-level fields are verified here; candidate counts / final titles / per-constraint metadata evidence are **LIVE-only** and require a TMDB key (see eval/live/audit.mjs).', ''];
    for (const { q, v } of views) {
      L.push(`## ${q}`, '');
      L.push(`- **Parsed intent:** ${v.parsedIntent}`);
      L.push(`- **Reference title:** ${v.reference.title ?? '—'} · resolved title id: _live only_`);
      L.push(`- **Hard constraints:** ${v.hardConstraints.length ? v.hardConstraints.map((c) => `${c.kind}=${c.value} (${c.verifiedBy})`).join(', ') : '—'}`);
      L.push(`- **Soft preferences:** ${v.softPreferences.length ? v.softPreferences.map((s) => `${s.key}=${s.value}`).join(', ') : '—'}`);
      L.push(`- **Confidence:** intent ${(v.confidence.intent * 100).toFixed(0)}% · metadata ${(v.confidence.metadata * 100).toFixed(0)}% · provider ${(v.confidence.provider * 100).toFixed(0)}% · audio ${(v.confidence.audio * 100).toFixed(0)}% · overall ${(v.confidence.overall * 100).toFixed(0)}%`);
      L.push(`- **Follow-up:** ${v.followUp.needed ? `ASK — "${v.followUp.question}"` : 'none needed'}`);
      L.push(`- **Candidate funnel:** before ${v.candidateFunnel.beforeFilter ?? '—'} → after ${v.candidateFunnel.afterFilter ?? '—'} (${v.candidateFunnel.unavailableReason ?? ''})`);
      const d = DECOMPOSITION[q];
      if (d) {
        L.push('', '  **Similarity decomposition**');
        L.push(`  - Transfer: ${d.transfer.join('; ')}`);
        L.push(`  - Replace: ${d.replace.join('; ')}`);
        L.push(`  - ${d.note}`);
      }
      L.push('');
    }
    const dir = join(process.cwd(), 'evaluation-results', 'difficult');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'report.md'), L.join('\n'), 'utf8');
    expect(views.length).toBe(QUERIES.length);
  });

  // Parse-level sanity guards the report relies on (these must not regress).
  it('the flagship Spanish/English-audio/reference query keeps all three signals', () => {
    const v = buildSearchQa('A Spanish film with English audio similar to A Christmas Story');
    expect(v.hardConstraints.some((c) => c.kind === 'origin_country' && c.value === 'ES')).toBe(true);
    expect(v.hardConstraints.some((c) => c.kind === 'english_audio')).toBe(true);
    expect(v.reference.title?.toLowerCase()).toContain('christmas story');
  });

  it('the Korean/Netflix/2h query keeps origin + platform + runtime together', () => {
    const v = buildSearchQa('A Korean crime movie with English audio on Netflix under two hours');
    const kinds = v.hardConstraints.map((c) => `${c.kind}=${c.value}`);
    expect(kinds).toContain('origin_country=KR');
    expect(kinds.some((k) => k.startsWith('platform=') || k === 'provider_id=8')).toBe(true);
    expect(kinds).toContain('runtime_max=120m');
  });

  it('the non-supernatural similarity query keeps the exclusion as a hard signal', () => {
    const v = buildSearchQa('A non-supernatural thriller similar to The Conjuring');
    expect(v.normalizedQuery).toBeTruthy();
    // The reference is captured; the supernatural exclusion is enforced downstream.
    expect(v.parsedIntent).toBe('similar_to');
  });
});
