import { expect, test, type Page } from "@playwright/test"

import { prototypes } from "../lib/prototypes"

/** 与 registry 保持单一数据源：测试不硬编码 URL / 名称。 */
const crm = prototypes.find((prototype) => prototype.slug === "ai-crm")!
const EXPECTED_URL = "https://prototype-starter-skillres-projects.vercel.app/crm"

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

  test("Prototype Registry 展示 AI CRM 条目", async ({ page }) => {
    await page.goto("/")

    const registry = page.locator("#registry")
    await expect(
      registry.getByRole("heading", { level: 2, name: "原型索引" }),
    ).toBeVisible()

    const card = registry.getByRole("link", { name: /AI CRM/ })
    await expect(card).toBeVisible()

    // 分类 / 状态 / 说明 / CTA 都在卡片里
    await expect(card).toContainText(crm.category)
    await expect(card).toContainText(crm.status)
    await expect(card).toContainText(crm.description)
    await expect(card).toContainText("打开原型")

    // 缩略图带 alt
    const thumbnail = card.getByRole("img")
    await expect(thumbnail).toHaveAttribute("alt", crm.thumbnailAlt)
    await expect(thumbnail).toHaveAttribute("src", /ai-crm\.svg/)
  })

  /**
   * 回归测试：motion 的 whileInView 在数值型 amount / 负 rootMargin 下
   * 会静默失效，缩略图永远停在 opacity 0 —— 页面看着正常，内容是空的。
   *
   * 先断言「水合后确实被隐藏」（说明入场动画真的被武装了），
   * 再断言「滚进视口后确实变可见」。只测后者的话，动画彻底坏掉、
   * 元素根本没被隐藏的实现也会通过。
   */
  test("缩略图进入视口后真正可见，不停留在 opacity 0", async ({ page }) => {
    await page.goto("/")

    const panel = page.locator(
      "#registry a[href*='vercel.app'] div[class*='aspect']",
    )
    const opacity = () =>
      panel.evaluate((el) => getComputedStyle(el).opacity)

    // 首屏之下：水合完成后应处于隐藏的起手状态
    await expect.poll(opacity, { timeout: 10_000 }).toBe("0")

    await panel.scrollIntoViewIfNeeded()

    // 进入视口后必须真的被揭示
    await expect.poll(opacity, { timeout: 10_000 }).toBe("1")

    await expect(panel.locator("img")).toBeVisible()
  })

  test("AI CRM 链接指向生产地址且为新标签页", async ({ page }) => {
    await page.goto("/")

    const card = page.locator("#registry").getByRole("link", { name: /AI CRM/ })
    await expect(card).toHaveAttribute("href", EXPECTED_URL)
    await expect(card).toHaveAttribute("target", "_blank")
    await expect(card).toHaveAttribute("rel", /noopener/)
    await expect(card).toHaveAttribute("rel", /noreferrer/)
  })

  test("点击卡片会在新标签页打开 AI CRM", async ({ page, context }) => {
    // 用本地应答替代外站请求：只验证导航意图，不依赖外网可达性，
    // 也不触碰该部署的 Deployment Protection。
    await context.route(`${EXPECTED_URL}*`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: "<!doctype html><title>AI CRM</title><p>stub</p>",
      }),
    )
    await page.goto("/")

    const card = page.locator("#registry").getByRole("link", { name: /AI CRM/ })
    const [popup] = await Promise.all([
      context.waitForEvent("page"),
      card.click(),
    ])

    await expect.poll(() => popup.url(), { timeout: 10_000 }).toBe(EXPECTED_URL)

    // 原页面不受影响
    await expect(page).toHaveURL(/localhost:3100\/$/)
  })

  test("键盘可以走到 AI CRM 卡片", async ({ page }) => {
    await page.goto("/")

    // 第一个 Tab 落在跳转链接上
    await page.keyboard.press("Tab")
    await expect(page.getByRole("link", { name: "跳到主要内容" })).toBeFocused()

    const reached = await tabUntilFocused(
      page,
      'a[href="https://prototype-starter-skillres-projects.vercel.app/crm"]',
    )
    expect(reached).toBe(true)
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

    // 展板与缩略图在窄屏仍然完整可见
    const card = page.locator("#registry").getByRole("link", { name: /AI CRM/ })
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

    // 没有横向滚动
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
  })

  test("移动端卡片不遮挡点击目标", async ({ page }) => {
    await page.goto("/")

    const card = page.locator("#registry").getByRole("link", { name: /AI CRM/ })
    await card.scrollIntoViewIfNeeded()

    const box = await card.boundingBox()
    expect(box).not.toBeNull()
    // 通栏展板在 390 宽下应占据几乎全部内容宽度
    expect(box!.width).toBeGreaterThan(300)
  })
})
