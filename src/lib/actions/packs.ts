'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { markSeen, unmarkSeen } from '@/lib/packs/userSeen';
import { subscribe, unsubscribe } from '@/lib/packs/userTracking';
import { addToPackList, removeFromPackList, packListStorageAvailable } from '@/lib/packs/checklist';
import type { UserSeenSubjectType, TrackingSubscriptionType } from '@/lib/packs/types';
import type { ActionResult } from './watchlist';

async function requireUser(supabase: ReturnType<typeof createClient>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You need to be signed in.');
  return user;
}

const seenSchema = z.object({
  subjectType: z.enum(['programme', 'case']),
  subjectId: z.string().uuid(),
  packSlug: z.string().min(1).max(80),
});

export async function setSeen(input: z.infer<typeof seenSchema> & { seen: boolean }): Promise<ActionResult> {
  const parsed = seenSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid request.' };
  const { subjectType, subjectId, packSlug } = parsed.data;

  try {
    const supabase = createClient();
    const user = await requireUser(supabase);
    if (input.seen) {
      await markSeen(supabase, user.id, subjectType as UserSeenSubjectType, subjectId);
    } else {
      await unmarkSeen(supabase, user.id, subjectType as UserSeenSubjectType, subjectId);
    }
    revalidatePath(`/packs/${packSlug}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not update.' };
  }
}

const followSchema = z.object({
  subscriptionType: z.enum(['person', 'case', 'franchise', 'pack']),
  subject: z.string().min(1).max(300),
  packSlug: z.string().min(1).max(80),
});

export async function followSubject(input: z.infer<typeof followSchema>): Promise<ActionResult> {
  const parsed = followSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid request.' };
  const { subscriptionType, subject, packSlug } = parsed.data;

  try {
    const supabase = createClient();
    const user = await requireUser(supabase);
    const trackingId = await subscribe(supabase, user.id, subscriptionType as TrackingSubscriptionType, subject);
    revalidatePath(`/packs/${packSlug}`);
    return { ok: true, data: { trackingId } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not follow.' };
  }
}

const unfollowSchema = z.object({
  trackingId: z.string().uuid(),
  packSlug: z.string().min(1).max(80),
});

export async function unfollowSubject(input: z.infer<typeof unfollowSchema>): Promise<ActionResult> {
  const parsed = unfollowSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid request.' };
  const { trackingId, packSlug } = parsed.data;

  try {
    const supabase = createClient();
    const user = await requireUser(supabase);
    await unsubscribe(supabase, user.id, trackingId);
    revalidatePath(`/packs/${packSlug}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not unfollow.' };
  }
}

// ---------------------------------------------------------------------------
// MY CHECKLIST — explicit add/remove.
//
// The checklist is a list the user builds, not a view of the schedule (see
// src/lib/packs/checklist.ts). These are the only two ways a title can get
// onto it or leave it; nothing else infers membership.
// ---------------------------------------------------------------------------
const listSchema = z.object({
  packId: z.string().uuid(),
  packSlug: z.string().min(1).max(80),
  programmeId: z.string().uuid(),
});

export async function setOnChecklist(
  input: z.infer<typeof listSchema> & { onList: boolean },
): Promise<ActionResult> {
  const parsed = listSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid request.' };
  const { packId, packSlug, programmeId } = parsed.data;

  try {
    const supabase = createClient();
    const user = await requireUser(supabase);
    if (!(await packListStorageAvailable(supabase))) {
      return { ok: false, error: 'Checklists are not available on this deployment yet.' };
    }
    if (input.onList) {
      await addToPackList(supabase, user.id, packId, programmeId);
    } else {
      await removeFromPackList(supabase, user.id, packId, programmeId);
    }
    revalidatePath(`/packs/${packSlug}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not update your checklist.' };
  }
}
