#!/usr/bin/env node
/**
 * Browser QA — `pnpm qa`.
 *
 * A quality gate, not a screenshot script: it starts **its own** server on the
 * pinned port (3100), proves the responder is this application, sweeps every
 * route × viewport × motion mode with the probes in `.qa/sweep.mjs`, writes
 * screenshots and a machine-readable report, and exits non-zero if anything
 * could not be measured or did not match.
 *
 * It never reuses an existing server (`reuseExistingServer` is false in
 * playwright.config.ts for the same reason, and `scripts/check-qa-port.mjs`
 * refuses to start when the port is occupied). Adopting a foreign server is how
 * a suite goes green against the wrong page — the failure mode this Factory was
 * created to stop.
 *
 * Usage:
 *   node .qa/browser-qa.mjs                       # start a server, sweep, stop it
 *   node .qa/browser-qa.mjs --base-url=<url>      # sweep an origin that is already up
 *   node .qa/browser-qa.mjs --routes=/           # sweep a subset
 *   node .qa/browser-qa.mjs --json                # machine-readable summary on stdout
 *
 * Exit: 0 all checks passed · 1 problems found · 2 could not run (port busy, wrong server…)
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { chromium } from "@playwright/test"

import {
  APP_IDENTITY_MARKER,
  APP_IDENTITY_SELECTOR,
  APP_TITLE,
  QA_HOST,
  QA_ORIGIN,
  QA_PORT,
  colorSchemes,
  excludeRoutes,
  extraRoutes,
  motionModes,
  outDir as defaultOutDir,
  routes as configuredRoutes,
  serverCommand,
  settleMs,
  tolerancePx,
  viewports,
} from "./qa.config.mjs"
import {
  PortInUseError,
  WrongServerError,
  portInUseMessage,
  startManagedServer,
} from "./qa-server.mjs"
import { discoverRoutes, expectationsFromProjection, runSweep } from "./sweep.mjs"

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const EXIT = { OK: 0, PROBLEMS: 1, UNVERIFIED: 2 }

const argv = process.argv.slice(2)
const flags = new Map()
for (let index = 0; index < argv.length; index += 1) {
  const token = argv[index]
  if (!token.startsWith("--")) continue
  const [name, inline] = token.slice(2).split("=")
  if (inline !== undefined) flags.set(name, inline)
  else if (argv[index + 1] && !argv[index + 1].startsWith("--")) {
    flags.set(name, argv[index + 1])
    index += 1
  } else flags.set(name, true)
}

const asJson = flags.get("json") === true
const outDir = path.resolve(REPO_ROOT, String(flags.get("out") ?? defaultOutDir))
const remoteBaseUrl = typeof flags.get("base-url") === "string" ? String(flags.get("base-url")) : null
const origin = remoteBaseUrl ?? QA_ORIGIN

const line = (text = "") => {
  if (!asJson) process.stdout.write(`${text}\n`)
}

/* -------------------------------------------------------------------------- */
/* route list                                                                  */
/* -------------------------------------------------------------------------- */

const discovered = discoverRoutes(REPO_ROOT)
let routes = configuredRoutes ?? discovered.routes
if (typeof flags.get("routes") === "string") {
  const wanted = String(flags.get("routes"))
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
  routes = routes.filter((route) => wanted.includes(route.path))
}
if (configuredRoutes === null) {
  // Discovered routes plus the ones that cannot be discovered from the
  // filesystem (the 404 route is the useful one here: it is a real page of this
  // product, and nothing else exercises it).
  routes = [
    ...routes,
    ...extraRoutes.filter((route) => !routes.some((entry) => entry.path === route.path)),
  ]
}
routes = routes.filter((route) => !excludeRoutes.includes(route.path))

if (routes.length === 0) {
  process.stderr.write(
    "没有可扫描的路由 —— 0-scan 不能判 PASS。检查 app/ 下的 page 文件与 .qa/qa.config.mjs 的 routes。\n",
  )
  process.exit(EXIT.UNVERIFIED)
}

const artifact = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "lib/generated/factory-catalog.json"), "utf8"),
)
const expectations = expectationsFromProjection(artifact)

/* -------------------------------------------------------------------------- */
/* run                                                                         */
/* -------------------------------------------------------------------------- */

line("")
line("\u001b[1mPrototype Hub · Browser QA\u001b[0m")
line(`  origin     ${origin}${remoteBaseUrl ? "（外部 origin：本进程不管理 server）" : "（本进程自管 server）"}`)
line(`  端口常量   ${QA_HOST}:${QA_PORT}（唯一来源 .qa/qa.config.mjs）`)
line(`  路由       ${routes.map((route) => `${route.path}→${route.status}`).join(", ")}`)
for (const skipped of discovered.skipped) {
  line(`  ⚠ 未覆盖   ${skipped.path}（${skipped.reason}）—— 未扫描，不代表通过`)
}
line(
  `  矩阵       ${viewports.length} 视口 × ${colorSchemes.length} 配色 × ${motionModes.length} 动效模式 × ${routes.length} 路由`,
)
line(`  投影期望   ${expectations.prototypeCount} 个条目 · ${expectations.clickableHrefs.length} 个公开地址`)
line("")

mkdirSync(outDir, { recursive: true })

let server = null
let report = null
let exitCode = EXIT.OK

try {
  if (!remoteBaseUrl) {
    server = await startManagedServer({
      host: QA_HOST,
      port: QA_PORT,
      origin: QA_ORIGIN,
      command: String(flags.get("server-command") ?? serverCommand),
      identityMarker: APP_IDENTITY_MARKER,
    })
    line(`  ✓ server 已就绪，且身份校验通过（${APP_IDENTITY_MARKER}）`)
    line("")
  }

  const browser = await chromium.launch()
  report = await runSweep({
    browser,
    origin,
    routes,
    viewports,
    colorSchemes,
    motionModes,
    outDir,
    identity: { identitySelector: APP_IDENTITY_SELECTOR, appTitle: APP_TITLE },
    expectations,
    tolerancePx,
    settleMs,
    log: line,
  })
  await browser.close()

  report.generatedAt = new Date().toISOString()
  report.origin = origin
  report.expectations = expectations
  report.routesSwept = routes.map((route) => route.path)
  report.routesNotSwept = discovered.skipped
  writeFileSync(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8")

  line("")
  if (report.problems.length === 0) {
    line(
      `\u001b[32m✓\u001b[0m Browser QA OK · ${report.routes.length} 路由 / ${report.routes.reduce(
        (total, route) => total + route.combinations.length,
        0,
      )} 个组合 · 无控制台报错 / 无请求失败 / 无横向溢出 / 缩略图已解码`,
    )
    line(`  报告：${path.relative(REPO_ROOT, path.join(outDir, "report.json"))}`)
  } else {
    line(`\u001b[31m✗\u001b[0m Browser QA 发现 ${report.problems.length} 个问题：`)
    for (const problem of report.problems) line(`  ✗ ${problem}`)
    exitCode = EXIT.PROBLEMS
  }
} catch (error) {
  if (error instanceof PortInUseError) {
    process.stderr.write(portInUseMessage(error.host, error.port))
    exitCode = EXIT.UNVERIFIED
  } else if (error instanceof WrongServerError) {
    process.stderr.write(`\n✗ ${error.message}\n\n  QA 未运行：在能够证明被测对象之前，任何断言都不是关于本应用的断言。\n\n`)
    exitCode = EXIT.UNVERIFIED
  } else {
    process.stderr.write(`\n✗ Browser QA 无法完成：${error.message}\n\n`)
    exitCode = EXIT.UNVERIFIED
  }
} finally {
  if (server) {
    await server.stop()
    if (exitCode !== EXIT.OK && !asJson) {
      line("")
      line("--- server 最近输出 ---")
      line(server.logs())
    }
  }
}

if (asJson) {
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: exitCode === EXIT.OK,
        exitCode,
        origin,
        problems: report?.problems ?? [],
        routesSwept: report?.routesSwept ?? [],
        routesNotSwept: report?.routesNotSwept ?? [],
      },
      null,
      2,
    )}\n`,
  )
}

line("")
process.exit(exitCode)
