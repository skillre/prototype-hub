/**
 * Browser QA —— Prototype Hub。
 *
 * 目标：不靠「测试通过」自证，而是把首页真正渲染出来，
 * 检查两件事：
 *   1. 两块展板在不同视口下是否自然（截图留档，供人眼复核）
 *   2. 是否有横向溢出 / 控制台报错 / 请求失败 / 缩略图没解码
 *
 * 用法：先起 dev server（或让 Playwright 起），再
 *   node .qa/hub-shots.mjs
 */
import { chromium } from "@playwright/test"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

const BASE = process.env.HUB_BASE ?? "http://localhost:3100"
const OUT = path.join(process.cwd(), ".qa", "out")

const VIEWPORTS = [
  { name: "desktop-1440x900", width: 1440, height: 900, isMobile: false },
  { name: "mobile-390x844", width: 390, height: 844, isMobile: true },
]

const problems = []

async function main() {
  await mkdir(OUT, { recursive: true })
  const browser = await chromium.launch()
  const report = {}

  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.isMobile,
      deviceScaleFactor: 2,
    })
    const page = await context.newPage()

    const consoleErrors = []
    const pageErrors = []
    const failedRequests = []

    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text())
    })
    page.on("pageerror", (error) => pageErrors.push(String(error)))
    page.on("requestfailed", (request) =>
      failedRequests.push(`${request.url()} :: ${request.failure()?.errorText}`),
    )

    const response = await page.goto(`${BASE}/`, { waitUntil: "load" })
    if (response?.status() !== 200) {
      problems.push(`${viewport.name}: 首页 HTTP ${response?.status()}`)
    }

    // 让首屏之下的展板真正进入过视口，避免只看到 opacity 0 的起手状态
    const boards = page.locator("#registry article")
    const boardCount = await boards.count()
    for (let index = 0; index < boardCount; index += 1) {
      await boards.nth(index).scrollIntoViewIfNeeded()
      await page.waitForTimeout(1200)
    }

    const measurements = []
    const boardReport = []

    for (let index = 0; index < boardCount; index += 1) {
      const board = boards.nth(index)
      const link = board.locator("a").first()
      const image = board.locator("img").first()
      const panel = board.locator("div[class*='aspect']").first()

      const [box, panelBox, href, target, rel, name] = await Promise.all([
        board.boundingBox(),
        panel.boundingBox(),
        link.getAttribute("href"),
        link.getAttribute("target"),
        link.getAttribute("rel"),
        board.locator("h3").first().innerText(),
      ])

      const imageState = await image.evaluate((img) => ({
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        complete: img.complete,
        currentSrc: img.currentSrc,
        opacity: getComputedStyle(img).opacity,
      }))
      const panelOpacity = await panel.evaluate(
        (el) => getComputedStyle(el).opacity,
      )

      if (imageState.naturalWidth === 0) {
        problems.push(`${viewport.name}: ${name} 缩略图未解码`)
      }
      if (panelOpacity !== "1") {
        problems.push(
          `${viewport.name}: ${name} 图像位 opacity=${panelOpacity}（应已揭示）`,
        )
      }
      if (target !== "_blank" || !rel?.includes("noopener")) {
        problems.push(`${viewport.name}: ${name} 不是安全的新标签页链接`)
      }

      // 溢出检查：展板与图像位都不能越过视口
      for (const [label, box2] of [
        ["展板", box],
        ["图像位", panelBox],
      ]) {
        if (!box2) {
          problems.push(`${viewport.name}: ${name} ${label} 无尺寸`)
          continue
        }
        if (box2.x < 0 || box2.x + box2.width > viewport.width + 1) {
          problems.push(
            `${viewport.name}: ${name} ${label} 越界 x=${box2.x.toFixed(1)} w=${box2.width.toFixed(1)}`,
          )
        }
      }

      boardReport.push({
        name,
        href,
        target,
        rel,
        size: box ? `${Math.round(box.width)}×${Math.round(box.height)}` : null,
        aspect: panelBox
          ? (panelBox.width / panelBox.height).toFixed(3)
          : null,
        image: imageState,
        panelOpacity,
      })

      await board.screenshot({ path: path.join(OUT, `${viewport.name}-board-${index + 1}.png`) })
    }

    // 展板之间的间距：两块板要像画廊，而不是粘在一起
    if (boardCount > 1) {
      const boxes = await Promise.all(
        Array.from({ length: boardCount }, (_, index) =>
          boards.nth(index).boundingBox(),
        ),
      )
      const gap = boxes[1].y - (boxes[0].y + boxes[0].height)
      measurements.push({ gapBetweenBoards: Math.round(gap) })
      if (gap < 24) {
        problems.push(`${viewport.name}: 两块展板间距过小 ${gap}px`)
      }
    }

    const overflow = await page.evaluate(() => ({
      documentOverflow:
        document.documentElement.scrollWidth - window.innerWidth,
      bodyOverflow: document.body.scrollWidth - window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }))
    if (overflow.documentOverflow > 1) {
      problems.push(
        `${viewport.name}: 横向溢出 ${overflow.documentOverflow}px（scrollWidth ${overflow.scrollWidth} vs ${overflow.innerWidth}）`,
      )
    }

    // 找出真正越界的元素（如果有）
    const offenders = await page.evaluate((width) => {
      const found = []
      for (const element of document.querySelectorAll("body *")) {
        const rect = element.getBoundingClientRect()
        if (rect.width === 0) continue
        if (rect.right > width + 1 || rect.left < -1) {
          found.push(
            `${element.tagName.toLowerCase()}.${String(element.className).slice(0, 60)} → ${Math.round(rect.left)}..${Math.round(rect.right)}`,
          )
        }
      }
      return found.slice(0, 8)
    }, viewport.width)

    if (consoleErrors.length) {
      problems.push(`${viewport.name}: 控制台报错 → ${consoleErrors.join(" | ")}`)
    }
    if (pageErrors.length) {
      problems.push(`${viewport.name}: 页面异常 → ${pageErrors.join(" | ")}`)
    }
    if (failedRequests.length) {
      problems.push(
        `${viewport.name}: 请求失败 → ${failedRequests.join(" | ")}`,
      )
    }

    await page.screenshot({
      path: path.join(OUT, `${viewport.name}-hero.png`),
      clip: { x: 0, y: 0, width: viewport.width, height: viewport.height },
    })
    await page.screenshot({
      path: path.join(OUT, `${viewport.name}-full.png`),
      fullPage: true,
    })
    await page.locator("#registry").screenshot({
      path: path.join(OUT, `${viewport.name}-registry.png`),
    })

    report[viewport.name] = {
      boardCount,
      boards: boardReport,
      measurements,
      overflow,
      offenders,
      consoleErrors,
      pageErrors,
      failedRequests,
    }

    await context.close()
  }

  await browser.close()

  await writeFile(
    path.join(OUT, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  )

  console.log(JSON.stringify(report, null, 2))
  if (problems.length) {
    console.error("\nQA 发现问题：")
    for (const problem of problems) console.error(`  ✗ ${problem}`)
    process.exit(1)
  }
  console.log("\nQA OK —— 两块展板均正常，无溢出 / 无控制台报错 / 缩略图已解码")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
