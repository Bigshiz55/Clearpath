import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Tracked-link redirect. /go/<slug> → logs a click (via the SECURITY DEFINER
 * `growth_click` RPC, so anonymous visitors work without a broad table policy)
 * and 302s to the link's destination. Unknown slug → home. Never throws.
 */
export async function GET(request: Request, { params }: { params: { slug: string } }) {
  const origin = new URL(request.url).origin;
  const fallback = NextResponse.redirect(new URL('/', origin), 302);
  const slug = params.slug?.slice(0, 40);
  if (!slug) return fallback;

  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc('growth_click', {
      p_slug: slug,
      p_referer: request.headers.get('referer') ?? '',
      p_ua: request.headers.get('user-agent') ?? '',
    });
    if (error || !data || typeof data !== 'string') return fallback;
    const dest = data.startsWith('http') ? data : new URL(data.startsWith('/') ? data : `/${data}`, origin).toString();
    return NextResponse.redirect(dest, 302);
  } catch {
    return fallback;
  }
}
