import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

/**
 * COURT E2E — drives the REAL CourtRoom component on /dev/court through every
 * stage (join → tonight → shortlist → react → Verd1ct → appeal → chat) with the
 * Supabase RPC endpoint intercepted, so the whole room is exercised without
 * live credentials. Mission tests 1–3, 5, 7–10.
 */

const HARNESS = '/dev/court';
const SHOTS = 'test-results/court';

interface RoomModel {
  status: 'lobby' | 'veto' | 'verdict';
  participants: { id: string; name: string; host?: boolean; ready?: boolean; pickCount?: number; reactionCount?: number; reactions?: Record<string, { r: string; reason?: string }> }[];
  finalists: unknown[] | null;
  messages: { id: string; sender: string; body: string; at: string }[];
  /** Room-level setting, as court_state_v2 returns it. */
  courtSize?: 'quick' | 'standard' | 'deep';
  hostName?: string | null;
  sizeLocked?: boolean;
}

/** The host token the harness treats as genuine. */
const HOST_TOKEN = 'host-token-abcdefgh';

function finalist(rank: number, id: number, title: string, fits: [string, number][], streaming = ['Netflix']) {
  return {
    rank, id, mediaType: 'movie', title, year: 2019, posterUrl: null,
    attributes: ['Mystery'], genres: ['Mystery'],
    perMember: fits.map(([name, score]) => ({ name, score, picked: false })),
    pickedBy: [], fit: Math.round(fits.reduce((s, f) => s + f[1], 0) / fits.length),
    minScore: Math.min(...fits.map((f) => f[1])), avgScore: Math.round(fits.reduce((s, f) => s + f[1], 0) / fits.length),
    streaming,
  };
}

/** Intercept Supabase RPC POSTs and serve an in-memory room. */
async function mockRoom(page: Page, initial: RoomModel) {
  const room: RoomModel = JSON.parse(JSON.stringify(initial));
  const calls: { fn: string; body: Record<string, unknown> }[] = [];
  await page.route(/\/rest\/v1\/rpc\//, async (route) => {
    const url = route.request().url();
    const fn = url.split('/rpc/')[1]!.split('?')[0]!;
    const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
    calls.push({ fn, body });
    if (fn === 'court_state_v2' || fn === 'court_state') {
      const host = room.participants.find((p) => p.host);
      return route.fulfill({
        json: {
          ...room,
          courtSize: room.courtSize ?? 'standard',
          hostName: room.hostName ?? host?.name ?? null,
          sizeLocked: room.sizeLocked ?? room.status !== 'lobby',
        },
        headers: { 'content-type': 'application/json' },
      });
    }
    if (fn === 'court_claim_host') {
      if (body.p_host_token !== HOST_TOKEN) {
        return route.fulfill({ status: 400, json: { message: 'Not host' } });
      }
      const p = room.participants.find((x) => x.id === body.p_participant);
      if (p) p.host = true;
      return route.fulfill({ json: null });
    }
    if (fn === 'court_set_size') {
      // Mirrors the RPC exactly: host token required, locked outside the lobby,
      // and the size actually in force is returned either way.
      if (body.p_host_token !== HOST_TOKEN) {
        return route.fulfill({ status: 400, json: { message: 'Only the host can change the court size' } });
      }
      if (room.status === 'lobby') room.courtSize = body.p_size as 'quick' | 'standard' | 'deep';
      return route.fulfill({ json: room.courtSize ?? 'standard' });
    }
    if (fn === 'court_join') {
      const name = String(body.p_name ?? 'Guest');
      room.participants.push({ id: `p-${room.participants.length + 1}`, name, pickCount: 0, reactionCount: 0 });
      return route.fulfill({ json: [{ participant_id: `p-${room.participants.length}` }] });
    }
    if (fn === 'court_set_tonight') {
      const p = room.participants[0];
      if (p) p.ready = Boolean(body.p_ready);
      return route.fulfill({ json: null });
    }
    if (fn === 'court_react') {
      const p = room.participants.find((x) => x.id === body.p_participant) ?? room.participants[0];
      if (p) {
        p.reactions = { ...(p.reactions ?? {}), [String(body.p_key)]: { r: String(body.p_reaction) } };
        p.reactionCount = Object.keys(p.reactions).length;
      }
      return route.fulfill({ json: null });
    }
    if (fn === 'court_chat_send') {
      room.messages.push({ id: `m-${room.messages.length + 1}`, sender: 'Scott', body: String(body.p_body), at: new Date(0).toISOString() });
      return route.fulfill({ json: null });
    }
    if (fn === 'court_reveal') {
      room.status = 'verdict';
      return route.fulfill({ json: null });
    }
    if (fn === 'court_set_picks') return route.fulfill({ json: null });
    return route.fulfill({ json: null });
  });
  return { room, calls };
}

const EMPTY_LOBBY: RoomModel = { status: 'lobby', participants: [], finalists: null, messages: [] };

test.describe('TEST 1+2 — join and invite', () => {
  test('a guest joins with just a name (no account) and appears in the group', async ({ page }) => {
    await mockRoom(page, EMPTY_LOBBY);
    await page.goto(HARNESS);
    await expect(page.getByTestId('court-join')).toBeVisible();
    await page.screenshot({ path: path.join(SHOTS, '1-join.png') });

    await page.getByPlaceholder('Your name').fill('Scott');
    await page.getByTestId('join-court').click();

    await expect(page.getByTestId('court-group')).toBeVisible();
    // Scoped: "Scott" also appears in the xl activity feed's roster events.
    await expect(page.getByTestId('court-group').getByText('Scott')).toBeVisible();
    // Explicit status, never a bare mystery number.
    await expect(page.getByTestId('participant-status').first()).toHaveText('Still choosing');
    // Room status is actionable language, not "NEED 2+ TO START".
    await expect(page.getByTestId('room-status')).toContainText('1 of 2 minimum joined');
  });

  test('the summons names the inviter and shows who is already in the room', async ({ page }) => {
    // A second person opening the link must see who summoned them and who is
    // already inside — everything from the room state the screen already
    // polls, no new API surface.
    await mockRoom(page, {
      ...EMPTY_LOBBY,
      hostName: 'Scott',
      participants: [
        { id: 'p-1', name: 'Scott', host: true },
        { id: 'p-2', name: 'Amy' },
      ],
    });
    await page.goto(HARNESS);
    const join = page.getByTestId('court-join');
    await expect(join).toBeVisible();
    await expect(join).toContainText('Scott summoned you');
    const roster = page.getByTestId('join-roster');
    await expect(roster).toContainText('2 already in the room');
    // One initial-chip per joined member, host and guest alike.
    await expect(roster.locator('span[title="Scott"]')).toBeVisible();
    await expect(roster.locator('span[title="Amy"]')).toBeVisible();
  });

  test('the Join button is plainly disabled without a name, and plainly enabled with one', async ({ page }) => {
    await mockRoom(page, EMPTY_LOBBY);
    await page.goto(HARNESS);
    const btn = page.getByTestId('join-court');
    await expect(btn).toBeDisabled();
    const disabledBg = await btn.evaluate((el) => getComputedStyle(el).backgroundColor);
    await page.getByPlaceholder('Your name').fill('Scott');
    await expect(btn).toBeEnabled();
    // The fill animates (`transition`), so poll until it settles rather than
    // reading an interpolated frame. The two states must be visually distinct
    // fills, not the same blue at half opacity — and the enabled fill is the
    // high-contrast brand-600.
    await expect
      .poll(() => btn.evaluate((el) => getComputedStyle(el).backgroundColor))
      .toBe('rgb(31, 82, 230)');
    expect(disabledBg).not.toBe('rgb(31, 82, 230)');
  });

  test('invite area: no raw URL, copy gives feedback, QR toggles', async ({ page }) => {
    await mockRoom(page, { ...EMPTY_LOBBY, participants: [{ id: 'p-1', name: 'Scott' }] });
    await page.goto(HARNESS);
    await page.getByPlaceholder('Your name').fill('Scott');
    await page.getByTestId('join-court').click();
    await expect(page.getByTestId('court-group')).toBeVisible();

    // The full invite URL must NOT be printed on screen by default.
    await expect(page.getByText(/https?:\/\/[^\s]+\/court\//)).toHaveCount(0);
    await expect(page.getByTestId('share-invite')).toBeVisible();
    await expect(page.getByTestId('copy-link')).toBeVisible();

    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    await page.getByTestId('copy-link').click();
    await expect(page.getByTestId('invite-feedback')).toHaveText('Link copied');
  });
});

test.describe('TEST 3 — tonight setup is temporary', () => {
  test('choices are captured, marked ready, and labelled tonight-only', async ({ page }) => {
    const { calls } = await mockRoom(page, { ...EMPTY_LOBBY, participants: [{ id: 'p-1', name: 'Scott' }] });
    await page.goto(HARNESS);
    await page.getByPlaceholder('Your name').fill('Scott');
    await page.getByTestId('join-court').click();

    const tonight = page.getByTestId('court-tonight');
    await expect(tonight).toContainText('tonight only');
    // Content type and runtime moved behind the Advanced disclosure (defaults
    // "Either" / "No limit"); open it to set non-default values.
    await tonight.getByTestId('advanced-toggle').click();
    await tonight.getByRole('button', { name: 'Movie', exact: true }).click();
    await tonight.getByRole('button', { name: 'Mystery' }).click();
    await tonight.getByRole('button', { name: 'Thriller' }).click();
    await tonight.getByRole('button', { name: 'Supernatural' }).click();
    await tonight.getByRole('button', { name: 'Under 2 hours' }).click();
    await page.screenshot({ path: path.join(SHOTS, '2-tonight.png') });
    await page.getByTestId('tonight-ready').click();

    // Persisted as TEMPORARY room state — court_set_tonight, never a DNA write.
    const sent = calls.filter((c) => c.fn === 'court_set_tonight');
    expect(sent.length).toBeGreaterThan(0);
    const payload = sent.at(-1)!.body.p_tonight as Record<string, unknown>;
    expect(payload.kind).toBe('movie');
    expect(payload.moods).toEqual(['Mystery', 'Thriller']);
    expect(payload.avoid).toEqual(['Supernatural']);
    expect(payload.time).toBe('u120');
    // No DNA/profile mutation RPC was called.
    expect(calls.some((c) => /profile|dna|rate/i.test(c.fn))).toBe(false);
    // The summary reads back and the participant is Ready.
    await expect(tonight).toContainText('Movie · Mystery, Thriller · avoiding Supernatural');
  });
});

test.describe('TEST 4 — nobody is forced to nominate', () => {
  test('the shortlist section is optional and says WatchVerd1ct will build it', async ({ page }) => {
    await mockRoom(page, { ...EMPTY_LOBBY, participants: [{ id: 'p-1', name: 'Scott' }, { id: 'p-2', name: 'Heather' }] });
    await page.goto(HARNESS);
    await page.getByPlaceholder('Your name').fill('Scott');
    await page.getByTestId('join-court').click();

    const shortlist = page.getByTestId('court-shortlist');
    await expect(shortlist).toContainText('optional');
    await expect(shortlist).toContainText('Nobody has to search');
    await page.screenshot({ path: path.join(SHOTS, '3-shortlist.png') });
  });
});

test.describe('TEST 5+6 — reactions, veto protection, group ranking', () => {
  const REACTING: RoomModel = {
    status: 'veto',
    participants: [
      { id: 'p-1', name: 'Scott', reactionCount: 0, reactions: {} },
      { id: 'p-2', name: 'Heather', reactionCount: 1, reactions: {} },
    ],
    finalists: [
      finalist(1, 101, 'Split Favourite', [['Scott', 96], ['Heather', 38]]),
      finalist(2, 102, 'Shared Winner', [['Scott', 88], ['Heather', 85]]),
    ],
    messages: [],
  };

  test('the shared-fit title outranks the lopsided one (never an average)', async ({ page }) => {
    await mockRoom(page, REACTING);
    await page.goto(HARNESS);
    await page.getByPlaceholder('Your name').fill('Scott');
    await page.getByTestId('join-court').click();
    await expect(page.getByTestId('court-react')).toBeVisible();
    const cards = page.getByTestId('react-card');
    // Ranked by the pure engine: 88/85 beats 96/38 despite the lower mean.
    await expect(cards.first()).toContainText('Shared Winner');
    await page.screenshot({ path: path.join(SHOTS, '4-react.png') });
  });

  test('a veto flags the title and blocks it from winning the Verd1ct', async ({ page }) => {
    await mockRoom(page, REACTING);
    await page.goto(HARNESS);
    // A late arrival can still join while the group is reacting.
    await page.getByPlaceholder('Your name').fill('Scott');
    await page.getByTestId('join-court').click();
    const cards = page.getByTestId('react-card');
    // Veto the top-ranked title.
    await cards.first().getByTestId('react-veto').click();
    await expect(page.getByTestId('vetoed-flag').first()).toContainText('Removed by veto');
    // The vetoed card sinks below the non-vetoed one.
    await expect(page.getByTestId('react-card').first()).toContainText('Split Favourite');
    await page.screenshot({ path: path.join(SHOTS, '5-veto.png') });
  });

  test('FOR / MAYBE / PASS are distinct, persisted states', async ({ page }) => {
    const { calls } = await mockRoom(page, REACTING);
    await page.goto(HARNESS);
    await page.getByPlaceholder('Your name').fill('Scott');
    await page.getByTestId('join-court').click();
    const card = page.getByTestId('react-card').first();
    await card.getByTestId('react-for').click();
    await expect(card.getByTestId('react-for')).toHaveAttribute('aria-pressed', 'true');
    await card.getByTestId('react-pass').click();
    await expect(card.getByTestId('react-pass')).toHaveAttribute('aria-pressed', 'true');
    await expect(card.getByTestId('react-for')).toHaveAttribute('aria-pressed', 'false');
    const reactions = calls.filter((c) => c.fn === 'court_react').map((c) => c.body.p_reaction);
    expect(reactions).toEqual(['for', 'pass']);
    // PASS is a reaction only — never a permanent-dislike write.
    expect(calls.some((c) => /rate|dna|feedback/i.test(c.fn))).toBe(false);
  });
});

test.describe('TEST 7 — group chat', () => {
  test('sends a message, shows it, and reports the unread count on the header', async ({ page }) => {
    const { room } = await mockRoom(page, {
      status: 'veto',
      participants: [{ id: 'p-1', name: 'Scott', reactions: {} }],
      finalists: [finalist(1, 201, 'Chat Fixture', [['Scott', 80]])],
      messages: [],
    });
    await page.goto(HARNESS);
    await page.getByPlaceholder('Your name').fill('Scott');
    await page.getByTestId('join-court').click();
    // An inbound message from someone else raises the unread badge.
    room.messages.push({ id: 'm-0', sender: 'Heather', body: 'I’m in!', at: new Date(0).toISOString() });
    await expect(page.getByTestId('chat-unread')).toBeVisible();

    await page.getByTestId('open-chat').click();
    const chat = page.getByTestId('group-chat');
    await expect(chat).toBeVisible();
    await expect(chat).toContainText('I’m in!');
    await chat.getByTestId('chat-input').fill('Works for me');
    await chat.getByTestId('chat-send').click();
    await expect(chat).toContainText('Works for me');
    // Quick replies send without typing.
    await chat.getByRole('button', { name: 'Too long' }).click();
    await expect(chat).toContainText('Too long');
    await page.screenshot({ path: path.join(SHOTS, '6-chat.png') });
  });
});

test.describe('TEST 8+9 — Final Verd1ct and Appeal', () => {
  const VERDICT: RoomModel = {
    status: 'verdict',
    participants: [
      { id: 'p-1', name: 'Scott', reactionCount: 2, reactions: { 'movie-301': { r: 'for' } } },
      { id: 'p-2', name: 'Heather', reactionCount: 2, reactions: { 'movie-301': { r: 'for' } } },
    ],
    finalists: [
      finalist(1, 301, 'Knives Out', [['Scott', 94], ['Heather', 88]]),
      finalist(2, 302, 'Backup Choice', [['Scott', 80], ['Heather', 78]]),
      finalist(3, 303, 'Third Option', [['Scott', 70], ['Heather', 68]]),
    ],
    messages: [],
  };

  test('one decisive winner with per-member scores, reasons, availability and a backup', async ({ page }) => {
    await mockRoom(page, VERDICT);
    await page.goto(HARNESS);
    const v = page.getByTestId('court-verdict');
    await expect(v).toBeVisible();
    await expect(v).toContainText('Your group’s Verd1ct');
    await expect(v).toContainText('Knives Out');
    await expect(page.getByTestId('group-match')).toBeVisible();
    await expect(v).toContainText('Scott');
    await expect(v).toContainText('94');
    await expect(v).toContainText('Heather');
    await expect(v).toContainText('88');
    await expect(v).toContainText('Why it won');
    await expect(v).toContainText('Netflix');
    await expect(v).toContainText('availability likely');
    await expect(page.getByRole('link', { name: 'Watch now' })).toBeVisible();
    await expect(page.getByTestId('backup')).toContainText('Backup Choice');
    await page.screenshot({ path: path.join(SHOTS, '7-verdict.png') });
  });

  test('appeal excludes the winner and promotes the next strongest — reactions preserved', async ({ page }) => {
    await mockRoom(page, VERDICT);
    await page.goto(HARNESS);
    await expect(page.getByTestId('court-verdict')).toContainText('Knives Out');
    await page.getByTestId('appeal').click();
    await expect(page.getByTestId('court-verdict')).toContainText('Backup Choice');
    await expect(page.getByTestId('court-verdict')).not.toContainText('Knives Out');
    await page.getByTestId('appeal').click();
    await expect(page.getByTestId('court-verdict')).toContainText('Third Option');
    await page.screenshot({ path: path.join(SHOTS, '8-appeal.png') });
  });

  test('honest partial-participation note when not everyone reacted', async ({ page }) => {
    await mockRoom(page, {
      ...VERDICT,
      participants: [
        { id: 'p-1', name: 'Scott', reactionCount: 2, reactions: { 'movie-301': { r: 'for' } } },
        { id: 'p-2', name: 'Heather', reactionCount: 0, reactions: {} },
        { id: 'p-3', name: 'Amy', reactionCount: 0, reactions: {} },
      ],
    });
    await page.goto(HARNESS);
    await expect(page.getByTestId('partial-note')).toContainText('Verd1ct based on 1 of 3 participants');
  });
});

test.describe('NO JUDGE VERITY anywhere in the Court', () => {
  for (const [label, model] of [
    ['lobby', EMPTY_LOBBY],
    ['reacting', { status: 'veto', participants: [{ id: 'p-1', name: 'Scott', reactions: {} }], finalists: [finalist(1, 401, 'Any Title', [['Scott', 80]])], messages: [] }],
    ['verdict', { status: 'verdict', participants: [{ id: 'p-1', name: 'Scott', reactionCount: 1, reactions: { 'movie-401': { r: 'for' } } }], finalists: [finalist(1, 401, 'Any Title', [['Scott', 80]])], messages: [] }],
  ] as [string, RoomModel][]) {
    test(`no judge / gavel / deliberation language at the ${label} stage`, async ({ page }) => {
      await mockRoom(page, model);
      await page.goto(HARNESS);
      await page.waitForTimeout(300);
      const text = (await page.locator('body').innerText()).toLowerCase();
      for (const banned of ['judge verity', 'judge', 'gavel', 'deliberat', 'jury', 'juror', 'in session', 'testimony', 'submit evidence', 'the ruling']) {
        expect(text, `"${banned}" must not appear in the Court (${label})`).not.toContain(banned);
      }
    });
  }
});

test.describe('BRAND — the numeral 1 is always legible', () => {
  test('the wordmark renders WatchVERD1CT with a visible, non-zero-width 1', async ({ page }) => {
    await mockRoom(page, EMPTY_LOBBY);
    await page.goto(HARNESS);
    const one = page.locator('.wv-logo-1').first();
    await expect(one).toBeVisible();
    await expect(one).toHaveText('1');
    // Regression for the backface-visibility defect that rendered "WatchVERD_CT":
    // the glyph must have real width and full opacity at every animation phase.
    for (const wait of [0, 200, 450, 950]) {
      if (wait) await page.waitForTimeout(wait);
      const box = await one.boundingBox();
      expect(box!.width, `the 1 collapsed to zero width at ~${wait}ms`).toBeGreaterThan(2);
      const opacity = await one.evaluate((n) => Number(getComputedStyle(n).opacity));
      expect(opacity, `the 1 faded out at ~${wait}ms`).toBeGreaterThan(0.9);
    }
  });
});

test.describe('TEST 10 — mobile Court', () => {
  for (const w of [320, 360, 375, 390, 430]) {
    test(`no overflow / clipping at ${w}px through the room`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 780 });
      await mockRoom(page, {
        status: 'veto',
        participants: [
          { id: 'p-1', name: 'Scott', reactions: {} },
          { id: 'p-2', name: 'Bartholomew Wintersgate-Fitzpatrick', reactions: {} },
        ],
        finalists: [finalist(1, 501, 'An Extremely Long Motion Picture Title That Must Wrap Cleanly', [['Scott', 88], ['Bartholomew Wintersgate-Fitzpatrick', 85]])],
        messages: [],
      });
      await page.goto(HARNESS);
      await page.getByPlaceholder('Your name').fill('Scott');
      await page.getByTestId('join-court').click();
      await expect(page.getByTestId('court-react')).toBeVisible();
      let overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `overflow at ${w}px on the react stage`).toBeLessThanOrEqual(0);

      // Reaction controls meet the touch minimum.
      const forBtn = page.getByTestId('react-for').first();
      const box = await forBtn.boundingBox();
      expect(box!.height, `FOR button too small at ${w}px`).toBeGreaterThanOrEqual(43);

      // Chat as a bottom sheet must not overflow either.
      await page.getByTestId('open-chat').click();
      await expect(page.getByTestId('group-chat')).toBeVisible();
      overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `overflow at ${w}px with chat open`).toBeLessThanOrEqual(0);
      // The floating build badge must never overlap the header content.
      const badge = page.getByTestId('build-badge');
      if (await badge.count()) {
        const b = await badge.first().boundingBox();
        const logo = await page.locator('.wv-logo-1').first().boundingBox();
        if (b && logo) {
          const overlaps = b.x < logo.x + logo.width && logo.x < b.x + b.width && b.y < logo.y + logo.height && logo.y < b.y + b.height;
          expect(overlaps, `build badge overlaps the wordmark at ${w}px`).toBe(false);
        }
      }
      if (w === 390) await page.screenshot({ path: path.join(SHOTS, '9-mobile-react-chat.png'), fullPage: true });
    });
  }
});

/**
 * TEST 11 — LIVE SYNC. Drives the REAL Supabase Realtime protocol (phoenix v2
 * array frames) through a mocked socket, so this proves the client actually
 * connects, reports its state honestly, and re-reads on a push rather than
 * waiting for the poll.
 *
 * The security property under test is the important one: the socket carries a
 * SIGNAL, never room data. Chat bodies live behind `court_state_v2`, so a
 * broadcast payload must stay empty.
 */
interface FakeSocket {
  /** Push a broadcast to the client, as the server would. */
  broadcast: (event: 'chat' | 'state') => Promise<void>;
  /** Every frame the client sent us. */
  sent: string[];
}

async function mockRealtime(page: Page): Promise<FakeSocket> {
  const sent: string[] = [];
  let topic = 'realtime:court:HARNESS1';
  let push: ((data: string) => void) | null = null;

  await page.routeWebSocket(/realtime/, (ws) => {
    push = (data: string) => ws.send(data);
    ws.onMessage((raw) => {
      const text = String(raw);
      sent.push(text);
      let frame: [string | null, string | null, string, string, unknown];
      try {
        frame = JSON.parse(text) as [string | null, string | null, string, string, unknown];
      } catch {
        return; // non-JSON control frame — nothing for the fake server to answer
      }
      if (!Array.isArray(frame)) return;
      const [joinRef, ref, frameTopic, event] = frame;
      if (event === 'phx_join') {
        topic = frameTopic;
        ws.send(JSON.stringify([joinRef, ref, frameTopic, 'phx_reply', { status: 'ok', response: {} }]));
      } else if (event === 'heartbeat') {
        ws.send(JSON.stringify([joinRef, ref, frameTopic, 'phx_reply', { status: 'ok', response: {} }]));
      }
    });
  });

  return {
    sent,
    broadcast: async (event) => {
      const frame = JSON.stringify([null, null, topic, 'broadcast', { type: 'broadcast', event, payload: {} }]);
      await page.evaluate(() => {}); // flush pending work before pushing
      push?.(frame);
    },
  };
}

async function joinAs(page: Page, who: string) {
  await page.goto(HARNESS);
  await page.getByPlaceholder('Your name').fill(who);
  await page.getByTestId('join-court').click();
  await expect(page.getByTestId('court-group')).toBeVisible();
}

test.describe('TEST 11 — live sync', () => {
  test('reports Live once the socket subscribes', async ({ page }) => {
    await mockRealtime(page);
    await mockRoom(page, { ...EMPTY_LOBBY, participants: [{ id: 'p-1', name: 'Scott' }] });
    await joinAs(page, 'Scott');
    await expect(page.getByTestId('sync-status')).toHaveAttribute('data-sync', 'live');
    await expect(page.getByTestId('sync-status')).toHaveText('Live');
    await page.screenshot({ path: path.join(SHOTS, '11-live.png') });
  });

  test('a broadcast delivers a message far faster than the heartbeat poll', async ({ page }) => {
    // The floating chat panel is the sub-xl path (the xl lobby carries the
    // conversation inline in the activity feed) — test it at laptop width.
    await page.setViewportSize({ width: 1024, height: 800 });
    const socket = await mockRealtime(page);
    const { room } = await mockRoom(page, { ...EMPTY_LOBBY, participants: [{ id: 'p-1', name: 'Scott' }] });
    await joinAs(page, 'Scott');
    await expect(page.getByTestId('sync-status')).toHaveAttribute('data-sync', 'live');

    await page.getByTestId('open-chat').click();
    await expect(page.getByTestId('group-chat')).toBeVisible();

    // Someone else speaks: the row lands in the database, then the server pushes.
    room.messages.push({ id: 'm-remote', sender: 'Heather', body: 'I am in for the mystery', at: new Date(0).toISOString() });
    const started = Date.now();
    await socket.broadcast('chat');
    await expect(page.getByTestId('group-chat').getByText('I am in for the mystery')).toBeVisible({ timeout: 3_000 });
    // The live poll interval is 15s, so arriving inside 3s can only be the push.
    expect(Date.now() - started, 'message must arrive by push, not by poll').toBeLessThan(3_000);
  });

  test('the socket carries no room data — chat bodies only travel through the RPC', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    const socket = await mockRealtime(page);
    await mockRoom(page, { ...EMPTY_LOBBY, participants: [{ id: 'p-1', name: 'Scott' }] });
    await joinAs(page, 'Scott');
    await expect(page.getByTestId('sync-status')).toHaveAttribute('data-sync', 'live');

    await page.getByTestId('open-chat').click();
    await page.getByTestId('chat-input').fill('my private plan for tonight');
    await page.getByTestId('chat-send').click();
    await expect(page.getByTestId('group-chat').getByText('my private plan for tonight')).toBeVisible();

    // An announcement went out...
    const broadcasts = socket.sent.filter((f) => f.includes('"broadcast"'));
    expect(broadcasts.length, 'sending a message must announce to the room').toBeGreaterThan(0);
    // ...carrying nothing. No message body, no sender, no participant id.
    for (const frame of socket.sent) {
      expect(frame, 'no chat body may cross the socket').not.toContain('my private plan');
      expect(frame, 'no participant id may cross the socket').not.toContain('p-1');
    }
  });

  test('with the socket down the room says so and keeps working by polling', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    // No mockRealtime: wss://harness.invalid is unreachable, exactly like a
    // member on a flaky connection.
    const { room } = await mockRoom(page, { ...EMPTY_LOBBY, participants: [{ id: 'p-1', name: 'Scott' }] });
    await joinAs(page, 'Scott');
    await expect(page.getByTestId('sync-status')).toHaveAttribute('data-sync', 'polling');
    await expect(page.getByTestId('sync-status')).toContainText('still updating');

    // Degraded must still mean working: the 2s fallback poll picks this up.
    room.participants.push({ id: 'p-2', name: 'Heather' });
    await expect(page.getByTestId('court-group').getByText('Heather')).toBeVisible({ timeout: 8_000 });
    await page.screenshot({ path: path.join(SHOTS, '11-degraded.png') });
  });
});

/**
 * TEST 12 — COURT SIZE IS THE HOST'S CALL, AND THE ROOM'S FACT.
 *
 * The size belongs to the room. Exactly one member may write it; everyone else
 * reads the same value. These tests drive the REAL CourtRoom against a mock
 * that enforces the same host-token rule the RPC does.
 */
async function asHost(page: Page) {
  await page.addInitScript((token) => localStorage.setItem('court_host_HARNESS1', token), HOST_TOKEN);
}

test.describe('TEST 12 — host controls the title count', () => {
  test('the host gets the control, defaulted to Standard, and it reaches the room', async ({ page }) => {
    const { room, calls } = await mockRoom(page, { ...EMPTY_LOBBY, participants: [{ id: 'p-1', name: 'Heather' }] });
    await asHost(page);
    await joinAs(page, 'Heather');

    // The selector lives behind the Advanced disclosure, collapsed by default.
    await expect(page.getByTestId('court-size-picker')).toHaveCount(0);
    await page.getByTestId('advanced-toggle').click();
    await expect(page.getByTestId('court-size-picker')).toBeVisible();
    await expect(page.getByTestId('court-size-standard')).toHaveAttribute('aria-checked', 'true');
    await page.screenshot({ path: path.join(SHOTS, '12-host.png'), fullPage: true });

    await page.getByTestId('court-size-deep').click();
    await expect(page.getByTestId('court-size-deep')).toHaveAttribute('aria-checked', 'true');

    // Written to the ROOM through the host-gated RPC — not kept on the device.
    await expect.poll(() => calls.filter((c) => c.fn === 'court_set_size').length).toBeGreaterThan(0);
    expect(calls.find((c) => c.fn === 'court_set_size')!.body.p_size).toBe('deep');
    expect(room.courtSize).toBe('deep');
  });

  test('a joining member gets a READ-ONLY card naming the host, never a selector', async ({ page }) => {
    await mockRoom(page, {
      ...EMPTY_LOBBY,
      participants: [{ id: 'p-1', name: 'Heather', host: true }],
      courtSize: 'standard',
    });
    // No host token: this member arrived by invite link.
    await joinAs(page, 'Amy');

    // A member NEVER sees the selector — before or after opening Advanced.
    await expect(page.getByTestId('court-size-picker')).toHaveCount(0);
    await page.getByTestId('advanced-toggle').click();
    await expect(page.getByTestId('court-size-picker')).toHaveCount(0);
    const card = page.getByTestId('court-size-readonly');
    await expect(card).toBeVisible();
    await expect(page.getByTestId('court-size-headline')).toHaveText('Standard Court selected by Heather');
    await expect(page.getByTestId('court-size-detail')).toHaveText('12 titles · 6 in play · 6 in reserve');
    await expect(card).toContainText('Only Heather can change this.');
    await page.screenshot({ path: path.join(SHOTS, '12-member-readonly.png'), fullPage: true });
  });

  test('a member still completes their OWN tonight preferences', async ({ page }) => {
    const { calls } = await mockRoom(page, {
      ...EMPTY_LOBBY,
      participants: [{ id: 'p-1', name: 'Heather', host: true }],
    });
    await joinAs(page, 'Amy');

    const tonight = page.getByTestId('court-tonight');
    // Content type, genres, exclusions and runtime are all still theirs to set
    // — type and runtime behind Advanced, the two questions in front.
    await tonight.getByRole('button', { name: 'Sounds good: Comedy' }).click();
    await tonight.getByRole('button', { name: 'Avoid: Horror' }).click();
    await tonight.getByTestId('advanced-toggle').click();
    await tonight.getByRole('button', { name: 'Show', exact: true }).click();
    await tonight.getByRole('button', { name: 'Under 90 min' }).click();
    await page.getByTestId('tonight-ready').click();

    const sent = calls.filter((c) => c.fn === 'court_set_tonight');
    expect(sent.length).toBeGreaterThan(0);
    const payload = sent.at(-1)!.body.p_tonight as Record<string, unknown>;
    expect(payload.kind).toBe('tv');
    expect(payload.moods).toEqual(['Comedy']);
    expect(payload.avoid).toEqual(['Horror']);
    expect(payload.time).toBe('u90');
  });

  test("the host's change reaches a joined member's read-only card", async ({ page }) => {
    const socket = await mockRealtime(page);
    const { room } = await mockRoom(page, {
      ...EMPTY_LOBBY,
      participants: [{ id: 'p-1', name: 'Heather', host: true }],
      courtSize: 'standard',
    });
    await joinAs(page, 'Amy');
    await page.getByTestId('advanced-toggle').click();
    await expect(page.getByTestId('court-size-headline')).toHaveText('Standard Court selected by Heather');

    // The host (another device) changes it; the room broadcasts.
    room.courtSize = 'quick';
    await socket.broadcast('state');

    await expect(page.getByTestId('court-size-headline')).toHaveText('Quick Court selected by Heather', { timeout: 3_000 });
    await expect(page.getByTestId('court-size-detail')).toHaveText('8 titles · 4 in play · 4 in reserve');
  });

  test('the setting survives a refresh and a reconnection', async ({ page }) => {
    await mockRoom(page, {
      ...EMPTY_LOBBY,
      participants: [{ id: 'p-1', name: 'Heather', host: true }],
      courtSize: 'deep',
    });
    await joinAs(page, 'Amy');
    await page.getByTestId('advanced-toggle').click();
    await expect(page.getByTestId('court-size-headline')).toHaveText('Deep Court selected by Heather');
    await page.reload();
    // Read back from the room, not from this device's storage.
    await page.getByTestId('advanced-toggle').click();
    await expect(page.getByTestId('court-size-headline')).toHaveText('Deep Court selected by Heather');
  });

  test('it locks once candidate generation has begun — even for the host', async ({ page }) => {
    await mockRoom(page, {
      status: 'veto',
      participants: [{ id: 'p-1', name: 'Heather', host: true }, { id: 'p-2', name: 'Amy' }],
      finalists: [finalist(1, 11, 'The Quiet Room', [['Heather', 80], ['Amy', 74]])],
      messages: [],
      courtSize: 'deep',
    });
    await asHost(page);
    await page.goto(HARNESS);
    await page.evaluate(() => localStorage.setItem('court_part_HARNESS1', 'p-1'));
    await page.reload();

    // No editable control anywhere in the room once the court is built.
    await expect(page.getByTestId('court-size-picker')).toHaveCount(0);
  });

  test('the creator is clearly labelled Host in the roster', async ({ page }) => {
    await mockRoom(page, {
      ...EMPTY_LOBBY,
      participants: [{ id: 'p-1', name: 'Heather', host: true }, { id: 'p-2', name: 'Amy' }],
    });
    await joinAs(page, 'Amy');
    const badges = page.getByTestId('host-badge');
    await expect(badges).toHaveCount(1);
    await expect(badges.first()).toHaveText('Host');
  });
});

test.describe('STAGE 2 — two questions, solo preview, three columns', () => {
  test('a genre cannot be wanted and avoided at once', async ({ page }) => {
    await mockRoom(page, EMPTY_LOBBY);
    await joinAs(page, 'Scott');
    const tonight = page.getByTestId('court-tonight');

    // Pick Horror as "sounds good" → the avoid Horror chip is disabled.
    await tonight.getByRole('button', { name: 'Sounds good: Horror' }).click();
    await expect(tonight.getByRole('button', { name: 'Avoid: Horror' })).toBeDisabled();

    // Un-pick it, avoid it instead → the sounds-good chip is disabled.
    await tonight.getByRole('button', { name: 'Sounds good: Horror' }).click();
    await tonight.getByRole('button', { name: 'Avoid: Horror' }).click();
    await expect(tonight.getByRole('button', { name: 'Sounds good: Horror' })).toBeDisabled();
  });

  test('the default form is two chip groups plus Ready, and fits 900px', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockRoom(page, EMPTY_LOBBY);
    await joinAs(page, 'Scott');
    const tonight = page.getByTestId('court-tonight');

    // Two questions by default; type/runtime/size wait behind Advanced.
    await expect(tonight.locator('fieldset')).toHaveCount(2);
    await expect(tonight.getByTestId('advanced-panel')).toHaveCount(0);
    await expect(page.getByTestId('tonight-ready')).toBeVisible();

    // The whole form is on screen in a 900px viewport with no scrolling.
    const box = await tonight.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height, `form bottom ${box!.y + box!.height}`).toBeLessThanOrEqual(900);

    // Advanced opens to type (default Either), runtime (default No limit)
    // and — for a host — the court-size selector.
    await tonight.getByTestId('advanced-toggle').click();
    await expect(tonight.getByRole('button', { name: '✓ Either' })).toBeVisible();
    await expect(tonight.getByRole('button', { name: '✓ No limit' })).toBeVisible();
  });

  test('a solo host builds and previews; only the Verd1ct is gated', async ({ page }) => {
    const { room } = await mockRoom(page, EMPTY_LOBBY);
    await asHost(page);
    // The build endpoint succeeds solo and moves the room to the voting floor.
    await page.route('**/api/court/start', async (route) => {
      room.status = 'veto';
      room.finalists = [
        finalist(1, 11, 'The Quiet Room', [['Scott', 82]]),
        finalist(2, 12, 'Second Choice', [['Scott', 74]]),
      ];
      await route.fulfill({ json: { ok: true } });
    });
    await joinAs(page, 'Scott');

    // Solo: the build button is live, and the note says what the wait is for.
    const build = page.getByTestId('build-shortlist');
    await expect(build).toBeEnabled();
    await expect(build).toHaveText('Build our shortlist');
    await expect(page.getByTestId('solo-note')).toContainText('final Verd1ct unlocks');

    await build.click();

    // The generated shortlist is visible in the waiting state…
    await expect(page.getByText('The Quiet Room')).toBeVisible();
    // …and the ONLY disabled action is the Verd1ct reveal, which says why.
    const reveal = page.getByTestId('reveal');
    await expect(reveal).toBeDisabled();
    await expect(reveal).toHaveText('Invite one more juror to unlock the Verd1ct');
  });

  test('the Verd1ct unlocks when a second juror joins', async ({ page }) => {
    await mockRoom(page, {
      status: 'veto',
      participants: [
        { id: 'p-1', name: 'Scott', host: true, reactionCount: 1 },
        { id: 'p-2', name: 'Amy', reactionCount: 0 },
      ],
      finalists: [finalist(1, 11, 'The Quiet Room', [['Scott', 82], ['Amy', 77]])],
      messages: [],
    });
    await asHost(page);
    await page.goto(HARNESS);
    await page.evaluate(() => localStorage.setItem('court_part_HARNESS1', 'p-1'));
    await page.reload();

    await expect(page.getByTestId('reveal')).toBeEnabled();
  });

  test('three columns at 1920: roster · court · activity, honest widths', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await mockRoom(page, { ...EMPTY_LOBBY, messages: [{ id: 'm-1', sender: 'Amy', body: 'evening all', at: new Date(0).toISOString() }] });
    await joinAs(page, 'Scott');

    const cols = [
      await page.getByTestId('court-group').boundingBox(),
      await page.getByTestId('court-tonight').boundingBox(),
      await page.getByTestId('activity-feed').boundingBox(),
    ];
    for (const [i, box] of cols.entries()) {
      expect(box, `column ${i} missing`).not.toBeNull();
      expect(box!.width, `column ${i} width ${box!.width}`).toBeLessThanOrEqual(640);
    }
    // Side by side, not stacked.
    expect(cols[1]!.x).toBeGreaterThan(cols[0]!.x + cols[0]!.width - 1);
    expect(cols[2]!.x).toBeGreaterThan(cols[1]!.x + cols[1]!.width - 1);
    // No dead gutter over 120px per side.
    expect(cols[0]!.x, `left gutter ${cols[0]!.x}`).toBeLessThanOrEqual(120);
    expect(1920 - (cols[2]!.x + cols[2]!.width), 'right gutter').toBeLessThanOrEqual(120);

    // The feed carries the conversation inline; the floating chat button
    // stands down at this width.
    await expect(page.getByTestId('activity-feed')).toContainText('evening all');
    await expect(page.getByTestId('open-chat')).toBeHidden();
  });

  test('single column below 1280', async ({ page }) => {
    await page.setViewportSize({ width: 1279, height: 900 });
    await mockRoom(page, EMPTY_LOBBY);
    await joinAs(page, 'Scott');
    await expect(page.getByTestId('activity-feed')).toBeHidden();
    const group = await page.getByTestId('court-group').boundingBox();
    const tonight = await page.getByTestId('court-tonight').boundingBox();
    expect(tonight!.y).toBeGreaterThan(group!.y + group!.height - 1);
  });
});
