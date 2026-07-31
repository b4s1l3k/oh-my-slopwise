import { auth } from "@/lib/auth"
import { getUserAchievements } from "@/services/achievements.service"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return NextResponse.json(await getUserAchievements(session.user.id))
}
