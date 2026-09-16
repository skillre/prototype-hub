/**
 * QA server manager — the run owns the server, or there is no run.
 *
 * WHY THIS IS NOT A CONVENIENCE WRAPPER
 * -------------------------------------
 * `reuseExistingServer: true` (or `!process.env.CI` — same thing on a laptop)
 * makes Playwright adopt **whatever** answers the readiness URL with a 2xx/3xx.
 * It does not check that the responder is this application. Port 3100 is on a
 * machine that runs several prototypes, so "something answered" is not evidence
 * of anything, and a suite can go fully green against the wrong page.
 *
 * So:
 *   1. the port is checked **before** starting — an occupied port is a loud
 *      failure, never an adoption (and never a `pkill`: that would take down
 *      somebody else's work);
 *   2. the server is started **by this run**, pinned to the pinned port, in its
 *      own process group so teardown can only ever kill a process we own;
 *   3. readiness is followed by an **identity assertion** — the HTML must carry
 *      `data-app-identity`, so a Next dev server that silently auto-incremented
 *      to 3101 (leaving a foreign server answering 3100) fails here instead of
 *      measuring someone else's app.
 */

import { spawn } from "node:child_process"
import { createConnection } from "node:net"

export class PortInUseError extends Error {
  constructor(host, port) {
    super(`QA 端口已被占用：${host}:${port}`)
    this.name = "PortInUseError"
    this.host = host
    this.port = port
  }
}

export class WrongServerError extends Error {
  constructor(origin, detail) {
    super(`应答 ${origin} 的不是本应用：${detail}`)
    this.name = "WrongServerError"
    this.origin = origin
    this.detail = detail
  }
}

/** One TCP connect attempt. Resolves true when something is listening. */
export function isPortInUse(host, port, timeoutMs = 700) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port })
    const settle = (inUse) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(inUse)
    }
    socket.setTimeout(timeoutMs)
    socket.once("connect", () => settle(true))
    socket.once("timeout", () => settle(false))
    socket.once("error", () => settle(false))
  })
}

export function portInUseMessage(host, port) {
  return [
    "",
    `QA 端口被占用：${host}:${port}`,
    "",
    "QA 必须由当前 run 自己启动 server，绝不复用已经存在的进程：",
    "Playwright 的就绪探针只判断「有东西应答」，不判断「是不是这个应用」，",
    "一旦复用命中别的 server，整套断言会在错误的页面上通过。",
    "",
    "这里选择 fail loudly，而不是替你猜。先确认这个端口上是什么，再决定是否停止它：",
    "",
    `  lsof -nP -iTCP:${port} -sTCP:LISTEN`,
    "",
    '不要使用 `pkill -f "next dev"` / `pkill -f "next-server"` —— 那会杀掉同机其它原型。',
    "只停止你确认属于当前任务的那一个进程。",
    "",
  ].join("\n")
}

/**
 * Wait until `origin` answers *and* proves it is the expected application.
 *
 * The order matters: a 200 without the identity marker is a hard failure, not a
 * reason to keep waiting — waiting would eventually time out and report "the
 * server never came up", which is the wrong story and points at the wrong file.
 *
 * `identityMarker` is the literal text that must appear in the response bytes
 * (`data-app-identity="prototype-hub"`), not the CSS selector.
 */
export async function waitForIdentity({
  origin,
  identityMarker,
  timeoutMs = 120_000,
  intervalMs = 400,
  readLogs,
}) {
  const deadline = Date.now() + timeoutMs
  let lastError = null

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/`, {
        redirect: "manual",
        signal: AbortSignal.timeout(5_000),
      })
      if (response.status >= 200 && response.status < 400) {
        const html = await response.text()
        if (html.includes(identityMarker)) {
          return { status: response.status }
        }
        throw new WrongServerError(
          origin,
          `HTTP ${response.status} 但不含 ${identityMarker} —— ` +
            `很可能端口上跑着别的应用，或者 Next 因为端口占用自增到了别的端口。`,
        )
      }
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      if (error instanceof WrongServerError) throw error
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  const logs = typeof readLogs === "function" ? readLogs() : ""
  throw new Error(
    `等待 ${origin} 就绪超时（${timeoutMs}ms）。最后一次错误：${lastError?.message ?? "无"}\n` +
      (logs ? `\n--- server 最近输出 ---\n${logs}\n` : ""),
  )
}

/**
 * Start the app under test on the pinned port and assert its identity.
 *
 * @returns {Promise<{ stop: () => Promise<void>, logs: () => string }>}
 */
export async function startManagedServer({
  host,
  port,
  origin,
  command,
  identityMarker,
  timeoutMs = 120_000,
}) {
  if (await isPortInUse(host, port)) {
    throw new PortInUseError(host, port)
  }

  const child = spawn(command, {
    shell: true,
    // Own process group: `pnpm dev` is a wrapper, and killing only the wrapper
    // leaves an orphan `next-server` holding the port.
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  })

  const buffer = []
  const record = (chunk) => {
    buffer.push(chunk.toString())
    if (buffer.length > 400) buffer.splice(0, buffer.length - 400)
  }
  child.stdout.on("data", record)
  child.stderr.on("data", record)

  const logs = () => buffer.join("").split("\n").slice(-40).join("\n")

  let exited = false
  child.once("exit", () => {
    exited = true
  })

  try {
    await waitForIdentity({ origin, identityMarker, timeoutMs, readLogs: logs })
  } catch (error) {
    if (!exited) await stopProcessGroup(child)
    throw error
  }

  return {
    logs,
    stop: async () => {
      if (!exited) await stopProcessGroup(child)
    },
  }
}

/** Stop exactly the process group we started, and wait for the port to free. */
async function stopProcessGroup(child, { graceMs = 5_000 } = {}) {
  const pid = child.pid
  if (typeof pid !== "number") return

  const waitForExit = new Promise((resolve) => {
    child.once("exit", resolve)
    setTimeout(resolve, graceMs)
  })

  try {
    process.kill(-pid, "SIGTERM")
  } catch {
    // already gone
  }
  await waitForExit
  try {
    process.kill(-pid, "SIGKILL")
  } catch {
    // already gone
  }
}
