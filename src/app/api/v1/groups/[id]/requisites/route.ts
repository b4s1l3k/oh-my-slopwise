import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { requisitesSchema } from "@/lib/validations/user"
import { NextResponse } from "next/server"

type Params = { params: Promise<{ id: string }> }

// Реквизиты текущего пользователя ДЛЯ ЭТОЙ поездки (переопределение профиля)
export async function PATCH(req: Request, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: groupId } = await params
  const member = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: session.user.id } },
  })
  if (!member || !member.isActive) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const parsed = requisitesSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const updated = await prisma.groupMember.update({
    where: { groupId_userId: { groupId, userId: session.user.id } },
    data: parsed.data,
    select: { payeeName: true, bankName: true, payeeAccount: true },
  })
  return NextResponse.json({ requisites: updated })
}
