import { expect, test } from "@playwright/test"
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"

import catalogArtifact from "../lib/generated/factory-catalog.json"
import presentationFile from "../lib/hub-presentation.json"
import {
  catalogSource,
  prototypeHref,
  prototypes,
  publiclyReachableCount,
} from "../lib/prototypes"

/**
 * 投影正确性 —— 这一组测试不打开浏览器，它检查的是**数据本身**。
 *
 * 它们要守住的东西很具体：首页上每一条关于「有哪些仓、叫什么、能不能点开」的说法，
 * 都必须来自根 catalog 的投影，而不是某个人某天写下的句子。历史上这里出过一次真实
 * 事故：AI Finance 被标成 `Stable` 并指向一个后来返回 404 的地址（旧 production 部署
 * 410 Gone），而没有任何东西会因此变红。
 */

const REPO_ROOT = path.resolve(__dirname, "..")
const PROJECTS_DIR = path.resolve(REPO_ROOT, "..", "catalog", "projects")

const artifact = catalogArtifact as unknown as {
  schemaVersion: number
  source: { gitSha: string | null; inputsDigest: string; inputsDirty: boolean }
  payloadDigest: string
  counts: { projects: number; withPublicUrl: number; withoutPublicUrl: number }
  projects: Array<{
    id: string
    kind: string
    sourceFile: string
    deployment: {
      publicUrl: string | null
      productionUrl: string | null
      clickable: boolean
      availability: string
      label: string
      reason: string
      evidence: Array<{ source: string; text: string }>
    }
  }>
}

const presentation = presentationFile as unknown as {
  presentation: Record<string, unknown>
}

/**
 * 当前工作区里有 6 个仓。
 *
 * 这个数字是**人的断言**，不是从数据里推出来的：它正是「投影是否忠实」的对照物。
 * 新增第 7 个仓时，这条测试必须被显式改一次——那是有意的。让目录静默增长，
 * 就回到了「没人知道索引里有几条是真的」的状态。
 */
const EXPECTED_PROJECT_COUNT = 6

const LEGACY_CLAIMS = [
  "https://prototype-ai-finance.vercel.app/",
  "https://prototype-starter-skillres-projects.vercel.app/crm",
]

test.describe("catalog 投影", () => {
  test("投影恰好覆盖 6 个仓，且 id 唯一、有序", () => {
    expect(artifact.schemaVersion).toBe(1)
    expect(artifact.projects).toHaveLength(EXPECTED_PROJECT_COUNT)
    expect(prototypes).toHaveLength(EXPECTED_PROJECT_COUNT)

    const ids = artifact.projects.map((project) => project.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual([...ids].sort())
    expect(prototypes.map((prototype) => prototype.slug)).toEqual(ids)
  })

  test("有根控制面时，投影的 id 集合与 catalog/projects 完全一致", () => {
    test.skip(
      !existsSync(PROJECTS_DIR),
      "独立 checkout（CI / 裸 clone）里没有根控制面 catalog —— 这一条未执行，不代表通过",
    )

    const catalogIds = readdirSync(PROJECTS_DIR)
      .filter((name) => name.endsWith(".json"))
      .map((name) => {
        const parsed = JSON.parse(readFileSync(path.join(PROJECTS_DIR, name), "utf8"))
        return String(parsed.id)
      })
      .sort()

    expect(artifact.projects.map((project) => project.id).sort()).toEqual(catalogIds)
  })

  test("每个条目都记录了来源文件与判定理由", () => {
    for (const project of artifact.projects) {
      expect(project.sourceFile, `${project.id} 缺少 sourceFile`).toMatch(/^catalog\/projects\/.+\.json$/)
      expect(project.deployment.reason.length).toBeGreaterThan(10)
      expect(Array.isArray(project.deployment.evidence)).toBe(true)
    }
  })

  test("AI Finance 的记录与 catalog 的核实结果一致（404 / 410）", () => {
    const finance = artifact.projects.find((project) => project.id === "ai-finance")
    expect(finance, "投影里必须有 ai-finance").toBeTruthy()

    const evidence = finance!.deployment.evidence.map((entry) => entry.text).join("\n")
    expect(evidence).toContain("404")
    expect(evidence).toContain("410")
    expect(evidence).toMatch(/SSO/)
    expect(finance!.deployment.availability).toBe("not-public")
  })

  test("没有已核实 URL 的条目不可点击；可点击 ⇔ 有 URL", () => {
    for (const project of artifact.projects) {
      const deployment = project.deployment
      if (deployment.publicUrl === null) {
        expect(deployment.clickable, `${project.id} 没有公开地址却标成可点击`).toBe(false)
        expect(deployment.label).toBe("未部署 / 受保护")
        expect(deployment.availability).toBe("not-public")
      } else {
        expect(deployment.publicUrl).toMatch(/^https:\/\//)
        expect(deployment.clickable).toBe(true)
        expect(deployment.availability).toBe("public")
      }
      // 记录到的 productionUrl 永远不能是死链子的来源：它要么为 null，
      // 要么就是同一个经过核实的地址。
      if (deployment.productionUrl !== null) {
        expect(deployment.productionUrl).toBe(deployment.publicUrl)
      }
    }

    expect(artifact.counts.projects).toBe(artifact.projects.length)
    expect(artifact.counts.withPublicUrl).toBe(publiclyReachableCount)
    expect(artifact.counts.withoutPublicUrl).toBe(
      artifact.projects.length - publiclyReachableCount,
    )
  })

  test("运行时 API 不会把不可点击的条目变成链接", () => {
    for (const prototype of prototypes) {
      const href = prototypeHref(prototype)
      if (prototype.clickable) {
        expect(href).toBe(prototype.url)
        expect(href).toMatch(/^https:\/\//)
      } else {
        expect(href).toBeNull()
        expect(prototype.url).toBeNull()
        expect(prototype.statusLabel).toBe("未部署 / 受保护")
      }
    }
  })

  test("生成物里没有任何 vercel.app 地址，也没有旧的手写断言", () => {
    const raw = readFileSync(
      path.join(REPO_ROOT, "lib/generated/factory-catalog.json"),
      "utf8",
    )
    expect(raw).not.toMatch(/https?:\/\/[^\s"]*vercel\.app/i)
    for (const legacy of LEGACY_CLAIMS) {
      expect(raw).not.toContain(legacy)
    }
  })

  test("运行时代码里没有写死的部署地址，也没有手写的成熟度断言", () => {
    const roots = ["app", "components", "lib"].map((dir) => path.join(REPO_ROOT, dir))
    const files: string[] = []

    const walk = (dir: string) => {
      if (!existsSync(dir)) return
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const absolute = path.join(dir, entry.name)
        const relative = path.relative(REPO_ROOT, absolute)
        if (relative.startsWith("lib/generated")) continue
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name.startsWith(".")) continue
          walk(absolute)
        } else if (/\.(ts|tsx|json|mjs|js)$/.test(entry.name)) {
          files.push(absolute)
        }
      }
    }
    roots.forEach(walk)

    // 0-scan 不能判 PASS：这个探针必须先证明它真的看过东西。
    expect(files.length).toBeGreaterThan(10)

    const offenders: string[] = []
    for (const file of files) {
      const text = readFileSync(file, "utf8")
      text.split("\n").forEach((line, index) => {
        if (/https?:\/\/[^\s"'`)<]*\.vercel\.app/i.test(line)) {
          offenders.push(`${path.relative(REPO_ROOT, file)}:${index + 1} 写死的部署地址`)
        }
        if (/"(Stable|Beta|In Progress)"/.test(line)) {
          offenders.push(`${path.relative(REPO_ROOT, file)}:${index + 1} 手写的成熟度断言`)
        }
        for (const legacy of LEGACY_CLAIMS) {
          // 大小写无关，避免换个域大小写就绕过去
          if (line.toLowerCase().includes(legacy.toLowerCase())) {
            offenders.push(`${path.relative(REPO_ROOT, file)}:${index + 1} 旧的手写地址`)
          }
        }
      })
    }

    expect(offenders, `运行时代码里仍有手写的事实：\n${offenders.join("\n")}`).toEqual([])
  })

  test("展示层与投影双向一致：不多、不漏", () => {
    const overlayIds = Object.keys(presentation.presentation).sort()
    const projectionIds = artifact.projects.map((project) => project.id).sort()
    expect(overlayIds).toEqual(projectionIds)
  })

  test("生成物记录了来源 SHA 与输入摘要", () => {
    expect(artifact.source.gitSha).toMatch(/^[0-9a-f]{40}$/)
    expect(catalogSource.gitSha).toBe(artifact.source.gitSha)
    expect(artifact.source.inputsDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(artifact.payloadDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
  })
})

test.describe("catalog:check", () => {
  const runCheck = (root: string) =>
    execFileSync(
      process.execPath,
      [path.join(REPO_ROOT, "scripts/sync-factory-catalog.mjs"), "--check"],
      {
        cwd: REPO_ROOT,
        encoding: "utf8",
        env: { ...process.env, FACTORY_CONTROL_ROOT: root },
      },
    )

  test("没有根控制面时：只报完整性，不判 PASS", () => {
    const output = runCheck("/nonexistent-control-root-for-standalone-check")
    expect(output).toContain("[upstream-unavailable]")
    expect(output).toContain("INTEGRITY-OK (UPSTREAM UNVERIFIED)")
    expect(output).not.toContain("verdict: PASS")
  })

  test("有根控制面时：与 catalog 比对并给出 PASS", () => {
    const root = path.resolve(REPO_ROOT, "..")
    test.skip(
      !existsSync(path.join(root, "catalog", "projects")),
      "独立 checkout 里没有根控制面 —— 未执行上游比对，不代表通过",
    )

    const output = runCheck(root)
    expect(output).toContain("PASS（已与根 catalog 比对）")
    expect(output).toContain("输入摘要一致")
    expect(output).toContain("来源可复核")
  })
})
