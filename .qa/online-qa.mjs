#!/usr/bin/env node
/**
 * Online QA — `pnpm qa:online`. **REMOTE observer.**
 *
 * Local green does not mean the deployment is right. This runs the *same*
 * probes (`.qa/sweep.mjs` — one implementation, two origins) against a URL that
 * already exists. What it deliberately does **not** do, and why:
 *
 *   - it does not deploy, promote, merge or tag anything;
 *   - it does not start a local server;
 *   - it does not create an automation bypass secret. `vercel curl` does that as
 *     a side effect of a command that looks like a plain HTTP client; this tool
 *     is a plain HTTP client and creates nothing. A secret can only be supplied
 *     by the user through `QA_ONLINE_BYPASS_SECRET`, is never printed and never
 *     persisted.
 *
 * Three gates run *before* the sweep, because a QA result about the wrong
 * artefact is worse than no QA result:
 *
 *   1. **Identity before QA.** `--expect-sha` without `--identity` is a STOP, not
 *      a best effort: there is nothing to compare against.
 *   2. **Access classification.** An anonymous 2xx is the only thing that
 *      supports the word "public". A 3xx to SSO, 401, 403 or a non-2xx is
 *      reported as protected/unreachable — neither a deployment failure nor a
 *      pass.
 *   3. **Protected is a STOP, not a green.** Without a user-provided secret the
 *      runner stops and says so, instead of reporting a screenshot of an SSO
 *      login page as a healthy app.
 *
 * Usage:
 *   node .qa/online-qa.mjs --base-url=<url> [--identity=<deployment.json>] [--expect-sha=<sha>]
 *
 * Exit: 0 QA ran and passed · 1 QA ran and failed · 2 QA did not run (protected,
 *       unreachable, or missing identity) —— 未核实就是未核实，不是通过。
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { chromium } from "@playwright/test"

import { classifyUrlAccess, verifyDeploymentIdentity, assertProductionMatchesRC } from "../scripts/lib/deploy-contract.mjs"
import {
  APP_IDENTITY_SELECTOR,
  APP_TITLE,
  colorSchemes,
  extraRoutes,
  motionModes,
  outDir as defaultOutDir,
  settleMs,
  tolerancePx,
  viewports,
} from "./qa.config.mjs"
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

const line = (text = "") => process.stdout.write(`${text}\n`)
const stop = (code, reason, detail = []) => {
  line("")
  line(`✗ STOP · ${reason}`)
  for (const entry of detail) line(`  ${entry}`)
  line("")
  line("QA 未执行。未核实不是通过，也不是部署失败。")
  line("")
  process.exit(code)
}

const baseUrl = typeof flags.get("base-url") === "string" ? String(flags.get("base-url")) : null
if (baseUrl === null) {
  stop(EXIT.UNVERIFIED, "缺少 --base-url", [
    "用法：node .qa/online-qa.mjs --base-url=<url> [--identity=<deployment.json>] [--expect-sha=<sha>]",
  ])
}

const expectSha = typeof flags.get("expect-sha") === "string" ? String(flags.get("expect-sha")) : null
const identityPath = typeof flags.get("identity") === "string" ? String(flags.get("identity")) : null

line("")
line("\u001b[1mPrototype Hub · Online QA（REMOTE observer）\u001b[0m")
line(`  base-url   ${baseUrl}`)
line("  不部署 · 不 promote · 不 merge · 不 tag · 不启动本地 server · 不创建 bypass secret")
line("")

/* ── Gate 1: identity before QA ─────────────────────────────────────────── */

if (expectSha !== null && identityPath === null) {
  stop(EXIT.UNVERIFIED, "给了 --expect-sha 却没有 --identity", [
    "身份先于 QA：没有部署记录就没有可比对的 SHA，",
    "此时跑出来的绿只说明「某个东西」在应答，不说明它是那一版。",
  ])
}

if (identityPath !== null) {
  let record
  try {
    record = JSON.parse(readFileSync(identityPath, "utf8"))
  } catch (error) {
    stop(EXIT.UNVERIFIED, `无法读取部署记录 ${identityPath}`, [error.message])
  }

  const identity = verifyDeploymentIdentity(record)
  if (!identity.ok) {
    stop(EXIT.UNVERIFIED, "部署身份不完整", [
      identity.message,
      "  （identity 需要 target / git ref / git SHA / readyState / id）",
    ])
  }
  line(`  ✓ 部署身份 ${identity.message}`)

  if (expectSha !== null) {
    const match = assertProductionMatchesRC(record, expectSha)
    if (!match.ok) {
      stop(EXIT.UNVERIFIED, "部署与期望的 RC SHA 不一致 —— 在跑 QA 之前停下", [match.reason])
    }
    line(`  ✓ ${match.reason}`)
  }
} else {
  line("  ⚠ 未提供 --identity：本次只做可访问性与页面自查，未做部署身份比对。")
  line("    这不是「身份已核实」，报告里会照样这么写。")
}
line("")

/* ── Gate 2 + 3: access classification ──────────────────────────────────── */

const bypassSecret = process.env.QA_ONLINE_BYPASS_SECRET
const headers = {}
if (typeof bypassSecret === "string" && bypassSecret.trim() !== "") {
  headers["x-vercel-protection-bypass"] = bypassSecret
  line("  ⚠ 使用了用户通过 QA_ONLINE_BYPASS_SECRET 提供的 bypass 头。")
  line("    本工具不创建任何 secret，也不打印、不持久化它的值；请自行确认它是否仍然存在。")
  line("")
}

let accessProbe
try {
  const response = await fetch(baseUrl, { redirect: "manual", headers, signal: AbortSignal.timeout(20_000) })
  accessProbe = { status: response.status, location: response.headers.get("location") }
} catch (error) {
  stop(EXIT.UNVERIFIED, `无法访问 ${baseUrl}`, [error.message])
}

const access = classifyUrlAccess(accessProbe)
line(`  可访问性：${access.access} · ${access.message}`)

if (!access.publicLabelAllowed && !headers["x-vercel-protection-bypass"]) {
  stop(EXIT.UNVERIFIED, `受保护或无法公开访问（HTTP ${accessProbe.status}）—— 不猜、不绕、不报假绿`, [
    "受 SSO 保护的地址不得称为 public；没有用户提供的 secret 时不会尝试绕过。",
    "若确有验收需要，由用户提供 QA_ONLINE_BYPASS_SECRET 后重跑（本工具不创建 secret）。",
  ])
}
line("")

/* ── the sweep (same probes as local QA) ────────────────────────────────── */

const discovered = discoverRoutes(REPO_ROOT)
const routes = [...discovered.routes, ...extraRoutes.filter((route) => !discovered.routes.some((entry) => entry.path === route.path))]

const artifact = JSON.parse(readFileSync(path.join(REPO_ROOT, "lib/generated/factory-catalog.json"), "utf8"))
const expectations = expectationsFromProjection(artifact)

const outDir = path.resolve(REPO_ROOT, String(flags.get("out") ?? defaultOutDir))
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch()
const report = await runSweep({
  browser,
  origin: baseUrl.replace(/\/$/, ""),
  routes,
  viewports,
  colorSchemes,
  motionModes,
  outDir,
  identity: { identitySelector: APP_IDENTITY_SELECTOR, appTitle: APP_TITLE },
  expectations,
  extraHeaders: headers,
  tolerancePx,
  settleMs,
  log: line,
})
await browser.close()

report.generatedAt = new Date().toISOString()
report.mode = "remote"
report.baseUrl = baseUrl
report.identityVerified = identityPath !== null
report.expectedSha = expectSha
report.access = access
writeFileSync(path.join(outDir, "online-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8")

line("")
if (report.problems.length === 0) {
  line(`\u001b[32m✓\u001b[0m Online QA OK · ${routes.length} 路由 · 无控制台报错 / 无请求失败 / 无横向溢出`)
  line(`  报告：${path.relative(REPO_ROOT, path.join(outDir, "online-report.json"))}`)
  line("")
  process.exit(EXIT.OK)
}

line(`\u001b[31m✗\u001b[0m Online QA 发现 ${report.problems.length} 个问题：`)
for (const problem of report.problems) line(`  ✗ ${problem}`)
line("")
process.exit(EXIT.PROBLEMS)
