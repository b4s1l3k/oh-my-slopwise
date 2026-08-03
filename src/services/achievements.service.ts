import { evaluateAchievements, type Achievement } from "@/lib/achievements"
import { prisma } from "@/lib/db"
import {
  getCurrentUserStatistics,
  getHistoricalUserStatistics,
  mergeHistoricalAndCurrentStatistics,
} from "@/services/statistics.service"

// Всплывающее уведомление об одной полученной ачивке.
export type AchievementUnlockNotification = {
  id: string
  title: string
  description: string
  icon: string
}

/**
 * Считает актуальный прогресс и фиксирует только что открытые ачивки.
 * Открытая ачивка остаётся навсегда, даже если исходная группа или трата позже
 * удалены. Новые записи создаются с notifiedAt = null — значит уведомление о
 * них ещё не показывали.
 */
async function syncUserAchievements(
  userId: string,
  now: Date
): Promise<Achievement[]> {
  const [currentMetrics, historicalMetrics, persisted] = await Promise.all([
    getCurrentUserStatistics(userId, now),
    getHistoricalUserStatistics(userId, now),
    prisma.userAchievement.findMany({
      where: { userId },
      select: { achievementId: true },
    }),
  ])

  const metrics = mergeHistoricalAndCurrentStatistics(historicalMetrics, currentMetrics)
  const persistedIds = new Set(persisted.map((item) => item.achievementId))
  const current = evaluateAchievements(metrics, persistedIds)
  const newlyUnlocked = current.filter(
    (achievement) => achievement.unlocked && !persistedIds.has(achievement.id)
  )

  if (newlyUnlocked.length > 0) {
    await prisma.userAchievement.createMany({
      data: newlyUnlocked.map((achievement) => ({
        userId,
        achievementId: achievement.id,
        unlockedAt: now,
        // notifiedAt намеренно не задаём (null) — это сигнал показать тост.
      })),
      skipDuplicates: true,
    })
  }

  return current
}

export async function getUserAchievements(userId: string, now = new Date()) {
  const current = await syncUserAchievements(userId, now)

  return {
    summary: {
      unlocked: current.filter((achievement) => achievement.unlocked).length,
      total: current.length,
    },
    achievements: current,
  }
}

/**
 * Досчитывает новые разблокировки и возвращает те открытые ачивки, о которых
 * пользователю ещё не показывали уведомление, помечая их показанными. Вызывается
 * после любых мутаций, поэтому Steam-подобный тост всплывает сразу после
 * действия, где бы в приложении оно ни произошло. Каждая ачивка возвращается
 * ровно один раз.
 */
export async function collectUnseenAchievementUnlocks(
  userId: string,
  now = new Date()
): Promise<AchievementUnlockNotification[]> {
  const current = await syncUserAchievements(userId, now)

  const unseen = await prisma.userAchievement.findMany({
    where: { userId, notifiedAt: null },
    select: { achievementId: true },
  })
  if (unseen.length === 0) return []

  const unseenIds = unseen.map((item) => item.achievementId)
  // Помечаем показанными по условию notifiedAt = null. Вместе с guard'ом на
  // клиенте (не более одной проверки одновременно) это гарантирует один тост.
  await prisma.userAchievement.updateMany({
    where: { userId, achievementId: { in: unseenIds }, notifiedAt: null },
    data: { notifiedAt: now },
  })

  const byId = new Map(current.map((achievement) => [achievement.id, achievement]))
  return unseenIds
    .map((id) => byId.get(id))
    .filter((achievement): achievement is Achievement => Boolean(achievement))
    .map((achievement) => ({
      id: achievement.id,
      title: achievement.title,
      description: achievement.description,
      icon: achievement.icon,
    }))
}
