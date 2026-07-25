'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { submitFounderCode, type AccessState } from '@/lib/actions/founderAccess';

/**
 * The code is submitted as a POST form field, so it never appears in a URL,
 * a Referer header, or browser history. The input is type="password" with
 * autocomplete off, and nothing here ever reads or stores the value — the only
 * comparison happens on the server.
 */

const initial: AccessState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" data-testid="access-submit" disabled={pending} className="btn-primary w-full py-3">
      {pending ? 'Checking…' : 'Continue'}
    </button>
  );
}

export function FounderAccessForm() {
  const [state, formAction] = useFormState(submitFounderCode, initial);

  return (
    <main className="grid min-h-dvh place-items-center bg-slate-950 px-4 text-white" data-testid="founder-access">
      <div className="w-full max-w-sm">
        <h1 className="text-lg font-black">Founder access</h1>
        <p className="mt-1 text-sm text-slate-400">
          Temporary access while normal sign-in is unavailable.
        </p>

        <form action={formAction} className="mt-6 space-y-3">
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Access code</span>
            <input
              // No name reuse with any password manager field, no autofill, and
              // never rendered back into the DOM after submission.
              type="password"
              name="code"
              data-testid="access-code"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              required
              className="input mt-1 w-full"
            />
          </label>

          {state.error && (
            <p role="alert" data-testid="access-error" className="text-sm text-red-300">
              {state.error}
              {typeof state.remaining === 'number' && state.remaining > 0 && (
                <span className="block text-xs text-slate-400">
                  {state.remaining} attempt{state.remaining === 1 ? '' : 's'} remaining before a temporary lockout.
                </span>
              )}
            </p>
          )}

          <SubmitButton />
        </form>

        <p className="mt-6 text-[11px] leading-relaxed text-slate-500">
          This grants access to an internal diagnostic only. It does not sign you
          in to WatchVerd1ct and creates no user account.
        </p>
      </div>
    </main>
  );
}
