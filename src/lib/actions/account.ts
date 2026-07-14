'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ConfigError } from '@/lib/env';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Permanently delete the current user's account and all their data. Data rows
 * cascade via ON DELETE CASCADE from auth.users. Requires the service-role key
 * (server-only) to remove the auth user itself.
 */
export async function deleteAccount(): Promise<ActionResult> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'You need to be signed in.' };

    let admin;
    try {
      admin = createAdminClient();
    } catch (e) {
      if (e instanceof ConfigError) {
        return {
          ok: false,
          error:
            'Account deletion is not configured (missing service-role key). Contact the site owner.',
        };
      }
      throw e;
    }

    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) return { ok: false, error: error.message };

    await supabase.auth.signOut();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to delete account.' };
  }
}
