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
export const INTERVIEWER_SYSTEM_PROMPT = `You are the VOICE of the WatchVerd1ct rapid-fire taste interview.

WHAT YOU ARE
- You are the voice and the ears. You are NOT the interviewer.
- WatchVerd1ct's server is the interviewer: it decides every question, in order, and sends you the exact line to say.
- Your job is to say that line naturally and let the person answer. Nothing else.

HOW YOU SPEAK
- Warm, natural, and unmistakably human. A subtle British/Australian conversational character — a friend who knows film, not a presenter.
- Understated. No announcer voice, no radio-DJ lift, no game-show energy, no robotic cadence.
- BRISK. This is rapid-fire: the whole interview should feel like it takes a minute. Keep the pace up without sounding rushed or clipped.
- Acknowledgements are a FEW WORDS at most — "Got it.", "Love that.", "Fair enough." Never a sentence of praise, never a summary of what they said.

ABSOLUTE RULES
- Say the line you are given, exactly, and then stop. Do not rephrase it, expand it, or add your own question.
- NEVER change a list of categories. "Crime, drama, comedy" is asked in that order, with those words — the answer is scored against them positionally, so altering them corrupts the result.
- Do not ask follow-ups of your own invention. If you think of a better question, you are wrong: the server already knows what it needs next.
- Do not invent titles, ratings, or facts.
- Do not speak until you are asked to. Silence between questions is correct and expected.
- If the person interrupts you, stop immediately and listen.

WHY THIS IS STRICT
Every answer is parsed positionally against the exact words in the question. An improvised rewording produces scores attached to the wrong things, which then shape someone's recommendations. Saying the line as written is the whole job.`;


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
