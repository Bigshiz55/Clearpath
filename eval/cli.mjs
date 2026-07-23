#!/usr/bin/env node
/**
 * Dependency-free, cross-platform launcher for the WatchVerdict eval commands.
 * Maps a subcommand to EVAL_* env vars and spawns vitest with the eval config.
 *
 * Usage:
 *   node eval/cli.mjs <command> [--seed N] [--cases N] [--profile scott]
 *                               [--network lifetime] [--intent ...] [--baseline PATH]
 *
 * Commands: smoke standard full stress regression holdout live baseline compare optimize analyze
 */
import { spawnSync } from 'node:child_process';

const [, , cmd = 'smoke', ...rest] = process.argv;

const env = { ...process.env };
let spec = 'eval/runner/run.eval.ts';

switch (cmd) {
  case 'smoke': env.EVAL_MODE = 'smoke'; break;
  case 'standard': env.EVAL_MODE = 'standard'; break;
  case 'full': env.EVAL_MODE = 'full'; break;
  case 'stress': env.EVAL_MODE = 'stress'; break;
  case 'regression':
    env.EVAL_MODE = 'regression';
    env.EVAL_ASSERT = 'regression';
    env.EVAL_BASELINE = env.EVAL_BASELINE || 'evaluation-results/baseline';
    break;
  case 'holdout': env.EVAL_MODE = env.EVAL_MODE || 'full'; env.EVAL_SPLIT = 'holdout'; break;
  case 'live': env.EVAL_LIVE = '1'; env.EVAL_MODE = env.EVAL_MODE || 'smoke'; break;
  case 'baseline': env.EVAL_MODE = env.EVAL_MODE || 'standard'; env.EVAL_SAVE_BASELINE = '1'; break;
  case 'compare':
    env.EVAL_MODE = env.EVAL_MODE || 'standard';
    env.EVAL_BASELINE = env.EVAL_BASELINE || 'evaluation-results/baseline';
    break;
  case 'optimize': spec = 'eval/runner/optimize.eval.ts'; break;
  case 'analyze': spec = 'eval/runner/analyze.eval.ts'; break;
  default:
    console.error(`Unknown command: ${cmd}`);
    process.exit(2);
}

// Pass --flag value pairs straight through as argv (parseOptions reads them).
const passthrough = rest;

const args = ['run', '--config', 'eval/vitest.config.ts', spec, ...(passthrough.length ? ['--', ...passthrough] : [])];
const res = spawnSync('npx', ['vitest', ...args], { stdio: 'inherit', env, shell: process.platform === 'win32' });
process.exit(res.status ?? 1);
