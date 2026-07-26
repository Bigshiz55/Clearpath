/**
 * SPOKEN ANSWERS — the provider layer, built but not credentialed.
 *
 * Voice DNA is designed for spoken answers: the whole reason the interview asks
 * open questions is that people explain their taste better out loud than they
 * do with radio buttons. The pipeline behind it — parse, contradiction,
 * exception, review — is transcript-shaped, so it is identical whether the
 * transcript was typed or spoken. That is why the typed path is the product and
 * not a placeholder: turning audio on adds a transcription step in front of a
 * system that is already finished.
 *
 * Until a transcription key exists, this module reports exactly that. It:
 *   * never claims audio works,
 *   * never falls back to a fake or partial transcript,
 *   * only checks whether a credential is PRESENT — it never reads, logs, or
 *     returns the value, and nothing here reaches the client bundle except the
 *     booleans and labels below.
 */

export type ProviderStatus = 'configured' | 'awaiting_credentials';

export interface TranscriptionProvider {
  id: string;
  label: string;
  /** Name of the server-side variable that would enable it. Never its value. */
  envVar: string;
  /** What it is good at, for whoever configures this later. */
  note: string;
}

/**
 * Candidate providers, in preference order. A dedicated variable is used rather
 * than reusing `OPENAI_API_KEY` so transcription can be enabled, rotated, or
 * revoked without touching the recommendation model's credentials.
 */
export const TRANSCRIPTION_PROVIDERS: readonly TranscriptionProvider[] = [
  {
    id: 'whisper',
    label: 'OpenAI Whisper',
    envVar: 'VOICE_TRANSCRIPTION_API_KEY',
    note: 'Best accuracy on conversational speech; handles accents and hesitation well.',
  },
  {
    id: 'deepgram',
    label: 'Deepgram',
    envVar: 'DEEPGRAM_API_KEY',
    note: 'Lowest latency; the option to pick if answers should transcribe as they are spoken.',
  },
  {
    id: 'assemblyai',
    label: 'AssemblyAI',
    envVar: 'ASSEMBLYAI_API_KEY',
    note: 'Strong punctuation recovery, which the clause splitter depends on.',
  },
] as const;

export interface AudioAvailability {
  /** True only when a provider is actually configured. */
  available: boolean;
  /** The provider that would be used, when one is configured. */
  providerId: string | null;
  /** Per-provider presence, for the admin/status view. */
  providers: Array<{ id: string; label: string; envVar: string; status: ProviderStatus }>;
  /** Copy for the disabled control. Honest about why, never apologetic-vague. */
  message: string;
}

type Env = Record<string, string | undefined>;

function present(env: Env, key: string): boolean {
  const v = env[key];
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * What the audio path can do right now. Pass `process.env` from a server
 * context; the result is safe to send to the client (booleans and labels only).
 */
export function audioAvailability(env: Env): AudioAvailability {
  const providers = TRANSCRIPTION_PROVIDERS.map((p) => ({
    id: p.id,
    label: p.label,
    envVar: p.envVar,
    status: (present(env, p.envVar) ? 'configured' : 'awaiting_credentials') as ProviderStatus,
  }));
  const active = providers.find((p) => p.status === 'configured') ?? null;

  return {
    available: active !== null,
    providerId: active?.id ?? null,
    providers,
    message: active
      ? `Spoken answers are on, transcribed by ${active.label}.`
      : 'Spoken answers are built but switched off — no transcription service is configured yet. Type your answers; they go through exactly the same engine.',
  };
}

/**
 * The transcription call, unimplemented on purpose.
 *
 * It throws rather than returning an empty string, because a silent empty
 * transcript would flow into the parser and produce a confident profile built
 * on nothing. Failing loudly is the only safe behaviour here.
 */
export async function transcribe(_audio: Blob | ArrayBuffer, env: Env): Promise<string> {
  const state = audioAvailability(env);
  if (!state.available) {
    throw new Error('VOICE_DNA_TRANSCRIPTION_UNCONFIGURED');
  }
  throw new Error('VOICE_DNA_TRANSCRIPTION_NOT_IMPLEMENTED');
}
