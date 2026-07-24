/**
 * Clarification Engine orchestrator.
 *
 *   query (+locale) → normalize → interpret (canonical) → policy → localized render
 *
 * PURE + language-independent reasoning; only the final render is localized. Runs
 * before every search. Its guarantee: it returns a structured decision that is
 * either an immediate answer, an answer + localized alternatives, a single
 * localized tap-clarification, or an honest localized "could not identify" with
 * suggestions — never a bare dead end.
 */
import { resolveResponseLocale } from './locale';
import { localeInfo } from './locale';
import { generateInterpretations } from './interpret';
import { decidePolicy, type ClarificationDecision } from './policy';
import { localize } from './localize';
import { displayTitle } from './titleDisplay';
import { TITLE_CATALOG } from './entities';
import type { CanonicalInterpretation } from './canonical';
import type { ClarificationEvent } from './analytics';

export const CLARIFY_VERSION = 'clarify-v1';

export interface RenderedOption {
  meaningKey: string;
  label: string;      // localized
  intent: string;     // canonical
  confidence: number;
}
export interface RenderedClarification {
  heading: string;           // localized
  options: RenderedOption[];  // localized tap targets
}
export interface ClarificationResult {
  locale: string;
  dir: 'ltr' | 'rtl';
  localeSource: 'app' | 'query' | 'conversation' | 'default';
  decision: ClarificationDecision;   // canonical
  /** Localized answer-context line ("Looking for something else?" etc.), if any. */
  contextLine: string | null;
  /** Localized clarification block for the LOW / could_not_identify actions. */
  clarification: RenderedClarification | null;
  /** Localized label for the primary answer's interpretation. */
  primaryLabel: string | null;
  event: ClarificationEvent;
}

function titleFor(ref: string | null, name: string | null, locale: string): string {
  if (ref) { const rec = TITLE_CATALOG.find((t) => t.id === ref); if (rec) return displayTitle(rec, locale).display; }
  return name ?? '';
}

function labelFor(interp: CanonicalInterpretation, locale: string): string {
  const title = titleFor(interp.entityRef, interp.entityName, locale);
  return localize(locale, `meaning.${interp.meaningKey}`, { title });
}

export interface ClarifyOptions { appLocale?: string | null; conversationLocale?: string | null; at?: string }

export function clarify(query: string, opts: ClarifyOptions = {}): ClarificationResult {
  const sel = resolveResponseLocale({ appLocale: opts.appLocale, conversationLocale: opts.conversationLocale, queryText: query });
  const locale = sel.locale;
  const dir = localeInfo(locale).dir;
  const set = generateInterpretations(query);
  const decision = decidePolicy(set);

  let contextLine: string | null = null;
  let clarification: RenderedClarification | null = null;
  let primaryLabel: string | null = decision.primary ? labelFor(decision.primary, locale) : null;

  if (decision.action === 'answer_with_alternatives') {
    contextLine = localize(locale, 'clarification.looking_for_something_else');
    clarification = {
      heading: contextLine,
      options: decision.options.map((o) => ({ meaningKey: o.meaningKey, label: labelFor(o, locale), intent: o.intent, confidence: o.confidence })),
    };
  } else if (decision.action === 'clarify') {
    clarification = {
      heading: `${localize(locale, 'clarification.heading')} ${localize(locale, 'clarification.which_did_you_mean')}`,
      options: decision.options.map((o) => ({ meaningKey: o.meaningKey, label: labelFor(o, locale), intent: o.intent, confidence: o.confidence })),
    };
  } else if (decision.action === 'could_not_identify') {
    primaryLabel = null;
    clarification = {
      heading: `${localize(locale, 'clarification.could_not_identify')} ${localize(locale, 'clarification.try_one_of_these')}`,
      options: decision.options.map((o) => ({ meaningKey: o.meaningKey, label: labelFor(o, locale), intent: o.intent, confidence: o.confidence })),
    };
  }

  const event: ClarificationEvent = {
    at: opts.at ?? '1970-01-01T00:00:00Z',
    originalQuery: query,
    normalizedQuery: set.normalized,
    detectedQueryLanguage: sel.queryLanguage.lang,
    activeResponseLocale: locale,
    localeSource: sel.source,
    canonicalIntent: decision.primary?.intent ?? null,
    interpretationKeys: set.interpretations.map((i) => ({ intent: i.intent, meaningKey: i.meaningKey, confidence: i.confidence })),
    resolvedIds: set.entities.title ? [set.entities.title.id] : [],
    topConfidence: decision.topConfidence,
    policyAction: decision.action,
    confidenceBand: decision.band,
    clarificationShown: decision.action === 'clarify' || decision.action === 'could_not_identify',
    pipelineVersion: CLARIFY_VERSION,
  };

  return { locale, dir, localeSource: sel.source, decision, contextLine, clarification, primaryLabel, event };
}
