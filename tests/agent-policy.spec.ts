import { expect, test } from "@playwright/test"
import { readFileSync } from "node:fs"
import path from "node:path"

import {
  blockAnchors,
  compareManagedBlock,
  inspectCiWorkflow,
  inspectPackageWiring,
  renderManagedBlock,
  scanProhibitionConflicts,
  schemaConstAt,
  validateAgainstSchema,
} from "../scripts/lib/agent-policy.mjs"
import policyFile from "../factory-policy.json"
import policySchema from "../lib/factory-policy.schema.json"

/**
 * 策略门禁的自检 —— 「一个自身失效方式是静默通过的门，不能靠读代码来确认它是好的」。
 *
 * `pnpm factory:agents` 跑在真实文件上；这一组测试用**故意写坏的合成输入**驱动同一批
 * 纯函数，证明它确实会失败。没有这一层，门禁的每一条规则都只是「有人说它在跑」。
 *
 * 其中 `ci/no-catalog-check` 的那条注释用例不是假想的：门禁最初用
 * `ciText.includes("pnpm catalog:check")` 判断，而本仓 workflow 的头部注释**解释**了
 * 这个检查 —— 于是把真正的 step 删掉，门禁照样绿。一个被「关于门的注释」满足的门，
 * 正是这个工作区最怕的那种静默通过。
 */

const VALID_CI = `name: CI
on:
  push:
    branches: ["main"]
jobs:
  quality-gate:
    name: Quality gate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Agent policy gate
        run: pnpm factory:agents
      - name: Catalog projection check
        run: pnpm catalog:check
      - name: Lint
        run: pnpm lint
      - name: Playwright E2E
        run: pnpm test

  browser-qa:
    name: Browser QA (serial)
    needs: quality-gate
    runs-on: ubuntu-latest
    steps:
      - name: Browser QA sweep
        run: pnpm qa
`

const codes = (problems: Array<{ code: string }>) => problems.map((problem) => problem.code)

test.describe("CI 契约（inspectCiWorkflow）", () => {
  test("这份仓里的 workflow 通过", () => {
    const ci = readFileSync(
      path.join(__dirname, "..", ".github/workflows/ci.yml"),
      "utf8",
    )
    expect(inspectCiWorkflow(ci).problems).toEqual([])
  })

  test("合成的最小合格 workflow 通过", () => {
    const result = inspectCiWorkflow(VALID_CI)
    expect(result.problems).toEqual([])
    expect(result.jobs).toBe(2)
  })

  test("删掉策略门禁 → 失败", () => {
    const broken = VALID_CI.replace("        run: pnpm factory:agents\n", "")
    expect(codes(inspectCiWorkflow(broken).problems)).toContain("ci/no-policy-gate")
  })

  test("删掉投影门禁 → 失败", () => {
    const broken = VALID_CI.replace("        run: pnpm catalog:check\n", "")
    expect(codes(inspectCiWorkflow(broken).problems)).toContain("ci/no-catalog-check")
  })

  /**
   * 回归：注释里提到命令不算「跑了命令」。这条曾经是真实的假阴性。
   */
  test("只在注释里提到投影门禁 → 仍然失败", () => {
    const commented = `# 本 workflow 会跑 pnpm catalog:check，见 docs/catalog-projection.md\n${VALID_CI.replace(
      "        run: pnpm catalog:check\n",
      "",
    )}`
    const result = inspectCiWorkflow(commented)
    expect(codes(result.problems)).toContain("ci/no-catalog-check")
  })

  test("test 与 qa 挤在同一个 job → 失败", () => {
    const combined = VALID_CI.replace(
      `      - name: Browser QA sweep
        run: pnpm qa
`,
      "",
    ).replace("      - name: Playwright E2E\n        run: pnpm test\n", "      - name: E2E + QA\n        run: pnpm test && pnpm qa\n")
    expect(codes(inspectCiWorkflow(combined).problems)).toContain("ci/test-qa-same-job")
  })

  test("qa job 没有 needs → 失败（串行没有被机器表达）", () => {
    const parallel = VALID_CI.replace("    needs: quality-gate\n", "")
    expect(codes(inspectCiWorkflow(parallel).problems)).toContain("ci/test-qa-not-serial")
  })

  test("出现部署 CLI / 凭据 → 失败", () => {
    const withCli = VALID_CI.replace("        run: pnpm build\n", "").replace(
      "      - name: Lint",
      "      - name: Sneaky deploy\n        run: vercel deploy --prod\n      - name: Lint",
    )
    expect(codes(inspectCiWorkflow(withCli).problems)).toContain("ci/vercel-cli")

    const withToken = `${VALID_CI}\n# VERCEL_TOKEN: \${{ secrets.VERCEL_TOKEN }}\n`
    const envToken = VALID_CI.replace(
      "      - name: Lint",
      "      - name: Lint\n        env:\n          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}",
    )
    expect(codes(inspectCiWorkflow(envToken).problems)).toContain("ci/deployment-credential")
    expect(codes(inspectCiWorkflow(withToken).problems)).toContain("ci/deployment-credential")
  })

  test("没有 jobs 段 → 不作为通过", () => {
    expect(codes(inspectCiWorkflow("name: CI\non: push\n").problems)).toContain("ci/jobs-unparsed")
  })
})

test.describe("package.json 接线（inspectPackageWiring）", () => {
  const validPackage = {
    scripts: {
      check: "pnpm factory:agents && pnpm catalog:check && pnpm lint",
      "factory:agents": "node scripts/guard-agent-policy.mjs",
      "catalog:check": "node scripts/sync-factory-catalog.mjs --check",
      "catalog:sync": "node scripts/sync-factory-catalog.mjs",
    },
  }

  test("本仓的 package.json 通过", () => {
    const pkg = readFileSync(
      path.join(__dirname, "..", "package.json"),
      "utf8",
    )
    expect(inspectPackageWiring(JSON.parse(pkg)).problems).toEqual([])
  })

  test("缺少 catalog:check 脚本 → 失败", () => {
    const pkg = structuredClone(validPackage)
    delete (pkg.scripts as Record<string, string>)["catalog:check"]
    expect(codes(inspectPackageWiring(pkg).problems)).toContain("package/missing-catalog-script")
  })

  test("check 不以 factory:agents 开头 → 失败", () => {
    const pkg = structuredClone(validPackage)
    pkg.scripts.check = "pnpm lint && pnpm factory:agents"
    expect(codes(inspectPackageWiring(pkg).problems)).toContain("package/check-order")
  })
})

test.describe("管理块（render + compare）", () => {
  const policy = policyFile as unknown as Record<string, unknown>

  test("渲染出来的块写明每一条锚点规则", () => {
    const block = renderManagedBlock(policy)
    for (const anchor of blockAnchors(policy)) {
      expect(anchor.pattern.test(block), `缺少锚点 ${anchor.id}`).toBe(true)
    }
  })

  test("块被削掉一条规则 → compare 报 drift", () => {
    const block = renderManagedBlock(policy)
    const damaged = block.replace(/- \*\*HVA（人工视觉验收）\*\*：.+/, "")
    const result = compareManagedBlock(`前言\n${damaged}\n后记`, policy)
    expect(result.ok).toBe(false)
    expect(result.reason).toBe("drift")
  })

  test("标记各出现一次才算合格", () => {
    const block = renderManagedBlock(policy)
    const duplicated = `${block}\n${block}`
    expect(compareManagedBlock(duplicated, policy).ok).toBe(false)
  })
})

test.describe("禁令扫描（scanProhibitionConflicts）", () => {
  test("不带范围的 Subagent 禁令 → 冲突", () => {
    const scan = scanProhibitionConflicts([
      { path: "docs/x.md", text: "禁止 Multi-agent orchestration。\n" },
    ])
    expect(scan.conflicts).toHaveLength(1)
    expect(scan.conflicts[0].code).toBe("policy/unscoped-prohibition")
  })

  test("写明范围的禁令 → 不报", () => {
    const scan = scanProhibitionConflicts([
      { path: "docs/x.md", text: "禁止在产品应用代码里引入编排框架或编排运行时。\n" },
      { path: "docs/y.md", text: "允许并要求在 DSH 宿主内用多 Subagent 拆分任务。\n" },
    ])
    expect(scan.conflicts).toEqual([])
    // 反空扫：扫描必须真的看过东西，否则「没有冲突」只是一个空集。
    expect(scan.filesScanned).toBe(2)
    expect(scan.linesScanned).toBeGreaterThan(0)
  })
})

test.describe("schema 关键值", () => {
  test("策略对 schema 校验通过，关键值来自 schema 的 const", () => {
    const validation = validateAgainstSchema(policyFile, policySchema)
    expect(validation.issues).toEqual([])

    for (const dotPath of ["repositoryRole", "agentOrchestration.dshSubagents", "modelRouting.reasoningEffort"]) {
      const declared = schemaConstAt(policySchema, dotPath)
      expect(declared.declared, `${dotPath} 没有被钉成 const`).toBe(true)
    }
  })

  test("放松 schema 的 const 会让策略校验失败，而不是消失", () => {
    const weakened = structuredClone(policySchema)
    weakened.properties.repositoryRole.const = "product"
    expect(validateAgainstSchema(policyFile, weakened).issues.length).toBeGreaterThan(0)
  })

  test("不支持的 schema 关键字抛错而不是被忽略", () => {
    // 这里刻意把 schema 的类型放宽：我们要构造的是一个**不合规**的 schema，
    // 而 JSON 推断出来的类型只允许已知形状。
    const withCombinator = structuredClone(policySchema) as unknown as {
      properties: Record<string, unknown>
    }
    withCombinator.properties.repositoryRole = { oneOf: [{ const: "platform-catalog-hub" }] }
    const validation = validateAgainstSchema(policyFile, withCombinator)
    expect(validation.issues.some((issue) => issue.message.includes("oneOf"))).toBe(true)
  })
})
