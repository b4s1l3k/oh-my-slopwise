import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const q = url.searchParams.get("q")?.trim()
  if (!q || q.length < 2) return NextResponse.json({ users: [] })

  const users = await prisma.user.findMany({
    where: {
      AND: [
        { id: { not: session.user.id } },
        {
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
          ],
        },
      ],
    },
    select: { id: true, name: true, email: true, avatarUrl: true },
    take: 10,
  })
  return NextResponse.json({ users })
}
