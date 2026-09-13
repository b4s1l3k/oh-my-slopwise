import bcrypt from "bcryptjs"
import { prisma } from "@/lib/db"
import { isPasswordWithinBcryptLimit } from "@/lib/validations/auth"

let dummyPasswordHash: Promise<string> | undefined

export type AuthenticatedIdentity = {
  id: string
  email: string
  name: string
  avatarUrl: string | null
  role: "USER" | "ADMIN"
}

export async function authenticateCredentials(
  email: string,
  password: string
): Promise<AuthenticatedIdentity | null> {
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail || !password || !isPasswordWithinBcryptLimit(password)) {
    return null
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  })
  const passwordMatches = await bcrypt.compare(
    password,
    user?.passwordHash ?? await getDummyPasswordHash()
  )
  if (!user || !passwordMatches) {
    return null
  }

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: user.email.toLowerCase() === adminEmail ? "ADMIN" : "USER",
  }
}

function getDummyPasswordHash(): Promise<string> {
  // Lazy and process-local: unknown-account and wrong-password paths both pay
  // bcrypt verification cost, without blocking module initialization.
  dummyPasswordHash ??= bcrypt.hash("SLOPwise dummy credential", 10)
  return dummyPasswordHash
}
