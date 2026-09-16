# AGENTS.md · Prototype Hub（平台/目录仓）

本文件是本仓的**工作宪法**：它约束 Agent 在这里「怎么工作」。
机器可读的政策在 `factory-policy.json`（关键值由 `lib/factory-policy.schema.json` 钉住），
契约在 `lib/factory-lock.schema.json`，投影规则在 `docs/catalog-projection.md`。
本文件与它们冲突时，**以机器可读文件为准**，并把本文件改回来。

<!-- BEGIN:factory-core-policy v1.3.0 -->
> 本块由 `pnpm factory:agents --print-block` 从 `factory-policy.json` 渲染，`pnpm factory:agents` 逐字校验。
> **不要手工编辑块内文字**：改 `factory-policy.json`（其关键值由 `lib/factory-policy.schema.json` 钉住），再同步本块。块外仍是人类写的文档。

## Factory Core Policy v1.3.0（平台/目录仓 · Agent 编排与并发）

- **仓库角色**：本仓是平台/目录仓，角色 `platform-catalog-hub` —— 它**不是**从 Factory 基线派生的产品，锁的形状是 `catalog-hub`（`factory.lock.json`），不得伪装成 product。它拥有一个别的仓没有的面：**catalog 投影**。
- **Agent 编排边界（是边界，不是禁令）**：**允许并要求**在 **DSH 宿主**内用多 **Subagent** 拆分与并行任务；
  **禁止**在**产品应用代码**里引入编排框架或编排运行时。
  - 允许：宿主内拆分/并行只读或彼此独立的任务；宿主的 Subagent 调用不属于产品代码。
  - 禁止：产品应用代码及其运行时依赖（app/components/lib/hooks/stores/scripts）里出现 agent framework / orchestrator runtime / 多 agent 调度依赖。
  - 判据：`app` `components` `lib` `hooks` `stores` `scripts` 不得 import 编排 SDK；`package.json` 的运行时依赖不得出现编排框架。宿主侧的 Subagent 调用不是产品代码，不受此限。
- **Catalog 投影（本仓的核心不变式）**：索引由根控制面 catalog 生成（`pnpm catalog:sync` / `pnpm catalog:check`，产物 `lib/generated/factory-catalog.json`）。
  - **运行时只读生成物**，不跨仓读取：站点在任何一台机器上、没有根控制面也必须能构建与运行。
  - **事实只能来自 catalog**：身份、kind、端口、门禁、工厂/套件状态、部署状态与地址；展示层只提供展示名、说明与缩略图。
  - **未知不是 public**：只有 catalog 记录了已核实的 `deployment.productionUrl` 才是 public 且可点击；其余显示「未部署 / 受保护」，不给死链接、不猜地址。受 SSO 保护的地址不得称为 public。
  - **上游不可用时不判 PASS**：找不到根 catalog 时，`pnpm catalog:check` 只验证生成物内部完整性并打印 `[upstream-unavailable]`，输出 `INTEGRITY-OK (UPSTREAM UNVERIFIED)`；它**不会**说自己通过。
- **模型路由**：provider `opencode-go-dsv41` / model `deepseek-flash` / reasoning effort `max`（2026-09-15 与 DSH 模型目录核对）。Subagent 默认走这条路由；改路由先改 `factory-policy.json`。
- **单 worktree 单写者**（`single-writer`）：同一棵工作副本同一时间只有一个写者；要并行写就各自独立 worktree。两个写者共享一棵树，冲突不是概率问题，是时间问题。
- **共享路径单 owner**（`single-owner`）：`AGENTS.md`、`package.json`、`factory-policy.json`、`factory.lock.json`、契约 schema、门禁脚本与 `lib/generated/factory-catalog.json` 这类共享面，同一时间只有一个 owner，其余 agent 只读。
- **test / qa 串行**（`serial`）：`pnpm test` 与 `pnpm qa` **永不并发**（Next 16 dev server 按项目加锁，并行只会在错误的 server 上出结果）。CI 里同样不得拆成两个并行 job。
- **HVA（人工视觉验收）**：`required-before-release` —— 没有 HVA 就没有发布；Agent 不能替人验收，未完成时状态只能是 `READY FOR HUMAN VISUAL ACCEPTANCE`。
- **部署授权**：`explicit-user-authorization` —— 源码发布 ≠ Production 部署。没有用户明确授权，不创建/提升 Production 部署、不改 Deployment Protection、不 push Production Branch；CI 不调用 Vercel CLI、不持有任何部署凭证。详见 `docs/deployment.md`。

机器可读副本：`factory-policy.json` · 关键值：`lib/factory-policy.schema.json` · 平台锁：`factory.lock.json` · 校验器：`scripts/guard-agent-policy.mjs`（`pnpm factory:agents`）。
<!-- END:factory-core-policy -->

---

## 1 · 这个仓是什么

Prototype Hub 是一个**平台/目录仓**（角色 `platform-catalog-hub`）：

- 它是**门户**：把工作区里的原型收进一个可浏览的索引页（Next.js 16 App Router）。
- 它是**投影**：索引的每一条事实——有哪些仓、什么角色、有没有公开地址——
  都由根控制面的 catalog 生成，而不是手写的。
- 它**不是**从 Factory 基线派生的产品：没有 `init-contract.json`，没有基线派生来源，
  锁的形状是 `catalog-hub` 而不是 `product`（见 `factory.lock.json` 与
  `lib/factory-lock.schema.json` 的说明）。

所有权边界：本仓拥有自己的源码、`factory.lock.json`、`docs/**` 与生成物。
它**不拥有**根控制面：`catalog/**`、`contracts/**`、`workspace-policy.json`
都是**只读输入**。要改 catalog，去根控制面改，然后回到本仓跑 `pnpm catalog:sync`。

---

## 2 · 索引 = 生成投影（本仓最重要的不变式）

```
FACTORY_CONTROL_ROOT（默认：本仓父目录）
  catalog/projects/*.json · compatibility.json · ports.json · workspace-policy.json
      │  pnpm catalog:sync        （scripts/sync-factory-catalog.mjs）
      ▼
  lib/generated/factory-catalog.json      ← 提交在仓里的生成物（确定性、可复核）
      │  lib/prototypes.ts（运行时只读生成物）
      ▼
  app/ · components/ 渲染
```

四条规则，缺一条这个设计就不成立：

1. **事实只能来自 catalog。** 身份、kind、端口、门禁、工厂/套件状态、部署状态与地址
   全部投影自 catalog。`lib/hub-presentation.json` 是**展示层**，只能提供展示名、
   一句话说明与缩略图——它不能新增条目，也不能改变任何一条事实。
   `pnpm catalog:check` 双向核对：多余的键与漏掉的条目都会失败。
2. **运行时只读生成物，不跨仓读取。** 站点在没有根控制面的机器上（CI、裸 clone、
   评审者的笔记本）必须能构建、能运行。运行时代码里不允许出现写死的部署地址——
   `catalog:check` 会扫描 `app` `components` `lib` 并在发现时失败。
3. **未知不是 public。** 只有 catalog 记录了已核实的 `deployment.productionUrl` 的条目
   才是 `public` 且可点击。其余条目渲染成**不可点击**的展板/索引行，
   标签是「未部署 / 受保护」。受 SSO 保护的地址不得称为 public，
   没有地址的条目不给死链接、不猜地址。**「大概指向那里」不是数据。**
4. **重复同步不产生噪音，来源可复核。** 生成物记录 `source.gitSha`、逐文件摘要与一个
   `syncedAt`；输入未变时 sync 字节不变（同样不推进 SHA/时间）。`catalog:check`
   在根可用时用 `git show <sha>:<path>` 逐文件重算摘要复核来源。

> **为什么要有这些规则。** 这里曾经是一张手写列表：AI Finance 被标成 `Stable` 并指向
> 一个后来变成 **404** 的地址（它旧的 production 部署返回 **410 Gone**），而没有任何东西
> 会因此变红。一个不能发现自己过期的目录，比没有目录更糟。

### 常用命令

```bash
pnpm catalog:sync      # 从根 catalog 重新生成投影（写 lib/generated/factory-catalog.json）
pnpm catalog:check     # 校验生成物与 catalog 是否一致（只读）
pnpm catalog:check --require-upstream   # 本地复核用：没有根就退出 2
pnpm catalog:sync --reanchor            # 显式把 source.gitSha 重新锚定到当前 HEAD
```

catalog 变了以后的标准动作：`pnpm catalog:sync` → review diff → `pnpm catalog:check` →
必要时在 `lib/hub-presentation.json` 里为新仓做一次显式的展示决定。

**standalone 模式不撒谎**：CI 里没有根控制面，`catalog:check` 只验证生成物内部完整性
（payloadDigest 自洽、展示层契约、运行时只读约束），打印 `[upstream-unavailable]`，
输出 `INTEGRITY-OK (UPSTREAM UNVERIFIED)`。**它不会说自己通过**，因为唯一没法查的那件事
正是「这份生成物是否仍然反映 catalog」。

---

## 3 · 质量门

```bash
pnpm factory:agents    # 策略门禁：编排边界、角色/锁形状、管理块逐字同步、schema 关键值、CI 契约
pnpm catalog:check     # 投影门禁：生成物 ↔ catalog ↔ 展示层 ↔ 运行时只读约束
pnpm lint
pnpm typecheck         # next typegen && tsc --noEmit
pnpm test              # Playwright e2e（端口守卫 + 自管 server，端口 3100）
pnpm build             # 生产构建
pnpm qa                # Browser QA：自管 server + 身份校验 + 双视口 × reduced-motion 扫描
```

`pnpm check` 依次跑完这些，并把 `pnpm factory:agents` 作为**第一项**。

任何一项失败：**禁止声称完成**。未执行、无法读取、缺少对照物时一律记为 UNKNOWN / SKIP
并写出原因——「没检查」永远不能被说成「通过」。

---

## 4 · 端口隔离与 QA（Factory v1.1 硬规则）

**Playwright 的 `reuseExistingServer` 会接受任何以 2xx/3xx 应答就绪 URL 的 server，
不做任何身份校验。** 端口 3000 是 Next 的默认端口；同机还跑着别的原型，
一个残留或不属于本项目的 server 会被当成「被测应用」，整套断言在**错误的页面**上通过——
而且不报错。

- QA 端口是 **3100**，唯一来源 `.qa/qa.config.mjs` 的 `QA_PORT`（`catalog/ports.json` 记为 unique）。
- **`reuseExistingServer: false`，永远**（不是 `!process.env.CI`）。
- **server 由当前 run 自己启动**，端口显式固定（否则 Next 会自动 +1 而 `baseURL` 还指着旧端口）。
- **身份校验**：`app/layout.tsx` 在 `<html>` 上渲染 `data-app-identity="prototype-hub"`。
  QA run 在开始断言前要求这个标记；应答 200 但没有标记 = **不是本应用**，直接失败。
  测试里也有一条对应的断言，Playwright 侧同样不会把「有东西应答」当成「本应用应答」。
- 端口被占用时用 `lsof -nP -iTCP:3100 -sTCP:LISTEN` 定位，**确认属于当前任务**再单独停止它。
- **禁止** `pkill -f "next dev"` / `pkill -f "next-server"`：那会杀掉同机其它原型。
- **test 与 qa 串行**：Next 16 的 dev server 按项目加锁，两者永不并发。

### QA 探针纪律

`0 / 0 = NaN`，而 `Math.abs(NaN - expected) > tolerance` 返回 `false` —— 断言会**静默通过**。
所有数值探针先 `Number.isFinite`；量不到就**大声失败**（见 `.qa/probe-guard.mjs`）。
横向溢出的判据是**三条一起**：`|innerWidth - 请求宽度| <= tolerance`、
`scrollWidth <= 宽度 + tolerance`、`scrollTo(9999,0)` 之后 `scrollX ≈ 0`。
只用 `scrollWidth - innerWidth` 会漏掉「Chromium 扩张了布局视口」这一整类问题。

**这份 QA 没有覆盖的部分**（写在 `docs/browser-qa.md`，也必须留在交接里）：
深色主题（本产品不实现 `prefers-color-scheme`，扫两遍只会得到两次同样的结果）、
真机触摸、跨浏览器（只有 Chromium）、真实部署上的表现（那是 `pnpm qa:online` 的事）。

---

## 5 · 部署授权（Vercel）

**部署模型是 Vercel 自身的 Git 集成，不是 CI。** CI 只做检查：不调用任何部署 CLI、
不持有任何部署 token、不创建 Preview/Production。

没有**明确授权**时，不得：创建 Vercel Project · link project · 修改 Production Branch ·
修改 Deployment Protection · 创建 Production deployment · 把 Preview 提升为 Production ·
创建 automation bypass secret · push 到项目的 Production Branch。

四条硬规则：

1. **push Production Branch 之前先探测再决定。** Production Branch 未知时也 **STOP**——
   「不知道」不等于「不会触发生产」。不允许「先 push 再 cancel」：Production 建起来之后
   cancel 不是回滚。`pnpm factory:deploy preflight --branch <b> [--production-branch <p>] [--authorized]`。
2. **部署身份必须核验 `target` / `git ref` / `git SHA` / `readyState`**，不得靠 URL 推断。
3. **受 SSO 保护的 URL 不得称为 public。** 只有匿名请求 2xx 才支持这个说法。
   受保护既不是失败，也不是 public。
4. **在线 QA 是观察者**：不部署、不 promote、不 merge、不 tag、**不创建 bypass secret**。
   身份先于 QA：给了 `--expect-sha` 却没给 `--identity` → 不跑。
   契约与命令见 `docs/deployment.md`；授权矩阵：`pnpm factory:deploy actions`。

---

## 6 · Git 与写入隔离

| 动作 | 是否默认允许 |
|---|---|
| 在 feature branch 上写文件 | 允许 |
| `git commit` | **需要明确授权** |
| `git push` / merge / 删除分支 | **需要明确授权** |

**红线命令（默认禁止）**：`git reset --hard` · `git clean -fd` · `git push --force` ·
`git push --force-with-lease` · `git branch -D` · `git checkout .` · `git restore .` · `rm -rf` ·
`pkill -f "next dev"` · `pkill -f "next-server"`。

- **一个 Subagent 同一时刻只写一棵 worktree**；要并行写就各自独立 worktree。
- **共享路径单 owner**：`AGENTS.md`、`package.json`、`factory-policy.json`、`factory.lock.json`、
  契约 schema、门禁脚本与 `lib/generated/factory-catalog.json` 同一时间只有一个 owner。
- **根控制面只读**：`catalog/**`、`contracts/**`、`workspace-policy.json` 一律只读输入。
- 分支策略：`main` 是稳定基线，开发一律在 `feature/<kebab-case>`。

---

## 7 · 视觉与交互（不要顺手改掉）

设计语言是 **Editorial Product Gallery**：暖纸底 + 墨色字 + 一个信号色（朱砂红）。
第一视觉是字标 **Prototype Lab**，不是仪表盘。明确不做：玻璃拟态、紫色 AI 模板、
满屏渐变、卡片网格。

- 文案一律来自 `lib/i18n/dictionaries/zh-CN.ts`，JSX 里不散落硬编码中文；
  首页可见的英文只允许是品牌字标 / 技术栈 / 展示层登记过的产品名。
- 动效只出现在五个位置（Hero 入场、缩略图揭开、卡片悬停、背景微动、导航下划线），
  曲线与时长来自 `lib/motion-presets.ts` 与 `app/globals.css` 的 token。
- **动画不能是内容可见性的前提**：`components/motion/reveal.tsx` 在 SSR / 水合前渲染成
  完全可见的元素，`whileInView` 保持默认阈值（数值型 `amount` / 负 `margin` 在
  motion@13.2.0 上会**静默失效**，元素永远停在 `opacity: 0`，页面看着正常、内容却是空的）。
- 悬停样式必须包在 `@media (hover: hover) and (pointer: fine)` 里（`hoverable:` 变体）。
- **不可点击的条目不许伪装成可点击**：没有公开地址就没有 `<a>`、没有外链箭头、
  没有 hover 暗示，CTA 显示「暂无公开地址」。

---

## 8 · 已知未决项（不猜）

记录在 `factory.lock.json` 的 `unresolved[]` 里，每条都有 `probe` 与 `checkedOn`，
`value` 恒为 `null`：

- `upstream/control-repo` —— 根控制仓的 reusable workflow 是否发布到某个 ref。未核实前
  本仓 CI 保持自包含（引用一个解析不了的 ref 会让 workflow 直接不可用）。
- `deployment/hub-live-revision-sha` —— 「页面上的那一版是否就是 `2d5cc8a`」。
  **已核实**的部分写在锁的 `deployment` 段（项目 `skillres-projects/prototype-hub`、project id、
  Latest Production URL、匿名 200、项目级 Production Branch = `main` + 出处、那次生产部署的
  SHA + 出处）；本仓没有独立复核到的部分（页面不暴露 commit）留在这里，值仍为 null。
  两半分开放，是为了不把「知道一半」说成「知道」。
- `ci/runtime` —— **已关闭（2026-09-16，不再是未决项）**：这份 CI 确实在 Actions 上跑过并被回读 ——
  当天四次 push 运行（`841a789` 35042199927、`2d5cc8a` 35045169397 与 35045341876、
  `a694b91` 35057401601）结论都是 `success`，两个 job（Quality gate → Browser QA (serial)）
  串行跑完。但要记住 CI 里跑的是 **standalone** 模式的 `catalog:check`
  （打印 `[upstream-unavailable]` / `INTEGRITY-OK (UPSTREAM UNVERIFIED)`）：
  它证明生成物内部自洽，**不等于**与根 catalog 一致。

> **线上地址的两次观察（都留着，因为可以对照）**：2026-09-16 上午该地址提供的还是**旧版**页面
> （手写索引 + `Stable` + 已经 404 的旧地址，也没有身份标记）；用户授权合并 `main` 之后，
> Vercel Git 集成为它创建了 Production 部署（`target=production` / `gitRef=main` /
> `gitSha=2d5cc8a` / `readyState=READY`），此后同一个 URL 匿名 200 / 43755 字节、
> 身份标记在位、`Stable` 与旧死链归零。所以 `catalog/projects/hub.json` 现在记录
> `productionUrl` 与 `productionBranch`（带出处），索引里 hub 自己也是 `public` + 可点击——
> 投影不需要改代码，这是 catalog 一侧的事实变了。**没有本仓独立复核过的只剩一件事**：
> 页面不暴露 commit，「页面 == `2d5cc8a`」没有被对上（见
> `unresolved[deployment/hub-live-revision-sha]`）。那次部署是用户授权合并触发的平台行为，
> 本仓没有创建、没有提升、没有改保护设置。

> **根控制面侧的第四分支已经补上（2026-09-16 核实）**：`contracts/factory-lock.schema.json`
> 用 `oneOf` 描述**四种**角色形状，`catalog-hub` 这一支从根仓 `fdbfbae` 起就在；
> `5f9a6b1` 又给它加了本锁的四个 provenance 字段（`productionBranch` /
> `productionBranchSource` / `latestProductionSha` / `latestProductionShaSource`）——
> 理由是：断言一个 Production Branch 而说不出它从哪来，正是这套东西要防的。
> 控制面的 `pnpm drift` 现在对六个锁都通过：2026-09-16 实测 67 pass · 0 fail · 8 warn ·
> 4 skip · 2 unknown（两个 unknown 是历史根文件的人工决定，退出码 2 来自它们，不来自 hub）。
> **不要为了「看着合规」把锁改回产品形状**：`kind: catalog-hub` 仍然是更准确的描述。
