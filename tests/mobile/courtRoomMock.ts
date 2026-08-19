import type { Page } from '@playwright/test';

/**
 * THE COURT ROOM, WITHOUT A DATABASE.
 *
 * `/dev/court` mounts the real `CourtRoom`; this serves the Supabase RPCs it
 * calls from an in-memory room, so every stage can be driven without live
 * credentials. Extracted from `court.spec.ts` unchanged so a second suite can
 * drive the SAME room rather than a second approximation of it — two mocks
 * that drift apart would let a suite pass against a room the product does not
 * have.
 */

export const HARNESS = '/dev/court';

/** The host token the harness treats as genuine. */
export const HOST_TOKEN = 'host-token-abcdefgh';

export interface RoomModel {
  status: 'lobby' | 'veto' | 'verdict';
  participants: { id: string; name: string; host?: boolean; ready?: boolean; pickCount?: number; reactionCount?: number; reactions?: Record<string, { r: string; reason?: string }> }[];
  finalists: unknown[] | null;
  messages: { id: string; sender: string; body: string; at: string }[];
  /** Room-level setting, as court_state_v2 returns it. */
  courtSize?: 'quick' | 'standard' | 'deep';
  hostName?: string | null;
  sizeLocked?: boolean;
}

export function finalist(rank: number, id: number, title: string, fits: [string, number][], streaming = ['Netflix']) {
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
export async function mockRoom(page: Page, initial: RoomModel) {
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

export const EMPTY_LOBBY: RoomModel = { status: 'lobby', participants: [], finalists: null, messages: [] };
