# 部署授权与身份（Deployment）

> 部署模型是 **Vercel 自身的 Git 集成**，不是 CI。
> CI（`.github/workflows/ci.yml`）只做检查：不调用任何部署 CLI、不持有任何部署凭证、
> 不创建 Preview/Production。
>
> 机器判据在 `scripts/lib/deploy-contract.mjs`，入口是 `pnpm factory:deploy`。

## 0 · 两道人工闸门

- **HVA（人工视觉验收）先于发布**。Agent 可以准备证据（截图、在线 QA 报告、身份记录），
  但不能替人验收。未完成时状态只能是 `READY FOR HUMAN VISUAL ACCEPTANCE`。
  **没有 `READY FOR RELEASE` 这个状态。**
- **部署是独立的一次人工授权**。源码发布 ≠ Production 部署。没有用户对「这一版、这一次」
  的明确授权，不创建、不提升、不改保护设置。

## 1 · 授权矩阵（`pnpm factory:deploy actions`）

| 动作 | 授权 |
|---|---|
| 读取部署列表 / 单个部署状态 | 无需授权（只读） |
| 创建 Vercel Project | **需要明确授权** |
| link project（写 `.vercel/`、绑定仓库） | **需要明确授权** |
| 修改 Production Branch | **需要明确授权** |
| 修改 Deployment Protection / SSO | **需要明确授权** |
| 创建 Production deployment | **需要明确授权**（一次一授权，且只能发已验收的 RC SHA） |
| 把 Preview 提升为 Production | **需要明确授权** |
| 创建 / 使用 automation bypass secret | **需要明确授权**（见 §4） |
| push 到 Production Branch | **需要明确授权**（可能自动创建 Production，见 §2） |
| merge feature → main | **需要明确授权** |

## 2 · push 之前先探测（preflight）

```bash
node scripts/verify-deployment.mjs preflight --branch feature/x [--production-branch main] [--authorized]
```

- **Production Branch 未知 → STOP。** 「不知道」不等于「不会触发生产」。
- 分支就是 Production Branch 且没有授权 → STOP。
- **不允许「先 push 再 cancel」**：Production deployment 建起来之后，cancel 不是回滚。

## 3 · 部署身份：`target` / `git ref` / `git SHA` / `readyState`

```bash
node scripts/verify-deployment.mjs verify --deployment deployment.json [--rc <已验收 SHA>]
```

URL 不是身份。`https://x-git-branch-team.example` 看起来像分支地址，但它可以是任意别名；
只有 API 自己的字段说明**构建了什么**。身份不完整（缺 `target` / `ref` / `sha` / `readyState`）
即判失败——"看起来对"不是判据。

发布验收时，Production 部署的 SHA 必须**等于**已验收 RC 的 SHA（短 SHA 只接受无歧义前缀），
并且 `readyState === READY`。`readyState: READY` 必要不充分；平台的 `live` 字段不作为判据。

## 4 · 「受保护」不是「公开」，也不是失败

```bash
node scripts/verify-deployment.mjs access --status 302 --location https://…/sso
```

| 匿名请求 | 结论 |
|---|---|
| 2xx | 唯一支持称之为 **public** 的证据 |
| 302 → `/sso`、`/vercel/sso` | **protected**，不得称为 public |
| 302（非 SSO） | redirect —— 跟随之后重新判断；重定向本身不证明公开 |
| 401 / 403 | **protected**，不得称为 public |
| 其他 / 无状态码 | unknown，不得称为 public |

**`vercel curl` 会顺带创建 automation bypass secret。** 那不是普通 curl，是一次平台状态变更。
执行前说明，或执行后立即披露（谁创建的、scope 是什么、是否仍然存在）。
`pnpm qa:online` 不创建任何 secret：它只接受用户通过 `QA_ONLINE_BYPASS_SECRET`
提供的值，且不打印、不持久化、不提交。

## 5 · 本仓的部署现状（2026-09-16 核实）

**已核实（写在 `factory.lock.json` 的 `deployment` 段）：**

- 项目是 `skillres-projects/prototype-hub`，project id `prj_Vz6w0EwclApNmGZ7MrWku0I7UZjB`
  —— 由控制面通过 Vercel CLI 回读确认（本仓不持有 CLI 认证）。
- Latest Production URL `https://prototype-hub-dusky.vercel.app/`；本仓独立做了匿名只读探测：
  `curl -s -D- https://prototype-hub-dusky.vercel.app/` → **HTTP/2 200**（`server: Vercel`，
  无 SSO 跳转）。**只有匿名 2xx 才支持「public」这个说法**，这里成立。
- 该地址当前提供的是**旧版**页面：手写索引（`AI CRM` / `AI Finance` / `Stable`）+
  旧地址 `https://prototype-ai-finance.vercel.app/`（已 404）与 starter 的 CRM 地址，
  且不含新的 `data-app-identity="prototype-hub"` 标记。`pnpm qa:online --base-url=<该地址>`
  会把这一点说清楚（它确实这样说过：identity 0 次、投影条目 0/6、两个未授权外链）。

**未核实（留在 `unresolved[deployment/hub-production-branch-and-sha]`，value 仍为 null）：**

- Production Branch 是什么；线上那一版对应哪个 git SHA；是否等于某个已验收的 RC。
  没有 `target` / `git ref` / `git SHA` / `readyState` 就没有「这一版已验收」这句话。
- 本地没有 `.vercel/` 链接，`catalog/compatibility.json` 记 `vercel.cliAuth = "expired"`，
  所以本仓自己无法回读这三项——「知道一半」不写成「知道」。

**因此：**

- 投影里 hub 仍是 `productionUrl: null` / 「未部署 / 受保护」且不可点击：地址的事实来自 catalog，
  而 catalog 还没记录它（`catalog/projects/hub.json` 仍是 `linked=false, productionUrl=null`，
  与刚核实到的项目事实不一致）。**控制面把地址写进 catalog 之后，下一次 `pnpm catalog:sync`
  会自动把它变成 public + 可点击**——投影不需要改代码，也不需要手改生成物。
- **本轮没有执行任何部署动作**：未创建、未链接、未提升、未修改保护设置、未 push。
  让线上从「旧版」变成「这一版」是一次独立的部署授权，属于人的决定。

## 6 · 在线 QA 的位置

在线 QA 是**观察者**，不是发布流程的一部分：

```bash
pnpm qa:online --base-url=<url> --identity=<deployment.json> --expect-sha=<rc-sha>
```

顺序永远是：**RC SHA → 本地全部门禁 → Preview（同一 SHA）→ 在线 QA → 人工视觉验收
→ 源码发布 → Production（同一 SHA）→ annotated tag → housekeeping**。

本仓当前没有可公开访问的部署，因此 `pnpm qa:online` 从未对真实部署运行过——
这一点写在 `factory.lock.json` 的 `note` 与交接里，**不写成「已验证」**。
