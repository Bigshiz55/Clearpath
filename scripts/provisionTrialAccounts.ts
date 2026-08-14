/**
 * TRIAL-ACCOUNT PROVISIONING — run by the CREDENTIAL HOLDER, never by CI.
 *
 * Creates/verifies the five owner-named clean-slate trial accounts. This
 * script exists because the working agreement forbids the assistant from
 * requesting or handling production credentials: the owner runs it where
 * the secrets legitimately live.
 *
 *   TRIAL_ACCOUNTS_PASSWORD='<the shared trial password>' \
 *   NEXT_PUBLIC_SUPABASE_URL='https://<project>.supabase.co' \
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY='<anon key>' \
 *   SUPABASE_SERVICE_ROLE_KEY='<service role key>' \
 *   npx tsx scripts/provisionTrialAccounts.ts
 *
 * THE CONTRACT (owner-stated, enforced here):
 *   • For each address: determine whether the auth user exists, and whether
 *     profile/history/DNA exists.
 *   • Absent → create fresh (email pre-confirmed, the shared password).
 *   • Existing WITH meaningful real history (preference events, watchlist
 *     rows, or a completed profile) → NEVER deleted, NEVER reset — reported
 *     as a collision and left exactly as found.
 *   • Existing as an unquestionably unused shell (auth row only: no profile
 *     row or an incomplete one, zero events, zero watchlist rows) → the
 *     password is set via the standard admin API so the trial can use it.
 *     Nothing else about the account is touched.
 *   • Fresh means fresh: this script NEVER seeds likes, dislikes, DNA,
 *     watchlists or imported history.
 *   • Real login is verified with a genuine signInWithPassword against the
 *     app's own auth (anon key) — an auth DB row alone is not a login.
 *
 * OUTPUT: exactly email / created|existing|collision / fresh-profile /
 * fresh-DNA / real-login per account. The password, tokens, cookies and
 * session objects are NEVER printed.
 */
import { createClient } from '@supabase/supabase-js';

const ACCOUNTS = [
  'aauhoops@verizon.net',
  'Schidlt@verizon.net',
  'Hbs1717@verizon.net',
  'Smit1515@aol.com',
  'Rsburke1@gmail.com',
] as const;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name}. Set it in the environment — never on the command line of a shared shell history.`);
    process.exit(2);
  }
  return v;
}

async function main() {
  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const password = requireEnv('TRIAL_ACCOUNTS_PASSWORD');

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const report: Array<Record<string, string>> = [];

  for (const email of ACCOUNTS) {
    const row: Record<string, string> = { email, status: 'error', 'fresh-profile': '?', 'fresh-DNA': '?', 'real-login': '?' };
    try {
      // 1) Does the auth user exist? (Admin listing, filtered client-side —
      //    the admin API has no exact-email lookup.)
      const { data: page, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (listErr) throw listErr;
      const existing = page.users.find((u) => (u.email ?? '').toLowerCase() === email.toLowerCase());

      let userId: string;
      if (!existing) {
        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
        if (createErr || !created.user) throw createErr ?? new Error('createUser returned no user');
        userId = created.user.id;
        row.status = 'created';
      } else {
        userId = existing.id;
        row.status = 'existing';
      }

      // 2) Meaningful history? Three bounded reads.
      const [profile, events, watchlist] = await Promise.all([
        admin.from('profiles').select('onboarding_complete').eq('id', userId).maybeSingle(),
        admin.from('preference_events').select('id', { count: 'exact', head: true }).eq('user_id', userId),
        admin.from('watchlist_items').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      ]);
      const eventCount = events.count ?? 0;
      const watchlistCount = watchlist.count ?? 0;
      const profileComplete = profile.data?.onboarding_complete === true;
      const meaningfulHistory = eventCount > 0 || watchlistCount > 0 || profileComplete;

      row['fresh-profile'] = profile.data == null || !profileComplete ? 'yes' : 'no';
      row['fresh-DNA'] = eventCount === 0 ? 'yes' : 'no';

      if (row.status === 'existing') {
        if (meaningfulHistory) {
          // NEVER deleted, NEVER reset. Reported and left exactly as found.
          row.status = 'collision';
          row['real-login'] = 'not-attempted';
          report.push(row);
          continue;
        }
        // Unquestionably unused shell → set the trial password only.
        const { error: pwErr } = await admin.auth.admin.updateUserById(userId, { password });
        if (pwErr) throw pwErr;
      }

      // 3) REAL login — the app's own auth path, not just a DB row.
      const asUser = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
      const { data: login, error: loginErr } = await asUser.auth.signInWithPassword({ email, password });
      row['real-login'] = !loginErr && login.session != null ? 'yes' : 'no';
      if (login.session) await asUser.auth.signOut();
    } catch (e) {
      row.status = `error: ${e instanceof Error ? e.message : String(e)}`;
    }
    report.push(row);
  }

  // The five allowed fields, nothing else — never the password, a token,
  // a cookie, a session or a service credential.
  console.log('\nemail | status | fresh-profile | fresh-DNA | real-login');
  for (const r of report) {
    console.log(`${r.email} | ${r.status} | ${r['fresh-profile']} | ${r['fresh-DNA']} | ${r['real-login']}`);
  }
  const failed = report.some((r) => (r.status ?? '').startsWith('error'));
  process.exit(failed ? 1 : 0);
}

void main();
