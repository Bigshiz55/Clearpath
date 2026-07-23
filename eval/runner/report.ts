/**
 * Phase 10 — machine + human readable reports. Writes the run directory:
 *   summary.json cases.jsonl failures.jsonl metrics.json comparison.json
 *   report.md report.html artifacts/
 */
import fs from 'node:fs';
import path from 'node:path';
import type { CaseResult } from '../evaluator/result';
import type { Scorecard } from '../evaluator/scorecard';
import type { RunOptions } from './options';
import type { Comparison } from './compare';

export interface RunArtifacts {
  runId: string;
  options: RunOptions;
  scorecard: Scorecard;
  results: CaseResult[];
  comparison?: Comparison | null;
}

function slim(r: CaseResult) {
  return {
    id: r.case.id,
    seed: r.case.seed,
    source: r.case.source,
    archetype: r.case.archetype,
    profile: r.case.profileKey,
    rawQuery: r.case.rawQuery,
    noise: r.case.noise,
    tags: r.case.tags,
    passed: r.passed,
    critical: r.criticalFailure,
    score: Number(r.score.toFixed(4)),
    primaryCategory: r.primaryCategory,
    categories: r.failureCategories,
    intent: { want: r.case.intended.normalizedIntent, got: r.normalized.normalizedIntent, ok: r.layerA.intentCorrect },
    parseFields: r.layerA.fields,
    parseAccuracy: Number(r.layerA.fieldAccuracy.toFixed(3)),
    returned: r.pipeline.items.map((i) => ({ id: i.id, title: i.title, match: i.matchScore, where: i.where })),
    violations: r.layerB.violations,
    recall: r.layerC.recall,
    ndcg: r.layerD.ndcg,
    idealTopRank: r.layerD.idealTopRank,
    response: r.pipeline.responseText,
    clarification: r.pipeline.clarification,
    latencyMs: Number(r.layerF.totalMs.toFixed(2)),
    error: r.error ?? null,
  };
}

export function writeRun(baseOutDir: string, art: RunArtifacts): string {
  const runDir = path.join(baseOutDir, 'runs', art.runId);
  fs.mkdirSync(path.join(runDir, 'artifacts'), { recursive: true });

  const slimResults = art.results.map(slim);
  const failures = slimResults.filter((r) => !r.passed);

  const summary = {
    runId: art.runId,
    mode: art.options.mode,
    split: art.options.split,
    seed: art.options.seed ?? null,
    cases: art.scorecard.metrics.cases,
    passRate: art.scorecard.metrics.passRate,
    composite: art.scorecard.metrics.composite,
    passed: art.scorecard.passed,
    criticalBreaches: art.scorecard.breaches,
    generatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(path.join(runDir, 'summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(runDir, 'metrics.json'), JSON.stringify(art.scorecard.metrics, null, 2));
  fs.writeFileSync(path.join(runDir, 'cases.jsonl'), slimResults.map((r) => JSON.stringify(r)).join('\n') + '\n');
  fs.writeFileSync(path.join(runDir, 'failures.jsonl'), art.results.filter((r) => !r.passed).map((r) => JSON.stringify(fullFailure(r))).join('\n') + (failures.length ? '\n' : ''));
  fs.writeFileSync(path.join(runDir, 'comparison.json'), JSON.stringify(art.comparison ?? null, null, 2));
  fs.writeFileSync(path.join(runDir, 'report.md'), renderMarkdown(art, failures));
  fs.writeFileSync(path.join(runDir, 'report.html'), renderHtml(art, slimResults));

  // update a stable "latest" pointer
  fs.writeFileSync(path.join(baseOutDir, 'latest.json'), JSON.stringify({ runId: art.runId, runDir, summary }, null, 2));
  return runDir;
}

/** The full forensic record for each failure (Phase 7 required fields). */
function fullFailure(r: CaseResult) {
  return {
    caseId: r.case.id,
    seed: r.case.seed,
    rawQuery: r.case.rawQuery,
    intendedNormalized: r.case.intended,
    actualNormalized: r.normalized,
    profile: r.case.profileKey,
    resultsReturned: r.pipeline.items,
    candidatesConsidered: r.pipeline.consideredIds,
    expected: r.case.expected,
    scores: { total: r.score, layerA: r.layerA, layerB: r.layerB, layerC: r.layerC, layerD: r.layerD, layerE: r.layerE, layerF: r.layerF },
    primaryCategory: r.primaryCategory,
    categories: r.failureCategories,
    recommendedFix: recommendFix(r),
    error: r.error ?? null,
  };
}

function recommendFix(r: CaseResult): string {
  switch (r.primaryCategory) {
    case 'time_interpretation':
      return 'detectAiringHorizon: handle clock times and bare "tonight" without an airing cue.';
    case 'entity_extraction':
      return 'detectNetwork/detectPlatform/extractWatchTitle: fix the mis/blocked extraction shown in parseFields.';
    case 'exclusion_filtering':
      return 'Add deterministic negation parsing so "no X"/"nothing X" reaches excludedAttributes (today only the LLM path does).';
    case 'intent_classification':
      return 'Reorder the build-case cascade so this intent is not shadowed by an earlier branch.';
    case 'deduplication':
      return 'Dedup returned airings by title|start before slicing.';
    case 'ranking_weights':
      return 'Investigate ranking: the ideal pick was not #1 — check dimension nudge / personal score for these titles.';
    case 'ambiguity_handling':
      return 'Surface the contradiction as a clarification instead of silently picking one interpretation.';
    default:
      return 'See parseFields + violations to localize.';
  }
}

// ── Markdown ──────────────────────────────────────────────────────────────
function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}
function renderMarkdown(art: RunArtifacts, failures: ReturnType<typeof slim>[]): string {
  const m = art.scorecard.metrics;
  const cmp = art.comparison;
  const lines: string[] = [];
  lines.push(`# WatchVerdict Voice-Search Eval — ${art.runId}`);
  lines.push('');
  lines.push(`**Mode:** ${art.options.mode} · **Cases:** ${m.cases} · **Status:** ${art.scorecard.passed ? '✅ PASS' : '❌ FAIL'}`);
  lines.push('');
  lines.push(`- Composite: **${pct(m.composite)}**  ·  Pass rate: **${pct(m.passRate)}**  ·  Intent accuracy: ${pct(m.intentAccuracy)}  ·  Parse field accuracy: ${pct(m.parseFieldAccuracy)}`);
  lines.push('');
  lines.push('## Critical thresholds');
  if (art.scorecard.breaches.length === 0) lines.push('All critical thresholds satisfied. ✅');
  else for (const b of art.scorecard.breaches) lines.push(`- ❌ **${b.metric}** = ${pct(b.value)} (limit ${pct(b.threshold)})`);
  lines.push('');
  lines.push('## Rates');
  lines.push(`| metric | value |\n| --- | --- |`);
  for (const [k, v] of [
    ['hard-failure', m.hardFailureRate], ['hallucination', m.hallucinationRate], ['wrong time-window', m.wrongTimeWindowRate],
    ['wrong network/platform', m.wrongNetworkOrPlatformRate], ['exclusion violation', m.exclusionViolationRate],
    ['duplicate', m.duplicateRate], ['prev-watched leak', m.previouslyWatchedLeakRate], ['prev-rejected leak', m.previouslyRejectedLeakRate],
    ['clarification accuracy', m.clarificationAccuracy], ['top-1 personalization', m.top1PersonalizationAccuracy], ['mean nDCG', m.meanNdcg],
  ] as [string, number][]) lines.push(`| ${k} | ${pct(v)} |`);
  lines.push('');
  lines.push(`**Latency** p50 ${m.latency.p50.toFixed(2)}ms · p95 ${m.latency.p95.toFixed(2)}ms · p99 ${m.latency.p99.toFixed(2)}ms · external API calls ${m.externalApiCalls}`);
  lines.push('');
  lines.push('## Failure clusters');
  const clusters = Object.entries(m.failuresByCategory).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  if (clusters.length === 0) lines.push('No failures. 🎉');
  else for (const [cat, n] of clusters) lines.push(`- **${cat}**: ${n}`);
  lines.push('');
  if (cmp) {
    lines.push('## Comparison vs baseline');
    lines.push(`- Composite Δ: ${(cmp.compositeDelta * 100).toFixed(2)}pp · Pass-rate Δ: ${(cmp.passRateDelta * 100).toFixed(2)}pp`);
    lines.push(`- New failures: ${cmp.newFailures.length} · Fixed: ${cmp.fixed.length} · Critical regressions: ${cmp.criticalRegressions.length}`);
    lines.push('');
  }
  lines.push('## Representative failures');
  for (const f of failures.slice(0, 15)) {
    lines.push(`- \`${f.id}\` [${f.primaryCategory ?? '—'}] "${f.rawQuery}" → intent want=${f.intent.want} got=${f.intent.got}${f.violations.length ? `; ${f.violations.length} violation(s)` : ''}`);
  }
  return lines.join('\n') + '\n';
}

// ── HTML (self-contained, filterable) ──────────────────────────────────────
function renderHtml(art: RunArtifacts, results: ReturnType<typeof slim>[]): string {
  const m = art.scorecard.metrics;
  const data = JSON.stringify(results);
  const metricsJson = JSON.stringify(m);
  const cmpJson = JSON.stringify(art.comparison ?? null);
  const statusColor = art.scorecard.passed ? '#16a34a' : '#dc2626';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>WatchVerdict Eval — ${art.runId}</title>
<style>
:root{--bg:#0b0f17;--card:#141a26;--ink:#e5edf7;--mut:#8aa0bd;--line:#243044;--good:#16a34a;--bad:#dc2626;--warn:#d97706;--accent:#4f86ff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
header{padding:20px 24px;border-bottom:1px solid var(--line);display:flex;flex-wrap:wrap;gap:16px;align-items:baseline}
h1{font-size:18px;margin:0}.status{font-weight:800;color:${statusColor}}
.wrap{padding:20px 24px;max-width:1200px;margin:0 auto}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin:12px 0 24px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.kpi .v{font-size:22px;font-weight:800}.kpi .l{color:var(--mut);font-size:11px;text-transform:uppercase;letter-spacing:.04em}
.bad{color:var(--bad)}.good{color:var(--good)}.warn{color:var(--warn)}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--mut);font-weight:600;position:sticky;top:0;background:var(--bg);cursor:pointer}
tr.fail{background:rgba(220,38,38,.06)}tr.crit td:first-child{border-left:3px solid var(--bad)}
.tag{display:inline-block;background:#1c2636;border:1px solid var(--line);border-radius:999px;padding:1px 8px;font-size:11px;color:var(--mut);margin:1px}
.filters{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}select,input{background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:6px 8px}
.tblwrap{overflow-x:auto;border:1px solid var(--line);border-radius:12px}
details{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:6px 10px;margin:4px 0}
code{background:#0d1420;padding:1px 5px;border-radius:5px}
.muted{color:var(--mut)}.pill{border-radius:999px;padding:1px 8px;font-size:11px;font-weight:700}
.p-pass{background:rgba(22,163,74,.16);color:#4ade80}.p-fail{background:rgba(220,38,38,.16);color:#f87171}
</style></head><body>
<header><h1>WatchVerdict Voice-Search Eval</h1><span class="muted">${art.runId} · ${art.options.mode} · ${m.cases} cases</span>
<span class="status">${art.scorecard.passed ? 'PASS' : 'FAIL'}</span></header>
<div class="wrap">
<div class="grid" id="kpis"></div>
<h3>Critical thresholds</h3><div id="breaches"></div>
<h3>Comparison vs baseline</h3><div id="cmp" class="muted">—</div>
<h3>Failure clusters</h3><div id="clusters"></div>
<h3>Cases</h3>
<div class="filters">
<select id="fStatus"><option value="">all</option><option value="fail">failed</option><option value="pass">passed</option></select>
<select id="fCat"><option value="">any category</option></select>
<select id="fArch"><option value="">any archetype</option></select>
<input id="fText" placeholder="search query / id…" size="28">
<span class="muted" id="count"></span>
</div>
<div class="tblwrap"><table id="tbl"><thead><tr>
<th data-k="id">id</th><th data-k="archetype">archetype</th><th>query</th><th data-k="score">score</th><th>intent</th><th>returned</th><th>violations</th><th data-k="primaryCategory">category</th>
</tr></thead><tbody id="rows"></tbody></table></div>
</div>
<script>
const RESULTS=${data},M=${metricsJson},CMP=${cmpJson};
const p=x=>(x*100).toFixed(1)+'%';
const KPI=[['composite',p(M.composite)],['pass rate',p(M.passRate)],['intent acc',p(M.intentAccuracy)],['parse acc',p(M.parseFieldAccuracy)],['hard-fail',p(M.hardFailureRate)],['halluc',p(M.hallucinationRate)],['time-window',p(M.wrongTimeWindowRate)],['net/plat',p(M.wrongNetworkOrPlatformRate)],['exclusion',p(M.exclusionViolationRate)],['dup',p(M.duplicateRate)],['top-1 pers',p(M.top1PersonalizationAccuracy)],['nDCG',p(M.meanNdcg)],['clarify',p(M.clarificationAccuracy)],['p95 ms',M.latency.p95.toFixed(1)]];
document.getElementById('kpis').innerHTML=KPI.map(([l,v])=>'<div class=kpi><div class=v>'+v+'</div><div class=l>'+l+'</div></div>').join('');
const br=${JSON.stringify(art.scorecard.breaches)};
document.getElementById('breaches').innerHTML=br.length?br.map(b=>'<div class=bad>❌ '+b.metric+' = '+p(b.value)+' (limit '+p(b.threshold)+')</div>').join(''):'<div class=good>All critical thresholds satisfied ✅</div>';
if(CMP){document.getElementById('cmp').innerHTML='Composite Δ '+(CMP.compositeDelta*100).toFixed(2)+'pp · pass Δ '+(CMP.passRateDelta*100).toFixed(2)+'pp · new failures '+CMP.newFailures.length+' · fixed '+CMP.fixed.length+' · <span class='+(CMP.criticalRegressions.length?'"bad"':'"good"')+'>critical regressions '+CMP.criticalRegressions.length+'</span>';}
const clusters=Object.entries(M.failuresByCategory).filter(([,n])=>n>0).sort((a,b)=>b[1]-a[1]);
document.getElementById('clusters').innerHTML=clusters.length?clusters.map(([c,n])=>'<span class=tag>'+c+': '+n+'</span>').join(''):'<span class=good>No failures 🎉</span>';
const cats=[...new Set(RESULTS.map(r=>r.primaryCategory).filter(Boolean))];
document.getElementById('fCat').innerHTML+=cats.map(c=>'<option>'+c+'</option>').join('');
const arch=[...new Set(RESULTS.map(r=>r.archetype))];
document.getElementById('fArch').innerHTML+=arch.map(a=>'<option>'+a+'</option>').join('');
let sortK='score',sortAsc=true;
function esc(s){return String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}
function render(){
 const st=fStatus.value,ct=fCat.value,ar=fArch.value,tx=fText.value.toLowerCase();
 let rows=RESULTS.filter(r=>(!st||(st==='fail'?!r.passed:r.passed))&&(!ct||r.primaryCategory===ct)&&(!ar||r.archetype===ar)&&(!tx||r.rawQuery.toLowerCase().includes(tx)||r.id.includes(tx)));
 rows.sort((a,b)=>{let x=a[sortK],y=b[sortK];if(typeof x==='string'){x=x||'';y=y||''}else{x=x??0;y=y??0}return (x>y?1:x<y?-1:0)*(sortAsc?1:-1)});
 document.getElementById('count').textContent=rows.length+' / '+RESULTS.length;
 document.getElementById('rows').innerHTML=rows.map(r=>{
  const viol=r.violations.map(v=>v.kind).join(', ');
  const ret=r.returned.map(x=>esc(x.title)+' ('+x.match+')').join('<br>')||'<span class=muted>none</span>';
  return '<tr class="'+(r.passed?'':'fail')+' '+(r.critical?'crit':'')+'">'
   +'<td><code>'+r.id+'</code><br><span class="pill '+(r.passed?'p-pass':'p-fail')+'">'+(r.passed?'pass':'fail')+'</span></td>'
   +'<td>'+r.archetype+'<br><span class=muted>'+r.noise+'</span></td>'
   +'<td>'+esc(r.rawQuery)+'<details><summary class=muted>response</summary>'+esc(r.response)+(r.clarification?'<br><b>clarify:</b> '+esc(r.clarification):'')+'</details></td>'
   +'<td>'+(r.score*100).toFixed(0)+'</td>'
   +'<td>'+(r.intent.ok?'<span class=good>':'<span class=bad>')+esc(r.intent.got)+'</span><br><span class=muted>want '+esc(r.intent.want)+'</span></td>'
   +'<td>'+ret+'</td>'
   +'<td class='+(viol?'bad':'muted')+'>'+(viol||'—')+'</td>'
   +'<td>'+(r.primaryCategory?'<span class=tag>'+r.primaryCategory+'</span>':'—')+'</td></tr>';
 }).join('');
}
for(const id of ['fStatus','fCat','fArch']) document.getElementById(id).onchange=render;
fText.oninput=render;
document.querySelectorAll('th[data-k]').forEach(th=>th.onclick=()=>{const k=th.dataset.k;if(sortK===k)sortAsc=!sortAsc;else{sortK=k;sortAsc=false}render()});
render();
</script></body></html>`;
}
