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
  "productionBranch": "main",      // 断言，必须与下一行一起出现
  "productionBranchSource": "vercel api /v9/projects/<name> → link.productionBranch（只读回读）",
  "productionUrl": null,           // catalog 记录的地址（null = 没有已核实的）
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
✓ 运行时代码扫描 25 个文件：无写死部署地址、无手写成熟度断言

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

## 9 · 2026-09-16：hub 变成「公开且可点击」，以及同一个地址的两次观察

根控制面刷新后（`prototype-factory-control` main = 生成物的 `source.gitSha`），
`catalog/projects/hub.json` 记录了：

```jsonc
"deployment": {
  "linked": false,
  "projectName": null,             // 本地没有 .vercel/ 链接，catalog 就不声称项目名；平台侧项目名见 notes
  "productionBranch": "main",
  "productionBranchSource": "vercel api /v9/projects/<name> → link.productionBranch（2026-09-16 只读回读）",
  "productionUrl": "https://prototype-hub-dusky.vercel.app/"
}
```

核实方式（控制面一侧，2026-09-16）：匿名 `curl` 实测 **HTTP/2 200、`server: Vercel`、
无 SSO 跳转**；`vercel project ls` 确认项目 `prototype-hub` 存在
（`prj_Vz6w0EwclApNmGZ7MrWku0I7UZjB`）；Production Branch 由
`vercel api /v9/projects/<name>` 的 `link.productionBranch` **只读回读**——
不是从 URL 或分支名推断出来的。只有匿名 2xx 才支持「public」这个说法，这里成立。

于是投影里 **hub 自己**从「未部署 / 受保护」变成 `public` + 「公开」+ 可点击；当时另外五仓
仍是 `not-public`（starter / kits / research 的生产地址受 SSO 保护；finance 与 s1 的生产部署是
当天稍后用 Vercel API 以 `gitSource`（`ref=main`）补上的（`8d3eea5`），同样受保护 ——
**受保护既不是失败，也不是 public**，因此 `deployment.productionUrl` 对它们仍是 null）。

### 当天第三次变化：六个仓转 Public 之后，公开地址从 1 条变成 4 条

同一天更晚些时候（根 `8eaea8f`）：六个原型仓由 private 改为 public，六个 Vercel 项目的
Deployment Protection 从「Standard Protection」改为「Only Preview Deployments」——
Production 不再要求登录，Preview 仍受 SSO 保护。投影里的事实随之变成 **4 条 public /
2 条 not-public**：

| 条目 | `deployment.productionUrl`（均经**匿名** `curl` 实测） | 投影 |
|---|---|---|
| starter | `https://prototype-starter-git-main-skillres-projects.vercel.app`（200） | `public` + 「公开」+ 可点击 |
| kits | `https://prototype-kits-git-main-skillres-projects.vercel.app`（200） | 同上 |
| ai-research | `https://prototype-ai-research-git-main-skillres-projects.vercel.app`（200） | 同上 |
| hub | `https://prototype-hub-dusky.vercel.app/`（不变，200） | 同上 |
| ai-finance | 仍为 `null` | `not-public` + 「未部署 / 受保护」+ 不渲染 `<a href>` |
| s1 | 仍为 `null` | 同上 |

**finance 与 s1 为什么没有跟着变公开 —— 以及一条被推翻的解释**：同一个设置下，它们的地址
返回 **404**（既不是 200 也不是 302）。控制面第一版写下的解释是「它们的部署由 Vercel API 以
`gitSource` 创建、不是 Git webhook 触发的，所以平台不把它们当作当前生产部署」——
**这个解释已经被控制面自己的实验推翻**：随后给两个仓做了真正的 Git push（finance `cd47017`、
s1 `8c12c74`，都拿到 `target=production` / `gitRef=main` / `READY` 的 webhook 部署），
再把保护设成 Only-Preview，**依旧 404**。「API vs webhook」与「时间顺序」（`git connect`
之后重建 gitSource 部署）两条假设都实测排除。**已确立**的是：这两个项目的主域名被**另一个
Vercel 项目**占用 —— `POST /v9/projects/<id>/domains` 返回 **409
`already assigned to another project`**；同一设置在其余四条地址上则是匿名 200。
**根因尚未完全确定，因此不下结论。** 两个项目已**恢复为受保护（302）**：登录后能正常看到
页面，不留 404 —— **「登录后可看」是正常状态；一个被所有人当成部署故障的 404 不是。**

> **为什么把「写错了」也留下**：这是一个**看起来合理、推理自洽、却被一次真实实验推翻**的
> 解释。只留结论的话，下一个人会照着它去修错误的方向。控制面把
> `compatibility.json` 的 `finding` / `alternativeConsidered` 与 `s1.json#notes[11]`
> 都改成了「已证实的 + 已排除的 + 未确定的」，本仓的投影逐字收录它们。
>
> **那条上游遗留已经修掉（根仓 `ba7d6de`）**：`ai-finance.json#notes[11]` 现在与 s1 一样，
> 写的是「原因尚未完全确定」＋「第一版解释已被本仓真正的 Git push（`cd47017`）推翻」＋
> 已证实的主域名冲突（409）＋已排除的时间顺序假设，并明确保留「我曾写错」这件事。
> 于是生成物里两条 `evidence` 都不再以本仓的口气主张那条被推翻的原因 —— 旧解释只剩**引号里
> 被撤回的那一句**。这也是这套投影该有的行为：**改的是输入，重新 sync 之后生成物自己变**，
> 本仓从头到尾没有手改过生成物。

「有没有对外可点的地址」是人的断言：`tests/catalog-projection.spec.ts` 里那份公开/不可点
条目清单被显式改成了 4 / 2，而不是让它随 catalog 悄悄变化。

> **分支断言必须有出处。** `productionBranch` 与 `productionBranchSource` 是**一起**投影的：
> 只写一个 "main" 而没有出处，正是控制面这次收紧规则要消除的东西
> （`drift` 从「任何 production branch 断言都 UNKNOWN」改成「断言必须有出处」）。
> 本仓的 `catalog:check` 也拒绝「有分支、没出处」的生成物。

### 同一个地址的三次观察（都留着，因为可以对照）

| 观察时间 | 该地址当时提供的内容 | 证据 |
|---|---|---|
| 2026-09-16 上午 | **旧版**：手写索引 + `Stable` ×4 + 已 404 的 finance 链接，不含身份标记 | `pnpm qa:online --base-url=…` → identity 0 次、投影条目 0/6、两个未授权外链，**exit 1 / 52 项** |
| 2026-09-16 晚些时候（合并 `main` 触发的 Production 部署之后） | **本版**：身份标记在位、`Stable` 归零、旧死链归零 | 本仓独立匿名探测：**200 / 43755 字节** · `data-app-identity` ×1 · `Stable` ×0 · `prototype-ai-finance.vercel.app` ×0 · 外部链接恰好 1 条（hub 自己） |
| 2026-09-16 更晚（合并 `5d27f25` 触发的 Production 部署之后） | **本版 + 四条公开地址**：站外链接从 1 条变成 4 条，且与投影的 `publicUrl` 集合**逐条一致** | 本仓独立匿名探测：**200 / 45837 字节** · `data-app-identity` ×2 · `Stable` ×0 · 去重后的外链恰好 4 条（starter / kits / ai-research / hub）· `未部署 / 受保护` ×4 |

> 第三次观察里那次部署的 SHA 是**控制面告知**的（合并 `5d27f25` 触发）；本仓没有 Vercel
> 凭证，**没有回读它的 `target` / `gitRef` / `sha` / `readyState`** —— 我验的是页面本身：
> 匿名 200、身份标记在位、外链数与地址集合与投影一致。

**「链接可点」与「内容是新版」是两件事**，它们在当天分别成立过：上午前者不成立
（catalog 里根本没有地址），下午两者同时成立。这段对照留在文档里的价值就在于它两侧都写了——
只写「当时是旧的」而不留「后来变新了」，与只写「现在能点」而抹掉它曾经指向死链，是同一种失真。

刷新内容的那一步是**一次部署**（合并 `main`，由 Vercel Git 集成创建 Production 部署
`target=production` / `gitRef=main` / `gitSha=2d5cc8a` / `readyState=READY`），
属于独立的人工授权；索引只负责把「地址是已核实的」如实画出来。

> **上游注释里那处矛盾已经修掉（根仓 `3b31330`）。** 本仓在 2026-09-16 的审计里发现：
> `catalog/projects/hub.json` 的 `notes[3]` 与 `notes[6]` 还写着「Production Branch 与 SHA
> 没有回读，因此 `deployment.productionBranch` 记 null」，而字段本身早已是 `"main"` 且带
> 出处 —— **字段改了、散文没改**，而这个仓的投影会把 notes 逐字带进生成物。控制面随后保留
> 那两句原文并标注为**当时**的说法，同时补上「同日稍后已回读」。所以重新锚定之后 hub 的
> `evidence` 文本会更新（条目数不变）：**当前事实看字段值**，历史句子只在说它当时是什么。
> 这条缺陷正是本仓存在的理由：过期声明不该悄悄留在页面上，哪怕它出现在 catalog 自己身上。

## 10 · 输入脏了怎么办（provenance 的边界）

`source.gitSha` 是一句「这些字节是在这个 commit 上读到的」。根控制面有**未提交的
catalog 改动**时，这句话就不成立，所以生成物会记 `source.inputsDirty: true`，并且
`catalog:check` 对这一步只给 `[upstream-provenance-dirty]` 的说明——**不判 PASS，也不判 FAIL**：

- 内容摘要（`inputsDigest`）仍然能与工作副本逐文件比对，所以「生成物是否反映当前 catalog」
  是可验证的；
- 但「它等于哪个 commit 的内容」不可验证——那要等控制面把改动提交（或回退）。
- 提交之后**必须重新 sync**：脏状态本身是 provenance 的一部分，`catalog:sync` 会在
  脏 → 干净的转换处重新锚定 `gitSha`/`syncedAt`（即使内容没变），否则按旧 SHA
  逐文件复核会永远失败。内容没变、脏状态没变时，重复 sync 仍然是 byte-identical。

---

## 11 · 生命周期：退役不是消失

**机制在场，当前没有任何条目处于退役态。**

曾经有过一个：2026-09-16，工作区里的 `prototype-s1-incident-command/` 被移除，随后它的
GitHub 仓与 Vercel 项目也被删除，最后连 catalog 条目本身都按用户要求清掉了。**那一次的顺序
说明了这条机制为什么值得留着**：目录先消失时，控制面把一个"被移除"的仓报成了四条"坏掉"的
FAIL（没有锁、没有 kits lock、没有 remote、containment 失败）—— 它描述的是错的事情。

catalog 因此有生命周期字段（事实在根 catalog，投影只如实搬运）：

```
status: "active" | "retired"
retired: { on, by, reason, stillExists[], recoverableFrom, irreversibleLoss } | null
```

### 三条规则

1. **退役的条目不从索引里消失。** 删掉条目会把「这个工作区曾经有它」以及「它的仓、部署与证据
   仍然存在」一起抹掉 —— 而后者正是下一个人需要知道的。投影照常渲染它，只是多一个显式的
   `已退役` 标记（`lifecycleLabel`，来自生成物）与一整段退役记录。
2. **生命周期与可得性正交，所以是两个标签。** 「这个工作区还托管它吗」与「它能被打开吗」
   各有各的答案：一个仓库可以被退役而它的部署仍然在线。合成一个标签必然丢掉一个答案，
   所以 `LifecycleChip` 与 `StatusChip` 并排出现，谁也不改写谁。**可点击规则完全不变** ——
   仍然只有 catalog 记录了 `deployment.productionUrl` 的条目才能点，退役不豁免、也不加锁。
3. **零个退役条目也要是一条被写下来的事实。** `tests/catalog-projection.spec.ts` 里那条断言
   同时钉住两件事：机制没有被悄悄删掉（每个条目仍然显式带 `status`），以及现在的集合确实是空的。
   删掉机制会让它变红，而不是让页面悄悄少一行。

> 展示层（`lib/hub-presentation.json`）不为退役做特殊处理：它只管展示名、说明与缩略图。
> 但**它不能给一个 catalog 里不存在的仓保留条目** —— s1 从 catalog 消失时，`catalog:check`
> 正是靠这条把展示层里的残留当场报了出来。
