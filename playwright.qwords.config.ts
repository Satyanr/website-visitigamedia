import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/qwords-e2e',
  testMatch: '**/*.e2e.ts',
  workers: 1,
  timeout: 60_000,
  reporter: 'list',
  use: { baseURL: 'https://qwords-stage.example.test', trace: 'retain-on-failure', ...devices['Desktop Chrome'] },
  webServer: {
    command: 'php -S 127.0.0.1:4186 -t artifacts/qwords/public_html tests/qwords/browser-router.php',
    url: 'http://127.0.0.1:4186/id/',
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'ignore',
    env: { ...process.env },
  },
});
