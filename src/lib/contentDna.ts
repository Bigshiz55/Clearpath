import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MediaType } from '@/lib/types';

export interface DnaDimension {
  key: string;
  label: string;
  /** 0..100 for the bar. */
  value: number;
  caption: string;
}

export interface ContentDna {
  responses: number;
  dimensions: DnaDimension[];
}

type Counts = Record<string, Record<string, number>>;

function sum(obj: Record<string, number> | undefined): number {
  if (!obj) return 0;
  return Object.values(obj).reduce((a, b) => a + b, 0);
}

/**
 * A spoiler-free, viewer-sourced Content DNA aggregated from real post-watch
 * interview answers — the honest version of a content fingerprint. Every
 * dimension states its own sample size; nothing shows up without real answers
 * behind it. Returns null when there's no data or the RPC isn't available yet.
 */
export async function getContentDna(
  supabase: SupabaseClient,
  mediaType: MediaType,
  tmdbId: number,
): Promise<ContentDna | null> {
  const { data, error } = await supabase.rpc('get_content_dna', {
    p_media_type: mediaType,
    p_tmdb_id: tmdbId,
  });
  if (error || !data) return null;
  const d = data as { responses?: number; counts?: Counts };
  const responses = d.responses ?? 0;
  const counts = d.counts ?? {};
  if (responses === 0) return null;

  const dims: DnaDimension[] = [];

  // Slow-burn / pacing.
  const pacing = counts.pacing ?? {};
  const tooSlow = counts.why_stopped?.too_slow ?? 0;
  const pacingBase = sum(pacing) + tooSlow;
  if (pacingBase > 0) {
    const drag = (pacing.yes ?? 0) + 0.5 * (pacing.somewhat ?? 0) + tooSlow;
    const value = Math.round((100 * drag) / pacingBase);
    dims.push({
      key: 'pacing',
      label: 'Slow-burn / pacing',
      value,
      caption: `${value}% felt it dragged (${pacingBase} ${pacingBase === 1 ? 'viewer' : 'viewers'})`,
    });
  }

  // Ending satisfaction.
  const ending = counts.ending ?? {};
  const endBase = sum(ending);
  if (endBase > 0) {
    const good = (ending.yes ?? 0) + 0.5 * (ending.somewhat ?? 0);
    const value = Math.round((100 * good) / endBase);
    dims.push({
      key: 'ending',
      label: 'Ending satisfaction',
      value,
      caption: `${value}% found the ending satisfying (${endBase})`,
    });
  }

  // Element prominence (sci-fi / supernatural / fantasy, aggregated).
  const element = counts.element ?? {};
  const elBase = sum(element);
  if (elBase > 0) {
    const value = Math.round((100 * (element.more ?? 0)) / elBase);
    dims.push({
      key: 'element',
      label: 'Genre element prominence',
      value,
      caption: `${value}% said the genre element was bigger than expected (${elBase})`,
    });
  }

  // Would watch another season (TV).
  const season = counts.another_season ?? {};
  const seasonBase = sum(season);
  if (seasonBase > 0) {
    const value = Math.round((100 * ((season.yes ?? 0) + 0.5 * (season.maybe ?? 0))) / seasonBase);
    dims.push({
      key: 'another_season',
      label: 'Would watch another season',
      value,
      caption: `${value}% would keep going (${seasonBase})`,
    });
  }

  if (dims.length === 0) return null;
  return { responses, dimensions: dims };
}
