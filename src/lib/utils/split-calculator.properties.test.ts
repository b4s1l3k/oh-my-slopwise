import { describe, expect, it } from "vitest"
import { calculateSplits, type SplitParticipant } from "./split-calculator"

const TOTALS = [
  1,
  2,
  3,
  7,
  99,
  100,
  101,
  1_000_001,
  2_000_000_000,
]
const PARTICIPANT_COUNTS = [1, 2, 3, 7, 31]

function participants(count: number): SplitParticipant[] {
  return Array.from({ length: count }, (_, index) => ({ userId: `user-${index}` }))
}

describe("calculateSplits deterministic properties", () => {
  it.each(TOTALS)("EQUAL conserves %i kopecks for every participant count", (total) => {
    for (const count of PARTICIPANT_COUNTS) {
      const result = calculateSplits(total, "EQUAL", participants(count))

      expect(result).toHaveLength(count)
      expect(result.reduce((sum, split) => sum + split.amount, 0)).toBe(total)
      expect(result.every((split) => Number.isInteger(split.amount) && split.amount >= 0)).toBe(true)
    }
  })

  it.each(TOTALS)("EQUAL assigns the complete remainder for %i to the first participant", (total) => {
    for (const count of PARTICIPANT_COUNTS) {
      const result = calculateSplits(total, "EQUAL", participants(count))
      const floorShare = Math.floor(total / count)

      expect(result[0].amount).toBe(floorShare + (total % count))
      expect(result.slice(1).every((split) => split.amount === floorShare)).toBe(true)
    }
  })

  const percentageCases: Array<{ label: string; percentages: number[] }> = [
    { label: "one owner", percentages: [10_000] },
    { label: "halves", percentages: [5_000, 5_000] },
    { label: "minimum and remainder", percentages: [1, 9_999] },
    { label: "thirds", percentages: [3_333, 3_333, 3_334] },
    { label: "seven unequal shares", percentages: [1, 17, 99, 883, 1_000, 3_000, 5_000] },
  ]

  it.each(percentageCases)("PERCENTAGE conserves all totals for $label", ({ percentages }) => {
    for (const total of TOTALS) {
      const input = percentages.map((percentage, index) => ({
        userId: `user-${index}`,
        percentage,
      }))
      const result = calculateSplits(total, "PERCENTAGE", input)

      expect(result.reduce((sum, split) => sum + split.amount, 0)).toBe(total)
      expect(result.every((split) => Number.isInteger(split.amount) && split.amount >= 0)).toBe(true)

      for (let index = 1; index < percentages.length; index++) {
        expect(result[index].amount).toBe(Math.floor((total * percentages[index]) / 10_000))
      }
    }
  })

  it("PERCENTAGE moves only the rounding remainder when participant order changes", () => {
    const total = 10_001
    const original = calculateSplits(total, "PERCENTAGE", [
      { userId: "alice", percentage: 3_333 },
      { userId: "bob", percentage: 3_333 },
      { userId: "carol", percentage: 3_334 },
    ])
    const reordered = calculateSplits(total, "PERCENTAGE", [
      { userId: "carol", percentage: 3_334 },
      { userId: "bob", percentage: 3_333 },
      { userId: "alice", percentage: 3_333 },
    ])

    expect(Object.fromEntries(original.map((split) => [split.userId, split.amount]))).toEqual({
      alice: 3_334,
      bob: 3_333,
      carol: 3_334,
    })
    expect(Object.fromEntries(reordered.map((split) => [split.userId, split.amount]))).toEqual({
      alice: 3_333,
      bob: 3_333,
      carol: 3_335,
    })
  })

  it("EXACT returns a new projection and never mutates participant objects", () => {
    const input = [
      { userId: "alice", amount: 1 },
      { userId: "bob", amount: 2_000_000_000 },
    ]
    const snapshot = structuredClone(input)

    const result = calculateSplits(123, "EXACT", input)

    expect(result).toEqual(snapshot)
    expect(result).not.toBe(input)
    expect(result[0]).not.toBe(input[0])
    expect(input).toEqual(snapshot)
  })
})
