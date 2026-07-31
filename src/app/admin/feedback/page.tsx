import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdminEmail } from '@/lib/admin';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Feedback · WatchVerd1ct admin',
  robots: { index: false, follow: false },
};

interface FeedbackRow {
  id: string;
  user_id: string | null;
  user_email: string | null;
  url: string;
  commit_sha: string | null;
  viewport_width: number | null;
  viewport_height: number | null;
  description: string;
  severity: 'low' | 'medium' | 'high' | null;
  created_at: string;
}

const SEVERITY_STYLE: Record<string, string> = {
  high: 'border-red-400/40 bg-red-500/15 text-red-100',
  medium: 'border-amber-400/40 bg-amber-500/15 text-amber-100',
  low: 'border-white/15 bg-white/5 text-slate-300',
};

function formatWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * Read-only feedback inbox — newest first, full captured context per report.
 * Gated the same way as /admin/content: server-side ADMIN_EMAILS check,
 * notFound() (not a redirect) for anyone else so its existence isn't leaked.
 * Reads via the service-role client since `feedback` has no select RLS
 * policy (migration 0040) — this page is the only place these rows are read.
 */
export default async function AdminFeedbackPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !isAdminEmail(user.email)) notFound();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('feedback_reports')
    .select('id, user_id, user_email, url, commit_sha, viewport_width, viewport_height, description, severity, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  const reports = (data as FeedbackRow[] | null) ?? [];

  return (
    <div className="min-h-dvh">
      <main className="container-page py-8">
        <h1 className="text-2xl font-black text-white">Feedback</h1>
        <p className="mt-1 text-sm text-slate-400">
          {reports.length} report{reports.length === 1 ? '' : 's'}, newest first.
        </p>

        {error && (
          <p className="mt-4 rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-100">
            Could not load feedback: {error.message}
          </p>
        )}

        {!error && reports.length === 0 && (
          <p className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
            No feedback submitted yet.
          </p>
        )}

        <div className="mt-6 space-y-3">
          {reports.map((r) => (
            <div key={r.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4" data-testid="feedback-row">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span>{formatWhen(r.created_at)}</span>
                {r.severity && (
                  <span className={`rounded-md border px-1.5 py-0.5 font-bold uppercase ${SEVERITY_STYLE[r.severity]}`}>
                    {r.severity}
                  </span>
                )}
                <span className="text-slate-500">·</span>
                <span>{r.user_email ?? (r.user_id ? 'anonymous session' : 'no session')}</span>
                <span className="text-slate-500">·</span>
                <span className="font-mono">{r.commit_sha ? r.commit_sha.slice(0, 7) : 'unknown build'}</span>
                <span className="text-slate-500">·</span>
                <span>
                  {r.viewport_width ?? '?'}×{r.viewport_height ?? '?'}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-white">{r.description}</p>
              <p className="mt-2 truncate text-xs text-slate-500">{r.url}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
