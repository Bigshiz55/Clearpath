/**
 * `import 'server-only'` throws in any non-RSC context (a plain node/vitest
 * process). The eval framework only imports PURE production modules today, but
 * this shim lets live-mode/rankByDna paths load their server-only dependencies
 * under vitest without triggering that guard. Aliased in via the vitest config.
 * It is intentionally a no-op — it does NOT grant browser access to secrets;
 * the eval never bundles for the client.
 */
export {};
