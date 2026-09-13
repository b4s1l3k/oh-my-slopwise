import { auth } from "@/lib/auth"
import { getUserAchievements } from "@/services/achievements.service"
import { NextResponse } from "next/server"
import { toAchievementCollectionResponse } from "@/lib/api/v1/response-mappers"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const achievements = await getUserAchievements(session.user.id)
  return NextResponse.json(toAchievementCollectionResponse(achievements))
}
