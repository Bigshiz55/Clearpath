import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { VerdictTier, WatchlistDisposition, WatchProviders } from '@/lib/types';

export interface PublicVerdictSnapshot {
  kind: 'verdict';
  includePersonal: boolean;
  title: string;
  year: number | null;
  mediaType: 'movie' | 'tv';
  posterUrl: string | null;
  backdropUrl: string | null;
  generalScore: number;
  generalConfidence: 'high' | 'medium' | 'low';
  tier: VerdictTier;
  disposition: WatchlistDisposition;
  oneLiner: string;
  reasonsFor: string[];
  reasonsAgainst: string[];
  providers: WatchProviders | null;
  personal: { label: string; score: number } | null;
  generatedAt: string;
}

/**
 * Resolve a public share by token via the SECURITY DEFINER RPC. Returns null
 * for missing/inactive/expired tokens. Never exposes owner identity or private
 * data — only the pre-computed public snapshot.
 */
export async function getPublicShare(token: string): Promise<PublicVerdictSnapshot | null> {
  if (!token || token.length < 10 || token.length > 64) return null;
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc('get_public_share', { share_token: token });
    if (error || !data) return null;
    return data as PublicVerdictSnapshot;
  } catch {
    return null;
  }
}
