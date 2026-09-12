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

async function evaluateUserAchievements(
  userId: string,
  now: Date
): Promise<{ current: Achievement[]; persistedIds: Set<string> }> {
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
  return { current: evaluateAchievements(metrics, persistedIds), persistedIds }
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
  const { current, persistedIds } = await evaluateUserAchievements(userId, now)
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
  // Safe read: persistence and notification claiming belong to the explicit
  // POST /achievements/unseen mutation.
  const { current } = await evaluateUserAchievements(userId, now)

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

  // One atomic claim. Concurrent devices cannot both receive the same row:
  // PostgreSQL re-checks the NULL predicate after a competing UPDATE commits.
  const claimed = await prisma.$queryRaw<Array<{ achievementId: string }>>`
    UPDATE "user_achievements"
    SET "notifiedAt" = ${now}
    WHERE "userId" = ${userId}
      AND "notifiedAt" IS NULL
    RETURNING "achievementId"
  `
  if (claimed.length === 0) return []

  const unseenIds = claimed.map((item) => item.achievementId)

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
