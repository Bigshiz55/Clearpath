import { createClient } from '@/lib/supabase/server';
import { listStationsForPack } from '@/lib/packs/stations';
import { listPackBrowse, listMyChecklist, packListStorageAvailable } from '@/lib/packs/checklist';
import type { Pack } from '@/lib/packs/types';
import { PackTitleList } from './PackTitleList';
import { PackEmptyState } from './PackEmptyState';

/**
 * The two Pack title surfaces, as two components, because they answer two
 * different questions. See src/lib/packs/checklist.ts for why conflating
 * them was the defect.
 */

/** BROWSE — every title the Pack's channels carry. Impersonal. */
export async function PackBrowseSection({ pack, userId }: { pack: Pack; userId: string | null }) {
  const supabase = createClient();
  const [items, stationIds, listStorage] = await Promise.all([
    listPackBrowse(supabase, pack, userId),
    listStationsForPack(supabase, pack.id).catch(() => [] as string[]),
    packListStorageAvailable(supabase).catch(() => false),
  ]);

  if (items.length === 0) {
    // Three different causes, three different sentences. Collapsing them into
    // one line is what made every one of them undiagnosable.
    if (stationIds.length === 0) {
      return (
        <PackEmptyState
          title="This Pack's channels aren't wired up"
          detail="No TV stations are linked to this Pack yet — a wiring problem on our side, not an empty catalog. It heals automatically on the next listings refresh."
        />
      );
    }
    return (
      <PackEmptyState
        title="No titles from this Pack's channels yet"
        detail="This Pack's channels are connected, but the listings feed hasn't carried any programmes for them yet. This fills automatically as listings arrive — nothing to do on your side."
      />
    );
  }

  return (
    <PackTitleList
      items={items}
      packId={pack.id}
      packSlug={pack.slug}
      signedIn={userId != null}
      mode="browse"
      listStorageAvailable={listStorage}
    />
  );
}

/** MY CHECKLIST — only what this user explicitly added. */
export async function MyChecklistSection({ pack, userId }: { pack: Pack; userId: string | null }) {
  const supabase = createClient();

  if (!userId) {
    return (
      <PackEmptyState
        title="Sign in to build a checklist"
        detail="Your checklist is yours: the titles you pick from this Pack, and nothing else."
      />
    );
  }

  const { storageAvailable, items } = await listMyChecklist(supabase, pack, userId);

  if (!storageAvailable) {
    // Honest about a deployment state rather than rendering an empty list
    // that reads as "you have not added anything".
    return (
      <PackEmptyState
        title="Checklists aren't switched on for this deployment yet"
        detail="The storage for personal Pack checklists (migration 0043) hasn't been applied to this database. Browse Pack below still works, and nothing you do is being lost — there is simply nowhere to save a list yet."
      />
    );
  }

  if (items.length === 0) {
    return (
      <PackEmptyState
        title="Your checklist is empty"
        detail="Add titles from Browse Pack below and they'll show up here. We never add anything for you, and never guess what you want to watch."
      />
    );
  }

  return (
    <PackTitleList
      items={items}
      packId={pack.id}
      packSlug={pack.slug}
      signedIn
      mode="checklist"
      listStorageAvailable
    />
  );
}
