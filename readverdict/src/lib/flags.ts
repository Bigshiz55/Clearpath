// Feature flags. Read at runtime from env so they can be toggled per deployment
// without a rebuild. Defaults are safe (real providers on, unbuilt features off).

function bool(name: string, def = false): boolean {
  const v = process.env[name];
  if (v == null || v.trim() === '') return def;
  return /^(1|true|yes|on)$/i.test(v.trim());
}

export const flags = {
  /** Force the mock provider even when Open Library is reachable (offline/dev). */
  get forceMockProvider() {
    return bool('READVERDICT_FORCE_MOCK', false);
  },
  /** Enable the (future) LLM free-text interview parsing. Requires OPENAI_API_KEY. */
  get aiInterviewParsing() {
    return bool('READVERDICT_AI_INTERVIEW', false);
  },
  /** Show the internal style guide route in navigation. */
  get showStyleGuide() {
    return bool('READVERDICT_SHOW_STYLEGUIDE', false);
  },
};
