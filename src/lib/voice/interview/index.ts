/**
 * VOICE INTERVIEW — public surface.
 *
 * The pure, deterministic conversation engine: types, categories, confidence,
 * memory, contradictions, follow-ups, the topic planner, the phase machine, the
 * director/orchestrator, the DNA reveal, the preference bridge, and the Realtime
 * prompt surface. Everything here is unit-testable without a key, a network, or
 * a database.
 */
export * from './types';
export * from './categories';
export * from './confidence';
export * from './memory';
export * from './contradiction';
export * from './followup';
export * from './planner';
export * from './stateMachine';
export * from './director';
export * from './reveal';
export * from './dnaUpdate';
export * from './prompts';

// The rapid-fire staged script (stages 1–4) that drives the product interview,
// plus its mock transport. Feeds the same signals/confidence/DNA pipeline above.
export * from './script/questionBank';
export * from './script/numberParse';
export * from './script/scriptedInterview';
export * from './script/simulate';
