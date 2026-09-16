/**
 * Probe guard — the difference between "measured zero" and "did not measure".
 *
 * `0 / 0 = NaN`, and `Math.abs(NaN - expected) > tolerance` is `false`, so a
 * comparison written the obvious way **silently passes** when the probe never
 * found anything to measure. Every numeric probe in the sweep goes through this
 * module, so a missing element, a `null` box or a division by zero is a loud
 * failure instead of a green check.
 *
 * Usage:
 *   const width = guard.measure(box?.width, `${label}: 展板宽度`)
 *   guard.expectRatio(panel.width / panel.height, 1.6, 0.05, `${label}: 图像位比例`)
 */

export class UnmeasurableProbeError extends Error {
  constructor(label, detail) {
    super(`${label} —— ${detail}`)
    this.name = "UnmeasurableProbeError"
    this.label = label
    this.detail = detail
  }
}

/**
 * Assert that a value is a real, finite number and return it.
 *
 * Deliberately strict: `null`, `undefined`, `NaN`, `Infinity` and numeric
 * strings all fail. `0` is allowed — but callers that must not read zero should
 * use `expectNonZero` so the intent is written down rather than assumed.
 */
export function measure(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new UnmeasurableProbeError(
      label,
      `没有量到可用的数值（得到 ${describe(value)}）。「没量到」不等于「满足条件」。`,
    )
  }
  return value
}

/** A measurement that must not be zero (a zero almost always means "missed"). */
export function expectNonZero(value, label) {
  const number = measure(value, label)
  if (number === 0) {
    throw new UnmeasurableProbeError(
      label,
      "量到 0。这里 0 几乎总是「没量到」而不是真实的零；若确实允许为零，请改用 measure() 并写明理由。",
    )
  }
  return number
}

/** Compare a ratio against an expected value, with NaN turned into a failure. */
export function expectRatio(actual, expected, tolerance, label) {
  const value = measure(actual, label)
  const gap = Math.abs(value - expected)
  if (!Number.isFinite(gap) || gap > tolerance) {
    throw new UnmeasurableProbeError(
      label,
      `期望 ${expected} ±${tolerance}，实际 ${value}（差 ${gap}）。`,
    )
  }
  return value
}

/** Collect probe failures without aborting the whole sweep. */
export function createProbeCollector(problems) {
  return {
    /** @returns {number | null} the value, or null when it could not be measured */
    try(value, label) {
      try {
        return measure(value, label)
      } catch (error) {
        problems.push(error.message)
        return null
      }
    },
    tryNonZero(value, label) {
      try {
        return expectNonZero(value, label)
      } catch (error) {
        problems.push(error.message)
        return null
      }
    },
    tryRatio(actual, expected, tolerance, label) {
      try {
        return expectRatio(actual, expected, tolerance, label)
      } catch (error) {
        problems.push(error.message)
        return null
      }
    },
  }
}

function describe(value) {
  if (value === null) return "null"
  if (value === undefined) return "undefined"
  if (typeof value === "number") return String(value)
  return `${typeof value} ${JSON.stringify(value)}`
}
