import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { SECONDARY_NAV } from '@/config/nav';

export const metadata: Metadata = { title: 'Profile' };

const SETTINGS = [
  'Reader DNA',
  'Friends',
  'Reading-service value',
  'Badges',
  'Language & Region',
  'Privacy & Data',
  'Account settings',
];

export default function ProfilePage() {
  return (
    <div className="animate-fade-up space-y-8">
      <PageHeader
        eyebrow="Profile"
        title="You, and how ReadVerdict sees you"
        description="Your identity, preferences, privacy controls, and the secondary areas of the app."
      />

      <nav aria-label="Secondary" className="grid gap-2 sm:grid-cols-2">
        {SECONDARY_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="card flex items-center justify-between p-4 transition hover:border-brass-500/40"
          >
            <span className="font-medium text-ivory-100">{item.label}</span>
            <span aria-hidden className="text-ivory-400">→</span>
          </Link>
        ))}
      </nav>

      <div className="flex flex-wrap gap-2">
        {SETTINGS.map((s) => (
          <span key={s} className="pill">
            {s}
          </span>
        ))}
      </div>

      <EmptyState
        phase="Phase 5 / 10"
        title="Sign-in and privacy controls coming"
        body="Accounts (Supabase Auth), personalization controls, and understandable privacy settings — analytics, personalization, voice-transcript retention, data export, deletion, and Reader DNA reset — arrive in Phase 5 and Phase 10."
      />
    </div>
  );
}
