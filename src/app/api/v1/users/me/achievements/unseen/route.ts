import { auth } from "@/lib/auth"
import { collectUnseenAchievementUnlocks } from "@/services/achievements.service"
import { NextResponse } from "next/server"

// Явная mutation: досчитывает новые разблокировки, атомарно забирает
// непоказанные ачивки и помечает их показанными.
export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const unlocked = await collectUnseenAchievementUnlocks(session.user.id)
    return NextResponse.json({ unlocked })
  } catch {
    // Уведомления некритичны — при сбое просто ничего не показываем,
    // не роняя запрос 500-й ошибкой на каждом опросе.
    return NextResponse.json({ unlocked: [] })
  }
}
