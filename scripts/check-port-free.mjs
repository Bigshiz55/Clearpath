#!/usr/bin/env node
// Preflight for the mobile Playwright suite. `webServer.reuseExistingServer`
// is disabled for CI/agent runs (see playwright.mobile.config.ts) so a stray
// process left on the port would otherwise make Playwright spawn a second
// `npm start` that fails to bind — reported as an opaque webServer timeout.
// This fails fast, before any build work happens, and names the PID (when
// discoverable) so it can be killed instead of guessed at.
//
// Deliberately does NOT use `lsof -i` to detect the listening socket: in this
// project's sandboxed environments `lsof -i`/`lsof -ti` silently reports no
// match even while a process is genuinely bound to the port (confirmed with
// `fuser` and a real connect both seeing it). A live TCP connect attempt is
// the actual ground truth and works everywhere; `fuser` is used only as a
// best-effort way to name the PID in the error message.
import net from 'node:net';
import { execFileSync } from 'node:child_process';

const port = Number(process.argv[2]);
if (!port) {
  console.error('check-port-free.mjs: no port given');
  process.exit(1);
}

function isOccupied(p) {
  return new Promise((resolve) => {
    const socket = net.connect({ port: p, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.setTimeout(2000, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function pidsFor(p) {
  try {
    return execFileSync('fuser', [`${p}/tcp`], { encoding: 'utf8' })
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .join(', ');
  } catch {
    return null;
  }
}

const occupied = await isOccupied(port);
if (occupied) {
  const pids = pidsFor(port);
  console.error(
    `Port ${port} is already in use${pids ? ` (PID ${pids})` : ''}. The mobile ` +
      `suite no longer reuses an existing server in CI/agent runs — kill it first` +
      `${pids ? `, e.g.:\n  kill ${pids}` : '.'}`,
  );
  process.exit(1);
}
