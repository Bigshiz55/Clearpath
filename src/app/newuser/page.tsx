import { FreshStart } from '@/components/FreshStart';

/** Clean-slate entry that lands on the cold-start HOME (State Your Case hero +
 *  honest "still getting to know you" recs) — for testing the full first-time
 *  experience. Fresh anonymous guest, zero history; revisit for a new one. */
export default function NewUserPage() {
  return <FreshStart to="/app" />;
}
