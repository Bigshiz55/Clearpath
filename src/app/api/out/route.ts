import { NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env';
import { affiliateLink, isHttpUrl } from '@/lib/affiliate';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * Outbound click tracker + affiliate tagger.
 *
 * Every "open on Netflix / rent on Prime" link routes through here: we apply our
 * affiliate tag (server-side, so tags stay out of the client), record the click
 * best-effort, and 302 onward to the service.
 *
 * To avoid being an open redirect (our domain in a phishing link), we only
 * forward to a known streaming / commerce host. Anything else 400s.
 */
const ALLOWED_HOSTS = [
  'amazon.', 'primevideo.com', 'amzn.to', 'amzn.com',
  'apple.com', 'apple.co', 'itunes.apple.com',
  'netflix.com', 'hulu.com', 'max.com', 'hbomax.com', 'hbo.com',
  'disneyplus.com', 'peacocktv.com', 'paramountplus.com', 'pluto.tv',
  'tubitv.com', 'roku.com', 'crackle.com', 'plex.tv', 'vudu.com', 'fandangonow.com',
  'starz.com', 'showtime.com', 'amcplus.com', 'mgmplus.com', 'britbox.com', 'acorn.tv',
  'mubi.com', 'shudder.com', 'crunchyroll.com', 'funimation.com', 'hidive.com',
  'youtube.com', 'play.google.com', 'microsoft.com', 'fubo.tv', 'philo.com',
  'kanopy.com', 'hoopladigital.com', 'pbs.org', 'discoveryplus.com', 'espn.com',
  'justwatch.com', 'themoviedb.org',
];

function allowed(host: string): boolean {
  const h = host.toLowerCase();
  return ALLOWED_HOSTS.some((n) => h === n || h.endsWith(`.${n}`) || h.includes(n));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get('u') ?? '';
  if (!isHttpUrl(raw)) {
    return NextResponse.json({ error: 'Bad link.' }, { status: 400 });
  }
  let dest: URL;
  try {
    dest = new URL(raw);
  } catch {
    return NextResponse.json({ error: 'Bad link.' }, { status: 400 });
  }
  if (dest.protocol !== 'https:' || !allowed(dest.hostname)) {
    return NextResponse.json({ error: 'That destination isn’t allowed.' }, { status: 400 });
  }

  const provider = searchParams.get('p');
  const type = searchParams.get('t');
  const tagged = affiliateLink(raw, serverEnv.affiliateConfig());

  // Best-effort attribution log. Never blocks the redirect: a missing table
  // (migration not applied) or any error is swallowed. Also emitted to the
  // server log so it's visible even without the table.
  const record = {
    provider,
    type,
    media_type: searchParams.get('m'),
    tmdb_id: searchParams.get('id') ? Number(searchParams.get('id')) : null,
    host: dest.hostname,
    referer: request.headers.get('referer'),
  };
  console.log('[outbound]', JSON.stringify(record));
  try {
    const admin = createAdminClient();
    await admin.from('outbound_clicks').insert(record);
  } catch {
    /* table may not exist yet — ignore */
  }

  return NextResponse.redirect(tagged, 302);
}
