import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  use: { launchOptions: { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' } },
});
