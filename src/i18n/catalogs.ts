import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { SUPPORTED_LOCALES, type UiLocale } from './config';
import type { Messages } from './translate';
import en from '../../messages/en-US.json';
import es from '../../messages/es-419.json';
import zh from '../../messages/zh-Hans.json';

function deepMerge(a: Messages, b: Messages): Messages {
  for (const k of Object.keys(b)) {
    const bv = b[k];
    if (bv && typeof bv === 'object' && !Array.isArray(bv)) {
      a[k] = deepMerge((a[k] as Messages) ?? {}, bv as Messages);
    } else a[k] = bv;
  }
  return a;
}

/**
 * Merge the base catalogs with every per-namespace part in `messages/parts/*.json`
 * (each shaped `{ "en-US": {...}, "es-419": {...}, "zh-Hans": {...} }`). Parts let
 * screen-by-screen extraction land in isolated files with no merge conflicts on
 * the base catalogs while still resolving as one merged catalog per locale.
 */
export function buildCatalogs(): Record<UiLocale, Messages> {
  const merged: Record<UiLocale, Messages> = {
    'en-US': structuredClone(en) as Messages,
    'es-419': structuredClone(es) as Messages,
    'zh-Hans': structuredClone(zh) as Messages,
  };
  try {
    const dir = path.join(process.cwd(), 'messages', 'parts');
    if (fs.existsSync(dir)) {
      for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
        const part = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as Record<string, Messages>;
        for (const loc of SUPPORTED_LOCALES) {
          if (part[loc]) deepMerge(merged[loc], part[loc]);
        }
      }
    }
  } catch {
    /* parts are optional; base catalogs always work */
  }
  return merged;
}

export const CATALOGS = buildCatalogs();
export const ENGLISH_MESSAGES = CATALOGS['en-US'];
