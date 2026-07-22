import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"

type Params = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: groupId } = await params
  const member = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: session.user.id } },
  })
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const activities = await prisma.activityLog.findMany({
    where: { groupId },
    include: { actor: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  })

  return NextResponse.json({ activities })
}
