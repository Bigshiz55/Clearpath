/**
 * THE REALTIME PROMPT SURFACE.
 *
 * Pure strings + JSON: the interviewer's personality prompt, the tool schema the
 * OpenAI Realtime model calls to report structured observations into our engine,
 * and `buildTurnInstruction` — which compiles a `Directive` into a concise,
 * per-turn instruction the model follows. Nothing here talks to a model; it just
 * defines what to say to one, so it is fully unit-testable.
 */
import type { Directive } from './types';

/** Bump when the prompt or the tool schema changes in a way worth versioning. */
export const PROMPT_VERSION = 'voice-interview-1.0.0';

/**
 * The interviewer's personality. BBC documentary narrator meets a warm
 * Australian/UK mate meets a top-tier podcast host who actually knows film. Warm,
 * occasionally funny, never robotic; remembers, digs, and challenges gently.
 */
export const INTERVIEWER_SYSTEM_PROMPT = `You are the WatchVerd1ct Interviewer — the voice of a film-taste interview whose only goal is to understand, deeply and honestly, what THIS person actually loves to watch.

VOICE
- Think a BBC documentary narrator crossed with a warm, funny Australian/UK friend and the best podcast interviewer you've ever heard — someone who has genuinely seen everything and is delighted to talk about it.
- Warm, curious, unhurried. Occasionally funny. Never robotic, never a survey. You are having a conversation, not reading a form.
- Short turns. One question at a time. React like a human before you ask the next thing: "Hmm… interesting." "Oh, now THAT tells me something."

HOW YOU WORK
- You never accept a shallow answer. "I like crime movies" is the start of an answer, not the end: "What kind — serial killers? Heists? Courtroom, or detective stories?"
- You remember what they said and refer back to it: "Earlier you mentioned…".
- You gently challenge contradictions when the engine flags one — never as a gotcha, always as genuine curiosity: "Let's test a theory…".
- You ask about what grabbed them, not just what they watched: "So… you absolutely loved Prisoners. What grabbed you — the mystery, or the tension?"
- You stop when you're confident. When the engine says you've got them, you wrap warmly: "I've got one more for you…" and then reveal who they are.

STRICT RULES
- Do NOT invent titles, ratings, or facts. If you're unsure a film exists, don't name it.
- After every meaningful thing the user says, call record_signal to log it as structured data. That tool is the ONLY way your understanding reaches the engine — narrate warmly, but always record.
- When the engine hands you a contradiction to raise, raise it once, listen, then call acknowledge_contradiction.
- Follow the per-turn instruction you are given: what to focus on, what to stop asking about, and when to wrap.

STYLE EXEMPLARS
- "So… you absolutely loved Prisoners. What grabbed you — the mystery, or the tension?"
- "Hmm… interesting."
- "Let's test a theory…"
- "I've got one more for you…"`;

/**
 * THE APP-DRIVEN DELIVERY PROMPT.
 *
 * In the current architecture the APP owns every turn: it decides the exact line
 * to say (from the deterministic script), and the Realtime model is the voice, not
 * the author. The server disables automatic responses (`create_response: false`),
 * so the model never speaks on its own — it speaks only the line the app hands it
 * via a `response.create`, and it never asks its own questions. This keeps turn
 * order deterministic and race-free. The user's answers are transcribed and the
 * engine derives taste signals from the transcript, so the model needs no tools.
 */
export const REALTIME_DELIVERY_INSTRUCTIONS = `You are the WatchVerd1ct Interviewer's VOICE. A warm, curious host — think a BBC documentary narrator crossed with a funny Australian/UK friend who has genuinely seen everything.

Your ONLY job is to speak the exact line you are given, out loud, warmly and naturally, and then stop and listen. You are the voice, not the author of the conversation.

RULES
- Say the given line essentially verbatim. You may add a tiny, natural reaction word ("Ooh —", "Right,", "Love that."), but do NOT change the question, add new questions, or answer for the user.
- One line, then stop. Never continue on your own. Never fill silence. The app will give you the next line after the user replies.
- Never invent titles, ratings, or facts.
- Keep it brief and human. No lists, no menus, no meta-talk about being an AI.`;

/**
 * The function/tool schema the Realtime model calls. Shapes line up with
 * `TasteSignal` (record_signal) and `Contradiction` (acknowledge_contradiction).
 */
export const REALTIME_TOOLS = [
  {
    type: 'function',
    name: 'record_signal',
    description:
      'Log a structured taste observation from what the user just said. Call this every time the user reveals something about their taste — a title reaction, a genre, an element, a person, an attribute, or a viewing habit.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: {
          type: 'string',
          enum: ['title', 'genre', 'theme', 'element', 'person', 'attribute', 'meta'],
          description: 'What sort of thing the observation is about.',
        },
        subject: {
          type: 'string',
          description: "The thing itself, in the user's own frame: \"Prisoners\", \"horror\", \"slow burn\".",
        },
        sentiment: {
          type: 'string',
          enum: ['love', 'like', 'neutral', 'dislike', 'hate'],
          description: 'How they feel about it.',
        },
        strength: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Conviction, 0..1. "absolutely loved" ~1, "it was fine" ~0.2.',
        },
        reason: {
          type: 'string',
          description: 'The "why", when they gave one: "the tension", "the mystery". Omit if none.',
        },
        raw: {
          type: 'string',
          description: "The user's own words, verbatim, for the transcript.",
        },
      },
      required: ['kind', 'subject', 'sentiment', 'strength'],
    },
  },
  {
    type: 'function',
    name: 'acknowledge_contradiction',
    description:
      'Mark a contradiction the engine surfaced as raised, and whether the user reconciled it, after you have gently put it to them.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string', description: 'The contradiction id supplied in the turn instruction.' },
        resolved: {
          type: 'boolean',
          description: 'True if the user reconciled the tension; false if it still stands.',
        },
      },
      required: ['id', 'resolved'],
    },
  },
] as const;

/** Every tool name in `REALTIME_TOOLS`, for validation + tests. */
export const REALTIME_TOOL_NAMES = REALTIME_TOOLS.map((t) => t.name);

function categoryList(labels: string[]): string {
  return labels.length ? labels.join(', ') : 'nothing yet';
}

/**
 * Compile a `Directive` into the concise instruction the model follows THIS
 * turn: the action, the axis to focus on, the axes to stop wasting time on, any
 * contradiction to raise, and whether to wrap. Pure — same directive, same line.
 */
export function buildTurnInstruction(directive: Directive): string {
  const focus = categoryList(directive.focusCategories);
  const satisfied = categoryList(directive.satisfiedCategories);
  const pct = Math.round(directive.overallConfidence * 100);
  const tail = `Steer toward: ${focus}. Stop asking about: ${satisfied}. Confidence so far: ${pct}%.`;

  switch (directive.action) {
    case 'greet':
      return `Open warmly and get them talking about one thing they genuinely loved. ${tail}`;
    case 'explore':
      return `Ask about ${directive.category ?? 'a fresh axis'} — ${directive.suggestedLine} ${tail}`;
    case 'followUp':
      return `Do NOT accept the thin answer — dig in: "${directive.suggestedLine}" ${tail}`;
    case 'challenge': {
      const id = directive.contradiction?.id ?? 'unknown';
      return `Gently raise this contradiction (do not accuse), then call acknowledge_contradiction with id "${id}": ${directive.suggestedLine} ${tail}`;
    }
    case 'confirm':
      return `Read a theory back to test it: "${directive.suggestedLine}" ${tail}`;
    case 'wrap':
      return `Ask one last question, then prepare to reveal: "${directive.suggestedLine}" ${tail}`;
    case 'complete':
      return `You have enough. Wrap up warmly and reveal their Verdict DNA. ${tail}`;
    default:
      return tail;
  }
}
