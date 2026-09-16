import { defineConfig, devices } from "@playwright/test"

import { QA_HOST, QA_ORIGIN, QA_PORT } from "./.qa/qa.config.mjs"

/**
 * Playwright config — Factory v1.1 port isolation.
 *
 * WHAT WAS WRONG BEFORE
 * ---------------------
 * This file used to pin the port as a local constant and set
 * `reuseExistingServer: !process.env.CI`. That combination has a specific
 * failure mode: Playwright's readiness probe is a plain HTTP GET whose success
 * condition is `200 <= status < 404`, and when it succeeds while
 * `reuseExistingServer` is truthy, Playwright returns immediately **without
 * checking that the responder is this app**. On a machine that runs several
 * prototypes, a stale dev server — or a sibling prototype — answering `/` would
 * be adopted as the app under test, and the whole suite could go green against
 * the wrong page. Port 3000 (Next's default) made that likely; a pinned 3100
 * makes it rarer, not impossible.
 *
 * Factory v1.1 therefore:
 *   - takes the port from one source of truth (`QA_PORT` in `.qa/qa.config.mjs`),
 *     which the QA sweep and the pre-flight guard also read;
 *   - binds the dev server explicitly to that host and port, so Next can never
 *     auto-increment to 3101 while `baseURL` still points at 3100;
 *   - sets `reuseExistingServer: false` **unconditionally** — not
 *     `!process.env.CI` — so the server is always started and stopped by this
 *     run, and teardown can only ever kill a process we own;
 *   - leaves an occupied port to `scripts/check-qa-port.mjs` (wired into
 *     `pnpm test`), which fails loudly and names how to inspect the holder
 *     instead of letting Playwright hang for 180s;
 *   - relies on a spec-level identity assertion
 *     (`html[${APP_IDENTITY_SELECTOR}]`) so "a 200 answered" is never mistaken
 *     for "this app answered".
 *
 * Run it through `pnpm test` so the guard executes first; running
 * `pnpm exec playwright test` directly skips the guard (Playwright still refuses
 * to reuse, it just reports less helpfully).
 */

const DEV_COMMAND = `pnpm dev --hostname ${QA_HOST} --port ${QA_PORT}`

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"]],
  use: {
    baseURL: QA_ORIGIN,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: DEV_COMMAND,
    // Readiness only. Points at `/`, which always exists.
    url: `${QA_ORIGIN}/`,
    // Never adopt an existing server. Not `!process.env.CI` — always false.
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
