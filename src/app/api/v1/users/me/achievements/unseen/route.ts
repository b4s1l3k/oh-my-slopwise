import { auth } from "@/lib/auth"
import { collectUnseenAchievementUnlocks } from "@/services/achievements.service"
import { NextResponse } from "next/server"

// Досчитывает новые разблокировки и возвращает непоказанные ачивки (помечая их
// показанными). Фронтенд дёргает этот эндпоинт после мутаций и показывает тост.
export async function GET() {
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
