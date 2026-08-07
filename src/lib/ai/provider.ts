import 'server-only';
import { serverEnv } from '@/lib/env';
import { createAnthropicProvider } from './anthropic';
import type { AiProvider } from './types';

/**
 * THE PROVIDER FACTORY. Reads AI_PROVIDER and returns the configured provider,
 * or null when the provider has no credentials / isn't wired. This is the ONLY
 * place that decides which vendor answers; every other module depends on the
 * AiProvider interface. Making the app use a different vendor later is a change
 * here plus one new adapter — nothing in Finder/Ask/schema/validation/tools/DNA
 * moves (§1, §20).
 */
export function getAiProvider(): AiProvider | null {
  switch (serverEnv.aiProvider()) {
    case 'anthropic':
      return createAnthropicProvider();
    // 'openai' and other providers are a future adapter — deliberately not
    // implemented yet. Returning null makes discovery degrade safely rather than
    // pretend a provider exists.
    default:
      return null;
  }
}
