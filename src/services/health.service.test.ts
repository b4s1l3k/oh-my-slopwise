import { describe, expect, it, vi } from "vitest"
import { checkDatabaseReadiness } from "@/services/health.service"

describe("checkDatabaseReadiness", () => {
  it("resolves after a successful database probe", async () => {
    const query = vi.fn().mockResolvedValue([{ "?column?": 1 }])

    await expect(checkDatabaseReadiness({ $queryRaw: query } as never, 100))
      .resolves.toBeUndefined()
    expect(query).toHaveBeenCalledOnce()
  })

  it("rejects a failed database probe", async () => {
    const query = vi.fn().mockRejectedValue(new Error("database unavailable"))

    await expect(checkDatabaseReadiness({ $queryRaw: query } as never, 100))
      .rejects.toThrow("database unavailable")
  })

  it("bounds a stalled probe", async () => {
    const query = vi.fn(() => new Promise(() => undefined))

    await expect(checkDatabaseReadiness({ $queryRaw: query } as never, 1))
      .rejects.toThrow("READINESS_TIMEOUT")
  })
})
