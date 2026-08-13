import { describe, it } from 'vitest';
import { TITLES } from '@/lib/voice/quickdna/definition';
import { TRAIT_KEYS, traitBelief, traitConfidence, type TraitKey } from '@/lib/voice/quickdna/traits';
import { PERSONAS, play } from './coldStart.test';
import { dimensionConfidence, predictedAppeal } from './scanner';

const T = (id: string) => TITLES.find((t) => t.id === id)!;
const name = (id: string) => T(id).title;

describe('PERSONA TRAJECTORIES', () => {
  it('prints what the engine actually learned', () => {
    const seen = new Map<string, string[]>();
    for (const [pname, taste] of Object.entries(PERSONAS)) {
      const tr = play(taste);
      seen.set(pname, tr.rounds.map((r) => `${r.left}|${r.right}`));
      console.log(`\n════════ ${pname} ════════`);
      for (const r of tr.rounds) {
        const v = r.verdict === 'left' ? `◀ ${name(r.left)}`
          : r.verdict === 'right' ? `${name(r.right)} ▶`
          : r.verdict.toUpperCase();
        console.log(`  ${String(r.n + 1).padStart(2)} [${r.phase.padEnd(10)}] ${name(r.left).slice(0,26).padEnd(26)} vs ${name(r.right).slice(0,26).padEnd(26)} → ${v}`);
      }
      const dims = dimensionConfidence(tr.state.profile).filter((d) => d.confidence > 0.2 && Math.abs(d.pref - 50) > 12);
      console.log(`  ── LEARNED DNA (${tr.exposures.length} exposures, ${new Set(tr.exposures).size} unique) ──`);
      for (const d of dims.slice(0, 9)) {
        console.log(`     ${d.pref > 50 ? '+' : '−'} ${d.key.padEnd(16)} ${d.pref.toFixed(0).padStart(3)}/100  conf ${d.confidence.toFixed(2)} (${d.tier})`);
      }
      const low = dimensionConfidence(tr.state.profile).filter((d) => d.tier === 'low').length;
      console.log(`     …${low} axes left LOW confidence (honestly unknown)`);
      // What would we now recommend that they never saw?
      const unseen = TITLES.filter((t) => !tr.exposures.includes(t.id));
      const ranked = unseen.map((t) => ({ t, s: predictedAppeal(t, tr.state.profile) })).sort((a, b) => b.s - a.s);
      console.log(`  ── TOP UNSEEN PICKS ──`);
      for (const r of ranked.slice(0, 4)) console.log(`     ${r.s.toFixed(2)}  ${r.t.title}`);
      console.log(`     worst: ${ranked[ranked.length-1]!.s.toFixed(2)}  ${ranked[ranked.length-1]!.t.title}`);
    }
    console.log('\n════════ PAIRWISE QUESTION OVERLAP ════════');
    const names = [...seen.keys()];
    for (let i=0;i<names.length;i++) for (let j=i+1;j<names.length;j++){
      const a=new Set(seen.get(names[i]!)!), b=new Set(seen.get(names[j]!)!);
      const o=[...a].filter(k=>b.has(k)).length;
      console.log(`  ${names[i]!.padEnd(13)} vs ${names[j]!.padEnd(13)} ${o}/20 shared questions`);
    }
  });
});
