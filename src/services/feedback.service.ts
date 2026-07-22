import { prisma } from "@/lib/db"

export async function createFeedback(userId: string, message: string) {
  return prisma.feedback.create({
    data: { userId, message },
  })
}

export async function listFeedback() {
  return prisma.feedback.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { name: true, email: true } } },
  })
}
