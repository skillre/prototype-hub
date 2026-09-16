/**
 * The sweep — one implementation, used by local QA and by online QA.
 *
 * There is deliberately no second set of probes for "remote": the only
 * differences between a local run and an online run are the origin and the
 * request headers. A remote sweep with its own assertions would be a second
 * source of truth, and the two would drift the moment one of them is improved.
 *
 * What is measured, per route × viewport × motion mode:
 *   1. HTTP status matches what the route is expected to answer
 *   2. **identity** — the responder really is this app (`data-app-identity`)
 *   3. zero console errors, page errors and failed requests
 *   4. the registry matches the catalog projection: every projected project
 *      appears exactly once, clickability matches, and no rendered link points
 *      anywhere the projection did not authorise
 *   5. featured panels are revealed (`opacity: 1`) and their images decoded
 *   6. no viewport expansion and no horizontal overflow (three conditions)
 *
 * Anything that cannot be measured is a failure, not a pass — see probe-guard.
 */

import { readdirSync, statSync } from "node:fs"
import path from "node:path"

import { createProbeCollector } from "./probe-guard.mjs"

/* -------------------------------------------------------------------------- */
/* route discovery                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Discover routes from `app/`.
 *
 * Dynamic segments cannot be enumerated statically, so they are *reported as
 * not swept* rather than skipped in silence — an unreported gap is the same
 * thing as a claim that there is no gap.
 */
export function discoverRoutes(repoRoot) {
  const routes = []
  const skipped = []
  const appDir = path.join(repoRoot, "app")

  const walk = (dir, segments) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const absolute = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === "api" || entry.name.startsWith("_")) continue
        if (entry.name.startsWith("[")) {
          skipped.push({ reason: "dynamic-segment", path: `${segments.join("/")}/${entry.name}` })
          continue
        }
        // Route groups `(group)` do not contribute a path segment.
        const next = entry.name.startsWith("(") ? segments : [...segments, entry.name]
        walk(absolute, next)
        continue
      }
      if (entry.name !== "page.tsx" && entry.name !== "page.ts") continue
      const url = segments.length === 0 ? "/" : `/${segments.join("/")}`
      routes.push({ path: url, status: 200, label: "page" })
    }
  }

  if (statSync(appDir, { throwIfNoEntry: false })) walk(appDir, [])
  return { routes, skipped }
}

/* -------------------------------------------------------------------------- */
/* the sweep                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * @param {object} options
 * @param {import("@playwright/test").Browser} options.browser
 * @param {string} options.origin
 * @param {{path: string, status: number, label?: string}[]} options.routes
 * @param {object[]} options.viewports
 * @param {string[]} options.colorSchemes
 * @param {string[]} options.motionModes
 * @param {string} options.outDir
 * @param {{ identitySelector: string, appTitle: string }} options.identity
 * @param {{ prototypeCount: number, clickableHrefs: string[], ids: string[] }} options.expectations
 * @param {Record<string, string>} [options.extraHeaders]
 * @param {number} options.tolerancePx
 * @param {number} options.settleMs
 * @param {(message: string) => void} [options.log]
 */
export async function runSweep({
  browser,
  origin,
  routes,
  viewports,
  colorSchemes,
  motionModes,
  outDir,
  identity,
  expectations,
  extraHeaders = {},
  tolerancePx,
  settleMs,
  log = () => {},
}) {
  const problems = []
  const guard = createProbeCollector(problems)
  const report = { origin, routes: [], problems, skipped: [] }

  const allowedHrefs = new Set(expectations.clickableHrefs)

  for (const route of routes) {
    const routeReport = {
      path: route.path,
      expectedStatus: route.status,
      combinations: [],
    }

    for (const viewport of viewports) {
      for (const colorScheme of colorSchemes) {
        for (const motion of motionModes) {
          const label = `${route.path} · ${viewport.name} · ${colorScheme} · motion:${motion}`
          log(`  → ${label}`)

          const context = await browser.newContext({
            viewport: { width: viewport.width, height: viewport.height },
            isMobile: viewport.mobile,
            hasTouch: viewport.touch,
            deviceScaleFactor: 2,
            colorScheme,
            reducedMotion: motion === "reduced" ? "reduce" : "no-preference",
            extraHTTPHeaders: extraHeaders,
          })

          const consoleErrors = []
          const pageErrors = []
          const failedRequests = []
          const badResponses = []
          const page = await context.newPage()
          page.on("console", (message) => {
            if (message.type() === "error") consoleErrors.push(message.text())
          })
          page.on("pageerror", (error) => pageErrors.push(String(error)))
          page.on("requestfailed", (request) =>
            failedRequests.push(`${request.url()} :: ${request.failure()?.errorText}`),
          )
          // Responses with an error status are tracked separately from console
          // noise: a 404 route legitimately logs one console error for its own
          // document, but a missing *asset* on that page is still a defect.
          page.on("response", (response) => {
            if (response.status() >= 400) {
              badResponses.push({ url: response.url(), status: response.status() })
            }
          })

          const measurement = { label, route: route.path, viewport: viewport.name, colorScheme, motion }

          try {
            const response = await page.goto(`${origin}${route.path}`, { waitUntil: "load" })
            const status = response?.status() ?? null
            measurement.status = status
            if (status !== route.status) {
              problems.push(`${label}: HTTP ${status}，期望 ${route.status}`)
            }

            // 2 — identity. Only the app's own marker can prove who answered.
            const identityCount = await page.locator(identity.identitySelector).count()
            measurement.identity = identityCount
            if (identityCount !== 1) {
              problems.push(
                `${label}: 页面里 ${identity.identitySelector} 出现 ${identityCount} 次（应为 1 次）——` +
                  `无法证明这就是本应用`,
              )
            }
            const title = await page.title()
            measurement.title = title
            if (title !== identity.appTitle) {
              problems.push(`${label}: 标题是「${title}」，期望「${identity.appTitle}」`)
            }

            // 3 — console / page / request health
            await page.waitForTimeout(settleMs)

            if (route.status === 200) {
              await measureRegistry({ page, guard, problems, label, expectations, allowedHrefs, measurement })
              await measureLayout({ page, guard, problems, label, viewport, tolerancePx, measurement })
            }

            // screenshots: evidence for a human, not an assertion
            const shot = path.join(outDir, `${slug(route.path)}-${viewport.name}-${motion}.png`)
            await page.screenshot({ path: shot })
            measurement.screenshot = shot

            if (route.status === 200) {
              const registry = page.locator("#registry")
              if ((await registry.count()) === 1) {
                await registry.screenshot({
                  path: path.join(outDir, `${slug(route.path)}-${viewport.name}-${motion}-registry.png`),
                })
              }
            }
          } catch (error) {
            problems.push(`${label}: 扫描抛出异常 —— ${error.message}`)
            measurement.error = error.message
          }

          measurement.consoleErrors = consoleErrors
          measurement.pageErrors = pageErrors
          measurement.failedRequests = failedRequests
          measurement.badResponses = badResponses

          // The document's own non-2xx status is expected on a route like the 404
          // page; it shows up in the console as a failed-resource error. Anything
          // *else* that 404s on that page is a real problem and is reported below.
          const documentUrl = `${origin}${route.path}`
          const expectedDocumentFailure =
            route.status >= 400 ? [documentUrl, `${documentUrl}/`] : []
          const unexpectedConsoleErrors = consoleErrors.filter((text) => {
            if (expectedDocumentFailure.length === 0) return true
            return !/Failed to load resource/.test(text)
          })
          measurement.filteredConsoleErrors = consoleErrors.length - unexpectedConsoleErrors.length

          if (unexpectedConsoleErrors.length > 0) {
            problems.push(`${label}: 控制台报错 → ${unexpectedConsoleErrors.join(" | ")}`)
          }
          if (pageErrors.length > 0) {
            problems.push(`${label}: 页面异常 → ${pageErrors.join(" | ")}`)
          }
          if (failedRequests.length > 0) {
            problems.push(`${label}: 请求失败 → ${failedRequests.join(" | ")}`)
          }
          const unexpectedResponses = badResponses.filter(
            (entry) =>
              entry.url !== documentUrl &&
              !expectedDocumentFailure.some((expected) => entry.url.startsWith(expected)),
          )
          if (unexpectedResponses.length > 0) {
            problems.push(
              `${label}: 有资源返回错误状态 → ${unexpectedResponses
                .map((entry) => `${entry.status} ${entry.url}`)
                .join(" | ")}`,
            )
          }

          routeReport.combinations.push(measurement)
          await context.close()
        }
      }
    }

    report.routes.push(routeReport)
  }

  report.problems = problems
  return report
}

/* -------------------------------------------------------------------------- */
/* checks                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The registry must be the projection, rendered.
 *
 * This is the check that would have caught the failure this whole change exists
 * for: a hand-written entry claiming a deployment that no longer serves. Here
 * the page is compared against the generated artifact — count, ids, clickability
 * and every external href.
 */
async function measureRegistry({ page, guard, problems, label, expectations, allowedHrefs, measurement }) {
  const rendered = await page.$$eval("[data-prototype]", (nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute("data-prototype"),
      clickable: node.getAttribute("data-clickable") === "true",
    })),
  )
  measurement.registry = rendered

  guard.tryNonZero(rendered.length, `${label}: 页面上 registry 条目数`)
  if (rendered.length !== expectations.prototypeCount) {
    problems.push(
      `${label}: 页面渲染 ${rendered.length} 个条目，catalog 投影是 ${expectations.prototypeCount} 个`,
    )
  }

  const ids = rendered.map((entry) => entry.id)
  for (const expected of expectations.ids) {
    const occurrences = ids.filter((id) => id === expected).length
    if (occurrences !== 1) {
      problems.push(`${label}: 投影条目 ${expected} 在页面上出现 ${occurrences} 次（应为 1 次）`)
    }
  }
  for (const id of ids) {
    if (!expectations.ids.includes(id)) {
      problems.push(`${label}: 页面出现了投影里没有的条目 ${id} —— 手写数据又回来了`)
    }
  }

  const externalHrefs = await page.$$eval('a[href^="http"]', (nodes) =>
    Array.from(new Set(nodes.map((node) => node.getAttribute("href")))),
  )
  measurement.externalHrefs = externalHrefs

  for (const href of externalHrefs) {
    if (!allowedHrefs.has(href)) {
      problems.push(
        `${label}: 页面上有一个外部链接 ${href}，但 catalog 投影里没有任何条目记录过这个地址 —— ` +
          `不是死链接就是猜出来的地址`,
      )
    }
  }

  const clickableOnPage = rendered.filter((entry) => entry.clickable).length
  measurement.clickableOnPage = clickableOnPage
  if (clickableOnPage !== expectations.clickableHrefs.length) {
    problems.push(
      `${label}: 页面上可点击条目 ${clickableOnPage} 个，投影里是 ${expectations.clickableHrefs.length} 个`,
    )
  }
  if (externalHrefs.length !== expectations.clickableHrefs.length) {
    problems.push(
      `${label}: 页面上外部链接 ${externalHrefs.length} 个，投影里只有 ${expectations.clickableHrefs.length} 个公开地址`,
    )
  }
}

/**
 * Layout: revealed panels, decoded images, and no viewport expansion.
 *
 * The overflow check has **three** conditions on purpose. Chromium expands the
 * layout viewport to fit overflowing content, so comparing `scrollWidth` with
 * `innerWidth` alone reports "no overflow" on a page that is laid out for a width
 * nobody has. The requested width has to be in the comparison too.
 */
async function measureLayout({ page, guard, problems, label, viewport, tolerancePx, measurement }) {
  const boards = page.locator("#registry article")
  const boardCount = await boards.count()
  measurement.boardCount = boardCount

  for (let index = 0; index < boardCount; index += 1) {
    const board = boards.nth(index)
    await board.scrollIntoViewIfNeeded()

    const panel = board.locator("div[class*='aspect']").first()
    const panelBox = await panel.boundingBox()
    if (!panelBox) {
      problems.push(`${label}: 第 ${index + 1} 块展板的图像位没有尺寸`)
      continue
    }

    // The reveal is a transition, not a state: measuring once right after the
    // scroll catches it mid-animation (opacity ≈ 0.03). Poll until it settles,
    // and report the value it settled on — that is what a visitor would see.
    const opacity = await waitForReveal(panel, 3_000)
    measurement[`board${index + 1}Opacity`] = opacity
    if (opacity !== "1") {
      problems.push(
        `${label}: 第 ${index + 1} 块展板滚进视口后 opacity=${opacity}（应已揭示）——` +
          `动画可能静默失效，内容其实是空的`,
      )
    }

    guard.tryRatio(
      panelBox.width / panelBox.height,
      1.6,
      0.05,
      `${label}: 第 ${index + 1} 块展板图像位比例`,
    )

    const image = board.locator("img").first()
    const imageState = await image.evaluate((img) => ({
      naturalWidth: img.naturalWidth,
      complete: img.complete,
    }))
    guard.tryNonZero(imageState.naturalWidth, `${label}: 第 ${index + 1} 块展板缩略图解码宽度`)
    if (!imageState.complete) {
      problems.push(`${label}: 第 ${index + 1} 块展板缩略图没有加载完成`)
    }
  }

  const overflow = await page.evaluate(() => {
    const before = window.scrollX
    window.scrollTo(9999, 0)
    const after = window.scrollX
    window.scrollTo(0, 0)
    return {
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      scrollXAfterScrollTo: after,
      scrollXBefore: before,
    }
  })
  measurement.overflow = overflow

  const innerWidth = guard.try(overflow.innerWidth, `${label}: window.innerWidth`)
  if (innerWidth !== null) {
    const expansion = Math.abs(innerWidth - viewport.width)
    if (expansion > tolerancePx) {
      problems.push(
        `${label}: 布局视口被扩张到 ${innerWidth}px（请求 ${viewport.width}px）—— ` +
          `页面按一个用户并不存在的宽度排版`,
      )
    }
  }

  const scrollWidth = guard.try(overflow.scrollWidth, `${label}: documentElement.scrollWidth`)
  if (scrollWidth !== null && scrollWidth > viewport.width + tolerancePx) {
    problems.push(`${label}: 横向溢出 ${scrollWidth - viewport.width}px（scrollWidth ${scrollWidth}）`)
  }

  const scrollX = guard.try(overflow.scrollXAfterScrollTo, `${label}: scrollTo(9999) 之后的 scrollX`)
  if (scrollX !== null && Math.abs(scrollX) > tolerancePx) {
    problems.push(`${label}: 可以横向滚动到 ${scrollX}px —— 存在真实溢出`)
  }

  if (overflow.innerWidth > viewport.width + tolerancePx) {
    // The most useful artefact when this fires: which elements are out of bounds.
    const offenders = await page.evaluate(
      (width) =>
        Array.from(document.querySelectorAll("body *"))
          .map((element) => ({ element, rect: element.getBoundingClientRect() }))
          .filter(({ rect }) => rect.width > 0 && (rect.right > width + 1 || rect.left < -1))
          .slice(0, 8)
          .map(
            ({ element, rect }) =>
              `${element.tagName.toLowerCase()}.${String(element.className).slice(0, 50)} → ${Math.round(rect.left)}..${Math.round(rect.right)}`,
          ),
      viewport.width,
    )
    measurement.offenders = offenders
    if (offenders.length > 0) {
      problems.push(`${label}: 越界元素 → ${offenders.join(" | ")}`)
    }
  }
}

function slug(routePath) {
  return routePath === "/" ? "home" : routePath.replace(/^\//, "").replace(/[^a-z0-9-]/gi, "-")
}

/**
 * Poll a panel's computed opacity until it reaches 1 or the budget runs out.
 *
 * Returns the last value observed, so the caller reports what actually happened
 * rather than what it hoped for: a panel stuck at 0 and a panel still
 * transitioning both come back as their true value.
 */
async function waitForReveal(panel, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let value = await panel.evaluate((el) => getComputedStyle(el).opacity)
  while (Number.parseFloat(value) < 1 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100))
    value = await panel.evaluate((el) => getComputedStyle(el).opacity)
  }
  return value
}

/* -------------------------------------------------------------------------- */
/* projection expectations                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Read the expectations straight out of the generated artifact — not from the
 * TypeScript module the page imports. If the two disagree, the artifact is the
 * one that was verified against the control root, so the sweep must judge the
 * page against that.
 */
export function expectationsFromProjection(artifact) {
  const projects = artifact?.projects ?? []
  return {
    prototypeCount: projects.length,
    ids: projects.map((project) => project.id),
    clickableHrefs: projects
      .map((project) => project.deployment?.publicUrl ?? null)
      .filter((href) => typeof href === "string"),
  }
}
