import { describe, it } from 'vitest';
import { TITLES } from '@/lib/voice/quickdna/definition';
import { traitConfidence, type TraitKey } from '@/lib/voice/quickdna/traits';
import { PERSONAS, play } from './coldStart.test';
import { dnaSummary, dnaFacts, clusterReadout, unknownAxes } from './dnaSummary';
import { predictedAppeal } from './scanner';

describe('DNA SUMMARY — distinctiveness, not confidence', () => {
  it('reads each persona back in English', () => {
    for (const [name, taste] of Object.entries(PERSONAS)) {
      const tr = play(taste);
      const p = tr.state.profile;
      console.log(`\n════════ ${name} ════════`);
      for (const line of dnaSummary(p)) console.log(`   • ${line}`);
      console.log('   ── most distinctive axes ──');
      for (const f of dnaFacts(p).slice(0, 6)) {
        console.log(`      ${f.high ? '+' : '−'} ${f.key.padEnd(16)} pref ${f.pref.toFixed(0).padStart(3)} conf ${f.confidence.toFixed(2)} distinct ${f.distinctiveness.toFixed(3)}`);
      }
      console.log(`   ── clusters ──`);
      for (const c of clusterReadout(p)) {
        console.log(`      ${c.label.padEnd(10)} resolved ${(c.resolved*100).toFixed(0)}%  ${c.facts.slice(0,3).map(f=>`${f.high?'+':'−'}${f.key}`).join(' ')}`);
      }
      console.log(`   ── unknown: ${unknownAxes(p).length} axes not resolved ──`);
      const unseen = TITLES.filter((t) => !tr.exposures.includes(t.id));
      const ranked = unseen.map((t) => ({ t, s: predictedAppeal(t, p) })).sort((a, b) => b.s - a.s);
      console.log(`   ── top 5 unseen: ${ranked.slice(0,5).map(r=>r.t.title).join(' · ')}`);
      console.log(`   ── bottom 3:     ${ranked.slice(-3).map(r=>r.t.title).join(' · ')}`);
    }
  });
});
