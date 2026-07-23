#!/usr/bin/env node
/**
 * WatchVerdict Search Lab launcher — maps a subcommand to SEARCHLAB_MODE and
 * spawns vitest with the isolated Search Lab config. Dependency-free.
 *
 * Usage: node eval/searchlab/cli.mjs <baseline|gated|compare|regression|holdout>
 */
import { spawnSync } from 'node:child_process';

const [, , cmd = 'compare'] = process.argv;
const env = { ...process.env };

switch (cmd) {
  case 'baseline': env.SEARCHLAB_MODE = 'baseline'; break;
  case 'gated':
  case 'regression':
  case 'holdout': env.SEARCHLAB_MODE = 'gated'; break;
  case 'compare': env.SEARCHLAB_MODE = 'compare'; break;
  default:
    console.error(`Unknown command: ${cmd} (use baseline|gated|compare|regression|holdout)`);
    process.exit(2);
}

const r = spawnSync(
  'npx',
  ['vitest', 'run', '--config', 'eval/searchlab/vitest.searchlab.config.ts'],
  { stdio: 'inherit', env },
);
process.exit(r.status ?? 1);
