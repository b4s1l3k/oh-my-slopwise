import { describe, it, expect } from "vitest"
import authConfig from "./auth.config"

/* eslint-disable @typescript-eslint/no-explicit-any */
// Спецификация чистых колбэков сессии Auth.js: как id/role/name пробрасываются
// из user → token → session. Пароли и обращения к БД живут в auth.ts.
const jwt = authConfig.callbacks!.jwt as (args: any) => any
const session = authConfig.callbacks!.session as (args: any) => any

describe("authConfig.callbacks.jwt", () => {
  it("кладёт id и role пользователя в токен при входе", () => {
    const token = jwt({ token: {}, user: { id: "u1", role: "ADMIN" } })
    expect(token.id).toBe("u1")
    expect(token.role).toBe("ADMIN")
  })

  it("роль по умолчанию USER, если у пользователя её нет", () => {
    const token = jwt({ token: {}, user: { id: "u2" } })
    expect(token.role).toBe("USER")
  })

  it("обновляет имя в токене при trigger update", () => {
    const token = jwt({
      token: { id: "u1", name: "Старое" },
      trigger: "update",
      session: { name: "Новое" },
    })
    expect(token.name).toBe("Новое")
  })

  it("не трогает токен, если нет user и нет update", () => {
    const token = jwt({ token: { id: "u1", role: "USER", name: "N" } })
    expect(token).toEqual({ id: "u1", role: "USER", name: "N" })
  })

  it("update без строкового session.name имя не меняет", () => {
    const token = jwt({ token: { id: "u1", name: "N" }, trigger: "update", session: {} })
    expect(token.name).toBe("N")
  })

  it("update с пустой строкой session.name имя не перезаписывает", () => {
    // Пустая строка falsy → условие не срабатывает, старое имя остаётся.
    const token = jwt({ token: { id: "u1", name: "N" }, trigger: "update", session: { name: "" } })
    expect(token.name).toBe("N")
  })
})

describe("authConfig.callbacks.session", () => {
  it("пробрасывает id, name и role из токена в сессию", () => {
    const s = session({
      session: { user: {} },
      token: { id: "u1", name: "Имя", role: "ADMIN" },
    })
    expect(s.user.id).toBe("u1")
    expect(s.user.name).toBe("Имя")
    expect(s.user.role).toBe("ADMIN")
  })

  it("не выставляет id, если его нет в токене", () => {
    const s = session({ session: { user: { id: "keep" } }, token: {} })
    expect(s.user.id).toBe("keep")
  })

  it("отсутствие name и role в токене не затирает уже стоящие в сессии", () => {
    const s = session({
      session: { user: { id: "keep", name: "Имя", role: "USER" } },
      token: { id: "keep" }, // ни name, ни role
    })
    expect(s.user.name).toBe("Имя")
    expect(s.user.role).toBe("USER")
  })
})

describe("authConfig — базовая конфигурация", () => {
  it("JWT-сессии, доверенный хост, страница входа /login", () => {
    expect(authConfig.session?.strategy).toBe("jwt")
    expect(authConfig.trustHost).toBe(true)
    expect(authConfig.pages?.signIn).toBe("/login")
  })
})
