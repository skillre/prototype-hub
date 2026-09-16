# Browser QA

> `pnpm qa`（本地，自管 server）· `pnpm qa:online`（远端观察者）·
> 判据与实现都在 `.qa/` 下，配置的唯一来源是 `.qa/qa.config.mjs`。

## 1 · 为什么 QA 不是「跑一遍截图」

测试通过不等于页面成立。**一个静默通过的探针比没有探针更危险**：Factory v1.1 的
存在理由就是一次静默通过——Playwright 的 `reuseExistingServer` 接受任何以 2xx/3xx
应答就绪 URL 的 server，不做身份校验，于是整套断言在**错误的页面**上变绿，而且不报错。

本仓的 QA 因此建立在三条纪律上：

1. **server 必须由当前 run 自己启动**，端口显式固定（`.qa/qa.config.mjs:QA_PORT = 3100`）。
   `reuseExistingServer: false`，**永远**（不是 `!process.env.CI`）。
2. **身份先于断言。** `app/layout.tsx` 在 `<html>` 上渲染 `data-app-identity="prototype-hub"`；
   QA（与 `pnpm test` 里的一条 spec）要求这个标记。应答 200 但没有标记 = **不是本应用** → 失败。
   Next 的 dev server 在端口被占时会自动 +1，这条断言正是为了让那种情况**响**。
3. **量不到就失败。** 所有数值探针走 `.qa/probe-guard.mjs`：`NaN` / `undefined` /
   selector 未命中 → 大声失败。`0 / 0 = NaN`，而 `Math.abs(NaN - expected) > tolerance`
   返回 `false`——用「自然写法」写的断言会静默通过。

## 2 · 命令与退出码

```bash
pnpm qa                                  # 端口守卫 + 自管 server + 全量扫描（端口 3100）
pnpm qa --routes=/                       # 只扫一条路由
pnpm qa --base-url=http://localhost:3100 # 扫一个已经在跑的 origin（不管理 server）
pnpm qa:online --base-url=<url> --identity=<deployment.json> --expect-sha=<sha>
node .qa/hub-shots.mjs                   # 历史命令的兼容层，等价于 browser-qa
```

| 退出码 | 含义 |
|---|---|
| `0` | 全部检查通过 |
| `1` | 发现了问题（脚本列在输出与 `.qa/out/report.json` 里） |
| `2` | **没能运行**：端口被占、应答者不是本应用、远端受保护/不可达、缺少身份 —— 未核实不是通过 |

## 3 · 矩阵与判据

矩阵：**路由 × 视口 × 动效模式**。

| 维度 | 取值 | 说明 |
|---|---|---|
| 路由 | 从 `app/` 发现 + `/this-route-does-not-exist`（404 路由） | 动态段无法静态枚举，会被**显式报告为未覆盖** |
| 视口 | `1440×900`（desktop）· `390×844`（mobile, hasTouch） | 与产品断点一致 |
| 配色 | `light` | 本产品**不实现** `prefers-color-scheme`，扫两遍只是同一结果 |
| 动效 | `default` · `reduced`（`prefers-reduced-motion: reduce`） | 内容揭示最容易坏在这里 |

每个组合检查：

1. HTTP 状态符合预期；
2. 身份标记恰好出现 1 次，标题是 `智悟云 · Prototype Lab`；
3. **0** console error · **0** page error · **0** request failure；
4. registry 与 catalog 投影一致：条目集合、可点击性、以及**每一个外链都在投影的
   公开地址白名单里**（页面上出现白名单外的地址 = 死链接或猜出来的地址）；
5. 展板揭示状态 `opacity: 1`、图像位比例 16:10、缩略图已解码（`naturalWidth > 0`）；
6. **横向溢出三条一起**：
   `|innerWidth − 请求宽度| ≤ 1px` · `scrollWidth ≤ 宽度 + 1px` ·
   `scrollTo(9999,0)` 之后 `scrollX ≈ 0`。
   只用 `scrollWidth − innerWidth` 会漏掉「Chromium 扩张布局视口」这一整类问题
   （扩张之后两个值一起变大，看起来没有溢出，而页面是按一个用户不存在的宽度排版的）。

截图落在 `.qa/out/`（gitignored），报告是 `.qa/out/report.json`。

## 4 · 在线 QA（REMOTE）

```bash
node .qa/online-qa.mjs --base-url=<url> [--identity=<deployment.json>] [--expect-sha=<sha>]
```

- **同一份探针**：`.qa/sweep.mjs` 被本地与在线共用，差别只有 origin 与请求头——
  两套断言就是两个真相，迟早会分叉。
- **只观察，不编排**：不部署 · 不 promote · 不 merge · 不 tag · 不启动本地 server ·
  **不创建 bypass secret**。
- **身份先于 QA**：给了 `--expect-sha` 却没给 `--identity` → 直接 STOP。
  部署记录的 `target` / `ref` / `sha` / `readyState` 与期望不一致 → **在跑 QA 之前** STOP。
- **受保护不是失败，也不是 public**：302→SSO / 401 / 403 一律记为 protected 并按退出码 2
  停下（不发假绿）。没有用户提供的 secret 时**不尝试绕过**。
- secret 只能由用户通过 `QA_ONLINE_BYPASS_SECRET` 提供（→ `x-vercel-protection-bypass`），
  **不打印、不持久化、不提交**；使用了会在输出里披露，并提醒确认它是否仍然存在。

## 5 · 这份 QA **没有**覆盖的部分

写在交接里，也写在这里——缺这一项就不算合格交接：

- **深色主题**：产品不实现 `prefers-color-scheme`，矩阵里只有 light。
- **真机**：只有 Chromium（Playwright `Desktop Chrome` + 一个 mobile 视口），
  没有 WebKit / Firefox，也没有真实触摸硬件。
- **真实部署上的行为**：`pnpm qa` 只扫它自己启动的本地 server；部署侧必须用
  `pnpm qa:online`。2026-09-16 它在 hub 的公开地址上跑过一次（观察者模式，身份
  `production · main @ 2d5cc8a · READY` → `public` → 8 个组合全过，exit 0；见
  `docs/deployment.md` 第 6 节），但**其余五个仓的部署仍然没有被这样跑过**。
- **样式缺失（style presence）**：没有实现「与未加样式基线做差」那一类通道，
  路由级 CSS 缺失只靠视觉断言兜底。
- **可访问性**：只覆盖了结构化语义（区块名、身份标记、键盘可达性），
  没有做完整的无障碍树审计。

## 6 · 端口纪律

- 3100 是本仓的独占槽位（`catalog/ports.json` 记为 `unique`；其他仓在 3200 相撞）。
- 端口被占用时 `scripts/check-qa-port.mjs` 会在 Playwright 启动**之前**失败，
  并给出 `lsof -nP -iTCP:3100 -sTCP:LISTEN` 的定位方法。
- **禁止** `pkill -f "next dev"` / `pkill -f "next-server"`：那会杀掉同机其它原型。
  只停止你确认属于当前任务的那一个进程。
- `pnpm test` 与 `pnpm qa` **串行**：Next 16 的 dev server 按项目加锁（`.next/dev/lock`），
  并行只会在错误的 server 上出结果。CI 里它们是两个 job，`browser-qa` `needs:` 质量门。
