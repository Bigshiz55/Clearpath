import { FreshStart } from '@/components/FreshStart';

/** Clean-slate TEST link — a brand-new anonymous guest with zero history on
 *  every visit, dropped on the home so you can "State Your Case" and judge how
 *  good the selections are from what you put in. Revisit for another clean run. */
export default function FreshPage() {
  return <FreshStart to="/app" />;
}
