import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { z } from "zod"

const schema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  password: z.string().min(8, "Пароль минимум 8 символов"),
})

export async function POST(req: Request) {
  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const existing = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  })
  if (existing) {
    return NextResponse.json(
      { error: { message: "Пользователь с таким email уже существует" } },
      { status: 409 }
    )
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10)
  const user = await prisma.user.create({
    data: { email: parsed.data.email, name: parsed.data.name, passwordHash },
    select: { id: true, email: true, name: true, avatarUrl: true },
  })

  return NextResponse.json({ user }, { status: 201 })
}
