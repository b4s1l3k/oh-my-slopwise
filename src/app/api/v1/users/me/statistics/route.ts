import { auth } from "@/lib/auth"
import { buildProfileStatistics } from "@/lib/statistics"
import { getUserStatistics } from "@/services/statistics.service"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const metrics = await getUserStatistics(session.user.id)
  return NextResponse.json({ statistics: buildProfileStatistics(metrics) })
}
