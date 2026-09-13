import { execFileSync } from "node:child_process"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import type { ResetE2eFixtureRequest } from "./fixture-contract"

export async function resetLegacyPrismaFixture(
  databaseUrl: string,
  fixture: ResetE2eFixtureRequest
): Promise<void> {
  assertE2eDatabase(databaseUrl)
  await ensureDatabaseExists(databaseUrl)
  execFileSync(
    "npx",
    ["--no-install", "prisma", "migrate", "reset", "--force", "--skip-seed"],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "inherit",
    }
  )

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  try {
    const users = await Promise.all(fixture.users.map(async (user) => ({
      email: user.email,
      name: user.name,
      passwordHash: await bcrypt.hash(user.password, 10),
      payeeName: user.requisites?.payeeName,
      bankName: user.requisites?.bankName,
      payeeAccount: user.requisites?.payeeAccount,
    })))

    await prisma.user.createMany({ data: users })
  } finally {
    await prisma.$disconnect()
  }
}

function assertE2eDatabase(databaseUrl: string): void {
  if (!/[_-]e2e(?:\?|$)/.test(databaseUrl)) {
    throw new Error(`Refusing to reset a database without an e2e suffix: ${databaseUrl}`)
  }
}

async function ensureDatabaseExists(targetDatabaseUrl: string): Promise<void> {
  const target = new URL(targetDatabaseUrl)
  const databaseName = target.pathname.slice(1)
  const admin = new URL(targetDatabaseUrl)
  admin.pathname = "/postgres"

  const prisma = new PrismaClient({ datasources: { db: { url: admin.toString() } } })
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS exists",
      databaseName
    )
    if (!rows[0]?.exists) {
      const quotedName = `"${databaseName.replaceAll('"', '""')}"`
      await prisma.$executeRawUnsafe(`CREATE DATABASE ${quotedName}`)
    }
  } finally {
    await prisma.$disconnect()
  }
}
