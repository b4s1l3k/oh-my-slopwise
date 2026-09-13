import { describe, expect, it } from "vitest"
import { feedbackFormSchema } from "@/lib/forms/feedback-form"

describe("feedbackFormSchema", () => {
  it("normalizes a valid contract command", () => {
    expect(feedbackFormSchema.parse({ message: "  useful feedback  " })).toEqual({
      message: "useful feedback",
    })
  })

  it.each([
    ["x".repeat(9), "Минимум 10 символов"],
    ["x".repeat(2001), "Максимум 2000 символов"],
  ])("rejects contract boundary violations", (message, expectedError) => {
    const result = feedbackFormSchema.safeParse({ message })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(expectedError)
    }
  })
})
