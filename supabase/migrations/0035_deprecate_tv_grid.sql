-- 0035 — mark tv_grid deprecated.
--
-- tv_grid was fed by Gracenote's public listings grid (src/lib/gracenote.ts,
-- /api/cron/tv-grid), which is now behind an AWS WAF bot challenge and is
-- retired rather than repaired or worked around — see
-- docs/SCHEDULE_PROVIDERS.md. That module, its cron route, and every code
-- path that read or wrote this table have been deleted.
--
-- The table itself is left in place, not dropped: it may still hold rows
-- from before the endpoint was blocked, and dropping it is a separate,
-- deliberate decision this migration does not make. Real TV listings now
-- come from the TVmaze ingest into the 0032 tables
-- (tv_providers/tv_lineups/tv_stations/tv_programmes/tv_airings) — see
-- src/lib/viewing/ingest/.
--
-- Comment-only. No schema change. Idempotent.

comment on table public.tv_grid is
$$DEPRECATED — fed by a now-retired, WAF-blocked Gracenote endpoint. No code writes or reads this table. Left in place, not dropped. Real TV listings now come from the TVmaze ingest into tv_providers/tv_lineups/tv_stations/tv_programmes/tv_airings — see src/lib/viewing/ingest/.$$;
