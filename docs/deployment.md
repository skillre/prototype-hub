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

## 5 · 本仓的部署现状（2026-09-16 核实，同日更新）

**已核实（写在 `factory.lock.json` 的 `deployment` 段，每条都带出处）：**

- 项目是 `skillres-projects/prototype-hub`，project id `prj_Vz6w0EwclApNmGZ7MrWku0I7UZjB`
  —— 由控制面通过 Vercel CLI 回读确认（本仓不持有 CLI 认证）。
- Latest Production URL `https://prototype-hub-dusky.vercel.app/`；本仓独立做了匿名只读探测：
  `curl -s -D- https://prototype-hub-dusky.vercel.app/` → **HTTP/2 200**（`server: Vercel`，
  无 SSO 跳转）。**只有匿名 2xx 才支持「public」这个说法**，这里成立。
- 项目级 **Production Branch = `main`**：由 `vercel api /v9/projects/<name>` 的
  `link.productionBranch` **只读回读**（不是从 URL 或分支名推断）。本仓自己没有 CLI 认证，
  这一步由控制面完成，出处写在锁的 `productionBranchSource`。
- 线上那次生产部署的 SHA = `2d5cc8a`（`target=production` / `gitRef=main` /
  `readyState=READY`），出处写在锁的 `latestProductionShaSource`。
- **该地址在当天被刷新过一次**：2026-09-16 上午它还是**旧版**页面（手写索引
  `AI CRM` / `AI Finance` / `Stable` + 已 404 的 `https://prototype-ai-finance.vercel.app/`，
  不含 `data-app-identity="prototype-hub"`；当时 `pnpm qa:online --base-url=<该地址>`
  报 identity 0 次、投影条目 0/6、两个未授权外链，exit 1 / 52 项）。用户授权合并 `main`
  之后，Vercel Git 集成创建了 Production 部署；此后**同一个 URL** 匿名返回
  **200 / 43755 字节**、`data-app-identity` ×1、`Stable` ×0、旧死链 ×0、外部链接恰好 1 条
  （hub 自己）。两次观察是同一个 URL，对照本身是证据，所以两边都留在文档里。

**未核实（留在 `unresolved[deployment/hub-live-revision-sha]`，value 仍为 null）：**

- **页面上的那一版是否就是 `2d5cc8a`**：页面不暴露 commit，本仓也没有 Vercel 凭证可回读
  部署列表。探测能证明「是新版」，控制面的部署记录给出 SHA——这两件事**没有被本仓独立对上**。
- 本地没有 `.vercel/` 链接，`catalog/compatibility.json` 记 `vercel.cliAuth = "expired"`，
  所以本仓自己无法回读部署列表——「知道一半」不写成「知道」。

**因此：**

- 投影里 hub 是 `public` + 「公开」+ 可点击：`catalog/projects/hub.json` 现在记录了
  `productionUrl` 与 `productionBranch`（带出处），`pnpm catalog:sync` 据此把它渲染成可点条目。
  **「链接可点」与「页面是新版」是两件事**——当天上午前者不成立，下午两者同时成立；
  索引只负责把「地址是已核实的」如实画出来。
- **本仓没有执行任何部署动作**：未创建、未链接、未提升、未修改保护设置、未推 Production 分支。
  刷新线上内容的那次 Production 部署，是用户授权合并 `main` 后由 Vercel Git 集成创建的
  ——部署是独立的一次人工决定，不是索引的副作用。

## 6 · 在线 QA 的位置

在线 QA 是**观察者**，不是发布流程的一部分：

```bash
pnpm qa:online --base-url=<url> --identity=<deployment.json> --expect-sha=<rc-sha>
```

顺序永远是：**RC SHA → 本地全部门禁 → Preview（同一 SHA）→ 在线 QA → 人工视觉验收
→ 源码发布 → Production（同一 SHA）→ annotated tag → housekeeping**。

本工作区第一次真正的在线 QA 就发生在 hub（2026-09-16）：
`pnpm qa:online --base-url=https://prototype-hub-dusky.vercel.app/ --identity=<部署记录>
--expect-sha=2d5cc8a…` → 身份 `production · main @ 2d5cc8a · READY` → 可访问性 `public`
（匿名 200）→ 2 路由 × 桌面/移动 × 默认/reduced-motion 共 8 个组合，无 console error、
无请求失败、无横向溢出 → exit 0。其余五个仓的部署没有被这样跑过，对它们来说
`pnpm qa:online` 仍然「从未运行」——这一点写在 `factory.lock.json` 的 `note` 与交接里，
**不写成「已验证」**。
