import { NextResponse } from 'next/server';
import { voiceInterviewMode, openAiKey, realtimeModel, realtimeVoice } from '@/lib/voice/config';
import { INTERVIEWER_SYSTEM_PROMPT, REALTIME_TOOLS } from '@/lib/voice/interview';

/**
 * VOICE INTERVIEW — mint an OpenAI Realtime EPHEMERAL session token for the
 * browser WebRTC client.
 *
 * PUBLIC: open to everyone (no auth gate), like the rest of the interview.
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
        tools: REALTIME_TOOLS,
        tool_choice: 'auto',
        modalities: ['audio', 'text'],
        // Transcribe both sides so the transcript + contradiction memory work.
        input_audio_transcription: { model: 'whisper-1' },
        // Server VAD gives natural turn-taking + barge-in.
        turn_detection: { type: 'server_vad' },
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
