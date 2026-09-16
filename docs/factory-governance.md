# Factory 治理（Governance）

> 机器可读的政策是 `factory-policy.json`，关键值由 `lib/factory-policy.schema.json` 钉住，
> 锁是 `factory.lock.json`，契约由 `lib/factory-lock.schema.json` 描述。
> 本文件解释它们**为什么长这样**。冲突时以机器可读文件为准。

## 1 · 角色：平台/目录仓，不是产品

| | 产品仓（`kind: product`） | 本仓（`kind: catalog-hub`） |
|---|---|---|
| 派生来源 | 从 `prototype-starter` 派生 | **没有**派生来源（早于 Factory v1.1） |
| `init-contract.json` | 有（`stage: product`） | **没有**，也不该有 |
| 锁的形状 | `factoryVersion` / `baseline` / `stage` | `hub` / `adoption` / `projection` |
| 独有面 | Kits、产品不变量、Visual Manifest | **catalog 投影** |
| 部署归属 | Vercel 项目（产品） | 未核实（见锁的 `unresolved`） |

所以 `factory.lock.json` 的 `kind` 是 `catalog-hub`，而 `pnpm factory:agents` 会**拒绝**
其他取值：平台仓一旦伪装成产品，下游每一个判断（基线身份、初始化边界、部署归属）
都会同时错位。这条不是文档约定，是门禁。

## 2 · v1.3 管理块（`factory-core-policy`）

策略 v1.3.0 替换了 v1.2 那句笼统的「Multi-agent orchestration」条款——一条过宽的规则：
它同时掐掉了宿主侧合法的编排，也没有点名真正该被挡住的东西。现在的写法是**边界**：

- **允许并要求**在 **DSH 宿主**内用多 Subagent 拆分与并行任务；
- **禁止**在**产品应用代码**（`app` `components` `lib` `hooks` `stores` `scripts`）里引入
  编排框架或编排运行时；
- 模型路由：`opencode-go-dsv41` / `deepseek-flash` / `max`，每次调用显式写全三个字段；
- 单 worktree 单写者 · 共享路径单 owner · `test` / `qa` 串行；
- HVA（人工视觉验收）先于发布 · 部署是独立的一次人工授权。

管理块由 `pnpm factory:agents --print-block` 从 `factory-policy.json` **渲染**，
`pnpm factory:agents` 逐字校验。块外是人类写的文档，块内一个字都不许手工改。

### 本仓额外钉住的三条

1. **运行时只读生成物**，不跨仓读取（站点在没有根控制面的机器上也要能构建、能运行）。
2. **未知不是 public**：没有已核实地址的条目显示「未部署 / 受保护」。
3. **上游不可用时不判 PASS**：打印 `[upstream-unavailable]`，输出 `INTEGRITY-OK (UPSTREAM UNVERIFIED)`。

这三条写在 `blockAnchors()` 里：渲染器哪天不再陈述它们，门禁立刻失败——
模板不许悄悄缩水成「恰好匹配一个被截断的文件」。

## 3 · 锁里记了什么

```jsonc
{
  "kind": "catalog-hub",
  "hub":       { "packageName": "prototype-hub", "version": "0.1.0", "commit": "<采纳时刻的 HEAD>", "recordedOn": "2026-09-16" },
  "adoption":  { "factoryVersion": "1.2.0", "policyVersion": "1.3.0",
                 "policySource": { "repo": "prototype-starter", "commit": "6191916…", "subject": "chore(factory): adopt governance policy v1.3" } },
  "policy":    { "version": "1.3.0" },
  "projection": { "artifact": "lib/generated/factory-catalog.json", "generator": "scripts/sync-factory-catalog.mjs",
                  "syncCommand": "catalog:sync", "checkCommand": "catalog:check",
                  "sourceSha": "83916bf…", "inputsDigest": "sha256:…",
                  "readOnlyAtRuntime": true, "standaloneHonesty": "…" },
  "managedSurfaces": [ /* 每一个都必须真实存在 */ ],
  "unresolved":       [ /* value 恒为 null，probe 写清楚怎么核的 */ ]
}
```

- `hub.commit` 是**采纳治理那一刻**的 HEAD，不是「当前 HEAD」：HEAD 前进本身不是违规，
  门禁只会给一条 warning，但两个值都必须能解释。
- `adoption.policySource.commit` 是**可核**的一个 commit：政策 1.3.0 的文件
  （`factory-policy.json` / 本地 schema / 校验器）在 `prototype-starter@6191916` 上真的存在。
  写一个「大概是那个」的 SHA 比留空更危险。
- `unresolved` 是「未知不猜」的落地：每条都带 `probe`（实际执行的核实动作与结果）
  与 `checkedOn`，`value` 恒为 `null`。当前三条：上游 reusable workflow 是否发布、
  hub 的 Vercel 部署身份、这份 CI 是否真的在 Actions 上跑过。

## 4 · 门禁跑什么

```bash
pnpm factory:agents     # 策略 ↔ schema ↔ 管理块 ↔ 锁 ↔ CI，五个方向互相核对
pnpm factory:agents --json
pnpm factory:agents --print-block   # 同步管理块（只打印，不写文件）
```

它检查的七个面：

1. `factory-policy.json` 对 `lib/factory-policy.schema.json` 逐字段校验（含 24 条关键值）；
2. 关键值从 schema 的 `const` 读出来比对——策略里没有第二份常量，放松 schema 会让检查**失败**
   而不是消失；
3. 渲染出来的管理块必须包含全部 17 条锚点规则；
4. `AGENTS.md` 里的块与渲染结果**逐字**一致；
5. 文档扫描：任何提到 Subagent/Multi-agent 的禁令都必须写明范围（否则连宿主侧合法编排一起 ban）；
6. 锁：角色 `catalog-hub`、平台身份与 `package.json` 一致、投影产物存在、命令名正确、
   受管面全部存在、`unresolved` 不许有猜出来的值；
7. CI 契约：`pnpm factory:agents` 与 `pnpm catalog:check` 都在、无任何部署 CLI/token、
   `test` 与 `qa` 不同 job 且 `qa` `needs:` 那个跑 `test` 的 job。

退出码：`0` 通过（允许 warning）· `1` 不合法 · `2` 缺文件。

## 5 · 控制面侧待补：第四角色分支

根控制面的 `contracts/factory-lock.schema.json` 目前用 `oneOf` 描述**三种**角色形状：

1. `factory-baseline` governance lock（starter）
2. product lock（派生产品）
3. `kits-registry` lock（kits）

本仓的 `catalog-hub` 形状是**第四种**。在那一支被补上之前：

- 控制面的 `pnpm drift` 会对 hub 报 `factory-lock-off-contract` / **UNKNOWN**（退出码 2），
  并且在版本比对一节报「锁没有声明控制面认识的那种版本字段」——因为 `factoryVersion`
  在平台形状里位于 `adoption` 段，而扫描器只在顶层找它；
- 这是**控制面要补的分支**，不是本仓应该把锁改回产品形状的理由：
  `kind: catalog-hub` 是**更准确**的描述，把准确描述换成能通过校验的旧形状，
  正是这次治理要消除的那种「为了让闸门变绿而说谎」。

控制面补分支时需要同步两处：`contracts/factory-lock.schema.json` 的 `oneOf`
与 `automation/lib/scan.mjs` 的 `format` / `lockedVersion` 识别（让 `catalog-hub`
读 `adoption.factoryVersion`）。

## 6 · 一处必须说清楚的半衰期

`catalog/projects/hub.json` 目前记 `gates.qa=false`、`factory.lockPresent=false`、
`lockPath=factory/factory.lock.json` —— 那是**升级前的扫描快照**。本仓现在有
`factory.lock.json`（根目录、`catalog-hub` 形状）与 `pnpm qa` 门，所以三条都已经过期。

投影**不会**替控制面刷新它：投影保证的是忠实，不是正确。这份偏差应当由控制面的
`pnpm drift` 报出（`catalog-factory-lock-stale:hub` 等），并由控制面一侧更新 catalog。
本仓能做的、也已经做的，是把偏差写进交接与本文档，而不是把生成物手改成一个「看起来更好」的值。
