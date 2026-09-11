# 智悟云 · Prototype Lab

> AI Agent 驱动的交互式产品原型

Prototype Hub 是一个 **Prototype 展示门户**：把做好的交互式产品原型收进一个
Premium Showcase / Editorial Product Gallery，让人一眼看见、一点就开。

它不是 SaaS Dashboard，也不是组件文档站。第一视觉是字标 **Prototype Lab**，
不是仪表盘。

- **前端独立**：没有数据库、没有鉴权、没有后端服务、没有 Docker、不是 monorepo。
- **数据只有一个来源**：`lib/prototypes.ts`。加一个原型 = 加一条 entry。
- **中文优先**：所有用户可见文案都在 `lib/i18n/dictionaries/zh-CN.ts`，JSX 里不散落硬编码中文。

技术栈：Next.js 16（App Router）· React 19 · TypeScript · Tailwind CSS v4 ·
shadcn/ui · Motion。

---

## 快速开始

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

质量门（提交前必须全绿）：

```bash
pnpm lint         # ESLint
pnpm typecheck    # next typegen && tsc --noEmit
pnpm test         # Playwright e2e（自带 webServer，端口 3100）
pnpm build        # 生产构建
pnpm check        # lint + typecheck + test
```

首次跑 e2e 需要安装浏览器：`pnpm exec playwright install chromium`。

---

## Prototype Registry

注册表在 [`lib/prototypes.ts`](lib/prototypes.ts)，是整个门户的唯一数据源。
首页、卡片、链接、计数、SEO 全部由它派生。

```ts
export interface Prototype {
  name: string          // 展示名称，例如 "AI CRM"
  slug: string          // 唯一标识，kebab-case
  description: string   // 一句话说明
  category: PrototypeCategory
  status: PrototypeStatus        // "Stable" | "Beta" | "In Progress"
  url: string                    // 真实部署地址
  thumbnail: string              // public/ 下的静态资源路径
  thumbnailAlt: string           // 缩略图替代文本（必填）
  featured: boolean              // 是否进入首页主展示位
}
```

### 当前收录

| | |
| --- | --- |
| **AI CRM** | 智能销售工作台 · Sales · Stable |
| URL | <https://prototype-starter-skillres-projects.vercel.app/crm> |

> **关于 Deployment Protection**
> AI CRM 部署在 Vercel 上并开启了 Deployment Protection（访问者需要先登录
> Vercel 账号）。门户只负责链接，**不做任何绕过**，也不修改 Vercel 设置。

### 布局如何随原型变多而扩展

首页的 Registry 区块分成两层，由 `featured` 自动分流：

1. **精选展板** —— `featured: true` 的条目渲染成通栏编辑式大卡：
   元信息行（序号 / 分类 / 状态）→ 名称与说明 + CTA → 大幅视觉预览。
   目前只有 AI CRM，占据这一位。
2. **索引行** —— `featured: false` 的条目渲染成紧凑的编号列表行。
   当前列表为空，条目一加进来就会自动出现。

也就是说：**新增原型不需要改任何组件**，只需要在注册表里加一条。

---

## 如何添加一个 Prototype

1. **放缩略图**：把预览图丢进 `public/thumbnails/`，例如
   `public/thumbnails/ai-analytics.svg`（SVG / PNG / WebP 都可以，推荐 16:10）。

2. **加一条 registry entry**：

   ```ts
   // lib/prototypes.ts
   export const prototypes: Prototype[] = [
     { /* AI CRM ... */ },
     {
       name: "AI Analytics",
       slug: "ai-analytics",
       description: "经营分析工作台",
       category: "Analytics",          // 需要时先在 PrototypeCategory 里补上
       status: "Beta",
       url: "https://your-deployment.vercel.app/analytics",
       thumbnail: "/thumbnails/ai-analytics.svg",
       thumbnailAlt: "AI Analytics 经营分析视图预览",
       featured: false,                // false → 出现在索引行
     },
   ]
   ```

3. **跑一遍门禁**：`pnpm check && pnpm build`。

不需要写新组件、不需要改页面、不需要动 i18n（除非这条原型带来了新的界面文案）。

### 链接行为

`url` 是站外地址（`http(s)://`）时，卡片自动用
`target="_blank" rel="noopener noreferrer"` 新标签页打开；站内路径则同标签页跳转。
判断逻辑在 `isExternalUrl()` / `linkTargetProps()`，不要在每个组件里重复写。

---

## 视觉与动效约定

设计语言是 **Editorial Product Gallery**：暖纸底 + 墨色字 + 一个信号色（朱砂红，
只用在状态点、区块序号、焦点环、CTA 箭头）。

明确不做：玻璃拟态、紫色 AI 模板、满屏渐变、满屏 glow、巨大 UI 组件、卡片网格。

动效只出现在五个地方，且都很克制：

| 位置 | 实现 |
| --- | --- |
| Hero 入场 | 四拍淡入上浮（`enterTransition`），只发生一次 |
| 缩略图入场 | `clip-path` 从下往上揭开 |
| 卡片悬停 | 边框加深、缩略图 1.02 缩放、箭头位移、标题下划线扫过 |
| 背景微动 | 极低透明度环境光跟随光标（spring 平滑） |
| 导航交互 | 下划线从左扫入 |

约定写在 [`lib/motion-presets.ts`](lib/motion-presets.ts) 与 `app/globals.css`
（自定义缓动曲线 + `@custom-variant hoverable`）。

### ⚠️ 两个已经踩过的坑

1. **悬停样式必须包在 `@media (hover: hover) and (pointer: fine)` 里**
   （Tailwind 里用 `hoverable:` / `group-hoverable:` 变体）。触屏设备点按会触发
   `:hover`，不加媒体查询会出现假悬停。

2. **`whileInView` 的 `viewport` 保持默认阈值 `{ once: true }`。**
   实测 `motion@13.2.0` 上，数值型 `amount`（如 `amount: 0.2`）和负 `margin`
   （如 `margin: "-120px"`）都会让 `whileInView` **静默失效**：元素永远停在
   `opacity: 0`，页面看起来正常，内容却是空的。`tests/hub.spec.ts` 里有一条
   回归测试专门盯这个。

3. **动画不能是内容可见性的前提。** `components/motion/reveal.tsx` 在 SSR /
   水合前渲染成完全可见的普通 `div`，挂载后才升级成带 `whileInView` 的
   `motion.div`。无 JS、爬虫、截图工具拿到的都是内容本身。

---

## Responsive

断点以 Tailwind 默认值为准，重点验证两个尺寸：

| 尺寸 | 表现 |
| --- | --- |
| **1440 × 900** | 字标占满整个行宽；Registry 展板为「文本左 / CTA 右」的两端对齐；缩略图通栏 |
| **390 × 844** | 字标折成两行；导航保留为可见链接（不做汉堡菜单）；展板纵向堆叠，CTA 靠左不再通栏；缩略图整幅可见 |

移动端不是把桌面压扁：Hero 的字号、间距、CTA 排布、展板的堆叠顺序都单独调过。
e2e 里有一条测试专门断言 390 宽下 **没有横向滚动**。

---

## 测试

```bash
pnpm test                              # 全部
pnpm exec playwright test tests/hub.spec.ts --project=chromium
```

`tests/hub.spec.ts` 覆盖：

1. 首页正常打开，唯一 `h1` 就是字标 `Prototype Lab`
2. Prototype Registry 展示 AI CRM 条目（分类 / 状态 / 说明 / CTA / 缩略图 alt）
3. 卡片链接指向生产地址，且 `target="_blank" rel="noopener noreferrer"`
4. **点击卡片会在新标签页打开 AI CRM**（外站请求用本地应答替代，不依赖外网）
5. 键盘可以走到 AI CRM 卡片（含 skip link）
6. 语义结构：`header` / `footer` / `main#main` / `nav[aria-label]` / 区块 `aria-labelledby`
7. **缩略图进入视口后真正可见**，不停留在 `opacity: 0`（回归测试）
8. 移动端 390 × 844 首页正常且无横向溢出
9. 移动端卡片宽度与 CTA 尺寸（不被拉伸成通栏横幅）

---

## 部署

**GitHub → Vercel**，不写任何 CI 自动化：

1. 推到 GitHub 分支
2. Vercel 自动生成 Preview Deployment
3. 需要上线时再合回 `main` → Vercel 生成 Production Deployment

**不要**用 Vercel CLI / API 做部署自动化，**不要**修改 Deployment Protection 设置。

---

## 目录结构

```
app/
  layout.tsx                      # 字体、metadata、LocaleProvider、Header/Footer
  page.tsx                        # 首页编排：Hero → Registry → The Lab
  not-found.tsx
  globals.css                     # 设计令牌 + 自定义变体 + 动效降级
components/
  hub/                            # 门户自身的组件
    site-header.tsx               # 滚动后落下分隔线的吸顶导航
    hero.tsx                      # 字标 + 定位说明 + 事实行
    ambient-field.tsx             # 细网格 + 跟随光标的环境光
    prototype-registry.tsx        # Registry 区块（精选展板 + 索引行）
    featured-prototype-card.tsx   # 精选展板（整块是一个链接）
    prototype-index-row.tsx       # 非精选条目的紧凑索引行
    lab-statement.tsx             # 02 / The Lab
    site-footer.tsx
    status-chip.tsx               # 状态 → 信号点
  motion/reveal.tsx               # SSR 安全（默认可见）的滚动入场
  ui/                             # shadcn/ui 原语（button / badge）
  i18n/locale-provider.tsx
lib/
  prototypes.ts                   # ← 唯一数据源
  i18n/                           # 词典与取词入口
  motion-presets.ts               # 缓动曲线与入场时长
  utils.ts                        # cn()
public/thumbnails/                # 每个原型一张预览图
tests/hub.spec.ts                 # Playwright e2e
```

---

## 许可

私有项目。© 智悟云 · Prototype Lab
