import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ checkDatabaseReadiness: vi.fn() }))

vi.mock("@/services/health.service", () => ({
  checkDatabaseReadiness: mocks.checkDatabaseReadiness,
}))

import { GET as live } from "@/app/api/health/live/route"
import { GET as ready } from "@/app/api/health/ready/route"

describe("application health routes", () => {
  beforeEach(() => vi.resetAllMocks())

  it("reports liveness without probing dependencies", async () => {
    const response = live()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ status: "ok" })
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(mocks.checkDatabaseReadiness).not.toHaveBeenCalled()
  })

  it("reports readiness after a successful database probe", async () => {
    mocks.checkDatabaseReadiness.mockResolvedValue(undefined)

    const response = await ready()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ status: "ok" })
    expect(response.headers.get("cache-control")).toBe("no-store")
  })

  it("returns 503 without leaking database errors", async () => {
    mocks.checkDatabaseReadiness.mockRejectedValue(new Error("password and host details"))

    const response = await ready()

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ status: "unavailable" })
  })
})
