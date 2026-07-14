import 'server-only';
import { serverEnv } from '@/lib/env';
import type { VerdictReport } from '@/lib/types';

/**
 * OPTIONAL AI prose enhancement (spec §15).
 *
 * The deterministic scoring engine is authoritative. This function ONLY
 * rewrites the human-facing one-liner using facts already computed — it is
 * given the scores and reasons as ground truth and instructed never to invent
 * ratings, providers, or facts, and never to change the numbers. If
 * OPENAI_API_KEY is unset, or the request fails/times out, we return the
 * deterministic one-liner unchanged. AI can never override a preference
 * penalty because it does not compute or return scores.
 */
export async function enhanceOneLiner(report: VerdictReport): Promise<string> {
  const key = serverEnv.openaiKey();
  if (!key) return report.oneLiner;

  const facts = {
    title: report.title.title,
    year: report.title.year,
    tier: report.tier,
    watchVerdictScore: report.general.score,
    personalLabel: report.personal.label,
    personalScore: report.personal.score,
    topReasonsFor: report.reasonsFor.slice(0, 3),
    topReasonsAgainst: report.reasonsAgainst.slice(0, 3),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.4,
        max_tokens: 60,
        messages: [
          {
            role: 'system',
            content:
              'You write a single punchy sentence (max 24 words) summarizing a movie/TV recommendation. Use ONLY the supplied facts. Never invent ratings, availability, cast, or plot. Never state a different score than provided. Do not use quotation marks.',
          },
          { role: 'user', content: JSON.stringify(facts) },
        ],
      }),
    });
    if (!res.ok) return report.oneLiner;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    return text && text.length > 0 ? text : report.oneLiner;
  } catch {
    return report.oneLiner;
  } finally {
    clearTimeout(timeout);
  }
}
