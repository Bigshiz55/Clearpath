'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdminEmail } from '@/lib/admin';
import { PAGE_KIND_BASE, type PageKind } from '@/lib/discovery/types';

/**
 * CMS WRITE PATH. Admin-only, validated, and audited: every save appends a
 * revision row before the override is upserted, so content history is never
 * lost. Writes go through the service client because `discovery_overrides` has
 * no user-level write policy — publishing must be impossible from the browser.
 */

const schema = z.object({
  pageKind: z.enum(['movie', 'show', 'compare', 'for', 'discover', 'guide']),
  slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase, numbers and hyphens only.'),
  seoTitle: z.string().max(200).optional(),
  description: z.string().max(400).optional(),
  heading: z.string().max(200).optional(),
  standfirst: z.string().max(400).optional(),
  status: z.enum(['draft', 'needs_review', 'published', 'noindex', 'retired']).optional(),
  publishAt: z.string().optional(),
});

export type SaveResult = { ok: true } | { ok: false; error: string };

export async function saveDiscoveryOverride(input: unknown): Promise<SaveResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }
  const v = parsed.data;

  // Authorize server-side against the signed-in identity.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !isAdminEmail(user.email)) {
    return { ok: false, error: 'Not authorized.' };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: 'Content editing needs SUPABASE_SERVICE_ROLE_KEY to be configured.' };
  }

  const payload = {
    page_kind: v.pageKind,
    slug: v.slug,
    seo_title: v.seoTitle?.trim() || null,
    description: v.description?.trim() || null,
    heading: v.heading?.trim() || null,
    standfirst: v.standfirst?.trim() || null,
    status: v.status ?? null,
    publish_at: v.publishAt ? new Date(v.publishAt).toISOString() : null,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };

  try {
    // Append the revision BEFORE mutating, so history survives a failed write.
    await admin.from('discovery_revisions').insert({
      page_kind: v.pageKind,
      slug: v.slug,
      payload,
      changed_by: user.id,
    });
    const { error } = await admin.from('discovery_overrides').upsert(payload, { onConflict: 'page_kind,slug' });
    if (error) {
      return {
        ok: false,
        error: /relation .* does not exist/i.test(error.message)
          ? 'Apply migration 0027_discovery_content before editing content.'
          : error.message,
      };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not save.' };
  }

  // Refresh the affected public page, the sitemap and the CMS list.
  revalidatePath(`${PAGE_KIND_BASE[v.pageKind as PageKind]}/${v.slug}`);
  revalidatePath('/sitemap.xml');
  revalidatePath('/explore');
  revalidatePath('/admin/content');
  return { ok: true };
}
