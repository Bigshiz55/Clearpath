/**
 * Natural-language On TV query → structured ScheduleQuery. PURE, deterministic,
 * no LLM required (works offline; an LLM layer can enrich later). Sports are ALWAYS
 * excluded this phase. Returns the structured query plus an optional single
 * clarification when ambiguity would materially change results — and preserves the
 * original text + parsed query so the answer completes the SAME search.
 */
import type { ScheduleQuery, EventType } from './types';

export interface ParsedQuery {
  original: string;
  query: ScheduleQuery;
  clarification: { key: string; question: string; options: { key: string; label: string; patch: Partial<ScheduleQuery> }[] } | null;
}

const NETWORK_WORDS = ['abc', 'cbs', 'nbc', 'fox', 'cw', 'hallmark', 'lifetime', 'hbo', 'showtime', 'amc', 'fx', 'tnt', 'tbs', 'pbs', 'usa', 'bravo', 'freeform', 'nick', 'disney', 'cartoon network', 'comedy central', 'paramount', 'starz', 'cinemax'];

function baseQuery(): ScheduleQuery {
  return {
    intent: 'live_schedule_search', mediaTypes: [], eventTypesExclude: ['sports'], dateScope: 'now',
    startTimeMin: null, startTimeMax: null, withinMinutes: null, networks: [], availabilityScope: 'all',
    minMatch: null, maxRuntime: null, newOnly: false, noNews: false, noReality: false, noReruns: false,
    familyFriendly: false, noHorror: false, englishAudioOnly: false, household: [], sort: 'personalized_match',
  };
}

const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

export function parseScheduleQuery(text: string): ParsedQuery {
  const q = baseQuery();
  const t = ' ' + fold(text) + ' ';

  // ── date scope / time ──
  if (/\btonight\b/.test(t)) q.dateScope = 'tonight';
  else if (/\blate ?night\b/.test(t)) q.dateScope = 'late_night';
  else if (/\btomorrow\b/.test(t)) q.dateScope = 'tomorrow';
  else if (/\b(this )?weekend\b/.test(t)) q.dateScope = 'weekend';
  else if (/\b(right now|on now|on right now|currently|worth joining late)\b/.test(t)) q.dateScope = 'now';
  else if (/\btoday\b/.test(t)) q.dateScope = 'today';

  const within = t.match(/\b(?:next|within|in)\s+(\d+)\s*(min|minute|minutes|hour|hours|hr|hrs)\b/);
  if (within) { const n = +within[1]!; q.withinMinutes = /hour|hr/.test(within[2]!) ? n * 60 : n; if (q.dateScope === 'now') q.dateScope = 'today'; }
  else if (/\bnext two hours|next 2 hours\b/.test(t)) { q.withinMinutes = 120; q.dateScope = 'today'; }

  const after = t.match(/\bafter\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  if (after) q.startTimeMin = to24(+after[1]!, after[2] ? +after[2] : 0, after[3]);
  const before = t.match(/\bbefore\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  if (before) q.startTimeMax = to24(+before[1]!, before[2] ? +before[2] : 0, before[3]);

  // ── content type ──
  if (/\bmovies?\b|\bfilms?\b/.test(t)) q.mediaTypes = ['movie'];
  if (/\b(shows?|series|episodes?)\b/.test(t) && !/\bmovies?\b/.test(t)) q.mediaTypes = ['tv'];
  if (/\bnew episodes?\b|\bonly new\b/.test(t)) { q.newOnly = true; if (!q.mediaTypes.length) q.mediaTypes = ['tv']; }
  if (/\bno news\b|\b(do not|do n'?t|don'?t|dont) (show|want)( me)? .{0,12}news\b|\bnews\b[^.]*\bno\b/.test(t)) q.noNews = true;
  if (/\bno reality\b|\bno reality tv\b/.test(t)) q.noReality = true;
  if (/\bno reruns?\b/.test(t)) q.noReruns = true;
  if (/\bfamily(-| )friendly\b|\bfor kids\b|\bfamily movie\b/.test(t)) q.familyFriendly = true;
  if (/\bno horror\b/.test(t)) q.noHorror = true;
  if (/\benglish( audio)?\b/.test(t)) q.englishAudioOnly = true;

  const extraExclude: EventType[] = [];
  if (q.noNews) extraExclude.push('news');
  q.eventTypesExclude = Array.from(new Set(['sports', ...extraExclude])) as EventType[];

  // ── runtime / match threshold ──
  const under = t.match(/\bunder\s+(\d+)\s*(hour|hours|hr|hrs|min|minutes)\b/) || (/\bunder two hours\b|\bless than two hours\b/.test(t) ? ['', '2', 'hours'] as RegExpMatchArray : null);
  if (under) q.maxRuntime = /hour|hr/.test(under[2]!) ? +under[1]! * 60 : +under[1]!;
  const rate = t.match(/\b(?:rate|match|score)\s*(?:over|above|>=?|of at least)?\s*(\d{2,3})\b/) || t.match(/\bover\s+(\d{2,3})\b/);
  if (rate) q.minMatch = Math.min(100, +rate[1]!);

  // ── channels / networks ──
  for (const n of NETWORK_WORDS) if (t.includes(` ${n} `) || t.includes(` ${n}?`)) q.networks.push(n.toUpperCase());

  // ── availability / user scope ──
  if (/\bmy channels?\b|\bon my channels?\b|\bchannels i (have|get|own)\b|\bchannels included\b/.test(t)) q.availabilityScope = 'user_channels';
  else if (/\bmy services?\b|\bon my services?\b/.test(t)) q.availabilityScope = 'user_services';
  else if (/\bfree\b|\bno (additional |extra )?charge\b|\bincluded with my provider\b/.test(t)) q.availabilityScope = 'free';

  // ── household ──
  if (/\btwo profiles?\b|\bfamily (movie )?night\b|\beveryone\b|\bparents and kids\b|\bboth watch\b/.test(t)) {
    q.household = ['me', 'guest']; // resolved to real profile ids by the caller
    q.sort = 'personalized_match';
  }

  // ── sort ──
  if (q.minMatch != null || /\bbest\b|\bgood\b/.test(t)) q.sort = 'personalized_match';

  // ── one clarification only when it materially changes results ──
  let clarification: ParsedQuery['clarification'] = null;
  const noExtraConstraints = !q.startTimeMin && !q.startTimeMax && q.maxRuntime == null && q.minMatch == null && !q.newOnly && !q.withinMinutes && !q.household.length;
  const bareMoviesTonight = q.mediaTypes[0] === 'movie' && q.dateScope === 'tonight' && q.availabilityScope === 'all' && !q.networks.length && noExtraConstraints;
  const bareNetworkNow = q.networks.length === 1 && q.dateScope === 'now' && !/\b(right now|on now|currently)\b/.test(t) && q.mediaTypes.length === 0 && noExtraConstraints;
  if (bareMoviesTonight) {
    clarification = { key: 'availability_scope', question: 'Movies on all available channels, or only channels included with your provider?',
      options: [ { key: 'all', label: 'All channels', patch: { availabilityScope: 'all' } }, { key: 'mine', label: 'My provider only', patch: { availabilityScope: 'user_channels' } } ] };
  } else if (bareNetworkNow) {
    clarification = { key: 'network_when', question: `On ${q.networks[0]} right now, or the rest of tonight?`,
      options: [ { key: 'now', label: 'Right now', patch: { dateScope: 'now' } }, { key: 'tonight', label: 'Rest of tonight', patch: { dateScope: 'tonight' } } ] };
  }

  return { original: text, query: q, clarification };
}

/** Apply a clarification option's patch to complete the SAME search. */
export function applyClarification(parsed: ParsedQuery, optionKey: string): ScheduleQuery {
  const opt = parsed.clarification?.options.find((o) => o.key === optionKey);
  return { ...parsed.query, ...(opt?.patch ?? {}) };
}

function to24(h: number, m: number, ampm?: string): string {
  let hh: number;
  if (ampm === 'pm') hh = (h % 12) + 12;
  else if (ampm === 'am') hh = h % 12;
  else hh = h >= 1 && h <= 11 ? h + 12 : h % 24; // bare "after 8" ⇒ 8 PM (TV context)
  return `${String(hh % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
