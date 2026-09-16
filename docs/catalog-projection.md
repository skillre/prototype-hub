# Catalog 投影（Catalog Projection）

> 一句话：**索引不再手写。** 它是根控制面 catalog 的确定性投影，运行时只读生成物。

## 1 · 为什么

`lib/prototypes.ts` 以前是一张手写的数组。它同时是「有哪些原型」和「这些原型是什么」
的唯一来源，因此它也是唯一一处可以悄悄说谎的地方——而它确实说过：

| 曾经的写法 | 后来发生的事 |
|---|---|
| `AI Finance` · `status: "Stable"` · `url: "https://prototype-ai-finance.vercel.app/"` | 公开别名返回 **404**，旧的 production 部署返回 **410 Gone**（2026-09-15 核实） |

地址死了、部署没了，页面照常显示 `Stable` 和一个可点的链接。没有任何检查会因此变红，
因为**没有第二个来源可以对照**。

现在有第二个来源了：根控制面 (`FACTORY_CONTROL_ROOT`) 的 `catalog/**`。
投影把它变成仓内的一份生成物，而生成物可以被复核。

## 2 · 数据流

```
FACTORY_CONTROL_ROOT（默认：本仓父目录）
├── catalog/projects/*.json          六个仓的身份、角色、端口、门禁、工厂/套件状态、部署记录
├── catalog/compatibility.json       工厂版本、工具链、基础设施观察（含 Vercel 可访问性规则）
├── catalog/ports.json               端口图与冲突
└── workspace-policy.json            工作区政策（子代理路由、部署授权、红线命令）
        │
        │  pnpm catalog:sync        scripts/sync-factory-catalog.mjs
        ▼
  lib/generated/factory-catalog.json   提交在仓里（确定性、可复核、自带摘要）
        │
        │  lib/prototypes.ts（运行时只读生成物，不跨仓读取）
        ▼
  lib/hub-presentation.json（展示层：展示名 / 说明 / 缩略图）
        ▼
  app/ · components/ 渲染
```

## 3 · 生成物里有什么

| 字段 | 内容 |
|---|---|
| `source.controlRoot` | 输入**实际**来自哪里：默认父目录记作 `..`（跨机器稳定、不把谁的家目录提交进去），用 `FACTORY_CONTROL_ROOT` / `--root` 指向别处时记绝对路径——不会一边读别处一边谎称 `..` |
| `source.controlRootSource` | 根是 `default` / `env` / `flag` 哪一种方式选出来的 |
| `source.gitSha` | 读取输入时的根控制面 HEAD（40 位）。输入未变时**不推进**，避免无意义 diff |
| `source.inputs[]` | 每个输入文件的 sha256（逐文件可复核） |
| `source.inputsDigest` | 上述摘要的整体摘要，用于快速判断「catalog 是否变了」 |
| `source.inputsDirty` | 输入在根仓里是否有未提交改动（有 = SHA 无法完整描述内容） |
| `source.factory` / `source.vercel` | 工厂当前版本与支持区间；Vercel 可访问性规则（受保护不得称为 public） |
| `rules` | 四条不变式的明文，便于评审时直接读到判据 |
| `syncedAt` / `payloadDigest` | 同步时间；除 `syncedAt` 外全部内容的自摘要（可检出人工改动） |
| `counts` / `portCollisions` | 计数与端口冲突（派生自 catalog，不是手填） |
| `projects[]` | 每个仓的：`id` `kind` `title` `path` `repo` `defaultBranch` `qaPort` `gates`/`gatesMissing` `factory` `kits` `observed` `deployment` `sourceFile` |

`deployment` 段是这次改造的核心：

```jsonc
{
  "linked": true,
  "projectName": "prototype-ai-finance",
  "productionUrl": null,          // catalog 记录的地址（null = 没有已核实的）
  "publicUrl": null,              // 只有 productionUrl 非空时才与它相同
  "availability": "not-public",   // public | not-public | unverified
  "label": "未部署 / 受保护",       // 页面上显示的，且与 availability 绑定
  "clickable": false,             // 只有 publicUrl 非空时才为 true
  "reason": "…",                  // 为什么不可点击（可读）
  "evidence": [                   // catalog 原文摘录，带来源行号；没有与部署相关的原文时为空数组
    { "source": "catalog/projects/ai-finance.json#notes[6]", "text": "…404…410…SSO…" }
  ]
}
```

> `evidence` 只收录**与部署相关**的原文：匹配词是「部署 / 公开 / SSO / productionUrl /
> `deployment.` / `.vercel 目录` / 上线 / 别名 / Production」。早期版本连裸的 `404` 与产品名
> `Vercel` 都算命中，于是把「某个 GitHub repo 不存在」和「一份 QA 工具清单里出现
> `docs/vercel-bootstrap.md`」也当成部署证据——**逐字但不相关**的证据会让一个结论看起来
> 有出处，其实没有。命中不到就是空数组，判定依据改由 `reason` 陈述
> （它写明是哪些 `deployment` 字段决定了状态）。

## 4 · 四条不变式（`pnpm catalog:check` 强制）

1. **事实只能来自 catalog。** 展示层 `lib/hub-presentation.json` 只能提供
   `name` / `description` / `thumbnail` / `thumbnailAlt`；双向核对：多余键与漏掉的条目都失败。
2. **运行时只读生成物、不跨仓读取。** `catalog:check` 验证 `lib/prototypes.ts` 确实 import
   生成物，并扫描 `app` `components` `lib`：出现写死的 `*.vercel.app` 地址或
   `"Stable"` 之类的字符串字面量断言即失败（0 个文件被扫到同样判失败）。
3. **未知不是 public。** `clickable === true` 必须伴随 `publicUrl`；`availability` 与 `label`
   必须成对一致；`label` 与 `availability` 不匹配即失败。
4. **重复同步不产生噪音，来源可复核。** 输入未变时 `catalog:sync` 字节不变；
   `catalog:check` 在根可用时用 `git show <sha>:<path>` **逐文件重算摘要**，
   证明记录的 SHA 真的包含记录的内容。

## 5 · 命令

```bash
pnpm catalog:sync                        # 生成/更新 lib/generated/factory-catalog.json
pnpm catalog:check                       # 只读校验（有根就比对，没根就报 upstream unavailable）
pnpm catalog:check --require-upstream    # 本地严格模式：没有根 → 退出 2
pnpm catalog:sync --reanchor             # 显式把 source.gitSha 重新锚定到当前 HEAD
FACTORY_CONTROL_ROOT=/path/to/root pnpm catalog:check   # 指定控制根
```

退出码：`0` 通过（含独立模式的完整性通过）· `1` 漂移或生成物不合法 · `2` 要求上游但没有上游。

## 6 · standalone 不撒谎

CI 与裸 checkout 没有根控制面。此时 `catalog:check` 只验证**生成物内部**能验证的东西：

```
✓ payloadDigest 自洽
✓ 展示层覆盖全部 6 个条目，且没有多余条目
✓ lib/prototypes.ts 消费生成物
✓ 运行时代码扫描 23 个文件：无写死部署地址、无手写成熟度断言

[upstream-unavailable] 没有可用的根控制面 catalog（FACTORY_CONTROL_ROOT 未设置或目录不存在）。
  只验证了生成物内部完整性：payloadDigest 自洽、展示层契约、运行时只读约束。
  **未执行上游比对**：这份生成物是否仍然忠实地反映 catalog，这一点没有被验证。

verdict: INTEGRITY-OK (UPSTREAM UNVERIFIED) —— 只验证了生成物内部完整性；未执行上游比对，因此不是 PASS
```

**它不是 PASS，也不会说自己通过。** CI 绿的含义是「内部自洽」，不是「与根 catalog 一致」——
后者只能在有根的机器上验证（本地 `pnpm catalog:check` 会打印
`PASS（已与根 catalog 比对）` 并复核来源 SHA）。

## 7 · 新增一个仓时

1. 在**根控制面**加 `catalog/projects/<id>.json`（并刷新 `compatibility.json` / `ports.json`）。
2. 回到本仓：`pnpm catalog:sync` → review diff。
3. 在 `lib/hub-presentation.json` 里为这个 id 补一条展示决定
   （展示名、说明、缩略图；没有缩略图就写 `null`，它会进索引行）。
   **不补就会失败**：`catalog:check` 要求展示层与投影双向一致。
4. `pnpm check`：`factory:agents` → `catalog:check` → lint → typecheck → test → build → qa。

## 8 · 已知边界

- 投影**只读**根控制面，从不回写。catalog 里的过期事实（例如 hub 自己的
  `gates.qa=false`，而本仓已经有 qa 门）只能由控制面一侧刷新——这是设计，不是缺陷。
- 投影不判断「catalog 说的是否属实」：它保证的是**忠实**，不是**正确**。
  catalog 的核实工作属于控制面的 `drift` / `verify-policy`。
- `observed` 快照有半衰期（分支/SHA/脏标记随时会动），所以它只作为事实展示，
  不进入任何判据。
