export type AchievementCategory =
  | "START"
  | "ACTIVITY"
  | "TEAM"
  | "SETTLEMENTS"
  | "MASTERY"
  | "GROUPS"

export type AchievementMetrics = {
  accountAgeDays: number
  profileReady: number
  activeGroups: number
  groupsCreated: number
  invitesCreated: number
  expensesCreated: number
  expensesParticipated: number
  expensesPaid: number
  coffeeExpensesPaid: number
  createdForOthers: number
  uniquePeople: number
  maxExpenseParticipants: number
  maxPaidParticipants: number
  settlementsSent: number
  settlementsReceived: number
  cashSettlements: number
  equalSplits: number
  exactSplits: number
  percentageSplits: number
  splitMethodsUsed: number
  customRates: number
  currenciesUsed: number
  groupTypesUsed: number
  homeGroups: number
  tripGroups: number
  coupleGroups: number
  maxGroupMembers: number
  maxGroupExpenses: number
}

export type Achievement = {
  id: string
  title: string
  description: string
  category: AchievementCategory
  icon: string
  unlocked: boolean
  progress: number
  target: number
  percent: number
  hidden: boolean
}

type AchievementDefinition = {
  id: string
  title: string
  description: string
  category: AchievementCategory
  icon: string
  metric: keyof AchievementMetrics
  target: number
  hidden?: boolean
}

export const ACHIEVEMENT_CATEGORY_LABELS: Record<AchievementCategory, string> = {
  START: "Первые шаги",
  ACTIVITY: "Активность",
  TEAM: "Вместе",
  SETTLEMENTS: "Расчёты",
  MASTERY: "Функции",
  GROUPS: "Группы",
}

const definitions: AchievementDefinition[] = [
  { id: "first-group", title: "Своя компания", description: "Вступить в первую группу", category: "START", icon: "users", metric: "activeGroups", target: 1 },
  { id: "first-expense", title: "Первый чек", description: "Добавить первую трату", category: "START", icon: "receipt", metric: "expensesCreated", target: 1 },
  { id: "first-participation", title: "Я тоже участвую", description: "Стать участником первой траты", category: "START", icon: "user-check", metric: "expensesParticipated", target: 1 },
  { id: "first-settlement", title: "По рукам", description: "Зафиксировать первый расчёт", category: "START", icon: "handshake", metric: "settlementsSent", target: 1 },
  { id: "profile-ready", title: "Куда переводить?", description: "Заполнить получателя, банк и реквизиты", category: "START", icon: "badge-check", metric: "profileReady", target: 1 },
  { id: "first-invite", title: "Зови друзей", description: "Создать первое приглашение в группу", category: "START", icon: "user-plus", metric: "invitesCreated", target: 1 },

  { id: "expenses-10", title: "Счёт ведётся", description: "Добавить 10 трат", category: "ACTIVITY", icon: "notebook", metric: "expensesCreated", target: 10 },
  { id: "expenses-50", title: "Хранитель чеков", description: "Добавить 50 трат", category: "ACTIVITY", icon: "library", metric: "expensesCreated", target: 50 },
  { id: "expenses-250", title: "Главный бухгалтер", description: "Добавить 250 трат", category: "ACTIVITY", icon: "calculator", metric: "expensesCreated", target: 250 },
  { id: "secret-ledger", title: "Чеканос: Война бесконечных трат", description: "Добавить 1 000 трат и собрать полный Перчатень расходов", category: "ACTIVITY", icon: "crown", metric: "expensesCreated", target: 1000, hidden: true },
  { id: "paid-10", title: "Сегодня плачу я", description: "Оплатить 10 общих трат", category: "ACTIVITY", icon: "wallet", metric: "expensesPaid", target: 10 },
  { id: "paid-50", title: "Надёжный кошелёк", description: "Оплатить 50 общих трат", category: "ACTIVITY", icon: "wallet-cards", metric: "expensesPaid", target: 50 },
  { id: "participated-25", title: "В деле", description: "Поучаствовать в 25 тратах", category: "ACTIVITY", icon: "star", metric: "expensesParticipated", target: 25 },
  { id: "participated-100", title: "Завсегдатай", description: "Поучаствовать в 100 тратах", category: "ACTIVITY", icon: "sparkles", metric: "expensesParticipated", target: 100 },
  { id: "account-year", title: "Годовщина", description: "Пользоваться приложением целый год", category: "ACTIVITY", icon: "calendar", metric: "accountAgeDays", target: 365 },

  { id: "people-3", title: "Тесный круг", description: "Состоять в группах с 3 людьми", category: "TEAM", icon: "users", metric: "uniquePeople", target: 3 },
  { id: "people-10", title: "Командный игрок", description: "Состоять в группах с 10 людьми", category: "TEAM", icon: "users-round", metric: "uniquePeople", target: 10 },
  { id: "people-25", title: "Широкий круг", description: "Состоять в группах с 25 людьми", category: "TEAM", icon: "network", metric: "uniquePeople", target: 25 },
  { id: "expense-people-5", title: "За одним столом", description: "Добавить трату на 5 участников", category: "TEAM", icon: "utensils", metric: "maxExpenseParticipants", target: 5 },
  { id: "expense-people-10", title: "Большой стол", description: "Добавить трату на 10 участников", category: "TEAM", icon: "party-popper", metric: "maxExpenseParticipants", target: 10 },
  { id: "secret-feast", title: "Мстители: Финал чека", description: "Добавить трату на 20 участников и собрать всех в одном счёте", category: "TEAM", icon: "party-popper", metric: "maxExpenseParticipants", target: 20, hidden: true },
  { id: "created-for-other", title: "Помощник бухгалтера", description: "Занести трату, которую оплатил другой участник", category: "TEAM", icon: "pencil", metric: "createdForOthers", target: 1 },
  { id: "created-for-other-25", title: "Секретарь компании", description: "Занести 25 трат за других плательщиков", category: "TEAM", icon: "clipboard", metric: "createdForOthers", target: 25 },
  { id: "paid-for-10", title: "Один за всех", description: "Оплатить и занести трату на 10 участников", category: "TEAM", icon: "shield", metric: "maxPaidParticipants", target: 10 },

  { id: "settlements-10", title: "Долг платежом красен", description: "Зафиксировать 10 расчётов", category: "SETTLEMENTS", icon: "hand-coins", metric: "settlementsSent", target: 10 },
  { id: "settlements-50", title: "Мастер расчётов", description: "Зафиксировать 50 расчётов", category: "SETTLEMENTS", icon: "landmark", metric: "settlementsSent", target: 50 },
  { id: "cash-1", title: "Без перевода", description: "Учесть первый расчёт наличными при создании траты", category: "SETTLEMENTS", icon: "banknote", metric: "cashSettlements", target: 1 },
  { id: "cash-10", title: "Наличные в деле", description: "Учесть 10 расчётов наличными", category: "SETTLEMENTS", icon: "banknote", metric: "cashSettlements", target: 10 },
  { id: "received-10", title: "Всё сошлось", description: "Получить 10 зафиксированных расчётов", category: "SETTLEMENTS", icon: "circle-check", metric: "settlementsReceived", target: 10 },

  { id: "equal-10", title: "Поровну", description: "Добавить 10 трат с делением поровну", category: "MASTERY", icon: "equal", metric: "equalSplits", target: 10 },
  { id: "exact-1", title: "Точно до копейки", description: "Впервые разделить трату по суммам", category: "MASTERY", icon: "ruler", metric: "exactSplits", target: 1 },
  { id: "exact-10", title: "Ювелирная точность", description: "Добавить 10 трат с точными суммами", category: "MASTERY", icon: "crosshair", metric: "exactSplits", target: 10 },
  { id: "percentage-1", title: "Сто процентов", description: "Впервые разделить трату по процентам", category: "MASTERY", icon: "percent", metric: "percentageSplits", target: 1 },
  { id: "percentage-10", title: "Процентный эксперт", description: "Добавить 10 трат с делением по процентам", category: "MASTERY", icon: "chart-pie", metric: "percentageSplits", target: 10 },
  { id: "all-split-methods", title: "На все случаи", description: "Использовать все 3 способа деления трат", category: "MASTERY", icon: "shapes", metric: "splitMethodsUsed", target: 3 },
  { id: "custom-rate", title: "Свой курс", description: "Впервые указать собственный курс валюты", category: "MASTERY", icon: "badge-dollar", metric: "customRates", target: 1 },
  { id: "currencies-3", title: "Путешественник", description: "Участвовать в тратах в 3 валютах", category: "MASTERY", icon: "globe", metric: "currenciesUsed", target: 3 },
  { id: "currencies-5", title: "Без границ", description: "Участвовать в тратах в 5 валютах", category: "MASTERY", icon: "languages", metric: "currenciesUsed", target: 5 },

  { id: "groups-3", title: "Несколько компаний", description: "Состоять в 3 активных группах", category: "GROUPS", icon: "folders", metric: "activeGroups", target: 3 },
  { id: "groups-10", title: "Везде свой", description: "Состоять в 10 активных группах", category: "GROUPS", icon: "layout-grid", metric: "activeGroups", target: 10 },
  { id: "groups-created-3", title: "Организатор", description: "Создать 3 группы", category: "GROUPS", icon: "folder-plus", metric: "groupsCreated", target: 3 },
  { id: "home-group", title: "Дом, милый дом", description: "Вступить в домашнюю группу", category: "GROUPS", icon: "house", metric: "homeGroups", target: 1 },
  { id: "trip-group", title: "Чемоданное настроение", description: "Вступить в группу для поездки", category: "GROUPS", icon: "plane", metric: "tripGroups", target: 1 },
  { id: "couple-group", title: "Общий бюджет", description: "Вступить в группу для пары", category: "GROUPS", icon: "heart", metric: "coupleGroups", target: 1 },
  { id: "all-group-types", title: "На все случаи жизни", description: "Состоять в группах всех 4 типов", category: "GROUPS", icon: "blocks", metric: "groupTypesUsed", target: 4 },
  { id: "group-members-5", title: "Большая компания", description: "Состоять в группе из 5 участников", category: "GROUPS", icon: "users-round", metric: "maxGroupMembers", target: 5 },
  { id: "group-members-10", title: "Целая команда", description: "Состоять в группе из 10 участников", category: "GROUPS", icon: "megaphone", metric: "maxGroupMembers", target: 10 },
  { id: "group-expenses-50", title: "Группа с историей", description: "Состоять в группе с 50 тратами", category: "GROUPS", icon: "history", metric: "maxGroupExpenses", target: 50 },
  { id: "group-expenses-250", title: "Летопись расходов", description: "Состоять в группе с 250 тратами", category: "GROUPS", icon: "book-open", metric: "maxGroupExpenses", target: 250 },

  // Гиковская коллекция: часть достижений видна сразу, а редкие пасхалки
  // до открытия возвращаются клиенту без названия и условия.
  { id: "secret-wizard-accountant", title: "Ты бухгалтер, Гарри", description: "Добавить первую трату и поступить в Хогвартс финансовой отчётности", category: "START", icon: "sparkles", metric: "expensesCreated", target: 1 },
  { id: "secret-force-balance", title: "Да пребудет с тобой баланс", description: "Зафиксировать первый расчёт и восстановить равновесие в далёкой-далёкой группе", category: "SETTLEMENTS", icon: "star", metric: "settlementsSent", target: 1 },
  { id: "secret-not-the-debts", title: "Это не те долги, которые вы ищете", description: "Зафиксировать 10 расчётов, применив бухгалтерский трюк джедая", category: "SETTLEMENTS", icon: "handshake", metric: "settlementsSent", target: 10 },
  { id: "secret-expensium-leviosa", title: "Расходиум Левиоса", description: "Впервые разделить трату по процентам. Ударение — на баланс", category: "MASTERY", icon: "sparkles", metric: "percentageSplits", target: 1 },
  { id: "secret-one-does-not-simply", title: "Нельзя просто так взять и разделить чек", description: "Использовать все три способа деления и дойти до Мордора бухгалтерии", category: "MASTERY", icon: "shield", metric: "splitMethodsUsed", target: 3 },
  { id: "secret-fellowship", title: "Братство общего чека", description: "Собрать группу из 9 участников. Один чек, чтобы править всеми", category: "TEAM", icon: "users-round", metric: "maxGroupMembers", target: 9 },
  { id: "secret-i-am-your-payer", title: "Я твой плательщик", description: "Оплатить 50 общих трат и признать финансовое родство", category: "ACTIVITY", icon: "wallet", metric: "expensesPaid", target: 50 },
  { id: "secret-red-rate", title: "Ты выбрал красную таблетку курса", description: "Указать собственный курс и увидеть, насколько глубока кроличья нора конвертации", category: "MASTERY", icon: "badge-dollar", metric: "customRates", target: 1 },
  { id: "secret-toss-a-coin", title: "Заплатите бухгалтеру чеканной монетой", description: "Поучаствовать в тратах в 5 валютах. О-о-о, совместный бюджет", category: "MASTERY", icon: "globe", metric: "currenciesUsed", target: 5 },
  { id: "secret-winter-is-coming", title: "Зима близко. Чеки уже здесь", description: "Состоять в группе со 100 тратами и пережить финансовую зиму", category: "GROUPS", icon: "history", metric: "maxGroupExpenses", target: 100 },
  { id: "secret-after-all-this-time", title: "После стольких трат? Всегда", description: "Пользоваться приложением целый год и не отречься от общего чека", category: "ACTIVITY", icon: "calendar", metric: "accountAgeDays", target: 365 },
  { id: "secret-my-precious", title: "Моя прелесть… это чужой чек", description: "Занести 25 трат за других плательщиков и не отдать бухгалтерское кольцо", category: "TEAM", icon: "crown", metric: "createdForOthers", target: 25 },
  { id: "secret-portal", title: "Портал открыт. Кто будет платить?", description: "Создать 10 приглашений и собрать межпространственный совет должников", category: "GROUPS", icon: "user-plus", metric: "invitesCreated", target: 10 },
  { id: "secret-han-cash", title: "Хан Наличка стрелял первым", description: "Учесть 10 наличных расчётов до того, как прилетит перевод", category: "SETTLEMENTS", icon: "banknote", metric: "cashSettlements", target: 10 },
  { id: "secret-multiverse", title: "Доктор Стрэндж и мультивселенная расходов", description: "Одновременно состоять в 10 активных группах и не потеряться между счетами", category: "GROUPS", icon: "folders", metric: "activeGroups", target: 10 },
  { id: "secret-coffee-path", title: "Это путь. К кофе", description: "Оплатить кофе и вступить в орден мандалорских кофеманов. Таков путь", category: "ACTIVITY", icon: "coffee", metric: "coffeeExpensesPaid", target: 1, hidden: true },
]

const COFFEE_PATTERN = /(?:^|[^\p{L}])(?:кофе|кофейн\p{L}*|coffee|cappuccino|капучино|latte|латте|espresso|эспрессо|americano|американо|раф)(?=$|[^\p{L}])/iu

export function isCoffeeExpense(title: string, category?: string | null) {
  return COFFEE_PATTERN.test(`${title} ${category ?? ""}`)
}

export const ACHIEVEMENT_COUNT = definitions.length

export function evaluateAchievements(
  metrics: AchievementMetrics,
  persistedIds: ReadonlySet<string> = new Set()
): Achievement[] {
  return definitions.map((definition) => {
    const progress = Math.max(0, metrics[definition.metric])
    const unlocked = progress >= definition.target || persistedIds.has(definition.id)
    const hidden = Boolean(definition.hidden)

    return {
      id: definition.id,
      title: hidden && !unlocked ? "Секретная ачивка" : definition.title,
      description: hidden && !unlocked ? "Условие откроется вместе с наградой" : definition.description,
      category: definition.category,
      icon: hidden && !unlocked ? "lock" : definition.icon,
      unlocked,
      progress: hidden && !unlocked ? 0 : progress,
      target: hidden && !unlocked ? 1 : definition.target,
      percent: hidden && !unlocked ? 0 : Math.min(100, Math.round((progress / definition.target) * 100)),
      hidden,
    }
  })
}
