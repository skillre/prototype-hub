/**
 * ═══════════════════════════════════════════════════════════════════════
 * Prototype Registry —— 根 catalog 的**生成投影**，不是手写列表
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 这个文件以前住着一张手写的 `prototypes` 数组。它是全站唯一数据源，也是全站
 * 唯一一处可以悄悄说谎的地方：AI Finance 曾被标成 `Stable` 并指向一个现在返回
 * **404** 的地址（它旧的 production 部署返回 **410 Gone**），而没有任何东西会
 * 因此变红。
 *
 * 现在的边界是：
 *
 *   FACTORY_CONTROL_ROOT（根控制面，默认仓父目录）
 *     catalog/projects/*.json · catalog/compatibility.json · catalog/ports.json
 *         │  scripts/sync-factory-catalog.mjs   （pnpm catalog:sync）
 *         ▼
 *   lib/generated/factory-catalog.json          ← 提交在仓里的生成物
 *         │  本文件（运行时只读生成物，不跨仓读取）
 *         ▼
 *   app / components 的渲染
 *
 * 三条不可让步的性质：
 *
 * 1. **事实只能来自 catalog。** 身份、kind、端口、门禁、工厂锁、套件状态、
 *    部署状态与地址都在生成物里。`lib/hub-presentation.json` 只允许提供展示名、
 *    一句话说明与缩略图——它既不能新增条目，也不能改变任何一条事实
 *    （`pnpm catalog:check` 双向核对）。
 *
 * 2. **未知不是 public。** 只有 catalog 记录了 `deployment.productionUrl` 的条目
 *    才有 `url` 并且可以被点击；其余条目渲染成不可点击的展板，标签是
 *    「未部署 / 受保护」。受 SSO 保护的地址不得被称为 public，所以这里没有
 *    任何猜测出来的地址，也没有任何死链接。
 *
 * 3. **坏了要响。** 下面的 `assertProjection` 在模块加载时校验生成物与展示层；
 *    不一致就抛错，让 `next build` / `pnpm test` 直接失败，而不是渲染出一个
 *    看起来正常、内容却是错的页面。
 */

import catalogArtifact from "./generated/factory-catalog.json"
import presentationFile from "./hub-presentation.json"

/** catalog 里的仓角色。`kind` 是事实，展示用的中文标签在展示层。 */
export type PrototypeKind = "product" | "hub" | "kits" | "starter"

/**
 * 部署可得性 —— 由 catalog 事实派生，不是成熟度评分。
 * - `public`       catalog 记录了一个已核实的公开地址（可点击）
 * - `not-public`   没有已核实的公开地址：未部署，或受 SSO 保护而无法公开访问
 * - `unverified`   catalog 里没有 deployment 段，无从核实
 */
export type PrototypeAvailability = "public" | "not-public" | "unverified"

export interface Prototype {
  /** 展示名称（来自展示层；缺失即视为配置错误，见 assertProjection） */
  name: string
  /** 稳定且唯一，等于 catalog 里的 id（用于 anchor 与测试定位） */
  slug: string
  /** 一句话说明（展示层） */
  description: string
  /** 分类标签：由 catalog 的 kind 派生 */
  category: string
  /** catalog 记录的仓角色 */
  kind: PrototypeKind
  /** 部署可得性（catalog 事实） */
  availability: PrototypeAvailability
  /** 与 availability 一致的展示标签，例如「公开」「未部署 / 受保护」 */
  statusLabel: string
  /** 已核实的公开地址；没有就是 null —— 不猜、不指向死链接 */
  url: string | null
  /** 只有 url 存在时才为 true：不可点击的条目不会渲染成链接 */
  clickable: boolean
  /** 无可点击地址时的原因（来自生成物，可追溯到 catalog 原文） */
  availabilityReason: string
  /** 缩略图（展示层）；为 null 的条目进入索引行而不是展板 */
  thumbnail: string | null
  thumbnailAlt: string | null
  /** 有缩略图的条目进主展示位——「要不要露出画面」由展示层决定 */
  featured: boolean
  /** catalog 记录的 QA 端口 */
  qaPort: number | null
  /** catalog 记录为缺失的质量门（真实缺口，不是未知值） */
  gatesMissing: string[]
  /** catalog 记录的 origin（可能为 null：远端仓还不存在） */
  repo: string | null
  /** catalog 的观测快照 */
  observed: {
    observedAt: string | null
    branch: string | null
    head: string | null
    dirty: boolean | null
  }
  /** catalog 记录里这个仓是否已有工厂锁 */
  factoryLockPresent: boolean
  /** 生成物的来源文件，便于从页面回溯到事实 */
  sourceFile: string
}

interface CatalogDeployment {
  publicUrl: string | null
  availability: PrototypeAvailability
  label: string
  clickable: boolean
  reason: string
}

interface CatalogProject {
  id: string
  kind: string
  title: string | null
  repo: string | null
  qaPort: number | null
  gatesMissing: string[]
  observed: { observedAt: string | null; branch: string | null; head: string | null; dirty: boolean | null }
  factory: { lockPresent: boolean }
  deployment: CatalogDeployment
  sourceFile: string
}

interface CatalogArtifact {
  schemaVersion: number
  syncedAt: string
  source: { gitSha: string | null; inputsDirty: boolean; catalogGeneratedAt: string | null }
  projects: CatalogProject[]
}

interface PresentationEntry {
  name: string
  description: string
  thumbnail: string | null
  thumbnailAlt: string | null
}

interface PresentationFile {
  schemaVersion: number
  kindLabels: Record<string, string>
  presentation: Record<string, PresentationEntry>
}

const KINDS: readonly PrototypeKind[] = ["product", "hub", "kits", "starter"]
const AVAILABILITIES: readonly PrototypeAvailability[] = [
  "public",
  "not-public",
  "unverified",
]

const artifact = catalogArtifact as unknown as CatalogArtifact
const presentation = presentationFile as unknown as PresentationFile

/**
 * 生成物与展示层的自检。抛错而不是回落：一个渲染得出来但内容错的页面，
 * 比一个构建失败的页面危险得多。
 */
function assertProjection(
  value: CatalogArtifact,
  overlay: PresentationFile,
): void {
  const problems: string[] = []

  if (value.schemaVersion !== 1) {
    problems.push(`生成物 schemaVersion=${value.schemaVersion}，本文件只认识 1`)
  }
  if (!Array.isArray(value.projects) || value.projects.length === 0) {
    problems.push("生成物里没有 projects —— 空投影不能当作「没有原型」")
  }
  if (!overlay || typeof overlay.presentation !== "object" || overlay.presentation === null) {
    problems.push("lib/hub-presentation.json 缺少 presentation 段")
  }
  if (typeof overlay?.kindLabels !== "object" || overlay?.kindLabels === null) {
    problems.push("lib/hub-presentation.json 缺少 kindLabels 段")
  }

  const seen = new Set<string>()
  for (const project of value.projects ?? []) {
    const where = `projects[${project.id ?? "?"}]`

    if (typeof project.id !== "string" || project.id.trim() === "") {
      problems.push(`${where}: 没有 id`)
      continue
    }
    if (seen.has(project.id)) problems.push(`${where}: id 重复`)
    seen.add(project.id)

    if (!KINDS.includes(project.kind as PrototypeKind)) {
      problems.push(`${where}: kind「${project.kind}」不在展示层认识的范围内`)
    } else if (!overlay?.kindLabels?.[project.kind]) {
      problems.push(`${where}: kind「${project.kind}」没有对应的展示标签`)
    }

    const deployment = project.deployment
    if (!deployment || typeof deployment !== "object") {
      problems.push(`${where}: 没有 deployment 段——部署状态必须显式投影`)
      continue
    }
    if (!AVAILABILITIES.includes(deployment.availability)) {
      problems.push(`${where}: availability「${deployment.availability}」不认识`)
    }
    if (deployment.clickable && !deployment.publicUrl) {
      problems.push(`${where}: clickable=true 却没有 publicUrl —— 会渲染出死链接`)
    }
    if (!deployment.clickable && deployment.publicUrl) {
      problems.push(`${where}: 有 publicUrl 却不可点击 —— 状态自相矛盾`)
    }
    if (deployment.publicUrl !== null && !/^https:\/\//.test(deployment.publicUrl)) {
      problems.push(`${where}: publicUrl 不是 https 地址`)
    }
    if (deployment.availability !== "public" && deployment.publicUrl !== null) {
      problems.push(`${where}: 只有 public 才允许带地址`)
    }
    if (typeof deployment.label !== "string" || deployment.label.trim() === "") {
      problems.push(`${where}: 缺少展示标签`)
    }

    const entry = overlay?.presentation?.[project.id]
    if (!entry) {
      problems.push(
        `${where}: 展示层没有这个条目 —— 跑 \`pnpm catalog:check\`，` +
          `再到 lib/hub-presentation.json 显式做一次展示决定`,
      )
      continue
    }
    if (typeof entry.name !== "string" || entry.name.trim() === "") {
      problems.push(`${where}: 展示层 name 为空`)
    }
    if (entry.thumbnail !== null && !/^\/thumbnails\/.+\.(svg|png|webp)$/.test(entry.thumbnail)) {
      problems.push(`${where}: 缩略图路径不符合约定：${entry.thumbnail}`)
    }
  }

  const orphans = Object.keys(overlay?.presentation ?? {}).filter(
    (id) => !seen.has(id),
  )
  if (orphans.length > 0) {
    problems.push(
      `展示层里有 catalog 不存在的条目：${orphans.join(", ")} —— ` +
        `展示层不能给一个不存在的仓添加条目`,
    )
  }

  if (problems.length > 0) {
    throw new Error(
      `Prototype Registry 投影不合法（${problems.length} 个问题）：\n` +
        problems.map((problem) => `  ✗ ${problem}`).join("\n") +
        "\n  生成物：lib/generated/factory-catalog.json（`pnpm catalog:sync`）" +
        "\n  验证：`pnpm catalog:check`",
    )
  }
}

assertProjection(artifact, presentation)

function toPrototype(project: CatalogProject): Prototype {
  const entry = presentation.presentation[project.id]
  const thumbnail = entry.thumbnail
  const thumbnailAlt = entry.thumbnailAlt

  if (thumbnail !== null && (thumbnailAlt === null || thumbnailAlt.trim() === "")) {
    throw new Error(
      `Prototype Registry：${project.id} 有缩略图却没有替代文本 —— ` +
        `缩略图的可访问描述是必填的（lib/hub-presentation.json）`,
    )
  }

  return {
    name: entry.name,
    slug: project.id,
    description: entry.description,
    category: presentation.kindLabels[project.kind] ?? project.kind,
    kind: project.kind as PrototypeKind,
    availability: project.deployment.availability,
    statusLabel: project.deployment.label,
    url: project.deployment.publicUrl,
    clickable: project.deployment.clickable,
    availabilityReason: project.deployment.reason,
    thumbnail,
    thumbnailAlt,
    // 「有没有签名视觉」就是「进不进主展示位」：索引行没有图像位。
    featured: thumbnail !== null,
    qaPort: project.qaPort,
    gatesMissing: [...(project.gatesMissing ?? [])],
    repo: project.repo,
    observed: {
      observedAt: project.observed?.observedAt ?? null,
      branch: project.observed?.branch ?? null,
      head: project.observed?.head ?? null,
      dirty: project.observed?.dirty ?? null,
    },
    factoryLockPresent: project.factory?.lockPresent === true,
    sourceFile: project.sourceFile,
  }
}

/** 全部条目，顺序即生成物里的顺序（按 id 排序，确定性）。 */
export const prototypes: Prototype[] = artifact.projects.map(toPrototype)

/** 精选展板 —— 有签名视觉的条目。类型收窄到必有缩略图。 */
export type FeaturedPrototype = Prototype & {
  thumbnail: string
  thumbnailAlt: string
}

export const featuredPrototypes: FeaturedPrototype[] =
  prototypes.filter((prototype): prototype is FeaturedPrototype =>
    Boolean(prototype.featured && prototype.thumbnail && prototype.thumbnailAlt),
  )

/** 索引行 —— 其余条目（没有图像位）。 */
export const listedPrototypes: Prototype[] = prototypes.filter(
  (prototype) => !prototype.featured,
)

/** 按 slug 取单个原型。 */
export function getPrototype(slug: string): Prototype | undefined {
  return prototypes.find((prototype) => prototype.slug === slug)
}

export const prototypeCount = prototypes.length

/** 已核实公开地址的条目数（页面上的「可打开」计数）。 */
export const publiclyReachableCount = prototypes.filter(
  (prototype) => prototype.clickable,
).length

/** 生成物记录的事实来源，页面与测试都可以读它。 */
export const catalogSource = {
  gitSha: artifact.source.gitSha,
  inputsDirty: artifact.source.inputsDirty,
  catalogGeneratedAt: artifact.source.catalogGeneratedAt,
  syncedAt: artifact.syncedAt,
} as const

/**
 * 可点击地址 —— 不可点击的条目返回 null。
 *
 * 组件必须用这个函数而不是直接用 `prototype.url`：把「有没有地址」的判断
 * 收在一处，就不可能出现「状态显示未部署、链接却还能点」的页面。
 */
export function prototypeHref(prototype: Prototype): string | null {
  return prototype.clickable ? prototype.url : null
}

/** 是否为站外地址——决定是否 target="_blank"。 */
export function isExternalUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

/** 站外链接统一带上安全属性；站内链接保持同标签页。 */
export function linkTargetProps(url: string) {
  return isExternalUrl(url)
    ? ({ target: "_blank", rel: "noopener noreferrer" } as const)
    : ({ target: "_self", rel: undefined } as const)
}
