import { execFileSync } from "node:child_process"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const databaseUrl =
  process.env.E2E_DATABASE_URL ??
  "postgresql://splitwise:splitwise@localhost:5433/splitwise_e2e"

if (!/[_-]e2e(?:\?|$)/.test(databaseUrl)) {
  throw new Error(`Refusing to reset a database without an e2e suffix: ${databaseUrl}`)
}

export default async function globalSetup(): Promise<void> {
  await ensureDatabaseExists(databaseUrl)
  execFileSync("npx", ["--no-install", "prisma", "migrate", "reset", "--force", "--skip-seed"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  })

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  const passwordHash = await bcrypt.hash("E2e-password-123", 10)

  await prisma.user.createMany({
    data: [
      {
        email: "admin.e2e@example.com",
        name: "Админ E2E",
        passwordHash,
        payeeName: "Админ Тестовый",
        bankName: "Тест Банк",
        payeeAccount: "+79990000001",
      },
      {
        email: "alice.e2e@example.com",
        name: "Алиса E2E",
        passwordHash,
        payeeName: "Алиса Тестовая",
        bankName: "Альфа Тест",
        payeeAccount: "+79990000002",
      },
      {
        email: "bob.e2e@example.com",
        name: "Боб E2E",
        passwordHash,
        payeeName: "Боб Тестовый",
        bankName: "Бета Тест",
        payeeAccount: "+79990000003",
      },
      {
        email: "carol.e2e@example.com",
        name: "Карина E2E",
        passwordHash,
      },
      {
        email: "outsider.e2e@example.com",
        name: "Внешний E2E",
        passwordHash,
      },
    ],
  })

  await prisma.$disconnect()
}

async function ensureDatabaseExists(targetDatabaseUrl: string): Promise<void> {
  const target = new URL(targetDatabaseUrl)
  const databaseName = target.pathname.slice(1)
  const admin = new URL(targetDatabaseUrl)
  admin.pathname = "/postgres"

  const prisma = new PrismaClient({ datasources: { db: { url: admin.toString() } } })
  const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS exists",
    databaseName
  )
  if (!rows[0]?.exists) {
    const quotedName = `"${databaseName.replaceAll('"', '""')}"`
    await prisma.$executeRawUnsafe(`CREATE DATABASE ${quotedName}`)
  }
  await prisma.$disconnect()
}
