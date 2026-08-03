import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/* eslint-disable @typescript-eslint/no-explicit-any */
// Спецификация authorize() из Credentials-провайдера: единственная точка, где
// проверяется пароль и назначается роль. NextAuth и провайдер мокаются, чтобы
// перехватить authorize без реальной инициализации Auth.js; БД и bcrypt тоже
// подменяются — тест чисто логический, без сети и без Postgres.

// authorize, перехваченный из конфига Credentials-провайдера при импорте auth.ts.
let capturedAuthorize: (credentials: unknown) => Promise<unknown>

const findUnique = vi.fn()
const bcryptCompare = vi.fn()

vi.mock("next-auth", () => ({
  // NextAuth(config) вызывается на верхнем уровне auth.ts; возвращаем заглушки
  // деструктуризируемых полей, а сам config нам не нужен — providers[] уже
  // построен вызовом Credentials(...) ниже.
  default: () => ({ handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }),
}))

vi.mock("next-auth/providers/credentials", () => ({
  default: (config: any) => {
    capturedAuthorize = config.authorize
    return config
  },
}))

vi.mock("@/lib/db", () => ({
  prisma: { user: { findUnique: (...args: unknown[]) => findUnique(...args) } },
}))

vi.mock("bcryptjs", () => ({
  default: { compare: (...args: unknown[]) => bcryptCompare(...args) },
}))

beforeEach(async () => {
  vi.resetModules()
  findUnique.mockReset()
  bcryptCompare.mockReset()
  // Импорт после установки моков — иначе capturedAuthorize не заполнится.
  await import("@/lib/auth")
})

afterEach(() => {
  delete process.env.ADMIN_EMAIL
})

const creds = { email: "user@example.com", password: "secret" }

describe("authorize (Credentials provider)", () => {
  it("возвращает null, если нет email или пароля", async () => {
    expect(await capturedAuthorize(null)).toBeNull()
    expect(await capturedAuthorize({})).toBeNull()
    expect(await capturedAuthorize({ email: "user@example.com" })).toBeNull()
    expect(await capturedAuthorize({ password: "secret" })).toBeNull()
    // до БД дело не дошло
    expect(findUnique).not.toHaveBeenCalled()
  })

  it("возвращает null, если пользователь не найден", async () => {
    findUnique.mockResolvedValue(null)
    expect(await capturedAuthorize(creds)).toBeNull()
    expect(findUnique).toHaveBeenCalledWith({ where: { email: "user@example.com" } })
    // пароль не проверяем, если пользователя нет
    expect(bcryptCompare).not.toHaveBeenCalled()
  })

  it("возвращает null при неверном пароле", async () => {
    findUnique.mockResolvedValue({
      id: "u1",
      email: "user@example.com",
      name: "Иван",
      avatarUrl: null,
      passwordHash: "HASH",
    })
    bcryptCompare.mockResolvedValue(false)
    expect(await capturedAuthorize(creds)).toBeNull()
    expect(bcryptCompare).toHaveBeenCalledWith("secret", "HASH")
  })

  it("при верном пароле возвращает пользователя с ролью USER", async () => {
    findUnique.mockResolvedValue({
      id: "u1",
      email: "user@example.com",
      name: "Иван",
      avatarUrl: "https://ava/1.png",
      passwordHash: "HASH",
    })
    bcryptCompare.mockResolvedValue(true)

    const result = await capturedAuthorize(creds)
    expect(result).toEqual({
      id: "u1",
      email: "user@example.com",
      name: "Иван",
      image: "https://ava/1.png",
      role: "USER",
    })
  })

  it("назначает роль ADMIN, если email совпадает с ADMIN_EMAIL", async () => {
    process.env.ADMIN_EMAIL = "user@example.com"
    findUnique.mockResolvedValue({
      id: "u1",
      email: "user@example.com",
      name: "Иван",
      avatarUrl: null,
      passwordHash: "HASH",
    })
    bcryptCompare.mockResolvedValue(true)

    const result = (await capturedAuthorize(creds)) as { role: string; image: null }
    expect(result.role).toBe("ADMIN")
    expect(result.image).toBeNull()
  })

  it("чужой email не получает ADMIN даже при верном пароле", async () => {
    process.env.ADMIN_EMAIL = "boss@example.com"
    findUnique.mockResolvedValue({
      id: "u2",
      email: "user@example.com",
      name: "Пётр",
      avatarUrl: null,
      passwordHash: "HASH",
    })
    bcryptCompare.mockResolvedValue(true)

    const result = (await capturedAuthorize(creds)) as { role: string }
    expect(result.role).toBe("USER")
  })
})
