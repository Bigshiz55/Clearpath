/**
 * STREAMING XMLTV PARSER — the one reader for TV Media file deliveries.
 *
 * ── WHY HAND-ROLLED, NOT A DOM OR A GENERIC XML LIBRARY ──────────────────
 * The deliveries are large (a 543-channel file runs ~45 MB / 70k programmes)
 * and arrive from a third party, which sets two hard requirements:
 *
 *   MEMORY  the whole document must never be resident. This scanner holds a
 *           rolling buffer bounded by MAX_ELEMENT_BYTES — one <channel> or
 *           <programme> element at a time — so peak memory is measured in
 *           kilobytes regardless of file size.
 *   XXE     no DTD processing, no entity resolution, no network. The
 *           `<!DOCTYPE tv SYSTEM "xmltv.dtd">` line every TV Media file
 *           carries is consumed as inert markup; only the five built-in XML
 *           entities and numeric character references are decoded. There is
 *           no code path that could fetch anything, which is a stronger
 *           guarantee than configuring a general parser not to.
 *
 * XMLTV is a deliberately flat vocabulary (channels and programmes with
 * simple, non-recursive children), which is what makes a bounded scanner
 * correct here — this is NOT a general XML parser and must not migrate to
 * parsing anything else.
 *
 * TRANSPORT-NEUTRAL BY CONSTRUCTION: input is any async iterable of bytes.
 * A local file, an SFTP drop, an object-storage download or an upload buffer
 * all feed the same function; the CLI is just one transport (see
 * scripts/tv/importXmltv.ts).
 *
 * PURE against the outside world: no I/O of its own, no clock, no env.
 */

export interface XmltvChannel {
  /** The raw XMLTV channel id, e.g. "177.stations.xmltv.tvmedia.ca". */
  id: string;
  /** Every <display-name>, in document order — position carries meaning
   *  (see displayNameRoles below) and is preserved verbatim. */
  displayNames: string[];
  /** Provider icon URLs, as supplied (scheme preserved — the render layer
   *  decides what is safe to show; see the images policy in the importer). */
  iconUrls: string[];
  urls: string[];
}

export interface XmltvTimestamp {
  /** Epoch milliseconds, computed FROM THE SUPPLIED OFFSET — never a guess. */
  utcMs: number;
  /** The raw string exactly as delivered, e.g. "20260815000000 +0000". */
  raw: string;
  /** The supplied offset in minutes east of UTC (e.g. "+0000" → 0, "-0500" → -300). */
  offsetMinutes: number;
}

export interface XmltvEpisodeNum {
  system: string | null;
  value: string;
}

export interface XmltvProgramme {
  channelId: string;
  start: XmltvTimestamp;
  /** XMLTV allows a missing stop; the corpus decides how common that is. */
  stop: XmltvTimestamp | null;
  title: string;
  subTitle: string | null;
  desc: string | null;
  /** <date> — usually a release year for movies. Kept raw. */
  date: string | null;
  categories: string[];
  actors: string[];
  directors: string[];
  episodeNums: XmltvEpisodeNum[];
  iconUrls: string[];
  /** <rating><value>TVPG</value></rating> — first value, raw. */
  rating: string | null;
  /** <star-rating><value>3 / 5</value></star-rating> — first value, raw. */
  starRating: string | null;
  isNew: boolean;
  isPremiere: boolean;
  isLive: boolean;
  previouslyShown: boolean;
}

export interface XmltvMalformation {
  /** Where in the stream (byte offset of the element start). */
  byteOffset: number;
  reason: string;
  /** A short, truncated excerpt for diagnostics — never the whole element. */
  excerpt: string;
}

export interface XmltvHeader {
  sourceInfoName: string | null;
  sourceInfoUrl: string | null;
  /** The <tv date="..."> attribute, raw. */
  generatedDate: string | null;
}

export interface XmltvParseCallbacks {
  onHeader?: (header: XmltvHeader) => void;
  onChannel?: (channel: XmltvChannel) => void | Promise<void>;
  onProgramme?: (programme: XmltvProgramme) => void | Promise<void>;
  onMalformed?: (m: XmltvMalformation) => void;
}

export interface XmltvParseSummary {
  channels: number;
  programmes: number;
  malformed: number;
  bytes: number;
}

/** One element must fit comfortably in this window; a "channel" or
 *  "programme" element larger than 256 KiB is not schedule data. */
export const MAX_ELEMENT_BYTES = 256 * 1024;

/* ── entity decoding — the five built-ins plus numeric refs, NOTHING else.
   An unknown named entity is left as literal text: decoding it would require
   a DTD, and consulting a DTD is exactly what this parser refuses to do. */
export function decodeXmlText(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, c: string) => c)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => safeCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function safeCodePoint(n: number): string {
  if (!Number.isFinite(n) || n < 0x9 || n > 0x10ffff) return '';
  try {
    return String.fromCodePoint(n);
  } catch {
    return '';
  }
}

/* ── XMLTV timestamps: "YYYYMMDDHHMMSS +HHMM". The offset is DATA — a feed
   may deliver station-local times; converting through the supplied offset is
   arithmetic, dropping it would be a guess. A timestamp with no offset is
   refused (reported malformed) rather than silently read in some machine's
   local zone: the XMLTV spec calls no-offset "local time", and this importer
   has no honest way to know whose. */
const TS_RE = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})$/;

export function parseXmltvTimestamp(raw: string | null | undefined): XmltvTimestamp | null {
  if (!raw) return null;
  const m = TS_RE.exec(raw.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s, off] = m;
  const sign = off![0] === '-' ? -1 : 1;
  const offsetMinutes = sign * (Number(off!.slice(1, 3)) * 60 + Number(off!.slice(3, 5)));
  const asUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  if (!Number.isFinite(asUtc)) return null;
  // Basic calendar sanity — Date.UTC silently rolls over "20260231".
  const check = new Date(asUtc);
  if (check.getUTCMonth() !== Number(mo) - 1 || check.getUTCDate() !== Number(d)) return null;
  return { utcMs: asUtc - offsetMinutes * 60_000, raw: raw.trim(), offsetMinutes };
}

/* ── tiny element readers, applied to ONE extracted element at a time ───── */

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`).exec(tag) ?? new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`).exec(tag);
  return m ? decodeXmlText(m[1]!) : null;
}

function textsOf(block: string, el: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${el}(?:\\s[^>]*)?>([\\s\\S]*?)</${el}>`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const t = decodeXmlText(m[1]!).trim();
    if (t) out.push(t);
  }
  return out;
}

function firstText(block: string, el: string): string | null {
  return textsOf(block, el)[0] ?? null;
}

function attrsOf(block: string, el: string, name: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${el}\\b[^>]*>`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const v = attr(m[0]!, name);
    if (v) out.push(v);
  }
  return out;
}

function hasElement(block: string, el: string): boolean {
  return new RegExp(`<${el}(?:[\\s/>])`).test(block);
}

export function parseChannelElement(block: string): XmltvChannel | null {
  const open = /<channel\b[^>]*>/.exec(block);
  if (!open) return null;
  const id = attr(open[0]!, 'id');
  if (!id) return null;
  return {
    id,
    displayNames: textsOf(block, 'display-name'),
    iconUrls: attrsOf(block, 'icon', 'src'),
    urls: textsOf(block, 'url'),
  };
}

export function parseProgrammeElement(block: string): { programme: XmltvProgramme | null; reason?: string } {
  const open = /<programme\b[^>]*>/.exec(block);
  if (!open) return { programme: null, reason: 'no opening programme tag' };
  const tag = open[0]!;
  const channelId = attr(tag, 'channel');
  if (!channelId) return { programme: null, reason: 'programme without channel attribute' };
  const start = parseXmltvTimestamp(attr(tag, 'start'));
  if (!start) return { programme: null, reason: `unparseable start "${attr(tag, 'start') ?? ''}"` };
  const stopRaw = attr(tag, 'stop');
  const stop = stopRaw ? parseXmltvTimestamp(stopRaw) : null;
  if (stopRaw && !stop) return { programme: null, reason: `unparseable stop "${stopRaw}"` };
  const title = firstText(block, 'title');
  if (!title) return { programme: null, reason: 'programme without title' };

  // <credits> children — actors/directors read from inside the credits block
  // only, so a stray element elsewhere can't masquerade as a credit.
  const creditsBlock = /<credits(?:\s[^>]*)?>([\s\S]*?)<\/credits>/.exec(block)?.[1] ?? '';

  const episodeNums: XmltvEpisodeNum[] = [];
  const epRe = /<episode-num\b([^>]*)>([\s\S]*?)<\/episode-num>/g;
  let em: RegExpExecArray | null;
  while ((em = epRe.exec(block)) !== null) {
    const value = decodeXmlText(em[2]!).trim();
    if (value) episodeNums.push({ system: attr(`<episode-num${em[1]!}>`, 'system'), value });
  }

  return {
    programme: {
      channelId,
      start,
      stop,
      title,
      subTitle: firstText(block, 'sub-title'),
      desc: firstText(block, 'desc'),
      date: firstText(block, 'date'),
      categories: textsOf(block, 'category'),
      actors: textsOf(creditsBlock, 'actor'),
      directors: textsOf(creditsBlock, 'director'),
      episodeNums,
      iconUrls: attrsOf(block, 'icon', 'src'),
      rating: /<rating[\s\S]*?<value>([\s\S]*?)<\/value>/.exec(block)?.[1]?.trim() ?? null,
      starRating: /<star-rating[\s\S]*?<value>([\s\S]*?)<\/value>/.exec(block)?.[1]?.trim() ?? null,
      isNew: hasElement(block, 'new'),
      isPremiere: hasElement(block, 'premiere'),
      isLive: hasElement(block, 'live'),
      previouslyShown: hasElement(block, 'previously-shown'),
    },
  };
}

/* ── the stream scanner ─────────────────────────────────────────────────── */

/**
 * Scan an XMLTV byte stream, invoking a callback per channel/programme.
 * Holds at most one element (bounded by MAX_ELEMENT_BYTES) plus one chunk in
 * memory. Unknown markup between elements — the prolog, the DOCTYPE line,
 * comments, whitespace — is discarded unread.
 */
export async function parseXmltvStream(
  input: AsyncIterable<Buffer | string>,
  callbacks: XmltvParseCallbacks,
): Promise<XmltvParseSummary> {
  const summary: XmltvParseSummary = { channels: 0, programmes: 0, malformed: 0, bytes: 0 };
  let buf = '';
  let consumedBytes = 0;
  let headerSent = false;

  const flushMalformed = (reason: string, at: number, excerpt: string) => {
    summary.malformed++;
    callbacks.onMalformed?.({ byteOffset: at, reason, excerpt: excerpt.slice(0, 160) });
  };

  const processBuffer = async (final: boolean) => {
    for (;;) {
      if (!headerSent) {
        const tv = /<tv\b[^>]*>/.exec(buf);
        if (tv) {
          headerSent = true;
          callbacks.onHeader?.({
            sourceInfoName: attr(tv[0], 'source-info-name'),
            sourceInfoUrl: attr(tv[0], 'source-info-url'),
            generatedDate: attr(tv[0], 'date'),
          });
        } else if (buf.length > MAX_ELEMENT_BYTES && !final) {
          // A file whose first 256 KiB contains no <tv> element is not XMLTV.
          throw new Error('not an XMLTV document: no <tv> element in the first 256 KiB');
        }
      }

      const open = /<(channel|programme)\b/.exec(buf);
      if (!open) {
        // Nothing openable — keep only a tail (a tag could be split across
        // chunk boundaries), drop the rest.
        if (buf.length > 4096) {
          consumedBytes += buf.length - 4096;
          buf = buf.slice(-4096);
        }
        return;
      }
      const el = open[1]!;
      const startIdx = open.index;
      const closeTag = `</${el}>`;
      const closeIdx = buf.indexOf(closeTag, startIdx);
      // Self-closing (rare, means an empty element): treat as malformed for
      // programmes/channels — both require children to mean anything.
      const selfClose = new RegExp(`<${el}\\b[^>]*/>`).exec(buf.slice(startIdx, startIdx + 2048));
      if (closeIdx === -1 && selfClose) {
        flushMalformed(`self-closing <${el}>`, consumedBytes + startIdx, selfClose[0]);
        const cut = startIdx + selfClose.index + selfClose[0].length;
        consumedBytes += cut;
        buf = buf.slice(cut);
        continue;
      }
      if (closeIdx === -1) {
        if (buf.length - startIdx > MAX_ELEMENT_BYTES) {
          flushMalformed(`unterminated <${el}> exceeding ${MAX_ELEMENT_BYTES} bytes`, consumedBytes + startIdx, buf.slice(startIdx, startIdx + 160));
          const cut = startIdx + MAX_ELEMENT_BYTES;
          consumedBytes += cut;
          buf = buf.slice(cut);
          continue;
        }
        if (final) {
          flushMalformed(`unterminated <${el}> at end of file`, consumedBytes + startIdx, buf.slice(startIdx, startIdx + 160));
          buf = '';
        }
        return; // need more bytes
      }

      const block = buf.slice(startIdx, closeIdx + closeTag.length);
      const at = consumedBytes + startIdx;
      const cut = closeIdx + closeTag.length;
      consumedBytes += cut;
      buf = buf.slice(cut);

      if (el === 'channel') {
        const channel = parseChannelElement(block);
        if (channel) {
          summary.channels++;
          await callbacks.onChannel?.(channel);
        } else {
          flushMalformed('channel without id', at, block);
        }
      } else {
        const { programme, reason } = parseProgrammeElement(block);
        if (programme) {
          summary.programmes++;
          await callbacks.onProgramme?.(programme);
        } else {
          flushMalformed(reason ?? 'unparseable programme', at, block);
        }
      }
    }
  };

  // A chunk boundary can split a multibyte UTF-8 character; StringDecoder
  // carries the partial sequence across chunks instead of corrupting it.
  const { StringDecoder } = await import('node:string_decoder');
  const decoder = new StringDecoder('utf8');
  for await (const chunk of input) {
    const b = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
    summary.bytes += b.length;
    buf += decoder.write(b);
    await processBuffer(false);
  }
  buf += decoder.end();
  await processBuffer(true);
  return summary;
}
