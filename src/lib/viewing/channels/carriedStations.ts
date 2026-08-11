/**
 * PURGING STATIONS WE NO LONGER CARRY.
 *
 * `NBC.com`, `ABC News Live` and `CBS News` reached the guide as television
 * channels, and the ingest fix stopped them being WRITTEN — but a fix at the
 * write boundary cannot retract what was already stored. Those rows kept
 * rendering, and the only thing that would have removed them is the national
 * reconcile, which runs at most once per UTC day and had already run.
 *
 * That is a real gap, not just bad timing: "we stopped carrying this station"
 * is a POLICY change, and a policy change should not have to wait on a fetch
 * cadence to take effect. So this is a separate, fetch-independent step —
 * which is also what makes it safe:
 *
 *   • THE RECONCILE compares fetched-vs-stored, so it must never expire
 *     anything after a failed or partial fetch (an empty fetch would look
 *     exactly like "everything was cancelled"). That rule is unchanged.
 *   • THIS PURGE never consults a fetch at all. It asks one question of the
 *     REGISTRY — "is this station key one of the channels we carry?" — so an
 *     empty, failed or skipped fetch cannot influence it, and it cannot
 *     mass-delete a carried channel's listings under any circumstance.
 *
 * THREE WAYS TO BE KEPT, ONE WAY TO BE PURGED. A station survives if its key
 * matches a canonical channel id, OR the slug of a carried channel's display
 * name, OR resolves through the alias table once de-slugged. The redundancy is
 * deliberate: station keys were written by two different schemes (the legacy
 * `networkSlug(sourceName)` and the current canonical id), and a purge that
 * understood only the current one would delete live channels still stored
 * under their old key. Being generous about keeping and strict about removing
 * is the right asymmetry when the cost of a wrong removal is a blank guide.
 *
 * Pure: no I/O. The writer half lives in `ingest/tvmazeWriter.ts`.
 *
 * WHY IT LIVES IN `channels/` AND NOT `ingest/`. It used to sit next to the
 * writer, which read naturally — the purge is an ingest step — but the question
 * it answers is "is this station one of the channels we carry", which is
 * channel IDENTITY, the same subject as `channelIdentity.ts` next door. The
 * distinction stopped being cosmetic the moment a read-only diagnostic needed
 * this predicate: `userSessionEgress.test.ts` forbids any route importing from
 * `viewing/ingest/`, on the sound principle that a user-facing surface has no
 * business reaching the ingest layer. Filing a pure predicate under `ingest/`
 * made that guard fire on a route that cannot make a network call, and the
 * cheap way out would have been an allowlist exemption — which weakens the
 * guard permanently to fix a filing error once. Correct classification costs
 * nothing and leaves the rule sharp.
 */
import { LINEAR_CHANNELS, networkSlug, resolveLinearChannel } from './channelIdentity';

/** The `tvmaze-net:` prefix the national ingest synthesises its stations with. */
export const NATIONAL_STATION_PREFIX = 'tvmaze-net:';

const CARRIED_IDS: ReadonlySet<string> = new Set(LINEAR_CHANNELS.map((c) => c.id));
const CARRIED_SLUGS: ReadonlySet<string> = new Set(LINEAR_CHANNELS.map((c) => networkSlug(c.name)));

/**
 * Is this synthesized station key still one of the channels we carry?
 *
 * Takes the FULL key (`tvmaze-net:nbc-com`). A key without the national prefix
 * is not ours to judge and is always kept — the curated Pack stations live on
 * the same lineup and must never be touched by this.
 */
export function isCarriedStationKey(stationKey: string): boolean {
  if (!stationKey.startsWith(NATIONAL_STATION_PREFIX)) return true;
  const suffix = stationKey.slice(NATIONAL_STATION_PREFIX.length).trim();
  if (!suffix) return false;
  if (CARRIED_IDS.has(suffix)) return true; // current scheme: canonical id
  if (CARRIED_SLUGS.has(suffix)) return true; // legacy scheme: slug of the display name
  // Legacy keys built from a source spelling we still recognise as an alias
  // ("fox-news-channel" → "fox news channel" → Fox News Channel).
  return resolveLinearChannel(suffix.replace(/-/g, ' ')) !== null;
}

/**
 * Which of these stored station keys are no longer carried?
 *
 * Deterministic and total: every input key is either kept or returned here, and
 * the result preserves input order so a log reads the same way twice.
 */
export function uncarriedStationKeys(storedKeys: readonly string[]): string[] {
  return storedKeys.filter((k) => !isCarriedStationKey(k));
}
