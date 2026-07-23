import { describe, it, expect } from "vitest"
import { handleServiceError } from "./api-errors"

describe("handleServiceError", () => {
  it("RATE_UNAVAILABLE → 503 с понятным сообщением", async () => {
    const res = handleServiceError(new Error("RATE_UNAVAILABLE"))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error.code).toBe("RATE_UNAVAILABLE")
    expect(body.error.message).toMatch(/курс/i)
  })

  it("NOT_FOUND → 404", async () => {
    const res = handleServiceError(new Error("NOT_FOUND"))
    expect(res.status).toBe(404)
  })

  it("FORBIDDEN → 403", async () => {
    const res = handleServiceError(new Error("FORBIDDEN"))
    expect(res.status).toBe(403)
  })

  it("неизвестная ошибка → 500", async () => {
    const res = handleServiceError(new Error("SOME_UNKNOWN"))
    expect(res.status).toBe(500)
  })

  it("не-Error объект → 500", async () => {
    const res = handleServiceError("random string error")
    expect(res.status).toBe(500)
  })
})
