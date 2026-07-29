'use client';

import { useEffect, useRef, useState } from 'react';
import { Copy, Download, Share2 } from 'lucide-react';
import { buildShareCardText, type ShareCardInput, type ShareCardText } from '@/lib/court/shareCard';

/**
 * THE SHAREABLE VERD1CT CARD — client-side canvas, no server dependency (§1).
 *
 * A screenshot of the app is not a shareable artifact — it carries no brand,
 * no join link, and reads as a private thing. This renders a real image
 * instead: the winning poster, the title, the jury's own names and scores for
 * it, and any titles the room vetoed with who struck them — plus the
 * wordmark and the room's join URL, so a screenshot dropped into a group chat
 * IS an acquisition surface (§3), not a dead end.
 *
 * MISSING POSTER ART: `loadPosterSafely` never rejects. A network failure, a
 * 404, or a canvas TAINTED by a poster host that skipped CORS headers all
 * degrade the same way — the poster region is redrawn as a branded
 * placeholder (a stylised TV, not a broken-image icon) and the rest of the
 * card renders exactly as it would with real art. The taint check runs a
 * `getImageData` probe immediately after drawing the poster; if THAT throws,
 * the drawn pixels are erased and replaced with the placeholder before the
 * canvas is ever exported, so Copy/Download/Share can never fail on a
 * tainted canvas.
 */

const CARD_W = 1080;
/** Generous upper bound while drawing (5 jurors + capped vetoes never
 *  exceeds this); the canvas is cropped to the REAL content height
 *  afterward, so a 2-juror room doesn't ship a card that's mostly empty
 *  space above a footer pinned to a fixed bottom. */
const CARD_H_MAX = 1500;
/** Never shorter than this even for the shortest room — keeps the card a
 *  recognizable portrait shape rather than an odd sliver. */
const CARD_H_MIN = 860;
const MARGIN = 64;
const PINK = '#ff1493';

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** CSS object-fit: cover, for a canvas drawImage call. */
function drawCoverImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const srcRatio = img.naturalWidth / img.naturalHeight;
  const dstRatio = w / h;
  let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
  if (srcRatio > dstRatio) {
    sw = img.naturalHeight * dstRatio;
    sx = (img.naturalWidth - sw) / 2;
  } else {
    sh = img.naturalWidth / dstRatio;
    sy = (img.naturalHeight - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

/** A branded placeholder — a stylised TV, not a broken-image glyph — for a
 *  missing or unloadable poster, so the card never looks like an error. */
function drawPosterPlaceholder(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.save();
  roundRectPath(ctx, x, y, w, h, 16);
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, '#141a2b');
  grad.addColorStop(1, '#0b0e17');
  ctx.fillStyle = grad;
  ctx.fill();

  const cx = x + w / 2;
  const cy = y + h / 2;
  const s = Math.min(w, h) * 0.34;
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = Math.max(3, s * 0.06);
  ctx.lineCap = 'round';
  // TV body.
  roundRectPath(ctx, cx - s, cy - s * 0.55, s * 2, s * 1.35, s * 0.18);
  ctx.fill();
  ctx.stroke();
  // Antenna.
  ctx.beginPath();
  ctx.moveTo(cx, cy - s * 0.55);
  ctx.lineTo(cx - s * 0.55, cy - s * 1.15);
  ctx.moveTo(cx, cy - s * 0.55);
  ctx.lineTo(cx + s * 0.55, cy - s * 1.15);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx - s * 0.55, cy - s * 1.15, s * 0.07, 0, Math.PI * 2);
  ctx.arc(cx + s * 0.55, cy - s * 1.15, s * 0.07, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fill();
  // Dial.
  ctx.beginPath();
  ctx.arc(cx, cy - s * 0.05, s * 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.font = '600 26px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.textAlign = 'center';
  ctx.fillText('No poster available', cx, y + h - 28);
  ctx.restore();
}

/** Never rejects — a load failure resolves to null so the caller always has
 *  a fallback path, never an unhandled promise. */
function loadPosterSafely(url: string | null): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Word-wrap to at most `maxLines`; the final line ellipsizes if it still
 *  overflows. Real pixel measurement — not a character-count guess. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth || !line) {
      line = test;
    } else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) lines.length = maxLines;
  const last = lines[lines.length - 1];
  if (last && ctx.measureText(last).width > maxWidth) {
    let cut = last;
    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
    lines[lines.length - 1] = `${cut}…`;
  }
  return lines;
}

/**
 * Wraps a URL across up to `maxLines`. `wrapText` above breaks at
 * WHITESPACE — a URL has none, so as one long "word" it would either
 * overflow the line or get truncated with the room code as the casualty
 * (the actual defect this replaced: "…/court/…" swallowing "HARNESS1", the
 * one part of the URL a person might need to read aloud). This breaks at
 * character boundaries instead, preferring a natural point (`/`, `-`, `.`)
 * near the fit line so a wrap doesn't land mid-word when it doesn't have to.
 * Only the very last line — after `maxLines` is exhausted — ever ellipsizes.
 */
function wrapUrl(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  if (ctx.measureText(text).width <= maxWidth) return [text];
  const BREAK_CHARS = new Set(['/', '-', '.', '_', '?', '&', '=']);
  const lines: string[] = [];
  let rest = text;
  while (rest.length > 0 && lines.length < maxLines) {
    if (ctx.measureText(rest).width <= maxWidth) {
      lines.push(rest);
      rest = '';
      break;
    }
    // Binary search the longest prefix of `rest` that fits `maxWidth`.
    let lo = 1, hi = rest.length, fit = 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (ctx.measureText(rest.slice(0, mid)).width <= maxWidth) {
        fit = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    let cut = fit;
    if (lines.length < maxLines - 1) {
      // Prefer breaking at a natural URL boundary near the fit point, but
      // never far enough back to leave a near-empty line.
      for (let i = fit; i > fit * 0.6; i--) {
        if (BREAK_CHARS.has(rest[i - 1] ?? '')) {
          cut = i;
          break;
        }
      }
    }
    lines.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest.length > 0) {
    // Ran out of lines with text still remaining — only NOW does anything
    // ellipsize, and only the final line, never the room code if it fit
    // within the lines already used.
    let last = lines[lines.length - 1] ?? '';
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[lines.length - 1] = `${last}…`;
  }
  return lines;
}

/** Draws the card and crops it to its real content height. Returns the final
 *  height so the caller can size the preview's aspect ratio correctly. */
async function drawShareCard(canvas: HTMLCanvasElement, text: ShareCardText, posterUrl: string | null): Promise<number> {
  canvas.width = CARD_W;
  canvas.height = CARD_H_MAX;
  const ctx = canvas.getContext('2d');
  if (!ctx) return CARD_H_MAX;

  // Background — drawn to the MAX height; the crop below trims it.
  const bg = ctx.createLinearGradient(0, 0, 0, CARD_H_MAX);
  bg.addColorStop(0, '#0b0e17');
  bg.addColorStop(1, '#07090f');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H_MAX);

  // Wordmark — "Watch" white / "VERD" pink / "1" white / "CT" pink, matching
  // the app's own WatchVerdictWordmark exactly (§3: legible at 400px wide).
  ctx.textBaseline = 'alphabetic';
  ctx.font = '800 52px system-ui, -apple-system, sans-serif';
  let wx = MARGIN;
  const wy = 88;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text.wordmark.prefix, wx, wy);
  wx += ctx.measureText(text.wordmark.prefix).width;
  ctx.fillStyle = PINK;
  ctx.fillText('VERD', wx, wy);
  wx += ctx.measureText('VERD').width;
  ctx.fillStyle = '#ffffff';
  ctx.fillText('1', wx, wy);
  wx += ctx.measureText('1').width;
  ctx.fillStyle = PINK;
  ctx.fillText('CT', wx, wy);

  ctx.font = '600 26px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText('Your group’s Verd1ct', MARGIN, wy + 40);

  // Poster.
  const posterX = MARGIN;
  const posterY = 172;
  const posterW = 320;
  const posterH = 480;
  const img = await loadPosterSafely(posterUrl);
  let posterDrawn = false;
  if (img) {
    try {
      ctx.save();
      roundRectPath(ctx, posterX, posterY, posterW, posterH, 16);
      ctx.clip();
      drawCoverImage(ctx, img, posterX, posterY, posterW, posterH);
      ctx.restore();
      // Taint probe: throws a SecurityError if the source lacked CORS
      // headers, even though it loaded and drew visibly.
      ctx.getImageData(posterX + 1, posterY + 1, 1, 1);
      posterDrawn = true;
    } catch {
      // Erase whatever the tainted draw left behind before falling back.
      ctx.save();
      ctx.fillStyle = '#07090f';
      ctx.fillRect(posterX - 4, posterY - 4, posterW + 8, posterH + 8);
      ctx.restore();
      posterDrawn = false;
    }
  }
  if (!posterDrawn) drawPosterPlaceholder(ctx, posterX, posterY, posterW, posterH);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 2;
  roundRectPath(ctx, posterX, posterY, posterW, posterH, 16);
  ctx.stroke();

  // Title + group match, beside the poster.
  const colX = posterX + posterW + 40;
  const colW = CARD_W - colX - MARGIN;
  ctx.font = '800 46px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#ffffff';
  const titleLines = wrapText(ctx, text.title, colW, 3);
  let ty = posterY + 52;
  for (const line of titleLines) {
    ctx.fillText(line, colX, ty);
    ty += 54;
  }
  if (text.year) {
    ctx.font = '600 30px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(text.year, colX, ty + 6);
    ty += 44;
  }

  ty += 28;
  ctx.font = '700 22px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillText('GROUP MATCH', colX, ty);
  ty += 66;
  ctx.font = '800 84px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = PINK;
  ctx.fillText(String(text.groupScore), colX, ty);

  // Jury row — avatar + name + score, flowed and wrapped by real measurement.
  let jy = posterY + posterH + 56;
  ctx.font = '700 24px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillText('THE GROUP', MARGIN, jy);
  jy += 44;

  const chipH = 60;
  const chipGap = 14;
  let cx = MARGIN;
  ctx.font = '600 26px system-ui, -apple-system, sans-serif';
  for (const j of text.jurors) {
    const scoreText = String(j.score);
    const nameW = ctx.measureText(j.name).width;
    ctx.font = '800 22px system-ui, -apple-system, sans-serif';
    const scoreW = ctx.measureText(scoreText).width;
    ctx.font = '600 26px system-ui, -apple-system, sans-serif';
    const avatarD = 44;
    const chipW = 16 + avatarD + 12 + nameW + 14 + Math.max(scoreW + 20, 40) + 16;
    if (cx + chipW > CARD_W - MARGIN) {
      cx = MARGIN;
      jy += chipH + chipGap;
    }
    // Chip background.
    roundRectPath(ctx, cx, jy, chipW, chipH, chipH / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Avatar.
    const acx = cx + 16 + avatarD / 2;
    const acy = jy + chipH / 2;
    ctx.beginPath();
    ctx.arc(acx, acy, avatarD / 2, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${j.hue} 55% 32%)`;
    ctx.fill();
    ctx.font = '800 18px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = `hsl(${j.hue} 85% 82%)`;
    ctx.textAlign = 'center';
    ctx.fillText(j.initials, acx, acy + 6);
    ctx.textAlign = 'left';
    // Name.
    ctx.font = '600 26px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(j.name, cx + 16 + avatarD + 12, jy + chipH / 2 + 9);
    // Score pill.
    const pillX = cx + chipW - 16 - Math.max(scoreW + 20, 40);
    ctx.font = '800 22px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = PINK;
    ctx.textAlign = 'center';
    ctx.fillText(scoreText, pillX + Math.max(scoreW + 20, 40) / 2, jy + chipH / 2 + 8);
    ctx.textAlign = 'left';

    cx += chipW + chipGap;
  }
  jy += chipH + 44;

  // Vetoed section.
  if (text.vetoes.lines.length > 0) {
    ctx.font = '700 24px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText('VETOED', MARGIN, jy);
    jy += 40;
    ctx.font = '600 26px system-ui, -apple-system, sans-serif';
    for (const line of text.vetoes.lines) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText(line.title, MARGIN, jy);
      const w = ctx.measureText(line.title).width;
      // Strike-through.
      ctx.strokeStyle = 'rgba(239,68,68,0.8)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(MARGIN, jy - 9);
      ctx.lineTo(MARGIN + w, jy - 9);
      ctx.stroke();
      ctx.font = '500 22px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = 'rgba(248,113,113,0.85)';
      ctx.fillText(`vetoed by ${line.by}`, MARGIN + w + 16, jy);
      ctx.font = '600 26px system-ui, -apple-system, sans-serif';
      jy += 40;
    }
    if (text.vetoes.overflow > 0) {
      ctx.font = '500 22px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillText(`+${text.vetoes.overflow} more vetoed`, MARGIN, jy);
    }
  }

  // THE ROOM CODE MUST NEVER BE THE PART THAT GETS CUT. A single fixed
  // footer line ellipsized "…/court/HARNESS1" down to "…/court/…" — the one
  // piece of the URL a person might actually need to read out loud, gone.
  // The URL wraps onto up to 2 lines at full size instead of shrinking or
  // truncating; the footer (and so the whole card) grows to fit it.
  ctx.font = '700 34px ui-monospace, SFMono-Regular, Menlo, monospace';
  const urlLines = wrapUrl(ctx, text.joinUrl, CARD_W - MARGIN * 2, 2);
  const FOOTER_TOP_PAD = 40; // content bottom -> divider
  const FOOTER_LABEL_GAP = 38; // divider -> label baseline
  const FOOTER_LINE_H = 40; // label -> first url line, and between url lines
  const FOOTER_BOTTOM_PAD = 26; // last url line -> card edge

  const dividerY = jy + FOOTER_TOP_PAD;
  const labelY = dividerY + FOOTER_LABEL_GAP;
  const firstUrlY = labelY + FOOTER_LINE_H;
  const lastUrlY = firstUrlY + (urlLines.length - 1) * FOOTER_LINE_H;
  const contentBottom = lastUrlY + FOOTER_BOTTOM_PAD;

  // THE CARD CROPS TO ITS REAL CONTENT — a 2-juror, no-veto, one-line-URL
  // room shouldn't ship a card that's mostly empty space above a footer
  // pinned to a fixed 1350px bottom; a 5-juror, many-veto, 2-line-URL room
  // still gets the room it needs, capped at CARD_H_MAX.
  const finalHeight = Math.min(CARD_H_MAX, Math.max(CARD_H_MIN, contentBottom));

  // Footer — wordmark's join URL, the card's acquisition surface.
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(MARGIN, dividerY);
  ctx.lineTo(CARD_W - MARGIN, dividerY);
  ctx.stroke();
  ctx.font = '600 22px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillText('JOIN THE ROOM', MARGIN, labelY);
  ctx.font = '700 34px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillStyle = '#ffffff';
  let uy = firstUrlY;
  for (const line of urlLines) {
    ctx.fillText(line, MARGIN, uy);
    uy += FOOTER_LINE_H;
  }

  // CROP TO finalHeight. The canvas was drawn at the oversized CARD_H_MAX
  // working area; this trims it to what the content actually needs. Safe to
  // read pixels here — any tainted poster draw was already caught, erased
  // and replaced with the placeholder above, well before this point.
  const snapshot = ctx.getImageData(0, 0, CARD_W, finalHeight);
  canvas.width = CARD_W;
  canvas.height = finalHeight;
  ctx.putImageData(snapshot, 0, 0);

  return finalHeight;
}

export interface ShareVerdictCardProps {
  data: ShareCardInput;
}

type ActionState = { kind: 'idle' | 'copied' | 'downloaded' | 'shared' | 'error'; message?: string };

export function ShareVerdictCard({ data }: ShareVerdictCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [action, setAction] = useState<ActionState>({ kind: 'idle' });
  const [caps, setCaps] = useState({ clipboard: false, share: false });
  // The card crops to its real content height (see drawShareCard) — the
  // preview's aspect ratio follows whatever height that draw actually
  // produced, not a fixed constant.
  const [cardHeight, setCardHeight] = useState(CARD_H_MIN);

  useEffect(() => {
    setCaps({
      clipboard: typeof navigator !== 'undefined' && !!navigator.clipboard && 'write' in navigator.clipboard && typeof window.ClipboardItem === 'function',
      share: typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function',
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    const text = buildShareCardText(data);
    const canvas = canvasRef.current;
    if (!canvas) return;
    void drawShareCard(canvas, text, data.posterUrl).then((finalHeight) => {
      if (!cancelled) {
        setCardHeight(finalHeight);
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
    // `data` is a plain object rebuilt by the caller each render from stable
    // primitives; re-drawing on every field change (a fresh appeal's winner,
    // for instance) is exactly what should happen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.title, data.year, data.posterUrl, data.groupScore, data.joinUrl, JSON.stringify(data.jurors), JSON.stringify(data.vetoed)]);

  function toBlob(): Promise<Blob | null> {
    return new Promise((resolve) => {
      const canvas = canvasRef.current;
      if (!canvas) return resolve(null);
      canvas.toBlob((b) => resolve(b), 'image/png');
    });
  }

  function fileName(): string {
    const slug = data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'verdict';
    return `watchverd1ct-${slug}.png`;
  }

  async function onCopy() {
    const blob = await toBlob();
    if (!blob) return setAction({ kind: 'error', message: 'Couldn’t generate the image.' });
    try {
      await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
      setAction({ kind: 'copied', message: 'Copied to clipboard' });
    } catch {
      setAction({ kind: 'error', message: 'Couldn’t copy — try Download instead.' });
    }
  }

  async function onDownload() {
    const blob = await toBlob();
    if (!blob) return setAction({ kind: 'error', message: 'Couldn’t generate the image.' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    setAction({ kind: 'downloaded', message: 'Downloaded' });
  }

  async function onShare() {
    const blob = await toBlob();
    if (!blob) return setAction({ kind: 'error', message: 'Couldn’t generate the image.' });
    const file = new File([blob], fileName(), { type: 'image/png' });
    try {
      if (!navigator.canShare?.({ files: [file] })) {
        // Feature exists but can't take files here — fall back rather than
        // calling share() and getting a silent no-op or a thrown error.
        await onDownload();
        setAction({ kind: 'downloaded', message: 'Sharing images isn’t supported here — downloaded instead.' });
        return;
      }
      await navigator.share({ files: [file], title: 'Our group’s Verd1ct', text: `Our group's Verd1ct: ${data.title}` });
      setAction({ kind: 'shared', message: 'Shared' });
    } catch (e) {
      // AbortError = the user closed the share sheet — not a failure.
      if (e instanceof Error && e.name === 'AbortError') return;
      setAction({ kind: 'error', message: 'Sharing didn’t go through — try Download instead.' });
    }
  }

  return (
    <div data-testid="share-verdict-card" className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <h2 className="text-base font-bold text-white">Share the Verd1ct</h2>
      <p className="mt-1 text-xs text-slate-400">A real image — the winning title, your group’s scores, and how to join.</p>

      <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-ink-950">
        <canvas
          ref={canvasRef}
          data-testid="share-card-canvas"
          data-ready={ready ? 'true' : 'false'}
          className="block w-full max-w-[400px]"
          style={{ aspectRatio: `${CARD_W} / ${cardHeight}` }}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void onDownload()}
          disabled={!ready}
          data-testid="share-card-download"
          className="btn-primary inline-flex items-center gap-1.5 text-sm disabled:opacity-50"
        >
          <Download size={16} aria-hidden /> Download
        </button>
        {caps.clipboard && (
          <button
            type="button"
            onClick={() => void onCopy()}
            disabled={!ready}
            data-testid="share-card-copy"
            className="btn-secondary inline-flex items-center gap-1.5 text-sm disabled:opacity-50"
          >
            <Copy size={16} aria-hidden /> Copy image
          </button>
        )}
        {caps.share && (
          <button
            type="button"
            onClick={() => void onShare()}
            disabled={!ready}
            data-testid="share-card-share"
            className="btn-secondary inline-flex items-center gap-1.5 text-sm disabled:opacity-50"
          >
            <Share2 size={16} aria-hidden /> Share
          </button>
        )}
      </div>
      {action.kind !== 'idle' && (
        <p role="status" data-testid="share-card-status" className={`mt-2 text-xs ${action.kind === 'error' ? 'text-red-300' : 'text-emerald-300'}`}>
          {action.message}
        </p>
      )}
    </div>
  );
}
