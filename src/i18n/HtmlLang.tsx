'use client';

import { useEffect } from 'react';

/**
 * Syncs `<html lang>` to the active UI locale on the client. The root layout
 * stays statically `lang="en"` (so marketing pages remain static); once inside
 * the authenticated app we set the correct document language for accessibility
 * and browser features (hyphenation, voice, translate prompts). Renders nothing.
 */
export function HtmlLang({ lang }: { lang: string }) {
  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.lang = lang;
  }, [lang]);
  return null;
}
