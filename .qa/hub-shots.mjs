#!/usr/bin/env node
/**
 * `hub-shots` —— 历史命令的兼容层，现在只剩一条实现。
 *
 * 它以前是一个独立的截图脚本：需要人手先起好 dev server，再连上去截图，没有
 * 身份校验（连到的可能是同机别的原型），也没有探针守卫。那正是 Factory v1.1
 * 要消除的模式——**一个静默通过的探针比没有探针更危险**。
 *
 * 现在它只做一件事：把参数原样交给 `.qa/browser-qa.mjs`。真正的扫描、探针、
 * 身份校验、截图与报告都在那边，本地 QA（`pnpm qa`）与在线 QA（`pnpm qa:online`）
 * 共用同一份实现。
 *
 * 用法：
 *   node .qa/hub-shots.mjs                  # 自管 server，端口 3100，全量扫描
 *   node .qa/hub-shots.mjs --base-url=<url> # 扫一个已经在跑的 origin
 *
 * 退出码与 browser-qa 一致：0 通过 · 1 有问题 · 2 没能运行（端口被占 / 应答者不是本应用）。
 */

import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const target = path.join(here, "browser-qa.mjs")

const child = spawn(process.execPath, [target, ...process.argv.slice(2)], {
  stdio: "inherit",
})

child.once("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 1)
})
