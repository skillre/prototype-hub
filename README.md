# 智悟云 · Prototype Lab

> AI Agent 驱动的交互式产品原型

Prototype Hub 是一个 **Prototype 索引门户**：把工作区里的产品原型收进一个
Editorial Product Gallery，让人一眼看见每个仓**现在是什么状态**。

它不是 SaaS Dashboard，也不是组件文档站。第一视觉是字标 **Prototype Lab**，
不是仪表盘。

- **前端独立**：没有数据库、没有鉴权、没有后端服务、没有 Docker、不是 monorepo。
- **索引是生成投影**：`lib/generated/factory-catalog.json` 由根 catalog 生成，
  运行时只读它，不跨仓读取。加一个仓 = 在根 catalog 加一条然后 `pnpm catalog:sync`。
- **不做无法证明的陈述**：没有已核实公开地址的条目显示「未部署 / 受保护」且不可点击。
- **中文优先**：所有用户可见文案都在 `lib/i18n/dictionaries/zh-CN.ts`，JSX 里不散落硬编码中文。

技术栈：Next.js 16（App Router）· React 19 · TypeScript · Tailwind CSS v4 ·
shadcn/ui · Motion。

---

## 快速开始

```bash
pnpm install
pnpm dev              # http://localhost:3000

pnpm catalog:sync     # 从根 catalog 重新生成索引投影
pnpm check            # factory:agents + catalog:check + lint + typecheck + test + build + qa
```

质量门（提交前必须全绿）：

```bash
pnpm factory:agents   # 策略门禁（编排边界 / 平台角色与锁形状 / 管理块同步 / CI 契约）
pnpm catalog:check    # 投影门禁（生成物 ↔ catalog ↔ 展示层 ↔ 运行时只读约束）
pnpm lint
pnpm typecheck        # next typegen && tsc --noEmit
pnpm test             # Playwright e2e（端口守卫 + 自管 server，端口 3100）
pnpm build            # 生产构建
pnpm qa               # Browser QA（自管 server + 身份校验 + 双视口 × reduced-motion）
```

首次跑 e2e / QA 需要安装浏览器：`pnpm exec playwright install chromium`。

---

## Prototype Registry 是投影，不是列表

```
FACTORY_CONTROL_ROOT（默认：本仓父目录）
  catalog/projects/*.json · compatibility.json · ports.json · workspace-policy.json
        │  pnpm catalog:sync
        ▼
  lib/generated/factory-catalog.json      ← 提交在仓里，运行时只读
        │  lib/prototypes.ts
        ▼
  lib/hub-presentation.json（展示名 / 说明 / 缩略图）
        ▼
  app/ · components/ 渲染
```

| 来源 | 提供什么 |
|---|---|
| 根 catalog（投影） | 有哪些仓、`kind`、端口、质量门、工厂锁、套件状态、**部署状态与地址** |
| `lib/hub-presentation.json`（展示层） | 展示名、一句话说明、缩略图 —— 不能新增条目，也不能改变任何事实 |

以前 `lib/prototypes.ts` 是一张手写数组，它说过一次谎：AI Finance 被标成 `Stable`
并指向一个后来返回 **404** 的地址（旧 production 部署 **410 Gone**），页面照常显示，
没有任何检查会红。现在条目集合与事实由投影决定，展示层只能决定「怎么显示」。

### 条目在页面上的两种形态

1. **精选展板** —— 展示层给了缩略图的条目渲染成通栏编辑式大卡：
   元信息行（序号 / 角色 / 部署状态）→ 名称与说明 + CTA → 大幅视觉预览。
2. **索引行** —— 没有缩略图的条目渲染成紧凑的编号列表行。

两种形态遵守同一条规则：**只有 catalog 记录了已核实公开地址的条目才是链接**。
其余条目没有 `<a>`、没有外链箭头、没有 hover 暗示，CTA 显示「暂无公开地址」，
状态标签显示「未部署 / 受保护」。**死链接和「看起来能点、点了没反应」是同一个错误。**

---

## 新增一个仓

1. 在**根控制面**加 `catalog/projects/<id>.json`。
2. 回到本仓：`pnpm catalog:sync` → review 生成物的 diff。
3. 想给它一块展板就把预览图放进 `public/thumbnails/`，然后在
   `lib/hub-presentation.json` 里登记 `{ name, description, thumbnail, thumbnailAlt }`；
   没有缩略图就写 `null`（它会进索引行）。**不登记会失败**——展示层与投影必须双向一致。
4. `pnpm check`。

### 链接行为

只有投影里 `deployment.publicUrl` 非空的条目才有地址；渲染时用
`prototypeHref(prototype)` 取值（不可点击返回 `null`）。站外地址自动
`target="_blank" rel="noopener noreferrer"`，判断在 `isExternalUrl()` / `linkTargetProps()`，
不要在组件里重复写。

`pnpm catalog:check` 会扫描 `app` `components` `lib`：**写死的部署地址**与
**手写的成熟度断言**（`"Stable"` 之类）都会让它失败。

---

## 视觉与动效约定

设计语言是 **Editorial Product Gallery**：暖纸底 + 墨色字 + 一个信号色（朱砂红，
只用在状态点、区块序号、焦点环、CTA 箭头）。明确不做：玻璃拟态、紫色 AI 模板、
满屏渐变、满屏 glow、巨大 UI 组件、卡片网格。

动效只出现在五个地方，且都很克制：

| 位置 | 实现 |
| --- | --- |
| Hero 入场 | 四拍淡入上浮（`enterTransition`），只发生一次 |
| 缩略图入场 | `clip-path` 从下往上揭开 |
| 卡片悬停 | 边框加深、缩略图 1.02 缩放、箭头位移、标题下划线扫过（**仅可点击条目**） |
| 背景微动 | 极低透明度环境光跟随光标（spring 平滑） |
| 导航交互 | 下划线从左扫入 |

约定写在 [`lib/motion-presets.ts`](lib/motion-presets.ts) 与 `app/globals.css`
（自定义缓动曲线 + `@custom-variant hoverable`）。

### ⚠️ 三个已经踩过的坑

1. **悬停样式必须包在 `@media (hover: hover) and (pointer: fine)` 里**
   （Tailwind 里用 `hoverable:` / `group-hoverable:` 变体）。触屏设备点按会触发
   `:hover`，不加媒体查询会出现假悬停。

2. **`whileInView` 的 `viewport` 保持默认阈值 `{ once: true }`。**
   实测 `motion@13.2.0` 上，数值型 `amount`（如 `amount: 0.2`）和负 `margin`
   （如 `margin: "-120px"`）都会让 `whileInView` **静默失效**：元素永远停在
   `opacity: 0`，页面看起来正常，内容却是空的。`tests/hub.spec.ts` 与 `pnpm qa`
   都有针对它的断言。

3. **动画不能是内容可见性的前提。** `components/motion/reveal.tsx` 在 SSR /
   水合前渲染成完全可见的普通 `div`，挂载后才升级成带 `whileInView` 的
   `motion.div`。无 JS、爬虫、截图工具拿到的都是内容本身。

---

## Responsive

断点以 Tailwind 默认值为准，重点验证两个尺寸：

| 尺寸 | 表现 |
| --- | --- |
| **1440 × 900** | 字标占满整个行宽；展板为「文本左 / CTA 右」的两端对齐；缩略图通栏 |
| **390 × 844** | 字标折成两行；导航保留为可见链接（不做汉堡菜单）；展板与索引行纵向堆叠，CTA 靠左不再通栏 |

移动端不是把桌面压扁：Hero 的字号、间距、CTA 排布、展板的堆叠顺序都单独调过。
e2e 与 `pnpm qa` 都断言 390 宽下**没有横向溢出**（三条判据一起，见下）。

---

## 测试

```bash
pnpm test                                       # 全部（先跑端口守卫）
pnpm exec playwright test tests/hub.spec.ts     # 只跑首页 e2e
pnpm exec playwright test tests/catalog-projection.spec.ts
```

- `tests/hub.spec.ts` —— 首页 e2e：身份标记、投影条目集合与页面条目集合逐一对齐、
  每个条目的可点击性、无授权外链不得出现、缩略图解码与揭示、键盘顺序、
  桌面 / 移动端布局、本地化白名单。
- `tests/catalog-projection.spec.ts` —— 投影本身：6 个条目、AI Finance 的 404/410 证据、
  「没有地址就不可点击」、展示层双向一致、运行时代码里没有写死的地址与手写断言、
  以及 `catalog:check` 在 standalone 模式下**不判 PASS**。

---

## Browser QA

测试通过不等于画面成立。`pnpm qa` 自己启动 server（端口 3100）、校验身份
（`html[data-app-identity="prototype-hub"]`）、按 **路由 × 视口 × 动效模式**
扫描，产出截图与 `.qa/out/report.json`，并在以下任一条不成立时失败：

- HTTP 状态、0 console error / 0 page error / 0 request failure；
- registry 与投影一致，且页面上**每一个外链都在投影的公开地址白名单里**；
- 展板揭示（`opacity: 1`）、图像位 16:10、缩略图已解码；
- **横向溢出三条一起**：`|innerWidth − 请求宽度| ≤ 1` · `scrollWidth ≤ 宽度 + 1` ·
  `scrollTo(9999,0)` 之后 `scrollX ≈ 0`。

```bash
pnpm qa                                              # 全量
pnpm qa --routes=/                                   # 只扫一条路由
pnpm qa:online --base-url=<url> --identity=… --expect-sha=…   # REMOTE 观察者
```

**端口隔离是硬规则**：`reuseExistingServer: false`（永远，不是 `!process.env.CI`），
server 由当前 run 自管，端口显式固定；端口被占时 `scripts/check-qa-port.mjs` 在
Playwright 启动前失败并给出 `lsof` 定位方法。**禁止** `pkill -f "next dev"`——
那会杀掉同机其它原型。细节与「没有覆盖的部分」见 [`docs/browser-qa.md`](docs/browser-qa.md)。

---

## 治理与部署

- 策略：`factory-policy.json` + `AGENTS.md` 的 `factory-core-policy v1.3.0` 管理块
  （`pnpm factory:agents` 逐字校验）。本仓角色是 `platform-catalog-hub`，
  锁的形状是 `kind: catalog-hub` —— 它**不是**从基线派生的产品。见
  [`docs/factory-governance.md`](docs/factory-governance.md)。
- 投影：见 [`docs/catalog-projection.md`](docs/catalog-projection.md)。
- 部署：**GitHub → Vercel Git Integration**，CI 只做检查（不调用任何部署 CLI、
  不持有部署凭证）。没有用户明确授权时不创建 / 不提升 Production、不改 Deployment
  Protection、不 push Production Branch。契约与授权矩阵见
  [`docs/deployment.md`](docs/deployment.md)（`pnpm factory:deploy actions`）。
- 线上部署：`https://prototype-hub-dusky.vercel.app/`（项目 `skillres-projects/prototype-hub`，
  匿名 200）。索引里 hub 自己是「公开」+ 可点击，因为 `catalog/projects/hub.json` 记录了
  已核实的地址；2026-09-16 该地址已由合并 `main` 触发的 Production 部署（`2d5cc8a`）刷新为
  本版——同一天上午它还是旧版页面，两次观察都留在
  [`docs/catalog-projection.md`](docs/catalog-projection.md) 第 9 节。
  本地仍无 `.vercel/` 链接（Vercel CLI 认证已过期），因此部署列表只能由控制面回读。

---

## 目录结构

```
app/
  layout.tsx                      # 字体、metadata、LocaleProvider、Header/Footer、身份标记
  page.tsx                        # 首页编排：Hero → Registry → The Lab
  not-found.tsx
  globals.css                     # 设计令牌 + 自定义变体 + 动效降级
components/
  hub/
    site-header.tsx               # 滚动后落下分隔线的吸顶导航
    hero.tsx                      # 字标 + 定位说明 + 事实行
    ambient-field.tsx             # 细网格 + 跟随光标的环境光
    prototype-registry.tsx        # Registry 区块（精选展板 + 索引行）
    featured-prototype-card.tsx   # 展板：有公开地址才是链接，否则是静态板
    prototype-index-row.tsx       # 没有图像位的条目的紧凑索引行
    lab-statement.tsx             # 02 / The Lab
    site-footer.tsx               # 含「索引由根 catalog 生成」的溯源说明
    status-chip.tsx               # 部署可得性 → 信号点
  motion/reveal.tsx               # SSR 安全（默认可见）的滚动入场
  ui/                             # shadcn/ui 原语（button / badge）
  i18n/locale-provider.tsx
lib/
  prototypes.ts                   # 投影的运行时门面（注册表 / 计数 / 链接判定）
  generated/factory-catalog.json  # ← 生成物：索引的唯一事实来源
  hub-presentation.json           # 展示层（展示名 / 说明 / 缩略图）
  factory-policy.schema.json      # 策略的关键值（const）
  factory-lock.schema.json        # 本仓锁的形状（kind: catalog-hub）
  i18n/                           # 词典与取词入口
  motion-presets.ts               # 缓动曲线与入场时长
scripts/
  sync-factory-catalog.mjs        # catalog:sync / catalog:check
  guard-agent-policy.mjs          # factory:agents
  verify-deployment.mjs           # factory:deploy
  check-qa-port.mjs               # 端口守卫
.qa/
  qa.config.mjs                   # 端口 / 矩阵的唯一来源
  sweep.mjs                       # 探针实现（本地与在线共用）
  browser-qa.mjs · online-qa.mjs  # 本地质量门 / REMOTE 观察者
  probe-guard.mjs · qa-server.mjs # 探针守卫 / server 身份校验
tests/
  hub.spec.ts                     # 首页 e2e
  catalog-projection.spec.ts      # 投影正确性
docs/
  catalog-projection.md · factory-governance.md · browser-qa.md · deployment.md
.github/workflows/ci.yml          # 质量门（自包含，无部署凭证，qa 串行）
public/thumbnails/                # 展板的预览图（1600 × 1000 = 16:10）
```

---

## 许可

私有项目。© 智悟云 · Prototype Lab
