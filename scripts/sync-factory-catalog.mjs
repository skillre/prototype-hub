#!/usr/bin/env node
/**
 * Factory catalog → Hub projection · `pnpm catalog:sync` / `pnpm catalog:check`
 * ===========================================================================
 *
 * WHAT THIS IS
 * ------------
 * The Hub used to carry a **hand-written list** of prototypes in
 * `lib/prototypes.ts`. Every entry in that list was a claim — which projects
 * exist, what they are called, whether they are deployed, where they live. Some
 * of those claims were true when they were typed and quietly became false:
 * `AI Finance` was advertised as `Stable` with a production URL that now returns
 * **404** (its old production deployment returns **410 Gone**). A catalogue that
 * cannot notice that is worse than no catalogue.
 *
 * So the list stops being hand-written. The root control plane
 * (`FACTORY_CONTROL_ROOT`, default: this repository's parent directory) already
 * records what the six repositories are — `catalog/projects/*.json`,
 * `catalog/compatibility.json`, `catalog/ports.json`, `workspace-policy.json`.
 * This script reads those files and emits a **projection**:
 *
 *     lib/generated/factory-catalog.json      ← the artifact, committed here
 *
 * The Hub's runtime reads only that artifact. It never reaches across
 * repositories at build time or run time: a standalone checkout (CI, a fresh
 * clone, a reviewer's laptop) has everything it needs.
 *
 * THE THREE THINGS THAT MAKE THIS HONEST RATHER THAN MERELY GENERATED
 * ------------------------------------------------------------------
 * 1. **Facts come from the catalog; only presentation is editorial.**
 *    Identity, kind, ports, gates, factory/kits state, deployment state and the
 *    absence of a public URL are all projected from catalog files. A separate
 *    hand-written overlay (`lib/hub-presentation.json`) may supply a display
 *    name, a one-line description and a thumbnail — never an entry, never a
 *    status, never a URL. `catalog:check` enforces both directions (no orphan
 *    overlay keys, no uncovered catalog project).
 *
 * 2. **Unknown is not "public".** An entry is clickable **only** when the
 *    catalog records a verified `deployment.productionUrl`. Everything else is
 *    projected as `not-public` and labelled `未部署 / 受保护` — never a dead
 *    link, never a guessed address. SSO-protected URLs must not be called
 *    public, so they are not called public here.
 *
 * 3. **Repeating the sync must not produce noise, and provenance must be
 *    checkable.** The artifact records the source git SHA, a per-file digest of
 *    every input and one `syncedAt` timestamp. When the inputs are unchanged,
 *    `catalog:sync` rewrites nothing — same bytes, same SHA, same timestamp —
 *    so a clean tree stays clean. `catalog:check` then re-derives the digest and
 *    verifies, with `git show <sha>:<path>`, that the recorded SHA really did
 *    contain those inputs.
 *
 * STANDALONE MODE MUST NOT LIE
 * ----------------------------
 * CI of this repository has no `FACTORY_CONTROL_ROOT`. In that mode
 * `catalog:check` verifies what it *can* — internal integrity, the payload
 * digest, the overlay contract, the runtime consumer — and prints
 * `[upstream-unavailable]` with the explicit verdict
 * `INTEGRITY-OK (UPSTREAM UNVERIFIED)`. It never prints PASS, because the one
 * claim it cannot check is exactly the one being asked about. Pass
 * `--require-upstream` to turn that condition into a non-zero exit.
 *
 * Usage
 * -----
 *   node scripts/sync-factory-catalog.mjs              # sync (writes the artifact)
 *   node scripts/sync-factory-catalog.mjs --check      # check (never writes)
 *   node scripts/sync-factory-catalog.mjs --check --json
 *   node scripts/sync-factory-catalog.mjs --reanchor   # re-anchor source SHA on purpose
 *
 * Exit: 0 pass (including integrity-only) · 1 drift or invalid · 2 upstream required but unavailable
 */

import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
)

export const ARTIFACT_REL = "lib/generated/factory-catalog.json"
export const PRESENTATION_REL = "lib/hub-presentation.json"
export const RUNTIME_CONSUMER_REL = "lib/prototypes.ts"

const PROJECTION_SCHEMA_VERSION = 1
const PROJECTS_DIR = "catalog/projects"
const ROOT_INPUTS = [
  "catalog/compatibility.json",
  "catalog/ports.json",
  "workspace-policy.json",
]

/** Runtime sources that must never contain a hand-written deployment claim. */
const RUNTIME_SOURCE_DIRS = ["app", "components", "lib"]
const RUNTIME_SOURCE_SKIP = ["lib/generated"]
const FORBIDDEN_RUNTIME_PATTERNS = [
  {
    code: "runtime/hardcoded-deployment-url",
    pattern: /https?:\/\/[^\s"'`)<]*\.vercel\.app/i,
    message:
      "运行时代码里出现写死的 Vercel 部署地址——部署事实只能来自 catalog 投影。",
  },
  {
    code: "runtime/legacy-maturity-claim",
    // 只有**字符串字面量**才算断言：注释里解释历史不构成页面上的声明。
    pattern: /["'](Stable|Beta|In Progress)["']/,
    message:
      "运行时代码里出现手写的成熟度断言（Stable / Beta / In Progress）——状态必须由 catalog 事实派生。",
  },
]

/**
 * Fields copied from `deployment` as-is. `productionBranch` is copied together
 * with `productionBranchSource` because the control plane's rule is that a
 * branch is a *claim that needs provenance*: a projected "main" with no source
 * would be exactly the kind of unsourced assertion the catalog refuses.
 */
const AVAILABILITY = Object.freeze({
  PUBLIC: "public",
  NOT_PUBLIC: "not-public",
  UNVERIFIED: "unverified",
})

const AVAILABILITY_LABEL = Object.freeze({
  public: "公开",
  "not-public": "未部署 / 受保护",
  unverified: "未核实",
})

/**
 * 生命周期标签。`status: retired` 是 catalog 事实，**不是「消失」**：
 * 条目仍然被投影，只是多一个显式的「已退役」标签与一段退役记录
 * （原因 / 仍然存在的东西 / 从哪里能恢复）。
 *
 * 退役**不改变**可得性规则：可点击与否仍然只看 `deployment.productionUrl`。
 * 两件事是正交的 —— 「这个工作区还托管它吗」与「它能被打开吗」各有各的答案，
 * 合成一个标签就会丢掉其中一个。
 */
const LIFECYCLE_LABEL = Object.freeze({ retired: "已退役" })

/**
 * Which catalog notes count as deployment evidence.
 *
 * Deliberately specific. An earlier version matched the bare product name
 * ("Vercel") and bare status codes ("404"), which pulled in unrelated notes —
 * a QA-tooling list that happens to name `docs/vercel-bootstrap.md`, and a note
 * about a missing GitHub repository. Evidence that is *verbatim but off-topic*
 * is still misleading: it makes a claim look sourced when it is not. The token
 * list therefore requires a deployment concept, and the residual case (no
 * matching note at all) stays empty — `reason` carries the derivation from the
 * `deployment` fields, and an empty array is the honest answer.
 */
const DEPLOYMENT_EVIDENCE =
  /(部署|公开|SSO|productionUrl|deployment\.|\.vercel 目录|上线|别名|Production)/i

/* -------------------------------------------------------------------------- */
/* small stdlib helpers                                                        */
/* -------------------------------------------------------------------------- */

const sha256 = (value) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`

const canonicalJson = (value) => `${JSON.stringify(value, null, 2)}\n`

function readJson(absolutePath) {
  return JSON.parse(readFileSync(absolutePath, "utf8"))
}

function git(root, args) {
  try {
    return execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  } catch {
    return null
  }
}

/**
 * Read one file's exact bytes at a commit.
 *
 * Deliberately not routed through `git()`: that helper trims (correct for a SHA,
 * wrong for a file). Trimming a trailing newline here produced a digest mismatch
 * for every input file — a false "provenance not reproducible", which is exactly
 * the kind of confident-but-wrong verdict this script exists to avoid.
 */
function gitBlobAt(root, revision, relativePath) {
  try {
    return execFileSync("git", ["-C", root, "show", `${revision}:${relativePath}`], {
      encoding: "buffer",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 32 * 1024 * 1024,
    })
  } catch {
    return null
  }
}

/** Sorted file names of `catalog/projects`, so the projection is order-stable. */
function listProjectFiles(root) {
  const dir = path.join(root, PROJECTS_DIR)
  if (!existsSync(dir)) {
    throw new Error(
      `找不到 catalog 目录：${dir}\n` +
        `  根控制面要么不可用，要么不是预期的形状。用 FACTORY_CONTROL_ROOT 指定它的位置。`,
    )
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
}

/* -------------------------------------------------------------------------- */
/* the projection                                                              */
/* -------------------------------------------------------------------------- */

function deriveDeployment(project) {
  const deployment = project.deployment ?? null

  if (deployment === null || typeof deployment !== "object") {
    return {
      provider: null,
      linked: null,
      projectName: null,
      productionBranch: null,
      productionBranchSource: null,
      productionUrl: null,
      publicUrl: null,
      availability: AVAILABILITY.UNVERIFIED,
      label: AVAILABILITY_LABEL.unverified,
      clickable: false,
      reason:
        "catalog 没有 deployment 段：有没有部署、部署在哪里都无从核实，因此不显示地址。",
    }
  }

  const recordedUrl =
    typeof deployment.productionUrl === "string" &&
    deployment.productionUrl.trim() !== ""
      ? deployment.productionUrl.trim()
      : null

  const linked = deployment.linked === true

  if (recordedUrl !== null) {
    return {
      provider: deployment.provider ?? null,
      linked,
      projectName: deployment.projectName ?? null,
      productionBranch: deployment.productionBranch ?? null,
      productionBranchSource: deployment.productionBranchSource ?? null,
      productionUrl: recordedUrl,
      publicUrl: recordedUrl,
      availability: AVAILABILITY.PUBLIC,
      label: AVAILABILITY_LABEL.public,
      clickable: true,
      reason: "catalog 的 deployment.productionUrl 记录了一个已核实的地址。",
    }
  }

  return {
    provider: deployment.provider ?? null,
    linked,
    projectName: deployment.projectName ?? null,
    productionBranch: deployment.productionBranch ?? null,
    productionBranchSource: deployment.productionBranchSource ?? null,
    productionUrl: null,
    publicUrl: null,
    availability: AVAILABILITY.NOT_PUBLIC,
    label: AVAILABILITY_LABEL["not-public"],
    clickable: false,
    reason: linked
      ? "catalog 记录了 Vercel 项目链接，但没有已核实的公开 URL（deployment.productionUrl = null）；" +
        "团队内已存在的部署受 SSO 保护，受保护不得称为 public。"
      : "catalog 未记录 Vercel 项目链接，也没有已核实的公开 URL（deployment.linked=false，productionUrl=null）。",
  }
}

function deploymentEvidence(project, sourceFile) {
  const notes = Array.isArray(project.notes) ? project.notes : []
  return notes
    .map((text, index) => ({ source: `${sourceFile}#notes[${index}]`, text }))
    .filter((entry) => DEPLOYMENT_EVIDENCE.test(entry.text))
}

function projectEntry(project, sourceFile) {
  const gates = project.toolchain?.gates ?? {}
  const gateNames = ["lint", "typecheck", "test", "build", "qa"]
  const status = project.status === "retired" ? "retired" : "active"
  const retired =
    status === "retired"
      ? {
          on: project.retired?.on ?? null,
          by: project.retired?.by ?? null,
          reason: project.retired?.reason ?? null,
          stillExists: Array.isArray(project.retired?.stillExists)
            ? [...project.retired.stillExists]
            : [],
          recoverableFrom: project.retired?.recoverableFrom ?? null,
        }
      : null

  return {
    id: project.id,
    kind: project.kind,
    status,
    lifecycleLabel: status === "retired" ? LIFECYCLE_LABEL.retired : null,
    retired,
    title: project.title ?? null,
    path: project.path ?? null,
    repo: project.repo ?? null,
    defaultBranch: project.defaultBranch ?? null,
    qaPort: project.qaPort ?? null,
    qaPortSource: project.qaPortSource ?? null,
    gates: Object.fromEntries(
      gateNames.map((gate) => [gate, gates[gate] === true]),
    ),
    gatesMissing: gateNames.filter((gate) => gates[gate] !== true),
    factory: {
      lockPath: project.factory?.lockPath ?? null,
      lockPresent: project.factory?.lockPresent === true,
      lockFormat: project.factory?.lockFormat ?? null,
      factoryVersion: project.factory?.factoryVersion ?? null,
      policyVersion: project.factory?.factoryPolicyVersion ?? null,
      initStage: project.factory?.initStage ?? null,
    },
    kits: {
      role: project.kits?.role ?? null,
      lockPresent: project.kits?.lockPresent === true,
      registryVersion: project.kits?.registryVersion ?? null,
    },
    observed: {
      observedAt: project.observed?.observedAt ?? null,
      branch: project.observed?.branch ?? null,
      head: project.observed?.head ?? null,
      dirty: project.observed?.dirty ?? null,
    },
    deployment: {
      ...deriveDeployment(project),
      evidence: deploymentEvidence(project, sourceFile),
    },
    sourceFile,
  }
}

/**
 * The payload digest covers every field except `syncedAt` and
 * `payloadDigest` itself. Rebuilding the object here (rather than deleting keys
 * from the parsed file) fixes the key order, so the digest is stable no matter
 * how the JSON on disk was ordered.
 */
function canonicalPayload(artifact) {
  return {
    schemaVersion: artifact.schemaVersion,
    generator: artifact.generator,
    source: artifact.source,
    rules: artifact.rules,
    counts: artifact.counts,
    portCollisions: artifact.portCollisions,
    projects: artifact.projects,
  }
}

const payloadDigestOf = (artifact) => sha256(canonicalJson(canonicalPayload(artifact)))

function buildProjection({ root, rootSource = "default" }) {
  const projectFiles = listProjectFiles(root)

  const inputs = []
  for (const relative of [...ROOT_INPUTS, ...projectFiles.map((name) => `${PROJECTS_DIR}/${name}`)]) {
    const absolute = path.join(root, relative)
    if (!existsSync(absolute)) {
      throw new Error(`catalog 输入文件缺失：${relative}（root=${root}）`)
    }
    inputs.push({ path: relative, digest: sha256(readFileSync(absolute)) })
  }
  const inputsDigest = sha256(
    inputs.map((entry) => `${entry.path}:${entry.digest}`).join("\n"),
  )

  const compatibility = readJson(path.join(root, "catalog/compatibility.json"))
  const ports = readJson(path.join(root, "catalog/ports.json"))
  const workspacePolicy = readJson(path.join(root, "workspace-policy.json"))

  const projects = projectFiles
    .map((name) => {
      const relative = `${PROJECTS_DIR}/${name}`
      const project = readJson(path.join(root, relative))
      if (typeof project.id !== "string" || project.id.trim() === "") {
        throw new Error(`${relative} 没有 id —— 无法投影一个没有身份的条目`)
      }
      return projectEntry(project, relative)
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  const duplicateIds = projects
    .map((entry) => entry.id)
    .filter((id, index, all) => all.indexOf(id) !== index)
  if (duplicateIds.length > 0) {
    throw new Error(`catalog 里出现重复 id：${[...new Set(duplicateIds)].join(", ")}`)
  }

  const byKind = {}
  for (const entry of projects) {
    byKind[entry.kind] = (byKind[entry.kind] ?? 0) + 1
  }

  const withPublicUrl = projects.filter((entry) => entry.deployment.publicUrl !== null)
  const retiredProjects = projects.filter((entry) => entry.status === "retired")

  const inputsDirty =
    (git(root, ["status", "--porcelain", "--", "catalog", "workspace-policy.json"]) ??
      "") !== ""

  const artifact = {
    schemaVersion: PROJECTION_SCHEMA_VERSION,
    generator: {
      script: "scripts/sync-factory-catalog.mjs",
      syncCommand: "pnpm catalog:sync",
      checkCommand: "pnpm catalog:check",
      note: "本文件由脚本生成，不要手工编辑。Hub 运行时只读本文件，不跨仓读取。",
    },
    source: {
      controlRoot: describeControlRoot(root),
      controlRootSource: rootSource,
      controlRootMeaning:
        "输入实际来自哪里。默认是仓父目录（\"..\"）；用 FACTORY_CONTROL_ROOT 或 --root 指向别处时，" +
        "这里记的是一个绝对路径，而不是继续谎称 \"..\"。",
      gitSha: null,
      gitShaMeaning:
        "读取输入文件时根控制面 HEAD 的 SHA。输入内容未变时 sync 不推进它（避免无意义 diff）；" +
        "`catalog:sync --reanchor` 可以显式重新锚定。",
      inputsDigest,
      inputsDirty,
      inputs,
      catalogGeneratedAt: compatibility.generatedAt ?? null,
      workspacePolicyVersion: workspacePolicy.policyVersion ?? null,
      factory: {
        current: compatibility.factory?.current ?? null,
        supportedVersionRange: compatibility.factory?.supportedVersionRange ?? null,
      },
      vercel: {
        cliAuth: compatibility.infrastructure?.vercel?.cliAuth ?? null,
        deploymentsProtected:
          compatibility.infrastructure?.vercel?.deploymentsProtected ?? null,
        accessibilityRule:
          compatibility.infrastructure?.vercel?.accessibilityRule ?? null,
      },
      catalogPortsGeneratedAt: ports.generatedAt ?? null,
    },
    rules: {
      publicRequiresRecordedUrl:
        "只有当 catalog 记录了 deployment.productionUrl 时，条目才是 public 且可点击。",
      unknownIsNotPublic:
        "没有已核实地址的条目显示「未部署 / 受保护」，既不给死链接，也不猜地址；" +
        "受 SSO 保护的地址不得称为 public。",
      catalogIsTheOnlyFactSource:
        "身份、kind、端口、门禁、工厂/套件状态与部署状态全部来自 catalog；" +
        "lib/hub-presentation.json 只允许提供展示名、一句话说明与缩略图。",
      standaloneHonesty:
        "根控制面不可用时，catalog:check 只验证生成物内部完整性并报告 upstream unavailable，不判 PASS。",
      retiredIsAStateNotAHole:
        "status=retired 的条目仍然如实投影（含退役记录：原因 / 仍然存在的东西 / 从哪里能恢复），" +
        "不从索引里消失 —— 删掉它会抹掉「这个工作区曾经有它、它的仓与部署还在」这件事实；" +
        "退役也不改变可点击规则：仍然只有 catalog 记录的 productionUrl 才能点。",
    },
    syncedAt: new Date().toISOString(),
    payloadDigest: "sha256:pending",
    counts: {
      projects: projects.length,
      withPublicUrl: withPublicUrl.length,
      withoutPublicUrl: projects.length - withPublicUrl.length,
      retired: retiredProjects.length,
      byKind: Object.fromEntries(Object.entries(byKind).sort()),
    },
    portCollisions: (ports.collisions ?? []).map((collision) => ({
      port: collision.port,
      projectIds: [...(collision.projectIds ?? [])].sort(),
      severity: collision.severity ?? null,
    })),
    projects,
  }

  return { artifact, inputsDigest, root }
}

/* -------------------------------------------------------------------------- */
/* syncedAt / provenance plumbing                                              */
/* -------------------------------------------------------------------------- */

function readExistingArtifact(repoRoot) {
  const absolute = path.join(repoRoot, ARTIFACT_REL)
  if (!existsSync(absolute)) return null
  try {
    return readJson(absolute)
  } catch (error) {
    return { __unreadable: error.message }
  }
}

/**
 * Decide the two volatile fields.
 *
 * `source.gitSha` and `syncedAt` are provenance, not content. When the inputs
 * are byte-identical to what the committed artifact was built from, both are
 * kept — so `pnpm catalog:sync` on an unchanged catalog is a no-op instead of a
 * diff nobody can read. `--reanchor` opts out of that on purpose.
 */
function stabilise({ artifact, inputsDigest, existing, reanchor, now, root }) {
  const previous = existing && !existing.__unreadable ? existing : null
  const inputsUnchanged = previous?.source?.inputsDigest === inputsDigest
  const head = git(root, ["rev-parse", "HEAD"])

  // Cleanliness is part of provenance, not a cosmetic flag. `source.gitSha` is a
  // claim of the form "these exact bytes were read at this commit", and that
  // claim is false while the control root carries uncommitted changes to the
  // inputs. So a change in dirtiness re-anchors even when the content did not
  // change: the moment those edits are committed, the next sync moves the anchor
  // to the commit that actually contains them, and the per-file re-check at that
  // SHA starts passing again instead of failing forever against a stale anchor.
  const previousDirty = previous?.source?.inputsDirty === true
  const provenanceStable = inputsUnchanged && previousDirty === artifact.source.inputsDirty
  const keepPrevious = provenanceStable && !reanchor

  artifact.source.gitSha =
    keepPrevious && previous.source.gitSha ? previous.source.gitSha : head
  artifact.syncedAt =
    keepPrevious && typeof previous.syncedAt === "string" ? previous.syncedAt : now
  artifact.payloadDigest = payloadDigestOf(artifact)
  return { previous, inputsUnchanged, head, provenanceStable }
}

/* -------------------------------------------------------------------------- */
/* overlay + runtime consumer integrity                                        */
/* -------------------------------------------------------------------------- */

function loadPresentation(repoRoot) {
  const absolute = path.join(repoRoot, PRESENTATION_REL)
  if (!existsSync(absolute)) {
    return { ok: false, reason: `缺少 ${PRESENTATION_REL}` }
  }
  try {
    const value = readJson(absolute)
    const entries = value.presentation
    if (entries === null || typeof entries !== "object" || Array.isArray(entries)) {
      return { ok: false, reason: `${PRESENTATION_REL} 的 presentation 必须是对象` }
    }
    return { ok: true, value, ids: Object.keys(entries).sort() }
  } catch (error) {
    return { ok: false, reason: `${PRESENTATION_REL} 无法解析：${error.message}` }
  }
}

function walkRuntimeSources(repoRoot) {
  const files = []
  const walk = (relativeDir) => {
    const absolute = path.join(repoRoot, relativeDir)
    if (!existsSync(absolute)) return
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const relative = `${relativeDir}/${entry.name}`
      if (RUNTIME_SOURCE_SKIP.some((skip) => relative.startsWith(skip))) continue
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue
        walk(relative)
      } else if (/\.(ts|tsx|mjs|js|json)$/.test(entry.name) && entry.name !== "package.json") {
        files.push(relative)
      }
    }
  }
  for (const dir of RUNTIME_SOURCE_DIRS) walk(dir)
  return files.sort()
}

function scanRuntimeSources(repoRoot) {
  const findings = []
  const files = walkRuntimeSources(repoRoot)
  for (const relative of files) {
    const text = readFileSync(path.join(repoRoot, relative), "utf8")
    text.split("\n").forEach((line, index) => {
      for (const rule of FORBIDDEN_RUNTIME_PATTERNS) {
        if (rule.pattern.test(line)) {
          findings.push({
            code: rule.code,
            path: relative,
            line: index + 1,
            message: rule.message,
            text: line.trim().slice(0, 160),
          })
        }
      }
    })
  }
  return { findings, filesScanned: files.length }
}

/* -------------------------------------------------------------------------- */
/* integrity — the part that must work with no control root at all             */
/* -------------------------------------------------------------------------- */

function checkIntegrity(artifact) {
  const problems = []
  const notes = []

  const required = [
    "schemaVersion",
    "generator",
    "source",
    "rules",
    "syncedAt",
    "payloadDigest",
    "counts",
    "portCollisions",
    "projects",
  ]
  for (const key of required) {
    if (!(key in artifact)) problems.push(`生成物缺少字段 ${key}`)
  }
  if (artifact.schemaVersion !== PROJECTION_SCHEMA_VERSION) {
    problems.push(
      `schemaVersion 是 ${artifact.schemaVersion}，期望 ${PROJECTION_SCHEMA_VERSION}`,
    )
  }

  const projects = Array.isArray(artifact.projects) ? artifact.projects : []
  if (projects.length === 0) {
    problems.push("projects 为空——0 个条目的投影不能判 PASS")
  }

  const ids = projects.map((entry) => entry.id)
  const sorted = [...ids].sort()
  if (JSON.stringify(ids) !== JSON.stringify(sorted)) {
    problems.push("projects 没有按 id 排序——投影必须是确定性的")
  }
  if (new Set(ids).size !== ids.length) {
    problems.push("projects 里有重复 id")
  }

  for (const project of projects) {
    const where = `projects[${project.id ?? "?"}]`
    if (typeof project.id !== "string" || project.id === "") {
      problems.push(`${where}: 没有 id`)
      continue
    }
    if (!project.deployment || typeof project.deployment !== "object") {
      problems.push(`${where}: 没有 deployment 段`)
      continue
    }

    // ── 生命周期：退役是一个状态，不是从账本上挖掉的一块 ─────────────────
    // 只有两种状态，而且必须自洽：retired 必须带得出「为什么退役、还剩什么、
    // 从哪里恢复」；active 不能带退役记录。宁可这里报错，也不要渲染出一个
    // 「看起来只是普通条目」的退役仓。
    const status = project.status
    if (status !== "active" && status !== "retired") {
      problems.push(`${where}: status「${JSON.stringify(status)}」不认识（期望 active | retired）`)
    }
    if (status === "retired") {
      if (!project.retired || typeof project.retired !== "object") {
        problems.push(`${where}: status=retired 却没有 retired 记录 —— 退役必须说明原因`)
      } else {
        const retired = project.retired
        if (typeof retired.reason !== "string" || retired.reason.trim() === "") {
          problems.push(`${where}: retired.reason 为空 —— 退役必须写出原因`)
        }
        if (!Array.isArray(retired.stillExists)) {
          problems.push(`${where}: retired.stillExists 必须是数组（可以是空数组，但必须显式）`)
        }
        if (!("recoverableFrom" in retired)) {
          problems.push(`${where}: retired 缺少 recoverableFrom —— 无法恢复就显式写 null`)
        } else if (
          retired.recoverableFrom !== null &&
          (typeof retired.recoverableFrom !== "string" || retired.recoverableFrom.trim() === "")
        ) {
          problems.push(`${where}: retired.recoverableFrom 既不是 null 也不是非空字符串`)
        }
      }
      if (typeof project.lifecycleLabel !== "string" || project.lifecycleLabel.trim() === "") {
        problems.push(`${where}: status=retired 却没有 lifecycleLabel —— 页面上就说不清它已退役`)
      }
    } else if (status === "active") {
      if (project.retired !== null) {
        problems.push(`${where}: status=active 却带 retired 记录 —— 状态自相矛盾`)
      }
      if (project.lifecycleLabel !== null) {
        problems.push(`${where}: status=active 却带 lifecycleLabel —— 状态自相矛盾`)
      }
    }

    const { publicUrl, clickable, availability, label } = project.deployment

    if (publicUrl !== null && !/^https:\/\//.test(publicUrl)) {
      problems.push(`${where}: publicUrl 不是 https 地址：${publicUrl}`)
    }
    if (clickable === true && publicUrl === null) {
      problems.push(`${where}: clickable=true 却没有 publicUrl——点击会落到死链接或猜测地址`)
    }
    if (publicUrl === null && clickable !== false) {
      problems.push(`${where}: 没有 publicUrl 时 clickable 必须是 false`)
    }
    if (publicUrl === null && availability === AVAILABILITY.PUBLIC) {
      problems.push(`${where}: 没有 publicUrl 却声明 availability=public`)
    }
    if (typeof label !== "string" || label.trim() === "") {
      problems.push(`${where}: 缺少展示标签 label`)
    }
    if (AVAILABILITY_LABEL[availability] !== label) {
      problems.push(
        `${where}: label「${label}」与 availability「${availability}」不一致（期望「${AVAILABILITY_LABEL[availability]}」）`,
      )
    }
    const branch = project.deployment.productionBranch
    const branchSource = project.deployment.productionBranchSource
    if (branch !== null && branch !== undefined) {
      if (!("productionBranchSource" in project.deployment)) {
        problems.push(`${where}: 记录了 productionBranch 却没有 productionBranchSource 字段`)
      } else if (typeof branchSource !== "string" || branchSource.trim() === "") {
        problems.push(
          `${where}: productionBranch=${JSON.stringify(branch)} 没有出处 —— ` +
            `分支断言必须有 source（控制面规则：断言必须有出处）`,
        )
      }
    }

    if (!Array.isArray(project.deployment.evidence)) {
      problems.push(`${where}: 缺少 evidence —— 结论必须能追溯到 catalog 原文`)
    }
  }

  const counts = artifact.counts ?? {}
  const publicCount = projects.filter(
    (entry) => entry.deployment?.publicUrl !== null,
  ).length
  if (counts.projects !== projects.length) {
    problems.push(`counts.projects=${counts.projects} 与实际条目数 ${projects.length} 不一致`)
  }
  if (counts.withPublicUrl !== publicCount) {
    problems.push(`counts.withPublicUrl=${counts.withPublicUrl} 与实际的 ${publicCount} 不一致`)
  }
  if (counts.withoutPublicUrl !== projects.length - publicCount) {
    problems.push("counts.withoutPublicUrl 与实际不一致")
  }
  const retiredCount = projects.filter((entry) => entry.status === "retired").length
  if (counts.retired !== retiredCount) {
    problems.push(`counts.retired=${counts.retired} 与实际 retired 条目数 ${retiredCount} 不一致`)
  }

  const expectedDigest = payloadDigestOf(artifact)
  if (artifact.payloadDigest !== expectedDigest) {
    problems.push(
      `payloadDigest 不自洽：记录 ${artifact.payloadDigest}，重算 ${expectedDigest} —— ` +
        `生成物被手工改过，或者生成本身不可复现`,
    )
  } else {
    notes.push(`payloadDigest 自洽（${expectedDigest.slice(0, 20)}…）`)
  }

  if (!Array.isArray(artifact.source?.inputs) || artifact.source.inputs.length === 0) {
    problems.push("source.inputs 为空——没有记录任何输入摘要")
  }

  return { problems, notes }
}

/* -------------------------------------------------------------------------- */
/* upstream — compare against the control root, when there is one              */
/* -------------------------------------------------------------------------- */

function checkAgainstRoot(artifact, root, rootSource = "default") {
  const problems = []
  const notes = []

  const rebuilt = buildProjection({ root, rootSource })

  if (rebuilt.inputsDigest !== artifact.source?.inputsDigest) {
    const before = new Map(
      (artifact.source?.inputs ?? []).map((entry) => [entry.path, entry.digest]),
    )
    const changed = rebuilt.artifact.source.inputs
      .filter((entry) => before.get(entry.path) !== entry.digest)
      .map((entry) => entry.path)
    const removed = [...before.keys()].filter(
      (rel) => !rebuilt.artifact.source.inputs.some((entry) => entry.path === rel),
    )
    problems.push(
      "根 catalog 已经与生成物不一致（输入摘要不同）：" +
        [...changed, ...removed].join(", ") +
        " —— 跑 `pnpm catalog:sync` 并 review diff",
    )
  } else {
    notes.push("输入摘要一致：生成物反映当前 catalog 内容")
  }

  const head = git(root, ["rev-parse", "HEAD"])
  const recorded = artifact.source?.gitSha ?? null
  if (recorded === null) {
    problems.push("生成物没有记录 source.gitSha —— 来源不可追溯")
  } else if (head !== recorded) {
    const inputsUnchanged = rebuilt.inputsDigest === artifact.source?.inputsDigest
    notes.push(
      `记录的 source.gitSha ${String(recorded).slice(0, 7)} 与当前 HEAD ${String(head).slice(0, 7)} 不同` +
        (inputsUnchanged
          ? "（输入未变，保留旧 SHA 是设计：避免无意义 diff；要重新锚定用 `pnpm catalog:sync --reanchor`）"
          : "（输入已变，必须 sync）"),
    )
  }

  // Provenance: does the recorded SHA actually contain the recorded inputs?
  if (recorded !== null) {
    const missingAtSha = []
    const mismatched = []
    for (const entry of artifact.source?.inputs ?? []) {
      const blob = gitBlobAt(root, recorded, entry.path)
      if (blob === null) {
        missingAtSha.push(entry.path)
        continue
      }
      if (sha256(blob) !== entry.digest) mismatched.push(entry.path)
    }
    if (artifact.source?.inputsDirty === true) {
      /*
       * 措辞必须是**过去时**。
       *
       * `inputsDirty` 是**生成物里记下的那一刻**的状态（sync 时根仓是否干净），
       * 不是当前状态。原文写「catalog 输入在根仓里有未提交改动」（现在时），
       * 于是在「当时脏、现在已经提交」之后仍然这样报 —— 读的人会得出一个
       * 当下就不成立的结论（2026-09-17 实测：根仓 `git status` 为 0 个文件，
       * 这条消息却仍在说它脏）。
       *
       * 实质结论不变，而且仍然重要：**记录的那个 SHA 描述不了记录的这些输入**，
       * 所以「生成物 ↔ catalog 一致」这件事在这一格上没有被证明。
       */
      notes.push(
        "[upstream-provenance-dirty] 生成这份投影时，catalog 输入在根仓里**有未提交改动**" +
          `（当时记下的，不是当前状态），因此记录的 SHA 描述不了这些输入：` +
          `${[...missingAtSha, ...mismatched].join(", ") || "（摘要与工作副本一致）"} —— ` +
          "「生成物 ↔ catalog 一致」这一点没有被验证，不代表通过。" +
          "要让这一格重新可核：在根仓提交干净之后重跑 `pnpm catalog:sync`",
      )
    } else if (missingAtSha.length > 0) {
      notes.push(
        `[upstream-provenance-unknown] 无法在 ${String(recorded).slice(0, 7)} 处读到：${missingAtSha.join(", ")}` +
          "（文件当时可能未被提交）——没有做这一步的比对，不代表通过",
      )
    } else if (mismatched.length > 0) {
      problems.push(
        `记录的 source.gitSha ${String(recorded).slice(0, 7)} 与 inputsDigest 不符：${mismatched.join(", ")}` +
          " —— 生成物的来源无法复现",
      )
    } else {
      notes.push(
        `来源可复核：在 ${String(recorded).slice(0, 7)} 处逐文件重算摘要，与记录一致`,
      )
    }
  }

  return { problems, notes, head }
}

/* -------------------------------------------------------------------------- */
/* reporting                                                                   */
/* -------------------------------------------------------------------------- */

const VERDICT_TEXT = {
  PASS: "PASS（已与根 catalog 比对）",
  DRIFT: "DRIFT（生成物与 catalog 不一致）",
  INVALID: "INVALID（生成物内部完整性不通过）",
  INTEGRITY_ONLY:
    "INTEGRITY-OK (UPSTREAM UNVERIFIED) —— 只验证了生成物内部完整性；未执行上游比对，因此不是 PASS",
}

/* -------------------------------------------------------------------------- */
/* entry point                                                                 */
/* -------------------------------------------------------------------------- */

function parseArgs(argv) {
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
  return flags
}

function resolveRoot(flags) {
  const explicit = flags.get("root")
  const fromEnv = process.env.FACTORY_CONTROL_ROOT
  const source =
    typeof explicit === "string"
      ? "flag"
      : typeof fromEnv === "string" && fromEnv.trim() !== ""
        ? "env"
        : "default"
  const candidate =
    source === "flag"
      ? path.resolve(String(explicit))
      : source === "env"
        ? path.resolve(String(fromEnv))
        : path.resolve(REPO_ROOT, "..")
  return {
    candidate,
    source,
    available: existsSync(path.join(candidate, PROJECTS_DIR)),
  }
}

/**
 * How the control root is recorded in the artifact.
 *
 * The default (the repository's parent directory) is recorded as `..` — stable
 * across machines, and no developer's home directory ends up committed. Any
 * other root is recorded as the absolute path it actually is: recording `..`
 * while reading somewhere else would be provenance that cannot be true.
 */
function describeControlRoot(root) {
  const resolved = path.resolve(root)
  return resolved === path.resolve(REPO_ROOT, "..") ? ".." : resolved
}

function main() {
  const argv = process.argv.slice(2)
  const flags = parseArgs(argv)
  const mode = flags.get("check") === true ? "check" : "sync"
  const asJson = flags.get("json") === true
  const requireUpstream = flags.get("require-upstream") === true
  const reanchor = flags.get("reanchor") === true

  const repoRoot = REPO_ROOT
  const { candidate: root, available, source: rootSource } = resolveRoot(flags)

  const problems = []
  const advisories = []
  const lines = []

  const push = (text = "") => lines.push(text)

  push()
  push("\u001b[1mPrototype Hub · Factory catalog projection\u001b[0m")
  push(`  artifact   ${ARTIFACT_REL}`)
  push(`  generator  scripts/sync-factory-catalog.mjs`)
  push(
    `  mode       ${mode}${mode === "check" ? " (read-only)" : ""} · 控制根 ${root}${available ? "" : "（不可用）"}`,
  )
  push("")

  const existing = readExistingArtifact(repoRoot)
  if (existing?.__unreadable) {
    problems.push(`现有生成物无法解析：${existing.__unreadable}`)
  }

  if (mode === "sync") {
    if (!available) {
      push(
        "[upstream-unavailable] 找不到根控制面 catalog —— 不能凭空生成投影。" +
          " 用 FACTORY_CONTROL_ROOT 指定控制根。",
      )
      push("")
      process.stdout.write(`${lines.join("\n")}\n`)
      process.exit(2)
    }

    const { artifact, inputsDigest } = buildProjection({ root, rootSource })
    const { previous, inputsUnchanged, provenanceStable, head } = stabilise({
      artifact,
      inputsDigest,
      existing,
      reanchor,
      now: new Date().toISOString(),
      root,
    })

    const text = canonicalJson(artifact)
    const previousText =
      previous === null ? null : canonicalJson(previous)

    if (previousText === text) {
      push(`✓ 生成物已是最新（byte-identical）· 输入摘要 ${inputsDigest.slice(0, 20)}…`)
      push(`  source.gitSha ${String(artifact.source.gitSha).slice(0, 7)} · syncedAt ${artifact.syncedAt}`)
      push(`  条目 ${artifact.counts.projects} 个 · 公开地址 ${artifact.counts.withPublicUrl} 个`)
      push("")
      process.stdout.write(`${lines.join("\n")}\n`)
      process.exit(0)
    }

    writeFileSync(path.join(repoRoot, ARTIFACT_REL), text, "utf8")
    push(
      `✓ 已写入 ${ARTIFACT_REL}（${artifact.counts.projects} 个条目 · ` +
        `公开地址 ${artifact.counts.withPublicUrl} 个 · 无公开地址 ${artifact.counts.withoutPublicUrl} 个）`,
    )
    push(
      `  source.gitSha ${artifact.source.gitSha} · HEAD ${head ?? "unknown"} · ` +
        `输入${inputsUnchanged ? "未变" : "已变"}` +
        `${provenanceStable ? "（保留旧 SHA/syncedAt）" : "（已推进 SHA/syncedAt）"}` +
        `${reanchor ? " · --reanchor" : ""}`,
    )
    push(`  payloadDigest ${artifact.payloadDigest}`)
    push(
      `  inputsDirty = ${artifact.source.inputsDirty}` +
        (artifact.source.inputsDirty
          ? " ← 根仓的 catalog 输入有未提交改动：记录内容属实，但 SHA 无法完整描述它；该处提交/回退后需重新 sync 以重新锚定"
          : ""),
    )
    push("")

    const integrity = checkIntegrity(artifact)
    if (integrity.problems.length > 0) {
      process.stderr.write(
        `写入完成，但生成物自检失败：\n${integrity.problems.map((p) => `  ✗ ${p}`).join("\n")}\n`,
      )
      process.stdout.write(`${lines.join("\n")}\n`)
      process.exit(1)
    }

    push("  下一步：`pnpm catalog:check` 验证生成物与 catalog 一致。")
    push("")
    process.stdout.write(`${lines.join("\n")}\n`)
    process.exit(0)
  }

  /* ------------------------------------------------------------------ check */

  if (existing === null || existing.__unreadable) {
    push(`✗ 找不到或无法解析生成物 ${ARTIFACT_REL} —— 跑 \`pnpm catalog:sync\``)
    push("")
    process.stdout.write(`${lines.join("\n")}\n`)
    process.exit(1)
  }

  const artifact = existing

  const integrity = checkIntegrity(artifact)
  problems.push(...integrity.problems)
  for (const note of integrity.notes) push(`✓ ${note}`)

  // overlay contract
  const presentation = loadPresentation(repoRoot)
  const catalogIds = (artifact.projects ?? []).map((entry) => entry.id).sort()
  if (!presentation.ok) {
    problems.push(presentation.reason)
  } else {
    const orphans = presentation.ids.filter((id) => !catalogIds.includes(id))
    const uncovered = catalogIds.filter((id) => !presentation.ids.includes(id))
    if (orphans.length > 0) {
      problems.push(
        `${PRESENTATION_REL} 里有 catalog 不存在的条目：${orphans.join(", ")} —— ` +
          `展示层不能给一个不存在的仓添加条目`,
      )
    }
    if (uncovered.length > 0) {
      problems.push(
        `${PRESENTATION_REL} 没有覆盖 catalog 条目：${uncovered.join(", ")} —— ` +
          `新增仓必须显式做一次展示决定（哪怕只是写 null）`,
      )
    }
    if (orphans.length === 0 && uncovered.length === 0) {
      push(`✓ 展示层覆盖全部 ${catalogIds.length} 个条目，且没有多余条目`)
    }
  }

  // runtime consumer
  const consumerPath = path.join(repoRoot, RUNTIME_CONSUMER_REL)
  if (!existsSync(consumerPath)) {
    problems.push(`缺少运行时消费方 ${RUNTIME_CONSUMER_REL}`)
  } else {
    const consumer = readFileSync(consumerPath, "utf8")
    if (!consumer.includes("generated/factory-catalog.json")) {
      problems.push(
        `${RUNTIME_CONSUMER_REL} 没有 import 生成物 —— 运行时必须只读生成物`,
      )
    } else {
      push(`✓ ${RUNTIME_CONSUMER_REL} 消费生成物`)
    }
  }

  const scan = scanRuntimeSources(repoRoot)
  if (scan.filesScanned === 0) {
    problems.push("运行时代码扫描覆盖 0 个文件 —— 0-scan 不能判 PASS")
  }
  for (const finding of scan.findings) {
    problems.push(
      `${finding.path}:${finding.line} — ${finding.message}\n     ${finding.text}`,
    )
  }
  if (scan.findings.length === 0) {
    push(`✓ 运行时代码扫描 ${scan.filesScanned} 个文件：无写死部署地址、无手写成熟度断言`)
  }

  // upstream
  let verdict = "INTEGRITY_ONLY"
  if (available) {
    const upstream = checkAgainstRoot(artifact, root, rootSource)
    problems.push(...upstream.problems)
    for (const note of upstream.notes) push(`✓ ${note}`)
    push(
      `  upstream   root=${root} head=${String(upstream.head ?? "unknown").slice(0, 7)} ` +
        `inputsDirty=${artifact.source?.inputsDirty}`,
    )
    verdict = upstream.problems.length > 0 ? "DRIFT" : "PASS"
  } else {
    push("")
    push(
      "[upstream-unavailable] 没有可用的根控制面 catalog（FACTORY_CONTROL_ROOT 未设置或目录不存在）。",
    )
    push(
      "  只验证了生成物内部完整性：payloadDigest 自洽、展示层契约、运行时只读约束。",
    )
    push(
      "  **未执行上游比对**：这份生成物是否仍然忠实地反映 catalog，这一点没有被验证。",
    )
  }

  if (problems.length > 0) {
    verdict = verdict === "DRIFT" ? "DRIFT" : "INVALID"
  }

  const ok = problems.length === 0 && verdict === "PASS"
  const code = problems.length > 0 ? 1 : ok ? 0 : requireUpstream && !available ? 2 : 0

  push("")
  for (const problem of problems) push(`  ✗ ${problem}`)
  push("")
  push(`verdict: ${VERDICT_TEXT[verdict]}`)
  push("")

  if (asJson) {
    process.stdout.write(
      canonicalJson({
        ok,
        verdict,
        upstream: { root, available },
        problems,
        payloadDigest: artifact.payloadDigest,
        projects: catalogIds,
        advisories,
      }),
    )
  } else {
    process.stdout.write(`${lines.join("\n")}\n`)
  }

  process.exit(code)
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))

if (invokedDirectly) main()
