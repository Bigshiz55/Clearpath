import { LearnStart } from '@/components/LearnStart';

/** Persistent "learn my DNA over time" link — a clean session the first time,
 *  then kept across visits so a long run of selections accumulates into a
 *  sharper Taste DNA. Unlike /fresh, it does not wipe on return. */
export default function LearnPage() {
  return <LearnStart />;
}
