import { PrismaClient, SplitType } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  console.log("🌱 Seeding database...")

  const hash = (p: string) => bcrypt.hash(p, 10)

  const alice = await prisma.user.upsert({
    where: { email: "alice@demo.com" },
    update: {},
    create: { email: "alice@demo.com", name: "Алиса", passwordHash: await hash("password") },
  })
  const bob = await prisma.user.upsert({
    where: { email: "bob@demo.com" },
    update: {},
    create: { email: "bob@demo.com", name: "Боб", passwordHash: await hash("password") },
  })
  const carol = await prisma.user.upsert({
    where: { email: "carol@demo.com" },
    update: {},
    create: { email: "carol@demo.com", name: "Карина", passwordHash: await hash("password") },
  })

  const group = await prisma.group.create({
    data: {
      name: "Квартира на Тверской",
      type: "HOME",
      currency: "RUB",
      createdById: alice.id,
      members: {
        create: [
          { userId: alice.id, role: "ADMIN" },
          { userId: bob.id, role: "MEMBER" },
          { userId: carol.id, role: "MEMBER" },
        ],
      },
    },
  })

  // Аренда: Алиса заплатила 90 000₽, делим поровну
  const rent = await prisma.expense.create({
    data: {
      groupId: group.id,
      paidById: alice.id,
      createdById: alice.id,
      title: "Аренда за январь",
      amount: 9_000_000,
      category: "rent",
      splitType: SplitType.EQUAL,
      date: new Date("2025-01-01"),
    },
  })
  const rentShare = Math.floor(9_000_000 / 3)
  await prisma.expenseSplit.createMany({
    data: [
      { expenseId: rent.id, userId: alice.id, amount: rentShare },
      { expenseId: rent.id, userId: bob.id, amount: rentShare },
      { expenseId: rent.id, userId: carol.id, amount: 9_000_000 - rentShare * 2 },
    ],
  })

  // Продукты: Боб заплатил 4 500₽
  const groceries = await prisma.expense.create({
    data: {
      groupId: group.id,
      paidById: bob.id,
      createdById: bob.id,
      title: "Продукты (Пятёрочка)",
      amount: 450_000,
      category: "groceries",
      splitType: SplitType.EQUAL,
      date: new Date("2025-01-10"),
    },
  })
  const grocShare = Math.floor(450_000 / 3)
  await prisma.expenseSplit.createMany({
    data: [
      { expenseId: groceries.id, userId: alice.id, amount: grocShare },
      { expenseId: groceries.id, userId: bob.id, amount: grocShare },
      { expenseId: groceries.id, userId: carol.id, amount: 450_000 - grocShare * 2 },
    ],
  })

  await prisma.activityLog.createMany({
    data: [
      {
        groupId: group.id,
        actorId: alice.id,
        type: "EXPENSE_CREATED",
        entityType: "expense",
        entityId: rent.id,
        metadata: { title: "Аренда за январь", amount: 9_000_000 },
      },
      {
        groupId: group.id,
        actorId: bob.id,
        type: "EXPENSE_CREATED",
        entityType: "expense",
        entityId: groceries.id,
        metadata: { title: "Продукты (Пятёрочка)", amount: 450_000 },
      },
    ],
  })

  console.log("✅ Done!")
  console.log("   alice@demo.com  / password")
  console.log("   bob@demo.com    / password")
  console.log("   carol@demo.com  / password")
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
