// Analytics event taxonomy. Semantic events (not raw clicks), each with a stable
// name and version, and a documented list of allowed property keys. Sensitive
// values must never be recorded (see FORBIDDEN_PROP_KEYS). Pure & tested.

export interface EventDef {
  name: string;
  version: number;
  /** Property keys this event is allowed to carry (allow-list). */
  props: readonly string[];
}

export const EVENTS = {
  page_viewed: { name: 'page_viewed', version: 1, props: ['path'] },
  search_submitted: { name: 'search_submitted', version: 1, props: ['q', 'count', 'source'] },
  book_selected: { name: 'book_selected', version: 1, props: ['workId'] },
  trial_opened: { name: 'trial_opened', version: 1, props: ['workId', 'matchScore'] },
  cross_examination: { name: 'cross_examination', version: 1, props: ['question', 'workId'] },
  verdict_action: { name: 'verdict_action', version: 1, props: ['action', 'workId', 'matchScore'] },
  verdict_pass: { name: 'verdict_pass', version: 1, props: ['workId', 'matchScore'] },
  micro_feedback: { name: 'micro_feedback', version: 1, props: ['context', 'reason', 'workId'] },
  onboarding_completed: { name: 'onboarding_completed', version: 1, props: ['answered'] },
  import_previewed: { name: 'import_previewed', version: 1, props: ['kind', 'parsed', 'skipped'] },
  import_committed: { name: 'import_committed', version: 1, props: ['kind', 'added'] },
  appeal_filed: { name: 'appeal_filed', version: 1, props: ['reason', 'decision'] },
  data_exported: { name: 'data_exported', version: 1, props: [] },
  data_deleted: { name: 'data_deleted', version: 1, props: ['scope'] },
} as const satisfies Record<string, EventDef>;

export type EventName = keyof typeof EVENTS;

/** Keys that must never appear in analytics props. */
export const FORBIDDEN_PROP_KEYS = [
  'password',
  'token',
  'email',
  'payment',
  'card',
  'exclusion', // private group exclusions
  'audio', // raw voice audio
] as const;

export interface ValidatedEvent {
  name: string;
  version: number;
  props: Record<string, unknown>;
  warnings: string[];
}

/**
 * Validate + sanitize an event against the taxonomy. Unknown events pass through
 * with a warning (never dropped), but any forbidden or non-allow-listed prop key
 * is stripped so sensitive data cannot leak into analytics.
 */
export function validateEvent(name: string, props: Record<string, unknown> = {}): ValidatedEvent {
  const def = (EVENTS as Record<string, EventDef>)[name];
  const warnings: string[] = [];
  if (!def) warnings.push(`Unknown event "${name}"`);
  const allowed = def?.props ?? [];

  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    const lower = k.toLowerCase();
    if (FORBIDDEN_PROP_KEYS.some((f) => lower.includes(f))) {
      warnings.push(`Stripped forbidden prop "${k}"`);
      continue;
    }
    if (def && !allowed.includes(k)) {
      warnings.push(`Dropped non-allow-listed prop "${k}"`);
      continue;
    }
    clean[k] = v;
  }
  return { name, version: def?.version ?? 1, props: clean, warnings };
}
