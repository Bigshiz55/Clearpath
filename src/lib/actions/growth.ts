'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { serverEnv } from '@/lib/env';
import { slugify } from '@/lib/growth/utm';

/**
 * Growth OS server actions. Every action authorizes the caller as an ADMIN_EMAILS
 * owner first, then writes owner-scoped rows (RLS also enforces owner_id). Nothing
 * here sends any outreach — drafts are copied and sent manually by the founder.
 */
async function requireOwner() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const admins = serverEnv.adminEmails();
  if (!user?.email || !admins.includes(user.email.toLowerCase())) {
    throw new Error('Not authorized.');
  }
  return { supabase, user };
}

function shortId(): string {
  return (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`)
    .replace(/[^a-z0-9]/gi, '')
    .slice(0, 6)
    .toLowerCase();
}

const prospectSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.string().max(60).optional(),
  platform: z.string().max(80).optional(),
  audience_size: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
  contact: z.string().max(300).optional(),
  relevance: z.coerce.number().int().min(1).max(5).optional(),
  status: z.enum(['to_contact', 'contacted', 'replied', 'activated', 'passed']).default('to_contact'),
  next_follow_up: z.string().max(20).optional(),
  notes: z.string().max(2000).optional(),
});

export async function addProspect(formData: FormData): Promise<void> {
  const { supabase, user } = await requireOwner();
  const p = prospectSchema.parse({
    name: formData.get('name'),
    category: formData.get('category') || undefined,
    platform: formData.get('platform') || undefined,
    audience_size: formData.get('audience_size') || undefined,
    contact: formData.get('contact') || undefined,
    relevance: formData.get('relevance') || undefined,
    status: (formData.get('status') as string) || 'to_contact',
    next_follow_up: formData.get('next_follow_up') || undefined,
    notes: formData.get('notes') || undefined,
  });
  await supabase.from('growth_prospects').insert({ owner_id: user.id, ...p, next_follow_up: p.next_follow_up || null });
  revalidatePath('/growth-os/crm');
  revalidatePath('/growth-os');
}

const linkSchema = z.object({
  label: z.string().min(1).max(120),
  destination: z.string().min(1).max(300).default('/app/taste-quiz'),
  source: z.string().min(1).max(60),
  medium: z.string().max(60).optional(),
  campaign: z.string().max(80).optional(),
  content: z.string().max(80).optional(),
  ref_user: z.string().max(80).optional(),
});

export async function createTrackedLink(formData: FormData): Promise<void> {
  const { supabase, user } = await requireOwner();
  const v = linkSchema.parse({
    label: formData.get('label'),
    destination: (formData.get('destination') as string) || '/app/taste-quiz',
    source: formData.get('source'),
    medium: formData.get('medium') || undefined,
    campaign: formData.get('campaign') || undefined,
    content: formData.get('content') || undefined,
    ref_user: formData.get('ref_user') || undefined,
  });
  const slug = `${slugify(v.label)}-${shortId()}`;
  await supabase.from('growth_links').insert({ owner_id: user.id, slug, ...v });
  revalidatePath('/growth-os/campaigns');
  revalidatePath('/growth-os');
}

const campaignSchema = z.object({
  name: z.string().min(1).max(120),
  audience: z.string().max(200).optional(),
  value_prop: z.string().max(400).optional(),
  headline: z.string().max(200).optional(),
  cta: z.string().max(120).optional(),
  channel: z.string().max(60).optional(),
  destination: z.string().max(300).default('/app/taste-quiz'),
});

export async function createCampaign(formData: FormData): Promise<void> {
  const { supabase, user } = await requireOwner();
  const v = campaignSchema.parse({
    name: formData.get('name'),
    audience: formData.get('audience') || undefined,
    value_prop: formData.get('value_prop') || undefined,
    headline: formData.get('headline') || undefined,
    cta: formData.get('cta') || undefined,
    channel: formData.get('channel') || undefined,
    destination: (formData.get('destination') as string) || '/app/taste-quiz',
  });
  await supabase.from('growth_campaigns').insert({ owner_id: user.id, ...v });
  revalidatePath('/growth-os/campaigns');
}

const feedbackSchema = z.object({
  subject: z.string().max(200).optional(),
  source: z.string().max(120).optional(),
  activation: z.string().max(40).optional(),
  first_impression: z.string().max(1000).optional(),
  confusion: z.string().max(1000).optional(),
  favorite: z.string().max(1000).optional(),
  missing: z.string().max(1000).optional(),
  return_likelihood: z.coerce.number().int().min(1).max(5).optional(),
  invite_likelihood: z.coerce.number().int().min(1).max(5).optional(),
  quote: z.string().max(1000).optional(),
  notes: z.string().max(2000).optional(),
});

export async function recordFeedback(formData: FormData): Promise<void> {
  const { supabase, user } = await requireOwner();
  const v = feedbackSchema.parse(Object.fromEntries(
    ['subject', 'source', 'activation', 'first_impression', 'confusion', 'favorite', 'missing', 'return_likelihood', 'invite_likelihood', 'quote', 'notes']
      .map((k) => [k, formData.get(k) || undefined]),
  ));
  await supabase.from('growth_feedback').insert({ owner_id: user.id, ...v });
  revalidatePath('/growth-os/feedback');
}

export async function saveStageOverride(formData: FormData): Promise<void> {
  const { supabase, user } = await requireOwner();
  const raw = (formData.get('stage_override') as string) || '';
  const stage = ['stage1', 'stage2', 'stage3', 'scale'].includes(raw) ? raw : null;
  await supabase.from('growth_settings').upsert({ owner_id: user.id, stage_override: stage, updated_at: new Date().toISOString() });
  revalidatePath('/growth-os');
}
