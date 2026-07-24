/**
 * Multilingual Clarification Engine benchmark metrics — PURE. Runs each case
 * through the engine and computes the spec's quality metrics per locale, plus
 * regression flags comparing every shipped locale against the English baseline.
 */
import { clarify } from '@/lib/search/clarify/engine';
import { clearMissingKeys, missingKeyReport } from '@/lib/search/clarify/localize';
import { baseLocale, LOCALES } from '@/lib/search/clarify/locale';
import type { ClarifyCase } from './generator';

export interface CaseResult {
  id: string; locale: string; expectIntent: string; actualIntent: string | null;
  top1: boolean; top3: boolean; entityResolved: boolean | null;
  clarified: boolean; ambiguous: boolean; unnecessaryClar: boolean; missedClar: boolean;
  noResult: boolean; recoveryOk: boolean; localeMatch: boolean;
  untranslatedShipped: boolean; fallbackUsed: boolean; topConfidence: number;
}

export interface LocaleMetrics {
  n: number; intentAccuracy: number; top3Accuracy: number; entityResolution: number;
  clarificationPrecision: number; clarificationRecall: number; unnecessaryClarRate: number;
  noResultRate: number; recoverySuccessRate: number; avgConfidence: number;
  languageMismatchRate: number; untranslatedRate: number; fallbackRate: number;
}

export function evaluateCase(c: ClarifyCase): CaseResult {
  clearMissingKeys();
  const r = clarify(c.query, { appLocale: c.appLocale });
  const misses = missingKeyReport();
  const base = baseLocale(c.appLocale);
  const shipped = !!LOCALES[base]?.shipped;

  const top3Intents = r.decision.options.concat(r.decision.primary ? [r.decision.primary] : []).map((o) => o.intent);
  const allTop3 = [r.decision.primary?.intent, ...r.decision.options.map((o) => o.intent)].filter(Boolean) as string[];
  const isUnknownCase = c.expectIntent === 'unknown';
  const top1 = isUnknownCase ? r.decision.action === 'could_not_identify' : r.decision.primary?.intent === c.expectIntent;
  const top3 = isUnknownCase ? r.decision.action === 'could_not_identify' : allTop3.slice(0, 3).includes(c.expectIntent);
  const entityResolved = c.expectTitleId == null ? null : r.event.resolvedIds.includes(c.expectTitleId);
  const clarified = r.decision.action === 'clarify';
  const unnecessaryClar = clarified && !c.ambiguous;
  const missedClar = !clarified && c.ambiguous && r.decision.action === 'answer';
  const noResult = r.decision.action === 'could_not_identify' && c.expectTitleId != null;
  const recoveryOk = r.decision.action === 'could_not_identify' ? (r.clarification?.options.length ?? 0) > 0 : true;
  const localeMatch = baseLocale(r.locale) === base;
  const untranslatedShipped = shipped && misses.some((m) => m.servedBy !== base);
  void top3Intents;

  return {
    id: c.id, locale: base, expectIntent: c.expectIntent, actualIntent: r.decision.primary?.intent ?? null,
    top1, top3, entityResolved, clarified, ambiguous: c.ambiguous, unnecessaryClar, missedClar,
    noResult, recoveryOk, localeMatch, untranslatedShipped, fallbackUsed: misses.length > 0,
    topConfidence: r.decision.topConfidence,
  };
}

export function aggregateByLocale(results: CaseResult[]): Record<string, LocaleMetrics> {
  const byLoc: Record<string, CaseResult[]> = {};
  for (const r of results) (byLoc[r.locale] ??= []).push(r);
  const out: Record<string, LocaleMetrics> = {};
  for (const [loc, rs] of Object.entries(byLoc)) {
    const n = rs.length;
    const withTitle = rs.filter((r) => r.entityResolved !== null);
    const clarified = rs.filter((r) => r.clarified);
    const ambiguous = rs.filter((r) => r.ambiguous);
    const rr = (x: number) => Math.round(x * 1000) / 1000;
    out[loc] = {
      n,
      intentAccuracy: rr(rs.filter((r) => r.top1).length / n),
      top3Accuracy: rr(rs.filter((r) => r.top3).length / n),
      entityResolution: rr(withTitle.length ? withTitle.filter((r) => r.entityResolved).length / withTitle.length : 1),
      clarificationPrecision: rr(clarified.length ? clarified.filter((r) => r.ambiguous).length / clarified.length : 1),
      clarificationRecall: rr(ambiguous.length ? ambiguous.filter((r) => r.clarified).length / ambiguous.length : 1),
      unnecessaryClarRate: rr(rs.filter((r) => r.unnecessaryClar).length / n),
      noResultRate: rr(rs.filter((r) => r.noResult).length / n),
      recoverySuccessRate: rr(rs.filter((r) => r.recoveryOk).length / n),
      avgConfidence: rr(rs.reduce((s, r) => s + r.topConfidence, 0) / n),
      languageMismatchRate: rr(rs.filter((r) => !r.localeMatch).length / n),
      untranslatedRate: rr(rs.filter((r) => r.untranslatedShipped).length / n),
      fallbackRate: rr(rs.filter((r) => r.fallbackUsed).length / n),
    };
  }
  return out;
}

export interface RegressionFlag { locale: string; issue: string; detail: string }

/** Flag any SHIPPED locale that regresses vs the English baseline. */
export function regressionFlags(byLoc: Record<string, LocaleMetrics>): RegressionFlag[] {
  const en = byLoc.en;
  const flags: RegressionFlag[] = [];
  if (!en) return flags;
  for (const [loc, m] of Object.entries(byLoc)) {
    if (loc === 'en' || !LOCALES[loc]?.shipped) continue;
    if (m.intentAccuracy < en.intentAccuracy - 0.05) flags.push({ locale: loc, issue: 'intent_accuracy', detail: `${m.intentAccuracy} vs en ${en.intentAccuracy}` });
    if (m.noResultRate > en.noResultRate + 0.05) flags.push({ locale: loc, issue: 'no_result_rate', detail: `${m.noResultRate} vs en ${en.noResultRate}` });
    if (m.unnecessaryClarRate > en.unnecessaryClarRate + 0.05) flags.push({ locale: loc, issue: 'unnecessary_clarification', detail: `${m.unnecessaryClarRate} vs en ${en.unnecessaryClarRate}` });
    if (m.untranslatedRate > 0) flags.push({ locale: loc, issue: 'untranslated_strings', detail: `${m.untranslatedRate}` });
    if (m.languageMismatchRate > 0) flags.push({ locale: loc, issue: 'language_mismatch', detail: `${m.languageMismatchRate}` });
    if (m.entityResolution < 0.9) flags.push({ locale: loc, issue: 'title_resolution', detail: `${m.entityResolution}` });
  }
  return flags;
}
