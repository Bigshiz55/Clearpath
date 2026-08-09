import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isFounderOrAdminEmail } from '@/lib/admin';
import { voiceInterviewMode, openAiKey, realtimeModel, realtimeVoice } from '@/lib/voice/config';
import { INTERVIEWER_SYSTEM_PROMPT } from '@/lib/voice/interview';

/**
 * VOICE INTERVIEW — mint an OpenAI Realtime EPHEMERAL session token for the
 * browser WebRTC client.
 *
 * ANY SIGNED-IN SESSION, including the anonymous guest middleware mints: the
 * interview is a normal product surface on the Taste Quiz's session model. It
 * is still not open to the unauthenticated — minting a paid Realtime session
 * needs someone to attribute it to, so a request with no session gets the same
 * hidden 404 it always did.
 *
 * GRACEFUL BY DESIGN: this endpoint NEVER dead-ends the UI with a 5xx. When the
 * feature is not in realtime mode (no key / not enabled) it answers 200 with
 * `{ mode: 'fallback' }`, and the client then uses the keyless browser-speech
 * path. Even an upstream OpenAI failure comes back as a 200 `{ mode: 'fallback',
 * error }` so the interview can still run in fallback. The server key is used
 * only to POST to OpenAI and is NEVER returned to the browser — only the
 * short-lived `client_secret` is.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const NO_STORE = { 'cache-control': 'no-store' } as const;

export async function POST() {
  // Identity gate — a session is required, founder status is not.
  let authorized = false;
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) authorized = true;
  } catch {
    // treat as unauthenticated
  }
  if (!authorized) {
    return new NextResponse('Not Found', { status: 404, headers: NO_STORE });
  }

  // No key / disabled → the keyless fallback. A 200, not an error.
  if (voiceInterviewMode() !== 'realtime') {
    return NextResponse.json({ mode: 'fallback' }, { status: 200, headers: NO_STORE });
  }

  const key = openAiKey();
  if (!key) {
    // Belt-and-braces: mode said realtime but the key vanished — still degrade.
    return NextResponse.json({ mode: 'fallback' }, { status: 200, headers: NO_STORE });
  }

  const model = realtimeModel();
  try {
    const resp = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        voice: realtimeVoice(),
        instructions: INTERVIEWER_SYSTEM_PROMPT,
        // NO TOOLS. `recordScriptedTurn` on our server is the sole interpreter
        // of what the user said. Leaving `record_signal` available would give
        // the model a second, competing interpretation of the same utterance —
        // one answer scored twice, by two different judges.
        modalities: ['audio', 'text'],
        // Transcribe both sides so the transcript and the scripted turn loop work.
        input_audio_transcription: { model: 'whisper-1' },
        // TURN-ORDER CONTROL. Server VAD still detects when the user starts and
        // stops speaking, which is what gives us barge-in — but
        // `create_response: false` stops the model from ANSWERING on its own the
        // instant they stop. It must not: WatchVerd1ct owns the conversation
        // order (user stops → transcript completes → recordScriptedTurn decides
        // the next question → the client tells the model to speak exactly that).
        // With the default `create_response: true` the model races that round
        // trip and improvises a question the director never chose.
        // `interrupt_response: true` keeps barge-in working: new speech from the
        // user cancels whatever is currently being spoken.
        turn_detection: {
          type: 'server_vad',
          create_response: false,
          interrupt_response: true,
        },
      }),
    });

    if (!resp.ok) {
      // Never surface the key or the raw upstream body; degrade to fallback.
      return NextResponse.json(
        { mode: 'fallback', error: `upstream_${resp.status}` },
        { status: 200, headers: NO_STORE },
      );
    }

    const data = (await resp.json()) as { client_secret?: unknown };
    const clientSecret = data?.client_secret ?? null;
    if (!clientSecret) {
      return NextResponse.json(
        { mode: 'fallback', error: 'no_client_secret' },
        { status: 200, headers: NO_STORE },
      );
    }

    // Return ONLY the ephemeral client secret + model — never the server key.
    return NextResponse.json(
      { mode: 'realtime', model, client_secret: clientSecret },
      { status: 200, headers: NO_STORE },
    );
  } catch {
    return NextResponse.json(
      { mode: 'fallback', error: 'request_failed' },
      { status: 200, headers: NO_STORE },
    );
  }
}
