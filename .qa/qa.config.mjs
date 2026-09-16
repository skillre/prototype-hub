/**
 * Prototype Hub · Browser QA configuration — the single source of truth.
 *
 * This file is imported by three consumers:
 *   - `.qa/browser-qa.mjs`   the sweep (and the server it starts)
 *   - `playwright.config.ts` the e2e runner's port/host
 *   - `scripts/check-qa-port.mjs` the pre-flight guard
 *
 * Factory v1.1 rules that live here, and why:
 *
 *   - **The port is pinned, never 3000.** 3000 is Next's default, so a stray
 *     `next dev` or another prototype on this machine would race for it. The Hub
 *     owns 3100 (`catalog/ports.json` records it as `unique` — every other
 *     repository collides on 3200).
 *   - **`reuseExistingServer` is unconditionally false.** Playwright's readiness
 *     probe accepts *any* server that answers 2xx/3xx; it does not check identity.
 *     Adopting a foreign server is how a whole suite goes green against the wrong
 *     page. The port is therefore also checked *before* the runner starts
 *     (`scripts/check-qa-port.mjs`), and the responder's identity is asserted
 *     after (`APP_IDENTITY_SELECTOR`).
 *   - **The server is managed by the run.** Next's dev server auto-increments when
 *     the port is busy, which would leave `baseURL` pointing at someone else —
 *     identity assertion turns that into a loud failure instead of a green lie.
 */

/** QA port. Hub's slot; not 3000, not the 3200 shared by starter / s1 / kits. */
export const QA_PORT = 3100

/** Host the QA server binds to. 127.0.0.1 keeps the dev server off the network. */
export const QA_HOST = "127.0.0.1"

/** Full origin, used as Playwright's `baseURL`. */
export const QA_ORIGIN = `http://${QA_HOST}:${QA_PORT}`

/**
 * Identity of the application under test.
 *
 * The layout renders `data-app-identity="prototype-hub"` on `<html>`. A server
 * that answers 200 but does not carry this marker is **not** this app — the run
 * stops rather than measuring it. Only a marker the app itself renders can prove
 * identity; a status code cannot.
 *
 * Two forms, deliberately: `APP_IDENTITY_MARKER` is what must appear in the
 * bytes of the response (used before a browser exists), while
 * `APP_IDENTITY_SELECTOR` is the CSS selector the browser-side probes use.
 * Checking the response for the *selector text* would never match anything —
 * an identity check that can never pass is as broken as one that always does.
 */
export const APP_IDENTITY = "prototype-hub"
export const APP_IDENTITY_MARKER = `data-app-identity="${APP_IDENTITY}"`
export const APP_IDENTITY_SELECTOR = `html[${APP_IDENTITY_MARKER}]`
export const APP_TITLE = "智悟云 · Prototype Lab"

/**
 * Routes to sweep.
 *
 * `null` means "discover every route from `app/`" — the default, so this file
 * never accumulates a hand-written route list. Dynamic segments cannot be
 * discovered statically; add the concrete paths under `extraRoutes`.
 *
 * @type {{ path: string, status: number, label?: string }[] | null}
 */
export const routes = null

/** Routes that exist but cannot be discovered from the filesystem. */
export const extraRoutes = [
  {
    path: "/this-route-does-not-exist",
    status: 404,
    label: "not-found",
  },
]

/** Routes deliberately excluded from the sweep. */
export const excludeRoutes = []

/** Viewports every route is swept at. */
export const viewports = [
  { name: "desktop", width: 1440, height: 900, mobile: false, touch: false },
  { name: "mobile", width: 390, height: 844, mobile: true, touch: true },
]

/**
 * Colour schemes. The Hub ships one scheme (warm paper + ink) and does **not**
 * implement `prefers-color-scheme`, so sweeping a dark theme would only measure
 * the same rendering twice. That is a fact about this product, not an oversight:
 * `docs/browser-qa.md` states what the matrix does and does not cover.
 */
export const colorSchemes = ["light"]

/**
 * Motion modes. `reduced` matters because the content reveal is what breaks
 * first: an interrupted IntersectionObserver leaves panels at `opacity: 0`, and
 * the page still looks fine to anything that only reads the DOM.
 */
export const motionModes = ["default", "reduced"]

/** Milliseconds to settle after navigation before measuring. */
export const settleMs = 450

/** Tolerance in CSS pixels. The only slack: scrollbars and sub-pixel rounding. */
export const tolerancePx = 1

/** Fail the run if any numeric probe cannot be measured. Always leave on. */
export const failOnUnmeasurableProbe = true

/** Where screenshots and the machine-readable report land (gitignored). */
export const outDir = ".qa/out"

/**
 * The command that starts the app under test. Overridable so a run can pin a
 * production build (`pnpm start`) without editing this file.
 */
export const serverCommand = `pnpm dev --hostname ${QA_HOST} --port ${QA_PORT}`
