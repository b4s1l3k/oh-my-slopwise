import { spawn } from "node:child_process"
import { parseGoldenOutcome } from "./load-fixtures"
import type { GoldenAdapter, GoldenOutcome, GoldenRequest } from "./types"

const MAX_OUTPUT_BYTES = 1_000_000
const DEFAULT_TIMEOUT_MS = 10_000
const TERMINATION_GRACE_MS = 250

export class CandidateProcessAdapter implements GoldenAdapter {
  readonly name: string
  readonly kind = "candidate" as const

  constructor(
    private readonly command: string,
    private readonly args: string[] = [],
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS
  ) {
    this.name = `candidate:${command}`
  }

  execute(request: GoldenRequest): Promise<GoldenOutcome> {
    return new Promise((resolve) => {
      const child = spawn(this.command, this.args, {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, GOLDEN_PROTOCOL_VERSION: "1" },
      })
      let stdout = ""
      let stderr = ""
      let settled = false
      let terminationOutcome: GoldenOutcome | null = null
      let forceKillTimeout: ReturnType<typeof setTimeout> | undefined
      let requestTimeout: ReturnType<typeof setTimeout> | undefined
      const complete = (outcome: GoldenOutcome) => {
        if (settled) return
        settled = true
        if (requestTimeout) clearTimeout(requestTimeout)
        if (forceKillTimeout) clearTimeout(forceKillTimeout)
        resolve(outcome)
      }
      const terminate = (outcome: GoldenOutcome) => {
        if (terminationOutcome) return
        terminationOutcome = outcome
        child.kill("SIGTERM")
        forceKillTimeout = setTimeout(() => {
          child.kill("SIGKILL")
          complete(outcome)
        }, TERMINATION_GRACE_MS)
      }
      requestTimeout = setTimeout(() => {
        terminate({
          ok: false,
          error: {
            code: "CANDIDATE_TIMEOUT",
            message: `candidate exceeded ${this.timeoutMs}ms`,
          },
        })
      }, this.timeoutMs)

      child.stdout.setEncoding("utf8")
      child.stderr.setEncoding("utf8")
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk
        if (stdout.length > MAX_OUTPUT_BYTES) {
          terminate({
            ok: false,
            error: { code: "CANDIDATE_OUTPUT_TOO_LARGE" },
          })
        }
      })
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk
        if (stderr.length > MAX_OUTPUT_BYTES) {
          terminate({
            ok: false,
            error: { code: "CANDIDATE_OUTPUT_TOO_LARGE" },
          })
        }
      })
      child.on("error", (error) => {
        complete({ ok: false, error: { code: "CANDIDATE_START_FAILED", message: error.message } })
      })
      child.on("close", (code) => {
        if (terminationOutcome) {
          complete(terminationOutcome)
          return
        }
        if (code !== 0) {
          complete({
            ok: false,
            error: {
              code: "CANDIDATE_PROCESS_FAILED",
              message: stderr.trim() || `candidate exited with code ${code}`,
            },
          })
          return
        }
        try {
          complete(parseGoldenOutcome(JSON.parse(stdout), "candidate output"))
        } catch (error) {
          complete({
            ok: false,
            error: {
              code: "CANDIDATE_INVALID_OUTPUT",
              message:
                error instanceof Error
                  ? `${error.message}; stdout=${stdout.slice(0, 500)}`
                  : stdout.slice(0, 500),
            },
          })
        }
      })

      child.stdin.end(`${JSON.stringify(request)}\n`)
    })
  }
}
