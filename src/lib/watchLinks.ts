// Client-safe "Watch it" deep links. For seniors the single most important
// action is one big button that actually opens the service to the title. We
// can't reliably deep-link to an exact title id per service, but opening the
// service's search for the title works everywhere and triggers the app via
// universal links on phones/TVs. Honest: it opens the service and searches.

const q = (title: string, year?: number | null) => encodeURIComponent(year ? `${title} ${year}` : title);

/** Map a provider name (as TMDB reports it) to a URL that opens that service to
 *  the title. Falls back to a Google "watch <title>" search when unknown. */
export function providerWatchUrl(provider: string | null, title: string, year?: number | null): { url: string; label: string } {
  const name = (provider ?? '').toLowerCase();
  const t = q(title, year);
  const on = (label: string, url: string) => ({ url, label: `Watch on ${label}` });

  if (name.includes('netflix')) return on('Netflix', `https://www.netflix.com/search?q=${t}`);
  if (name.includes('prime') || name.includes('amazon')) return on('Prime Video', `https://www.amazon.com/s?k=${t}&i=instant-video`);
  if (name.includes('disney')) return on('Disney+', `https://www.disneyplus.com/search?q=${t}`);
  if (name.includes('hulu')) return on('Hulu', `https://www.hulu.com/search?q=${t}`);
  if (name.includes('max') || name.includes('hbo')) return on('Max', `https://play.max.com/search?q=${t}`);
  if (name.includes('apple')) return on('Apple TV', `https://tv.apple.com/search?term=${t}`);
  if (name.includes('paramount')) return on('Paramount+', `https://www.paramountplus.com/search/`);
  if (name.includes('peacock')) return on('Peacock', `https://www.peacocktv.com/`);
  if (name.includes('tubi')) return on('Tubi', `https://tubitv.com/search/${t}`);
  if (name.includes('pluto')) return on('Pluto TV', `https://pluto.tv/en/search/details?query=${t}`);
  if (name.includes('roku')) return on('The Roku Channel', `https://therokuchannel.roku.com/search/${t}`);
  if (name.includes('starz')) return on('Starz', `https://www.starz.com/us/en/search?q=${t}`);
  if (name.includes('showtime')) return on('Showtime', `https://www.sho.com/search?q=${t}`);
  if (name.includes('amc')) return on('AMC+', `https://www.amcplus.com/search?q=${t}`);
  if (name.includes('crunchyroll')) return on('Crunchyroll', `https://www.crunchyroll.com/search?q=${t}`);
  if (name.includes('youtube')) return on('YouTube', `https://www.youtube.com/results?search_query=${t}`);

  // Unknown provider — a plain, trustworthy web search for where to watch it.
  return { url: `https://www.google.com/search?q=${q(`watch ${title} ${year ?? ''}`)}`, label: provider ? `Watch on ${provider}` : 'Find where to watch' };
}
