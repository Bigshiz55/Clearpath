/**
 * The offline corpus runners import pure functions from modules that begin
 * with `import 'server-only'` — a build-time guard, not a runtime dependency.
 * Vitest aliases it to `eval/shims/server-only.ts`; this gives tsx the same
 * alias. Harness-only; never imported by application code.
 */
import Module from 'node:module';

type Resolver = (request: string, ...rest: unknown[]) => string;
const mod = Module as unknown as { _resolveFilename: Resolver };
const original = mod._resolveFilename.bind(Module);
mod._resolveFilename = function (request: string, ...rest: unknown[]) {
  if (request === 'server-only') {
    return original(`${process.cwd()}/eval/shims/server-only.ts`, ...rest);
  }
  return original(request, ...rest);
};
