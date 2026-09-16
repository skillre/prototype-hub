/**
 * zh-CN 词典 —— 全部用户可见文案的唯一来源。
 *
 * 规则：JSX 里不写中文散句。新增文案先加到这里，再在组件里按 key 取。
 * 纯数据（无函数），因此可以安全地跨 Server / Client 边界传递。
 */
export const zhCN = {
  /** 站点元信息 */
  meta: {
    title: "智悟云 · Prototype Lab",
    titleTemplate: "%s · 智悟云 Prototype Lab",
    description:
      "探索通过 AI Agent 构建的真实可交互产品体验。智悟云 Prototype Lab 收录可点击、可操作的高保真产品原型。",
  },

  /** 品牌 */
  brand: {
    company: "智悟云",
    product: "Prototype Lab",
    lockup: "智悟云 · Prototype Lab",
    /** Hero 首行小字：与下方巨型字标共同构成「智悟云 · Prototype Lab」 */
    eyebrow: "智悟云 ·",
  },

  /** 导航 */
  nav: {
    label: "主导航",
    registry: "原型",
    about: "关于",
    skipToContent: "跳到主要内容",
  },

  /** 首页 Hero */
  hero: {
    display: "Prototype Lab",
    lede: "AI Agent 驱动的交互式产品原型",
    body: "探索通过 AI Agent 构建的真实可交互产品体验。",
    primaryCta: "浏览原型",
    secondaryCta: "了解 Prototype Lab",
    scrollCue: "向下浏览",
    /** 数值由 registry 计算，词典只负责标签与单位。 */
    facts: {
      index: { label: "Index", unit: "个原型" },
      stack: { label: "Stack", value: "Next.js · React · Tailwind" },
    },
  },

  /** Prototype Registry 区块 */
  registry: {
    index: "01 / Prototype Registry",
    title: "原型索引",
    description:
      "索引由根 catalog 生成：哪些仓存在、各自处于什么状态、有没有可公开的地址，都以事实为准。",
    countPrefix: "收录",
    countUnit: "个原型",
    /** 非精选条目的分组标题（没有签名视觉的仓落在这里） */
    indexListTitle: "更多原型",
  },

  /** Prototype 卡片 */
  card: {
    categoryLabel: "分类",
    /** 屏幕阅读器读出的字段名：显示的是部署可得性，不是成熟度评分 */
    availabilityLabel: "部署",
    cta: "打开原型",
    /** 没有已核实公开地址时的 CTA 文案（不可点击） */
    unavailableCta: "暂无公开地址",
    externalHint: "在新标签页打开",
    previewAltFallback: "原型预览",
  },

  /** 实验室说明区块 */
  about: {
    index: "02 / The Lab",
    title: "关于 Prototype Lab",
    description: "这里不是作品集截图墙，而是一间持续开工的产品实验室。",
    points: [
      {
        index: "01",
        title: "真实交互",
        body: "每个原型都能点、能筛、能拖动，本地状态真实变化——不是静态稿，也不是演示视频。",
      },
      {
        index: "02",
        title: "Agent 构建",
        body: "由 AI Agent 依据产品规范实现，从信息架构、排版层级到动效曲线都由同一套设计系统约束。",
      },
      {
        index: "03",
        title: "前端优先",
        body: "无数据库、无鉴权、无后端服务：原型本身就是产品，打开即用。",
      },
    ],
  },

  /** 页脚 */
  footer: {
    tagline: "AI Agent 驱动的交互式产品原型",
    backToTop: "回到顶部",
    rights: "保留所有权利",
    /** 索引的来源说明：页面上不出现手写的事实 */
    catalogNote: "索引由根 catalog 生成",
    catalogSnapshot: "快照",
  },

  /** 404 */
  notFound: {
    index: "Error 404",
    title: "页面不存在",
    body: "这个地址没有对应的原型。回到首页继续浏览。",
    cta: "返回首页",
  },
}

/** 词典形状：新增语言时按此结构补齐即可。 */
export type Dictionary = typeof zhCN
