# WatchVerdict — Current Visual Language (Baseline Reference)

> Phase-1 deliverable. A precise, file-cited record of the EXISTING design system
> so the surgical refinement + internationalization preserves the brand exactly.
> Reuse these values; do not invent new ones. Nothing here proposes changes —
> this is the "before" reference.
>
> Sources: `tailwind.config.ts`, `src/app/globals.css`, `src/components/*`,
> `src/lib/verdictVisual.ts`.

## 1. Brand-defining elements that MUST remain

- **Dark cinematic base** — near-black navy (`ink-950 #07090f`) body with a fixed
  two-radial glow (blue top-right, gold top-left) from `globals.css` and the
  `cinema-radial` background image.
- **Magenta/pink VERD1CT identity** — `#ff1493` / `#ff62b6` / `#ff5ab0`, with the
  3D CTA edge `#b30d6b`. **Hardcoded hex, not a Tailwind token** (see §2 risk).
- **The VERD1CT wordmark** with the flipping "I↔1" split-flap (`.wv-iflip`, slab
  serif) — `Logo.tsx` / `Tagline.tsx`. `sr-only` "Verdict" provides the a11y name.
- **Blue accent** `brand-400 #4f86ff` / `brand-500 #2f6bff` (buttons, antennas).
- **Gold eyebrows/labels** `gold-300 #ffd873`, Pro chip.
- **Poster-forward rounded cards** — `.card` = `rounded-2xl border border-white/10
  bg-ink-850/70 shadow-card backdrop-blur`.
- **The retro-TV Verdict badge** (`Verd1ctBadge.tsx`) — pink screen, blue "V"
  watermark, black number.
- **Courtroom personality** — ⚖️ gavel, Judge Verity (🦉 `RobedPortrait`), the
  gavel-strike verdict reveal, "the bench / deliberating / ruling" copy.
- **The DNA burst** (`DnaBurst.tsx`) — twisting 🧬 helix + halo, "VERD1CT DNA
  Updating ↑↓".
- **Share cards** (`ShareCards.tsx`) — 4 templates, navy/purple gradients, the
  `#a855f7→#ff1493` DNA orb.

## 2. Colors & design tokens (exact)

**`ink` surfaces:** `950 #07090f` (body), `900 #0b0e17` (theme-color), `850 #0f1320`
(card), `800 #141a2b`, `700 #1c2438`, `600 #28324c`, `500 #3a4660`.

**`brand` (blue):** `50 #eef4ff`, `100 #d9e6ff`, `300 #7aa8ff`, `400 #4f86ff`,
`500 #2f6bff`, `600 #1f52e6`, `700 #1a41b4`.

**`gold`:** `300 #ffd873`, `400 #f5c65a`, `500 #e6ad33`.

**`verdict` (Tailwind tokens, mostly unused — see below):** must `#22c55e`,
strong `#4ade80`, worth `#a3e635`, possible `#facc15`, low `#fb923c`, skip `#f87171`.

**Signature pink (⚠ NOT tokenized — raw hex across components):** `#ff1493`,
`#ff62b6`, `#ff5ab0`, edge `#b30d6b`.

> **Authoritative call color source is `src/lib/verdictVisual.ts`, not the Tailwind
> `verdict.*` tokens.** 5 keys: `watch #34d399` (STREAM IT ✅), `worth #f5c65a`
> (MAYBE 👍), `uncertain #cbd5e1` (TOSS-UP 🤔), `skip #f87171` (SKIP IT ⛔),
> `wildcard #a78bfa` (🃏). Change call colors here, never per-component.

**Shadows:** `glow = 0 0 0 1px rgba(255,255,255,0.04), 0 20px 60px -20px rgba(47,107,255,0.35)`;
`card = 0 10px 40px -12px rgba(0,0,0,0.6)`.

**Breakpoints:** Tailwind defaults; **`sm` (640px) is the primary mobile↔desktop
split**, with occasional `md`/`lg`. Mobile-first, 2-up poster grids on phone.

## 3. Typography

- **No `next/font` in the root layout** — the app runs on the system stack
  (`ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, …`). Base 16px
  (20px in "Simple"/Senior view).
- **Only bundled webfont:** `Cinzel` (`next/font/google`, latin subset, 700/900)
  — used ONLY in `CourtroomDoors.tsx` display headings.
- **Wordmark** `.wv-iflip` forces a slab serif (`Roboto Slab/Rockwell/serif`,
  `width:0.64em`) — Latin-only by design.
- Heavy use of tiny sizes (`text-[9px]`–`text-[11px]`) and heavy weights
  (`font-black`, inline `fontWeight:900`).

## 4. Spacing, cards, buttons (the component vocabulary — `globals.css @layer components`)

- `.container-page` = `mx-auto w-full max-w-6xl px-4 sm:px-6`
- `.poster-grid` = 2-col phone → `sm:` auto-fill `minmax(200px,1fr)`
- `.card` = `rounded-2xl border border-white/10 bg-ink-850/70 shadow-card backdrop-blur`
- `.btn` = `rounded-xl px-4 py-2.5 text-sm font-semibold min-h-[44px]`;
  `.btn-primary` (brand-500→400 + `shadow-glow`), `.btn-secondary`, `.btn-ghost`
- `.chip` / `.chip-active`, `.input` (`min-h-[44px]`), `.label`, `.helper`
- `.eyebrow` = `text-[13px] font-bold uppercase tracking-[0.12em] text-gold-300`
- `.skeleton` (+ shimmer)

## 5. Verdict, external-rating & DNA treatments

- **Verdict badge** `Verd1ctBadge.tsx`: pink screen `linear-gradient(150deg,#ff5ab0,#ff1493 80%)`,
  `borderRadius px*0.22`, inset white ring, blue `V` watermark `rgba(79,134,255,0.62)`,
  brand-400 antennas/feet. `px` scales (52 title, 44 card, 38 grid-DNA).
- **`AlgorithmScore.tsx`** (pink box on every card): `rounded-xl border-2
  border-pink-400/70 bg-gradient-to-br from-pink-500/30 to-rose-500/20
  shadow-[0_0_16px_rgba(244,63,94,0.28)]` + `CardRatings` beneath.
- **External ratings** (`ReportExtras.tsx`, `OnTvGuide.tsx`): brand-exact swatches —
  IMDb `#f5c518` (black text), RT 🍅 `#fa320a`, RT/TMDB Audience 🍿 `#faa71a`,
  Metacritic `#00ce7a`. Chips = `h-7 w-7 rounded-md` + stacked value/label.
- **Cards** `PosterCard.tsx`: top action groove (`border-b border-white/10
  bg-ink-900/85 px-1.5 py-1.5`) holding **For / Pass / Save**; poster `aspect-[2/3]`
  hover `scale-[1.04]`; title `line-clamp-2 text-sm font-semibold`.
- **Gavel actions:** `LikeButton` ("For", emerald, inverted hammer), `TasteFeedback`
  ("Pass", red, mirrored hammer), SaveButton — each `h-9`, `text-[10px] font-black
  uppercase`, firing a `DnaBurst`.

## 6. Courtroom motifs, Judge Verity, share cards

- **Judge Verity** `AskTheJudge.tsx` + `RobedPortrait.tsx` (🦉, black robe SVG
  `#0a0a0d`, gold-ringed face). Chat card `h-[56vh] max-h-[620px]`; you-bubbles
  `bg-brand-500/25`, judge-bubbles `bg-white/[0.04]`; "⚖️ The court is
  deliberating…"; submit "File it".
- **Ranks/badges** (`chambers.ts`): Clerk→Bailiff→Juror→Counsel→Magistrate→Judge;
  10 badges (Opening Statement, Sworn In, Critic's Pen, Time Traveler, …).
- **Signature motion** (`globals.css` lines ~162–291): `.wv-cta-3d` (3D pink
  verdict button), `.wv-gavel`/`.wv-order`/`.wv-verdict-in` (Live Court reveal),
  `.wv-dna-twist`+`.wv-dna-halo` (DNA burst), `.wv-iflip` (wordmark), tile sheens.
  All disabled under `prefers-reduced-motion`.
- **Share/OG** `ShareCards.tsx` (340/360px → PNG @3×), `opengraph-image.tsx`
  (1200×630 `next/og`).
- **Toast** `Toast.tsx`: feedback bar, standard bottom toasts, and the
  center-screen pink "verdict" variant (`from-[#ff62b6] to-[#ff1493]`, ⚖️).

## 7. Layout & responsive

- Root `layout.tsx`: `<html lang="en">`, runtime viewport/desktop-view toggle,
  `data-simple` Senior mode, `ToastProvider`, `themeColor #0b0e17`.
- App shell `src/app/app/layout.tsx`: `<Nav>` + `container-page py-6` + `<NavArrows>`,
  `pb-20 sm:pb-0` for the mobile tab bar, a build marker footer.
- `Nav.tsx`: sticky `h-16`, desktop primary links + `MoreMenu`, Pro chip,
  ViewModeToggle, Avatar. `nav/MobileNav.tsx`: fixed bottom tab bar (`sm:hidden`),
  5 tabs + More sheet.

## 8. Icons & emoji

- **No icon library** — all icons are hand-authored inline SVG.
- **Emoji are load-bearing brand vocabulary** (approx: ⚖️×58, 📺×32, 🧬×29,
  🍿×19, ⭐×12, 🔔×11, 👍×10, 👎×9, 🍅×7, ✅×7, 💸, 🦉…). The gavel ⚖️ is the
  dominant identity glyph. These stay; when embedded in translatable strings the
  emoji must travel with the message (they are locale-safe).

## 9. Components that can remain UNCHANGED

The core visual primitives are healthy and should not be restyled: `.card`,
`.btn*`, `.chip*`, `.eyebrow*`, `Verd1ctBadge`, `AlgorithmScore`, `verdictVisual`,
`DnaBurst`, the pink CTA, the toast system, `RobedPortrait`, the poster grid.
Refinement is about **coherence, hierarchy, and i18n**, not re-skinning.

## 10. Components needing CAREFUL refinement (for i18n, not restyle)

Text-length-sensitive spots (Spanish is ~15–30% longer; German longer still):
- `.wv-cta-3d` is `white-space:nowrap` → a longer translated verdict CTA clips.
  Allow wrap or a 2-line variant.
- Verdict call pills (`AlgorithmScore`, `verdictVisual` STREAM IT/SKIP IT/TOSS-UP)
  — tight `inline-flex whitespace-nowrap`.
- `OnTvGuide` fixed `w-[5rem] sm:w-28` time column + `whitespace-nowrap` chips.
- Nav labels (`text-[11px]` single-line tabs) — must fit es/zh (see coherence audit).
- Fixed-height controls: Like/Pass `h-9`, mic/submit `h-11`, segmented toggles.
- **Share cards / OG image are fixed-pixel canvases** — longer labels overflow
  with no reflow; each template needs per-locale headroom or auto-fit.

## 11. Spanish typography/layout risks

- **~15–30% text expansion.** Nav labels, verdict pills, badge names, segmented
  toggles, and the fixed-pixel share cards are the pressure points (§10).
- Uppercase `tracking-[0.12em]` eyebrows are fine for Spanish (Latin) but the
  extra length compounds in nowrap pills.
- Sentence-builder copy in `verdict.ts` concatenates + `.toLowerCase()`s nouns —
  wrong word order/casing in Spanish (structural fix, see i18n audit).

## 12. Simplified Chinese typography/line-breaking/font risks

- **System `system-ui` DOES cover SC** on most platforms → body text renders. But:
  - **`Cinzel`** (latin subset) and **`.wv-iflip`** slab serif have **no CJK
    glyphs** → SC in courtroom-door headings / any CJK adjacent to the wordmark
    falls back and breaks. Keep the wordmark Latin ("VERD1CT" untranslated) and
    give `CourtroomDoors` a CJK-safe fallback stack.
  - **`leading-none`/`leading-tight`/`leading-[0.95]`** badges and headings will
    clip tall CJK ascenders/descenders — raise line-height for CJK.
  - **Uppercase + letter-spacing** is meaningless/ugly on CJK — suppress
    `uppercase`/`tracking` for zh eyebrows/labels.
  - Numeric badges (`tabular-nums`) are safe.
  - Consider bundling a CJK-capable font (e.g. Noto Sans SC) for zh, subset, to
    avoid inconsistent OS fallback — defer; system fallback is acceptable v1.
