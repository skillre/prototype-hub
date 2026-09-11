import { expect, test, type Page } from "@playwright/test"

import { prototypes, prototypeCount } from "../lib/prototypes"

/**
 * 与 registry 保持单一数据源：测试不硬编码名称 / 说明 / 缩略图路径。
 * 唯一被硬编码的是**生产地址**——那正是最需要被钉住的东西：
 * registry 里写错了，这里必须失败，而不是跟着错。
 */
const EXPECTED_URLS: Record<string, string> = {
  "ai-crm": "https://prototype-starter-skillres-projects.vercel.app/crm",
  "ai-finance": "https://prototype-ai-finance.vercel.app/",
}

const crm = prototypes.find((prototype) => prototype.slug === "ai-crm")!
const finance = prototypes.find((prototype) => prototype.slug === "ai-finance")!

/** 序号补零，与组件里的 `padStart(2, "0")` 同款。 */
const pad = (value: number) => String(value).padStart(2, "0")

/** 展板 = 某一原型在 registry 里的那块通栏链接。 */
function board(page: Page, slug: string) {
  const prototype = prototypes.find((entry) => entry.slug === slug)!
  return page.locator(`#registry a[href="${prototype.url}"]`)
}

/** 轮询 Tab 直到目标元素获得焦点（Tab 顺序变化时测试不会碎掉）。 */
async function tabUntilFocused(page: Page, selector: string, max = 20) {
  for (let i = 0; i < max; i += 1) {
    await page.keyboard.press("Tab")
    const focused = await page.evaluate(
      (sel) => document.activeElement?.matches(sel) ?? false,
      selector,
    )
    if (focused) return true
  }
  return false
}

test.describe("首页", () => {
  test("首页正常打开，第一视觉是 Prototype Lab", async ({ page }) => {
    const response = await page.goto("/")
    expect(response?.status()).toBe(200)

    // 唯一 h1，且是字标本身
    const headings = page.getByRole("heading", { level: 1 })
    await expect(headings).toHaveCount(1)
    await expect(headings).toHaveText("Prototype Lab")
    await expect(headings).toBeVisible()

    // 定位说明与描述
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "AI Agent 驱动的交互式产品原型",
      }),
    ).toBeVisible()
    await expect(
      page.getByText("探索通过 AI Agent 构建的真实可交互产品体验。"),
    ).toBeVisible()

    // 标题与语言
    await expect(page).toHaveTitle("智悟云 · Prototype Lab")
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN")
  })

  test("registry 现在同时收录 AI CRM 与 AI Finance", async ({ page }) => {
    await page.goto("/")

    const registry = page.locator("#registry")
    await expect(
      registry.getByRole("heading", { level: 2, name: "原型索引" }),
    ).toBeVisible()

    // 计数文案跟随 registry 条目数（Hero 底栏的 Index 同源）
    expect(prototypeCount).toBeGreaterThanOrEqual(2)
    await expect(registry).toContainText(`${pad(prototypeCount)} 个原型`)
    await expect(page.locator("#top")).toContainText(
      `${pad(prototypeCount)} 个原型`,
    )

    // 两块展板都在，顺序与 registry 一致，序号各自独立
    const boards = registry.locator("article")
    await expect(boards).toHaveCount(prototypeCount)
    await expect(boards.nth(0)).toContainText(crm.name)
    await expect(boards.nth(1)).toContainText(finance.name)
    await expect(boards.nth(0).getByText("01", { exact: true })).toBeVisible()
    await expect(boards.nth(1).getByText("02", { exact: true })).toBeVisible()

    // 非精选层此时应为空：两块展板已经占满主展示位，
    // 「更多原型」的分组标题不应该以一个空区块的形式出现。
    await expect(registry.getByText("更多原型")).toHaveCount(0)
  })

  for (const prototype of prototypes) {
    test(`registry 展示 ${prototype.name} 条目`, async ({ page }) => {
      await page.goto("/")

      const card = board(page, prototype.slug)
      await expect(card).toBeVisible()

      // 分类 / 状态 / 说明 / CTA 都在展板里
      await expect(card).toContainText(prototype.category)
      await expect(card).toContainText(prototype.status)
      await expect(card).toContainText(prototype.description)
      await expect(card).toContainText("打开原型")

      // 缩略图带 alt
      const thumbnail = card.getByRole("img")
      await expect(thumbnail).toHaveAttribute("alt", prototype.thumbnailAlt)
      await expect(thumbnail).toHaveAttribute(
        "src",
        new RegExp(`${prototype.slug}\\.svg`),
      )
    })

    test(`${prototype.name} 缩略图真实加载（HTTP 200 + 已解码）`, async ({
      page,
    }) => {
      const [svgResponse] = await Promise.all([
        page.waitForResponse((response) =>
          response.url().endsWith(prototype.thumbnail),
        ),
        page.goto("/"),
      ])
      expect(svgResponse.status()).toBe(200)

      const thumbnail = board(page, prototype.slug).getByRole("img")
      await thumbnail.scrollIntoViewIfNeeded()

      // naturalWidth > 0 才算真的解码成功：路径写错 / SVG 坏掉时是 0
      await expect
        .poll(
          () =>
            thumbnail.evaluate((img) => (img as HTMLImageElement).naturalWidth),
          { timeout: 10_000 },
        )
        .toBeGreaterThan(0)
    })

    /**
     * 回归测试：motion 的 whileInView 在数值型 amount / 负 rootMargin 下
     * 会静默失效，缩略图永远停在 opacity 0 —— 页面看着正常，内容是空的。
     *
     * 先断言「水合后确实被隐藏」（说明入场动画真的被武装了），
     * 再断言「滚进视口后确实变可见」。只测后者的话，动画彻底坏掉、
     * 元素根本没被隐藏的实现也会通过。
     *
     * 第二条 entry 加入后，这个约束必须对**每一块**展板成立。
     */
    test(`${prototype.name} 缩略图进入视口后真正可见，不停留在 opacity 0`, async ({
      page,
    }) => {
      await page.goto("/")

      const panel = board(page, prototype.slug).locator("div[class*='aspect']")
      const opacity = () =>
        panel.evaluate((el) => getComputedStyle(el).opacity)

      // 首屏之下：水合完成后应处于隐藏的起手状态
      await expect.poll(opacity, { timeout: 10_000 }).toBe("0")

      await panel.scrollIntoViewIfNeeded()

      // 进入视口后必须真的被揭示
      await expect.poll(opacity, { timeout: 10_000 }).toBe("1")

      await expect(panel.locator("img")).toBeVisible()
    })

    test(`${prototype.name} 链接指向生产地址且为新标签页`, async ({ page }) => {
      await page.goto("/")

      const card = board(page, prototype.slug)
      await expect(card).toHaveAttribute("href", EXPECTED_URLS[prototype.slug])
      await expect(card).toHaveAttribute("target", "_blank")
      await expect(card).toHaveAttribute("rel", /noopener/)
      await expect(card).toHaveAttribute("rel", /noreferrer/)
    })

    test(`点击展板会在新标签页打开 ${prototype.name}`, async ({
      page,
      context,
    }) => {
      const url = EXPECTED_URLS[prototype.slug]
      // 用本地应答替代外站请求：只验证导航意图，不依赖外网可达性，
      // 也不触碰该部署的 Deployment Protection。
      await context.route(`${url}*`, (route) =>
        route.fulfill({
          status: 200,
          contentType: "text/html; charset=utf-8",
          body: `<!doctype html><title>${prototype.name}</title><p>stub</p>`,
        }),
      )
      await page.goto("/")

      const card = board(page, prototype.slug)
      const [popup] = await Promise.all([
        context.waitForEvent("page"),
        card.click(),
      ])

      await expect.poll(() => popup.url(), { timeout: 10_000 }).toBe(url)

      // 原页面不受影响
      await expect(page).toHaveURL(/localhost:3100\/$/)
    })
  }

  test("键盘可以依次走到两张展板", async ({ page }) => {
    await page.goto("/")

    // 第一个 Tab 落在跳转链接上
    await page.keyboard.press("Tab")
    await expect(page.getByRole("link", { name: "跳到主要内容" })).toBeFocused()

    // 一次 Tab 一块展板：整块是一个链接，中间没有多余的 tab stop
    for (const prototype of prototypes) {
      const reached = await tabUntilFocused(
        page,
        `a[href="${EXPECTED_URLS[prototype.slug]}"]`,
      )
      expect(reached, `${prototype.name} 展板无法用键盘到达`).toBe(true)
    }

    // 到达即获得可见焦点环
    const focusedOutline = await page.evaluate(
      () => getComputedStyle(document.activeElement as Element).outlineWidth,
    )
    expect(focusedOutline).not.toBe("0px")
  })

  test("语义结构正确：区块有可访问名称", async ({ page }) => {
    await page.goto("/")

    await expect(page.locator("header")).toBeVisible()
    await expect(page.locator("footer")).toBeVisible()
    await expect(page.locator("main#main")).toBeVisible()
    await expect(page.locator("nav")).toHaveAttribute("aria-label", "主导航")
    await expect(page.locator("section#registry")).toHaveAttribute(
      "aria-labelledby",
      "registry-title",
    )
    await expect(page.locator("section#about")).toHaveAttribute(
      "aria-labelledby",
      "about-title",
    )

    // 每块展板的可访问名称包含原型名
    for (const prototype of prototypes) {
      await expect(
        page.getByRole("link", { name: new RegExp(prototype.name) }),
      ).toBeVisible()
    }
  })

  /**
   * registry 自身的体检。第二条 entry 是第一次真正验证 schema 的
   * 可扩展性：分类、状态、地址、缩略图约定都必须对每个条目成立。
   */
  test("registry 数据卫生：slug / 分类 / 状态 / 生产地址 / 缩略图", () => {
    const seen = new Set<string>()

    for (const prototype of prototypes) {
      expect(prototype.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(seen.has(prototype.slug)).toBe(false)
      seen.add(prototype.slug)

      expect(prototype.name.trim()).not.toBe("")
      expect(prototype.url).toMatch(/^https:\/\//)
      expect(prototype.thumbnail).toMatch(/^\/thumbnails\/.+\.svg$/)
      expect(prototype.thumbnailAlt.trim().length).toBeGreaterThan(10)

      // 界面语言是 zh-CN：说明与替代文本必须是中文，
      // 新增条目时不能靠英文占位糊过去。
      expect(prototype.description).toMatch(/[\u4e00-\u9fa5]/)
      expect(prototype.thumbnailAlt).toMatch(/[\u4e00-\u9fa5]/)

      // 每个条目都要显式登记生产地址，新增时被迫确认一次
      expect(EXPECTED_URLS[prototype.slug]).toBe(prototype.url)
    }

    expect(prototypeCount).toBe(prototypes.length)
    expect(prototypes.map((prototype) => prototype.category)).toContain(
      "Finance",
    )
  })
})

test.describe("桌面 1440 × 900", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("两块展板纵向堆叠、同宽、16:10，且无横向溢出", async ({ page }) => {
    await page.goto("/")

    const boards = page.locator("#registry article")
    await expect(boards).toHaveCount(prototypeCount)

    const first = await boards.nth(0).boundingBox()
    const second = await boards.nth(1).boundingBox()
    expect(first).not.toBeNull()
    expect(second).not.toBeNull()

    // 纵向堆叠：第二块的顶边在第一块底边之下
    expect(second!.y).toBeGreaterThanOrEqual(first!.y + first!.height - 1)
    // 同一栅格：两块宽度一致
    expect(Math.abs(first!.width - second!.width)).toBeLessThanOrEqual(1)
    // 展板不超出视口宽度
    expect(first!.width).toBeLessThanOrEqual(1440)

    // 两块展板的图像位都是 16:10（新增条目不能破坏画面比例）
    for (let index = 0; index < prototypeCount; index += 1) {
      const panel = boards.nth(index).locator("div[class*='aspect']")
      const box = await panel.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.width / box!.height).toBeCloseTo(1.6, 1)
    }

    // 没有横向滚动
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
  })

  test("两块展板在同一屏宽下视觉权重一致（不是一大一小）", async ({
    page,
  }) => {
    await page.goto("/")

    const boards = page.locator("#registry article")
    const boxes = await Promise.all([
      boards.nth(0).boundingBox(),
      boards.nth(1).boundingBox(),
    ])

    // 高度差控制在 10% 以内：两块展板结构相同，文案长度不同
    // 不应该把其中一块压成另一个量级。
    const [a, b] = boxes.map((box) => box!.height)
    expect(Math.abs(a - b) / Math.max(a, b)).toBeLessThan(0.1)
  })
})

test.describe("移动端 390 × 844", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true })

  test("移动端首页正常且无横向溢出", async ({ page }) => {
    await page.goto("/")

    await expect(
      page.getByRole("heading", { level: 1, name: "Prototype Lab" }),
    ).toBeVisible()
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "AI Agent 驱动的交互式产品原型",
      }),
    ).toBeVisible()

    // 导航保留为可见链接，而不是压缩成汉堡菜单
    const nav = page.getByRole("navigation", { name: "主导航" })
    await expect(nav.getByRole("link", { name: "原型" })).toBeVisible()
    await expect(nav.getByRole("link", { name: "关于" })).toBeVisible()

    // 两块展板在窄屏仍然完整可见
    for (const prototype of prototypes) {
      const card = board(page, prototype.slug)
      await card.scrollIntoViewIfNeeded()
      await expect(card).toBeVisible()
      await expect(card.getByRole("img")).toBeVisible()

      // 缩略图确实被绘制（移动端曾整块卡在 opacity 0）
      const panel = card.locator("div[class*='aspect']")
      await expect
        .poll(() => panel.evaluate((el) => getComputedStyle(el).opacity), {
          timeout: 10_000,
        })
        .toBe("1")

      // CTA 不应被拉伸成通栏横幅
      const cta = card.locator("span", { hasText: "打开原型" }).last()
      const ctaBox = await cta.boundingBox()
      expect(ctaBox).not.toBeNull()
      expect(ctaBox!.width).toBeLessThan(260)
    }

    // 没有横向滚动
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
  })

  for (const prototype of prototypes) {
    test(`移动端 ${prototype.name} 展板不遮挡点击目标`, async ({ page }) => {
      await page.goto("/")

      const card = board(page, prototype.slug)
      await card.scrollIntoViewIfNeeded()

      const box = await card.boundingBox()
      expect(box).not.toBeNull()
      // 通栏展板在 390 宽下应占据几乎全部内容宽度
      expect(box!.width).toBeGreaterThan(300)
      expect(box!.width).toBeLessThanOrEqual(390)
    })
  }
})

test.describe("本地化", () => {
  /**
   * 硬编码英文泄漏审计：首页可见文本里的拉丁词必须全部来自词典，
   * 白名单 = 品牌字标 / 技术栈 / 分类与状态的枚举值。
   * 新增条目时如果随手写英文占位，这里会直接报出是哪个词。
   */
  test("首页不出现词典之外的硬编码英文", async ({ page }) => {
    await page.goto("/")

    const ALLOWED = new Set([
      "prototype", // 字标 Prototype Lab / 区块标签 Prototype Registry
      "registry", // 同上，区块标签的一部分
      "lab",
      "index", // Hero 底栏字段名
      "stack",
      "next.js",
      "react",
      "tailwind",
      "the", // 区块标签 02 / The Lab
      "ai", // 产品名与文案中的 AI
      "agent", // "AI Agent 驱动的交互式产品原型"
      "crm", // 原型名 AI CRM
      "finance", // 原型名 AI Finance / 分类值 Finance
      "sales", // 分类值 Sales
      "stable", // 状态值 Stable
    ])

    const words = await page.evaluate(() => {
      const text = document.body.innerText
      const found = text.match(/[A-Za-z][A-Za-z.'/-]*/g) ?? []
      return Array.from(new Set(found.map((word) => word.toLowerCase())))
    })

    const leaked = words.filter((word) => !ALLOWED.has(word))
    expect(leaked, `未登记的硬编码英文：${leaked.join(", ")}`).toEqual([])
  })
})
