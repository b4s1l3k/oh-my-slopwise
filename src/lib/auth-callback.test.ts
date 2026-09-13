import { describe, expect, it } from "vitest"
import { getSafeAuthCallback } from "@/lib/auth-callback"

describe("getSafeAuthCallback", () => {
  it.each([
    [null, "/"],
    ["", "/"],
    ["/groups", "/groups"],
    ["/groups?archived=false#active", "/groups?archived=false#active"],
    ["https://attacker.example/collect", "/"],
    ["//attacker.example/collect", "/"],
    ["/\\\\attacker.example/collect", "/"],
    ["javascript:alert(document.domain)", "/"],
    ["not-an-absolute-path", "/"],
  ])("maps %s to %s", (callbackUrl, expected) => {
    expect(getSafeAuthCallback(callbackUrl)).toBe(expected)
  })
})
