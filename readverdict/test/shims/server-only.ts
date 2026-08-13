// No-op shim so modules that `import 'server-only'` remain loadable under the
// Vitest (Node) runner, which has no Next.js server/client boundary.
export {};
