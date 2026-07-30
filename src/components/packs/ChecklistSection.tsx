import { createClient } from '@/lib/supabase/server';
import { listPackChecklist } from '@/lib/packs/packs';
import type { Pack } from '@/lib/packs/types';
import { ChecklistView } from './ChecklistView';
import { PackEmptyState } from './PackEmptyState';

/** Server wrapper for My Checklist — driven by `pack.completionStats`, never `pack.slug`. */
export async function ChecklistSection({ pack, userId }: { pack: Pack; userId: string | null }) {
  const supabase = createClient();
  const items = await listPackChecklist(supabase, pack, userId);

  if (items.length === 0) {
    return (
      <PackEmptyState
        title="Nothing ingested yet"
        detail="This Pack's channels are connected, but no titles have been ingested yet. Check back after the next listings refresh."
      />
    );
  }

  return <ChecklistView items={items} packSlug={pack.slug} signedIn={userId != null} />;
}
