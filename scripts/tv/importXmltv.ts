/**
 * XMLTV IMPORT CLI — the local-file transport for the transport-neutral
 * importer (src/lib/viewing/ingest/xmltv/importXmltv.ts).
 *
 *   # analysis only — no database, no env needed
 *   npx tsx scripts/tv/importXmltv.ts --file /path/xmltv-10733.xml --feed-id 10733 --dry-run
 *
 *   # real import — requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY,
 *   # and the target project DECLARED so a stale env can never redirect a write:
 *   npx tsx scripts/tv/importXmltv.ts --file /path/xmltv-10733.xml --feed-id 10733 --project-ref <ref>
 *
 * The declared --project-ref must match the ref inside NEXT_PUBLIC_SUPABASE_URL
 * or the CLI refuses before any connection is made (see targetRef.ts — the
 * import prunes stale rows on success, so "which project?" is never implicit).
 *
 * ZERO provider HTTP calls: this process performs no network I/O other than
 * the database itself. A future SFTP/object-storage/webhook delivery is a new
 * streamFactory, not a new importer.
 */
import { createReadStream } from 'node:fs';
import { statSync } from 'node:fs';
import { importXmltv, type DbClient } from '../../src/lib/viewing/ingest/xmltv/importXmltv';
import { verifyImportTarget } from '../../src/lib/viewing/ingest/xmltv/targetRef';

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main() {
  const file = arg('file');
  const feedId = arg('feed-id');
  const dryRun = process.argv.includes('--dry-run');
  if (!file || !feedId) {
    console.error('usage: importXmltv.ts --file <path.xml> --feed-id <id> --project-ref <ref> [--lineup-name <name>] [--dry-run]');
    process.exit(2);
  }
  statSync(file); // fail fast with a clear ENOENT

  let db: DbClient | undefined;
  if (!dryRun) {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('real import needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (use --dry-run for analysis only)');
      process.exit(2);
    }
    // THE TARGET IS DECLARED OR THE IMPORT REFUSES. The reconciliation step
    // prunes rows, and ambient env is one stale export away from the wrong
    // project — the operator states the ref, we prove it matches the URL.
    // Refs only; no key ever reaches a log.
    const target = verifyImportTarget(process.env.NEXT_PUBLIC_SUPABASE_URL, arg('project-ref'));
    if (!target.ok) {
      console.error(target.reason);
      process.exit(2);
    }
    console.error(`importing into Supabase project ${target.ref}`);
    const { createClient } = await import('@supabase/supabase-js');
    db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } },
    ) as unknown as DbClient;
  }

  const peak = { rss: process.memoryUsage().rss };
  const tick = setInterval(() => {
    const rss = process.memoryUsage().rss;
    if (rss > peak.rss) peak.rss = rss;
  }, 100);

  const result = await importXmltv({
    feedId,
    lineupName: arg('lineup-name') ?? undefined,
    streamFactory: () => createReadStream(file, { highWaterMark: 256 * 1024 }),
    db,
    dryRun,
  });
  clearInterval(tick);

  console.log(JSON.stringify({ ...result, peakRssMb: Math.round(peak.rss / 1024 / 1024) }, null, 1));
  process.exit(result.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
