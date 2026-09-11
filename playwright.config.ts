import { defineConfig, devices } from "@playwright/test"

/**
 * 最小可用 Playwright 配置：
 * - 单一 chromium project
 * - 自带 webServer（CI 下冷启动，本地复用已运行的 dev server）
 * - 端口 3100，避免与本机其他 Next dev server 冲突
 */
const PORT = 3100
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `pnpm dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
