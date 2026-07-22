import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { updateProfileSchema } from "@/lib/validations/user"
import { NextResponse } from "next/server"

const profileSelect = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
  payeeName: true,
  bankName: true,
  payeeAccount: true,
  createdAt: true,
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: profileSelect,
  })
  return NextResponse.json({ user })
}

export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const parsed = updateProfileSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: parsed.data,
    select: profileSelect,
  })
  return NextResponse.json({ user })
}
