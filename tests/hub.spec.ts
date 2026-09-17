import { expect, test, type Page } from "@playwright/test"

import {
  featuredPrototypes,
  listedPrototypes,
  prototypes,
  prototypeCount,
  prototypeHref,
  publiclyReachableCount,
} from "../lib/prototypes"

/**
 * 首页 e2e。
 *
 * 与数据保持单一来源：名称 / 说明 / 缩略图 / 链接 / 计数全部从**投影**
 * （`lib/generated/factory-catalog.json` → `lib/prototypes.ts`）派生，
 * 测试不硬编码条目清单。
 *
 * 唯一被显式钉住的，是**不该存在的东西**：
 *   - 没有已核实公开地址的条目，页面上不能出现可点击的外链；
 *   - 旧的手写生产地址（AI Finance 的 404 地址、starter 的 CRM 地址）不得出现。
 * 这两条是这次改造的实质：一张手写列表可以说任何话，而一个投影不能。
 */

/** 序号补零，与组件里的 `padStart(2, "0")` 同款。 */
const pad = (value: number) => String(value).padStart(2, "0")

/** 曾经写在 lib/prototypes.ts 里、现在必须不存在的地址。 */
const FORBIDDEN_URLS = [
  "prototype-ai-finance.vercel.app",
  "prototype-starter-skillres-projects.vercel.app",
]

/** 条目在页面上的标题。展板用 article，索引行用 li。 */
function entry(page: Page, slug: string) {
  return page.locator(`#registry [data-prototype="${slug}"]`)
}

/** 有图像位的条目（精选展板）。 */
function board(page: Page, slug: string) {
  return page.locator(`#registry article[data-prototype="${slug}"]`)
}

/** 轮询 Tab 直到目标元素获得焦点（Tab 顺序变化时测试不会碎掉）。 */
async function tabUntilFocused(page: Page, selector: string, max = 30) {
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

/** 三条一起判断的横向溢出面：只用 scrollWidth - innerWidth 会漏掉视口扩张。 */
async function overflowReport(page: Page) {
  return page.evaluate(() => {
    window.scrollTo(9999, 0)
    const scrollX = window.scrollX
    window.scrollTo(0, 0)
    return {
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      scrollX,
    }
  })
}

test.describe("首页", () => {
  test("首页正常打开，第一视觉是 Prototype Lab", async ({ page }) => {
    const response = await page.goto("/")
    expect(response?.status()).toBe(200)

    const headings = page.getByRole("heading", { level: 1 })
    await expect(headings).toHaveCount(1)
    await expect(headings).toHaveText("Prototype Lab")
    await expect(headings).toBeVisible()

    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "AI Agent 驱动的交互式产品原型",
      }),
    ).toBeVisible()
    await expect(
      page.getByText("探索通过 AI Agent 构建的真实可交互产品体验。"),
    ).toBeVisible()

    await expect(page).toHaveTitle("智悟云 · Prototype Lab")
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN")
  })

  /**
   * 身份校验 —— 与 QA 探针同一条判据。
   *
   * 端口上的「有东西应答 200」不构成「这是本应用」。这条断言是 Playwright 侧的
   * 身份证明：`app/layout.tsx` 渲染的标记必须存在，而这个标记只有本应用会写。
   */
  test("被访问的应用确实是 Prototype Hub（身份标记）", async ({ page }) => {
    await page.goto("/")
    await expect(page.locator('html[data-app-identity="prototype-hub"]')).toHaveCount(1)
  })

  test("registry 渲染的正是 catalog 投影里的条目", async ({ page }) => {
    await page.goto("/")

    const registry = page.locator("#registry")
    await expect(
      registry.getByRole("heading", { level: 2, name: "原型索引" }),
    ).toBeVisible()

    // 计数文案跟随投影条目数（Hero 底栏的 Index 同源）
    expect(prototypeCount).toBe(6)
    await expect(registry).toContainText(`${pad(prototypeCount)} 个原型`)
    await expect(page.locator("#top")).toContainText(`${pad(prototypeCount)} 个原型`)

    // 页面上的条目集合 == 投影的条目集合，每个恰好一次
    const ids = await page.$$eval("#registry [data-prototype]", (nodes) =>
      nodes.map((node) => node.getAttribute("data-prototype")),
    )
    expect(ids).toHaveLength(prototypeCount)
    for (const prototype of prototypes) {
      expect(ids.filter((id) => id === prototype.slug)).toHaveLength(1)
    }

    await expect(page.locator("#registry article")).toHaveCount(
      featuredPrototypes.length,
    )
    await expect(page.locator("#registry li[data-prototype]")).toHaveCount(
      listedPrototypes.length,
    )
    await expect(registry).toContainText(String(listedPrototypes.length).padStart(2, "0"))
  })

  for (const prototype of prototypes) {
    test(`${prototype.name}：条目内容与投影一致`, async ({ page }) => {
      await page.goto("/")

      const card = entry(page, prototype.slug)
      await expect(card).toBeVisible()
      await expect(card).toHaveAttribute("data-availability", prototype.availability)
      await expect(card).toHaveAttribute(
        "data-clickable",
        prototype.clickable ? "true" : "false",
      )

      await expect(card).toContainText(prototype.name)
      await expect(card).toContainText(prototype.description)
      await expect(card).toContainText(prototype.category)
      await expect(card).toContainText(prototype.statusLabel)
    })

    test(`${prototype.name}：有公开地址才可点击，否则不伪装成链接`, async ({ page }) => {
      await page.goto("/")

      const card = entry(page, prototype.slug)
      const href = prototypeHref(prototype)

      if (href === null) {
        // 没有已核实的公开地址：不许有任何指向它的链接，也不许出现外链箭头
        //（那个箭头就是「可点」的承诺）。展板还会把 CTA 换成「暂无公开地址」；
        // 索引行本来就没有 CTA，它靠状态标签说明。
        await expect(card.locator("a[href]")).toHaveCount(0)
        await expect(card.locator("svg.lucide-arrow-up-right")).toHaveCount(0)
        await expect(card).toContainText(prototype.statusLabel)
        if (prototype.featured) {
          await expect(card).toContainText("暂无公开地址")
        }
      } else {
        const link = card.locator(`a[href="${href}"]`)
        await expect(link).toHaveCount(1)
        await expect(link).toHaveAttribute("target", "_blank")
        await expect(link).toHaveAttribute("rel", /noopener/)
        await expect(link).toHaveAttribute("rel", /noreferrer/)

        if (prototype.featured) {
          // 展板的 CTA 是可点的「打开原型」
          await expect(card).toContainText("打开原型")
        } else {
          // 索引行没有 CTA 按钮，它用外链箭头 + 屏幕阅读器提示表达「可点」
          await expect(card.locator("svg.lucide-arrow-up-right")).toHaveCount(1)
          await expect(card).toContainText("在新标签页打开")
        }
      }
    })
  }

  test("精选展板按时序排布，序号从 01 开始", async ({ page }) => {
    await page.goto("/")

    for (const [index, prototype] of featuredPrototypes.entries()) {
      const card = board(page, prototype.slug)
      await expect(card).toBeVisible()
      await expect(card.getByText(pad(index + 1), { exact: true })).toBeVisible()
    }
  })

  /**
   * 缩略图：每个展板各一条测试（各自一个新的 browser context，因此缓存不会让
   * 「真实加载」变成一次 304 —— 断言的是真实取到字节，而不是「浏览器缓存里有」）。
   */
  for (const prototype of featuredPrototypes) {
    test(`${prototype.name} 缩略图：路径符合约定、真实加载、已解码`, async ({ page }) => {
      const [response] = await Promise.all([
        page.waitForResponse((candidate) =>
          candidate.url().endsWith(prototype.thumbnail),
        ),
        page.goto("/"),
      ])
      expect(response.status()).toBe(200)

      const card = board(page, prototype.slug)
      const thumbnail = card.getByRole("img")
      await expect(thumbnail).toHaveAttribute("alt", prototype.thumbnailAlt)
      await expect(thumbnail).toHaveAttribute(
        "src",
        new RegExp(`${prototype.thumbnail?.split("/").pop()?.replace(".", "\\.")}`),
      )

      await thumbnail.scrollIntoViewIfNeeded()
      await expect
        .poll(
          () => thumbnail.evaluate((img) => (img as HTMLImageElement).naturalWidth),
          { timeout: 10_000 },
        )
        .toBeGreaterThan(0)
    })
  }

  /**
   * 回归测试：motion 的 whileInView 在数值型 amount / 负 rootMargin 下会静默失效，
   * 元素永远停在 opacity 0 —— 页面看着正常，内容是空的。
   *
   * 先断言「水合后确实被隐藏」（说明入场动画真的被武装了），
   * 再断言「滚进视口后确实变可见」。
   */
  test("缩略图进入视口后真正可见，不停留在 opacity 0", async ({ page }) => {
    await page.goto("/")

    for (const prototype of featuredPrototypes) {
      const panel = board(page, prototype.slug).locator("div[class*='aspect']")
      const opacity = () => panel.evaluate((el) => getComputedStyle(el).opacity)

      await expect.poll(opacity, { timeout: 10_000 }).toBe("0")
      await panel.scrollIntoViewIfNeeded()
      await expect.poll(opacity, { timeout: 10_000 }).toBe("1")
      await expect(panel.locator("img")).toBeVisible()
    }
  })

  test("页面上不存在旧的手写地址，也不存在未授权的站外链接", async ({ page }) => {
    await page.goto("/")

    const hrefs = await page.$$eval('a[href^="http"]', (nodes) =>
      nodes.map((node) => node.getAttribute("href") ?? ""),
    )

    // 只有投影里记录了公开地址的条目才允许有外部链接。
    expect(hrefs).toHaveLength(publiclyReachableCount)
    for (const href of hrefs) {
      expect(
        prototypes.some((prototype) => prototypeHref(prototype) === href),
        `${href} 不在投影的公开地址里`,
      ).toBe(true)
    }

    const html = await page.content()
    for (const forbidden of FORBIDDEN_URLS) {
      expect(html).not.toContain(forbidden)
    }
    // 「Stable」这类手写成熟度断言不应出现在首页可见文本里。
    const body = await page.locator("body").innerText()
    expect(body).not.toContain("Stable")
  })

  test("键盘顺序：跳过链接第一，可点击条目可达", async ({ page }) => {
    await page.goto("/")

    await page.keyboard.press("Tab")
    await expect(page.getByRole("link", { name: "跳到主要内容" })).toBeFocused()

    const reachable = prototypes.filter((prototype) => prototypeHref(prototype) !== null)
    if (reachable.length === 0) {
      // 当前没有任何已核实的公开地址：registry 里就不该存在可聚焦的链接。
      // 这不是空断言——它证明「不可点击」是页面结构上的事实，而不是 CSS 效果。
      await expect(page.locator("#registry a")).toHaveCount(0)
      return
    }

    for (const prototype of reachable) {
      const href = prototypeHref(prototype)!
      const reached = await tabUntilFocused(page, `a[href="${href}"]`)
      expect(reached, `${prototype.name} 展板无法用键盘到达`).toBe(true)
    }

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

    for (const prototype of prototypes) {
      await expect(entry(page, prototype.slug)).toContainText(prototype.name)
    }
  })

  test("页脚说明索引的来源，不假装数据是手写的", async ({ page }) => {
    await page.goto("/")
    await expect(page.locator("footer")).toContainText("索引由根 catalog 生成")
  })

  /** 投影数据卫生：新增条目时这些约定必须自动成立。 */
  test("投影数据卫生：slug / 分类 / 状态 / 地址 / 缩略图", () => {
    const seen = new Set<string>()

    for (const prototype of prototypes) {
      expect(prototype.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(seen.has(prototype.slug)).toBe(false)
      seen.add(prototype.slug)

      expect(prototype.name.trim()).not.toBe("")
      expect(prototype.description).toMatch(/[\u4e00-\u9fa5]/)
      expect(prototype.category.length).toBeGreaterThan(0)
      expect(["未部署 / 受保护", "公开", "未核实"]).toContain(prototype.statusLabel)

      if (prototype.url !== null) {
        expect(prototype.url).toMatch(/^https:\/\//)
        expect(prototype.clickable).toBe(true)
      } else {
        expect(prototype.clickable).toBe(false)
      }

      if (prototype.thumbnail !== null) {
        expect(prototype.thumbnail).toMatch(/^\/thumbnails\/.+\.svg$/)
        expect(prototype.thumbnailAlt).not.toBeNull()
        expect(prototype.thumbnailAlt!).toMatch(/[\u4e00-\u9fa5]/)
        expect(prototype.thumbnailAlt!.trim().length).toBeGreaterThan(10)
      }
    }

    expect(prototypeCount).toBe(prototypes.length)
    expect(featuredPrototypes.length + listedPrototypes.length).toBe(prototypeCount)
  })
})

test.describe("桌面 1440 × 900", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("展板纵向堆叠、同宽、16:10，且无横向溢出", async ({ page }) => {
    await page.goto("/")

    const boards = page.locator("#registry article")
    await expect(boards).toHaveCount(featuredPrototypes.length)

    const boxes = await Promise.all(
      Array.from({ length: featuredPrototypes.length }, (_, index) =>
        boards.nth(index).boundingBox(),
      ),
    )

    for (let index = 0; index < boxes.length; index += 1) {
      const box = boxes[index]
      expect(box).not.toBeNull()
      expect(box!.width).toBeLessThanOrEqual(1440)

      const panel = boards.nth(index).locator("div[class*='aspect']")
      const panelBox = await panel.boundingBox()
      expect(panelBox).not.toBeNull()
      expect(panelBox!.width / panelBox!.height).toBeCloseTo(1.6, 1)

      if (index > 0) {
        expect(box!.y).toBeGreaterThanOrEqual(
          boxes[index - 1]!.y + boxes[index - 1]!.height - 1,
        )
        expect(Math.abs(box!.width - boxes[index - 1]!.width)).toBeLessThanOrEqual(1)
      }
    }

    const overflow = await overflowReport(page)
    expect(Math.abs(overflow.innerWidth - 1440)).toBeLessThanOrEqual(1)
    expect(overflow.scrollWidth).toBeLessThanOrEqual(1440 + 1)
    expect(Math.abs(overflow.scrollX)).toBeLessThanOrEqual(1)
  })

  test("展板在同一屏宽下视觉权重一致（不是一大一小）", async ({ page }) => {
    await page.goto("/")

    const boards = page.locator("#registry article")
    const boxes = await Promise.all(
      Array.from({ length: featuredPrototypes.length }, (_, index) =>
        boards.nth(index).boundingBox(),
      ),
    )

    for (let index = 1; index < boxes.length; index += 1) {
      const a = boxes[index - 1]!.height
      const b = boxes[index]!.height
      expect(Math.abs(a - b) / Math.max(a, b)).toBeLessThan(0.1)
    }
  })

  test("索引行承载没有图像位的条目", async ({ page }) => {
    await page.goto("/")

    const rows = page.locator("#registry li[data-prototype]")
    await expect(rows).toHaveCount(listedPrototypes.length)

    if (listedPrototypes.length > 0) {
      await expect(page.locator("#registry")).toContainText("更多原型")
      for (const prototype of listedPrototypes) {
        await expect(entry(page, prototype.slug)).toContainText(prototype.name)
      }
    }
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

    const nav = page.getByRole("navigation", { name: "主导航" })
    await expect(nav.getByRole("link", { name: "原型" })).toBeVisible()
    await expect(nav.getByRole("link", { name: "关于" })).toBeVisible()

    for (const prototype of prototypes) {
      const card = entry(page, prototype.slug)
      await card.scrollIntoViewIfNeeded()
      await expect(card).toBeVisible()

      const box = await card.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.width).toBeGreaterThan(300)
      expect(box!.width).toBeLessThanOrEqual(390)
    }

    for (const prototype of featuredPrototypes) {
      const panel = board(page, prototype.slug).locator("div[class*='aspect']")
      await expect
        .poll(() => panel.evaluate((el) => getComputedStyle(el).opacity), {
          timeout: 10_000,
        })
        .toBe("1")
    }

    const cta = page.locator("#registry article span", { hasText: "暂无公开地址" }).first()
    if ((await cta.count()) > 0) {
      const ctaBox = await cta.boundingBox()
      expect(ctaBox).not.toBeNull()
      expect(ctaBox!.width).toBeLessThan(260)
    }

    const overflow = await overflowReport(page)
    expect(Math.abs(overflow.innerWidth - 390)).toBeLessThanOrEqual(1)
    expect(overflow.scrollWidth).toBeLessThanOrEqual(390 + 1)
    expect(Math.abs(overflow.scrollX)).toBeLessThanOrEqual(1)
  })
})

test.describe("本地化", () => {
  /**
   * 硬编码英文泄漏审计：首页可见文本里的拉丁词必须全部来自词典或展示层登记过的
   * 产品名，白名单 = 品牌字标 / 技术栈 / 展示层里的仓名 / 术语。
   *
   * 词元包含数字（`STH` 是一个词元而不是 `S`），否则「STH Incident Command」这种
   * 名字会退化成把一个单字母塞进白名单，那道白名单也就形同虚设。
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
      "agent", // "AI Agent 驱动的交互式产品原型"
      "catalog", // 页脚溯源说明：索引由根 catalog 生成
      // 展示层登记的产品名与术语（lib/hub-presentation.json）
      "ai",
      "crm",
      "finance",
      "research",
      "hub",
      "kits",
      "sth",
      "incident",
      "command",
      "starter",
    ])

    const words = await page.evaluate(() => {
      const text = document.body.innerText
      const found = text.match(/[A-Za-z][A-Za-z0-9.'/-]*/g) ?? []
      return Array.from(new Set(found.map((word) => word.toLowerCase())))
    })

    const leaked = words.filter((word) => !ALLOWED.has(word))
    expect(leaked, `未登记的硬编码英文：${leaked.join(", ")}`).toEqual([])
  })
})
