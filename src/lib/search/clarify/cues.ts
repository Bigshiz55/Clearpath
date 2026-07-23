/**
 * Multilingual intent-cue lexicon. Each entry maps trigger terms in one or more
 * languages to a CANONICAL intent with a weight. This is a true multilingual
 * table — NOT English rules translated one by one — and the ambiguous "coming"
 * family ("coming / viene / passe / kommt / vai passar / やる / سيعرض") deliberately
 * splits weight across live-TV and upcoming, which is what drives clarification.
 */
import { foldTitle } from '@/lib/search/titleMatch';
import type { CanonicalIntent } from './canonical';

export interface Cue { terms: string[]; intent: CanonicalIntent; weight: number }

/** Terms are matched case/diacritic-insensitively for Latin scripts and verbatim
 *  for CJK/Arabic (fold is a no-op there). Keep terms lowercased. */
export const CUES: Cue[] = [
  // streaming_lookup
  { terms: ['where can i watch', 'where to watch', 'where to stream', 'where can i stream', "where's", 'stream it'], intent: 'streaming_lookup', weight: 1 },
  { terms: ['where ', 'wheres '], intent: 'streaming_lookup', weight: 0.55 },
  { terms: ['donde puedo ver', 'donde veo', 'donde ver', 'donde sale', 'donde miro'], intent: 'streaming_lookup', weight: 1 },
  { terms: ['ou voir', 'ou regarder', 'ou puis-je regarder'], intent: 'streaming_lookup', weight: 1 },
  { terms: ['wo lauft', 'wo kann ich', 'wo streamen', 'wo sehen'], intent: 'streaming_lookup', weight: 1 },
  { terms: ['onde assistir', 'onde ver', 'onde posso assistir'], intent: 'streaming_lookup', weight: 1 },
  { terms: ['どこで見れる', 'どこで見られる', 'どこで観れる', 'どこで見る'], intent: 'streaming_lookup', weight: 1 },
  { terms: ['أين أشاهد', 'اين اشاهد', 'وين اشوف'], intent: 'streaming_lookup', weight: 1 },
  { terms: ['在哪看', '在哪里看', '哪里能看', '哪里可以看', '怎么看', '在哪儿看'], intent: 'streaming_lookup', weight: 1 },
  // live_tv_schedule (incl. ambiguous airing verbs)
  { terms: ['on tv', 'on now', 'whats on', "what's on", 'airing', 'live tv', 'on tonight', 'tonight on'], intent: 'live_tv_schedule', weight: 1 },
  { terms: ['coming', 'on soon'], intent: 'live_tv_schedule', weight: 0.5 },
  { terms: ['viene', 'sale hoy', 'dan hoy', 'echan'], intent: 'live_tv_schedule', weight: 0.5 },
  { terms: ['passe', 'passe bientot', 'ce soir'], intent: 'live_tv_schedule', weight: 0.5 },
  { terms: ['kommt', 'lauft bald', 'heute abend'], intent: 'live_tv_schedule', weight: 0.5 },
  { terms: ['vai passar', 'passa hoje'], intent: 'live_tv_schedule', weight: 0.5 },
  { terms: ['やる', '放送', '今夜'], intent: 'live_tv_schedule', weight: 0.5 },
  { terms: ['سيعرض قريبا', 'يعرض'], intent: 'live_tv_schedule', weight: 0.5 },
  { terms: ['什么时候播', '几点播', '今晚播', '什么时候上'], intent: 'live_tv_schedule', weight: 0.5 },
  // upcoming_release (ambiguous "new/coming" also lands here)
  { terms: ['coming out', 'coming soon', 'upcoming', 'new release', 'releasing', 'comes out'], intent: 'upcoming_release', weight: 1 },
  { terms: ['coming', 'new'], intent: 'upcoming_release', weight: 0.5 },
  { terms: ['nueva pelicula', 'nuevo', 'proximamente', 'estreno', 'viene'], intent: 'upcoming_release', weight: 0.5 },
  { terms: ['nouveau', 'bientot', 'sortie', 'a venir'], intent: 'upcoming_release', weight: 0.5 },
  { terms: ['neu', 'bald', 'kommt bald', 'demnachst'], intent: 'upcoming_release', weight: 0.5 },
  { terms: ['novo', 'em breve', 'estreia'], intent: 'upcoming_release', weight: 0.5 },
  { terms: ['新しい', '新作', '公開'], intent: 'upcoming_release', weight: 0.5 },
  { terms: ['جديد', 'قريبا'], intent: 'upcoming_release', weight: 0.5 },
  // similar_to
  { terms: ['something like', 'similar to', 'like ', 'more like', 'in the vein of'], intent: 'similar_to', weight: 1 },
  { terms: ['algo como', 'parecido a', 'similar a'], intent: 'similar_to', weight: 1 },
  { terms: ['un truc comme', 'comme ', 'dans le genre de'], intent: 'similar_to', weight: 1 },
  { terms: ['so was wie', 'ahnlich wie', 'wie '], intent: 'similar_to', weight: 1 },
  { terms: ['algo tipo', 'parecido com', 'tipo '], intent: 'similar_to', weight: 1 },
  { terms: ['みたいな', 'みたいの', 'のような'], intent: 'similar_to', weight: 1 },
  { terms: ['شيء مثل', 'مثل '], intent: 'similar_to', weight: 1 },
  { terms: ['类似', '像这样的', '差不多的', '这种类型'], intent: 'similar_to', weight: 1 },
  // recommendation
  { terms: ['recommend', 'suggest', 'what should i watch', 'surprise me', 'anything good'], intent: 'recommendation', weight: 1 },
  { terms: ['recomienda', 'recomiendame', 'que veo', 'algo bueno'], intent: 'recommendation', weight: 1 },
  { terms: ['recommande', 'conseille', 'quoi regarder'], intent: 'recommendation', weight: 1 },
  { terms: ['empfiehl', 'was soll ich schauen'], intent: 'recommendation', weight: 1 },
  { terms: ['recomenda', 'o que assistir'], intent: 'recommendation', weight: 1 },
  { terms: ['おすすめ', '何見る'], intent: 'recommendation', weight: 1 },
  { terms: ['推荐', '推荐点', '看什么好'], intent: 'recommendation', weight: 1 },
  { terms: ['即将上映', '新片', '新作品', '快上映'], intent: 'upcoming_release', weight: 0.5 },
  // actor_lookup
  { terms: ['movies with', 'films with', 'starring', 'with the actor'], intent: 'actor_lookup', weight: 0.9 },
  { terms: ['peliculas con', 'con el actor'], intent: 'actor_lookup', weight: 0.9 },
  { terms: ['films avec', 'avec l acteur'], intent: 'actor_lookup', weight: 0.9 },
  { terms: ['filme mit', 'mit dem schauspieler'], intent: 'actor_lookup', weight: 0.9 },
  // franchise_lookup
  { terms: ['franchise', 'saga', 'all the', 'collection', 'trilogy'], intent: 'franchise_lookup', weight: 0.7 },
  { terms: ['las peliculas de', 'la saga', 'todas las'], intent: 'franchise_lookup', weight: 0.7 },
  // genre_browse / mood_search
  { terms: ['comedy', 'horror', 'thriller', 'romance', 'sci-fi', 'documentary', 'drama'], intent: 'genre_browse', weight: 0.8 },
  { terms: ['comedia', 'terror', 'suspenso', 'romantica', 'documental'], intent: 'genre_browse', weight: 0.8 },
  { terms: ['funny', 'scary', 'sad', 'feel good', 'dark', 'gory', 'murder mystery', 'cozy'], intent: 'mood_search', weight: 0.8 },
  { terms: ['gracioso', 'divertido', 'de miedo', 'triste'], intent: 'mood_search', weight: 0.8 },
  { terms: ['drole', 'effrayant', 'triste'], intent: 'mood_search', weight: 0.8 },
  // availability_by_service
  { terms: ['on netflix', 'on max', 'on hulu', 'on disney', 'netflix tonight', 'on prime'], intent: 'availability_by_service', weight: 0.9 },
  { terms: ['en netflix', 'en disney'], intent: 'availability_by_service', weight: 0.9 },
  // release_date / watch_order
  { terms: ['release date', 'when does', 'when is', 'when comes out'], intent: 'release_date', weight: 0.85 },
  { terms: ['watch order', 'what order', 'in order'], intent: 'watch_order', weight: 0.9 },
];

/** Accumulate canonical-intent scores from cue matches over a query. */
export function scoreIntentCues(rawQuery: string): Record<string, number> {
  const folded = ' ' + foldTitle(rawQuery) + ' ';
  const scores: Record<string, number> = {};
  for (const cue of CUES) {
    for (const term of cue.terms) {
      if (folded.includes(foldTitle(term))) { scores[cue.intent] = (scores[cue.intent] ?? 0) + cue.weight; break; }
    }
  }
  return scores;
}
