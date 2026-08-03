import { describe, it, expect } from "vitest"
import { cn } from "@/lib/utils"

describe("cn", () => {
  it("merges multiple string arguments with single spaces", () => {
    expect(cn("a", "b", "c")).toBe("a b c")
  })

  it("returns an empty string when given no arguments", () => {
    expect(cn()).toBe("")
  })

  it("ignores falsy values (false, null, undefined, empty string)", () => {
    expect(cn("a", false, null, undefined, "", "b")).toBe("a b")
  })

  it("ignores a lone falsy argument", () => {
    expect(cn(false)).toBe("")
    expect(cn(null)).toBe("")
    expect(cn(undefined)).toBe("")
    expect(cn("")).toBe("")
  })

  it("applies conditional object syntax, keeping truthy keys only", () => {
    expect(cn("base", { active: true, disabled: false })).toBe("base active")
  })

  it("keeps only truthy keys from an object with mixed values", () => {
    expect(cn({ a: true, b: 0, c: 1, d: "", e: "x" })).toBe("a c e")
  })

  it("flattens array arguments", () => {
    expect(cn(["a", "b"], "c")).toBe("a b c")
  })

  it("flattens nested arrays and objects together", () => {
    expect(cn(["a", { b: true, c: false }], [["d"]], "e")).toBe("a b d e")
  })

  it("resolves tailwind conflicts so the later class wins (padding)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4")
  })

  it("resolves tailwind conflicts for the same axis (horizontal padding)", () => {
    expect(cn("px-2", "px-4")).toBe("px-4")
  })

  it("resolves tailwind conflicts for font size", () => {
    expect(cn("text-sm", "text-lg")).toBe("text-lg")
  })

  it("lets a conditionally-applied class override an earlier one", () => {
    expect(cn("p-2", { "p-4": true })).toBe("p-4")
  })

  it("keeps non-conflicting tailwind classes side by side", () => {
    expect(cn("p-2", "m-4")).toBe("p-2 m-4")
  })

  it("collapses duplicate identical classes via tailwind-merge", () => {
    expect(cn("p-4", "p-4")).toBe("p-4")
  })

  it("combines falsy filtering, arrays, objects and conflict resolution", () => {
    expect(
      cn("p-2", false && "hidden", ["text-sm", null], { "p-4": true, block: false })
    ).toBe("text-sm p-4")
  })
})
