import { createClient } from '@/lib/supabase/server';
import { listPackChecklist } from '@/lib/packs/packs';
import { listStationsForPack } from '@/lib/packs/stations';
import type { Pack } from '@/lib/packs/types';
import { ChecklistView } from './ChecklistView';
import { PackEmptyState } from './PackEmptyState';

/**
 * Server wrapper for My Checklist — driven by `pack.completionStats`, never
 * `pack.slug`.
 *
 * THREE DIFFERENT EMPTY STATES, NAMED HONESTLY. The old copy said "Nothing
 * ingested yet" for every empty list — including when thousands of pack
 * programmes WERE ingested and the user simply had not marked any, and when
 * the real problem was that no stations were wired to the pack at all.
 * Collapsing "your list is empty", "our data is missing", and "our wiring is
 * broken" into one sentence made every one of them undiagnosable.
 */
export async function ChecklistSection({ pack, userId }: { pack: Pack; userId: string | null }) {
  const supabase = createClient();
  const [items, stationIds] = await Promise.all([
    listPackChecklist(supabase, pack, userId),
    listStationsForPack(supabase, pack.id).catch(() => []),
  ]);

  if (items.length === 0) {
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
        detail="This Pack's channels are connected, but the listings feed hasn't carried any programmes for them yet. The checklist fills automatically as listings arrive — nothing to do on your side."
      />
    );
  }

  return <ChecklistView items={items} packSlug={pack.slug} signedIn={userId != null} />;
}
