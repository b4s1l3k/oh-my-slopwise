# Локализация (i18n): RU + EN, префикс в URL

## Context

Приложение сейчас моноязычное: `<html lang="ru">`, все строки захардкожены
(~76 файлов, ~1139 строк с кириллицей), `formatMoney`/даты прибиты к `"ru-RU"`
(`src/lib/utils/format.ts:3,12,20`), сервер отдаёт русские тексты (ошибки в
`api-errors.ts`, Zod-сообщения, ярлыки ачивок в `achievements.ts`). Русская
морфология не решена: 10 мест вида `добавил(а)`, множественные числа
(1 участник / 2 участника / 5 участников) не обрабатываются.

Цель — вынести строки в каталоги и поддержать два языка (RU по умолчанию + EN)
с корректной плюрализацией и форматированием.

**Решения:**
1. Языки v1: **RU (дефолт) + EN**.
2. Определение языка: **префикс в URL** (`/groups`, `/en/groups`) — классический
   next-intl с `app/[locale]` + middleware.
3. Объём сейчас: **инфраструктура + один пилотный экран** (обкатать паттерн до
   массового выноса строк).

## Библиотека

**`next-intl`** — сделана под App Router (RSC + client), ICU MessageFormat решает
русские множественные (`{count, plural, one{} few{} many{} other{}}`) и род
(`{gender, select, …}`). Каталоги — `messages/ru.json`, `messages/en.json`,
ключи по областям (`common`, `auth`, `expense`, `group`, `errors`,
`achievements`, …).

---

## Фаза 1 — Инфраструктура

### 1. Зависимость и конфиг
- `npm i next-intl`.
- `next.config.ts` — обернуть в `withNextIntl("./src/i18n/request.ts")`
  (сейчас конфиг чистый, `next.config.ts:3-6` — добавляем плагин, сохраняя
  `output: "standalone"` и `images`).

### 2. Роутинг локали — `src/i18n/routing.ts` (новый)
```ts
export const routing = defineRouting({
  locales: ["ru", "en"],
  defaultLocale: "ru",
  localePrefix: "as-needed", // ru — без префикса, en — /en/...
})
```
- `src/i18n/navigation.ts` — обёртки `Link`, `redirect`, `useRouter`,
  `usePathname` из `createNavigation(routing)` (locale-aware навигация; заменят
  импорты из `next/navigation` в клиентских компонентах — ~11 файлов, но в
  Фазе 1 только в пилоте).
- `src/i18n/request.ts` — `getRequestConfig`: подгрузка `messages/${locale}.json`.

### 3. Реструктуризация `app/` под `[locale]`
Перенести под `src/app/[locale]/` все страничные группы:
`(auth)/`, `(dashboard)/`, `(admin)/`, `faq/`, `invite/`, `page.tsx`.
**`src/app/api/` НЕ трогаем** — API не локализуется по URL.
- `src/app/[locale]/layout.tsx` — заменяет корневой: `setRequestLocale(locale)`,
  динамический `<html lang={locale}>`, `<NextIntlClientProvider>` вокруг `<Providers>`.
  Динамический `lang` вместо захардкоженного `lang="ru"` (`app/layout.tsx:16`).
- `generateStaticParams` для локалей.

### 4. Middleware — объединить с auth
Текущий `src/middleware.ts` делает cookie-based редирект на `/login`. Нужно:
- прогнать запрос через `createMiddleware(routing)` из next-intl (детект/редирект
  локали), затем применить auth-логику.
- Публичные пути сделать locale-aware: сначала снять префикс локали
  (`/en/login` → `/login`), потом проверять `authPaths`/`isPublic`
  (`middleware.ts:6-8`). Редирект на логин — через locale-aware `redirect`,
  сохраняя текущую локаль и `callbackUrl`.
- `matcher` расширить, чтобы ловил и локализованные пути, по-прежнему исключая
  `/api`, `_next/*`, статику (`middleware.ts:33-35`).

### 5. Хранение выбора пользователя
- Prisma: добавить `User.locale String @default("ru")` (миграция).
  `User` сейчас без поля языка (`schema.prisma:10-23`).
- API `PATCH /api/v1/users/me` — принимать `locale` (уже есть роут `users/me`).
- При логине/визите синхронизировать cookie `NEXT_LOCALE` с `User.locale`.

### 6. Переключатель языка — `src/components/ui/locale-switcher.tsx` (новый)
- Использует locale-aware `useRouter`/`usePathname` для смены префикса,
  пишет cookie и (для залогиненных) `PATCH users/me`. Разместить в профиле и/или
  в шапке рядом с `theme-toggle` (паттерн `components/ui/theme-toggle.tsx`).

### 7. Форматтеры — локаль-параметризация
- `formatMoney`/даты в `src/lib/utils/format.ts` — принимать locale вместо
  захардкоженного `"ru-RU"` (`format.ts:3,12,20`), либо тянуть активную локаль
  через next-intl `useFormatter`/`getFormatter`. Деньги/даты → через `Intl` с
  активной локалью. Заложить тесты (репозиторий держит ~99% покрытия).

---

## Фаза 2 — Пилотный экран

Пилот: **страницы входа/регистрации** (`app/[locale]/(auth)/login`, `register`)
+ общая обвязка (`common`: кнопки, заголовки, ошибки формы). Компактно, публично,
проверяет: провайдер, каталог, locale-aware навигацию, метаданные
(`generateMetadata` с переводами), переключатель языка и форматтеры.

Шаги пилота:
- завести ключи `auth.*` и `common.*` в `messages/{ru,en}.json`;
- заменить строки в login/register на `t("...")` (server: `getTranslations`,
  client: `useTranslations`);
- локализовать метаданные через `generateMetadata`;
- прогнать переключение `/login` ↔ `/en/login`, проверить редиректы auth.

Готовый пилот фиксирует паттерн для массового выноса в Фазе 3 (не входит в этот
объём): область за областью — dashboard, группы, расходы, профиль/статистика,
ачивки, FAQ, серверные коды ошибок (перевод на клиенте по `code`), Zod-сообщения.

---

## Серверные строки (задел на Фазу 3, отметить в пилоте)

- **Ошибки API — по кодам, а не текстам.** Сервисы уже кидают доменные коды
  (`EXPENSE_NOT_FOUND`); поменять `handleServiceError` (`src/lib/api-errors.ts`),
  чтобы API отдавал `{ error: { code } }`, а перевод делать на клиенте по
  каталогу `errors.<CODE>`. Это убирает локаль с серверного пути ошибок.
  (В пилоте — локализовать ошибки формы логина по этому паттерну как образец.)
- **Ачивки** — логику оставить в `achievements.ts`, ярлыки/описания вынести в
  каталог по id (`achievements.<id>.title/description`).
- **Zod** — кастомный error map на клиенте + ключи вместо русских литералов в
  `src/lib/validations/*`.

---

## Файлы

**Новые:** `src/i18n/routing.ts`, `src/i18n/navigation.ts`,
`src/i18n/request.ts`, `messages/ru.json`, `messages/en.json`,
`src/app/[locale]/layout.tsx`, `src/components/ui/locale-switcher.tsx`,
миграция Prisma под `User.locale`.
**Правим:** `next.config.ts`, `src/middleware.ts`, `src/lib/utils/format.ts`
(+тест), `src/app/api/v1/users/me/route.ts`, `prisma/schema.prisma`, перенос
всего страничного дерева под `src/app/[locale]/`, пилотные
`(auth)/login|register`.

## Проверка (end-to-end)
1. `npx prisma migrate dev` — поле `User.locale`.
2. `npm run dev`:
   - `/login` — русский; `/en/login` — английский; переключатель меняет
     префикс и сохраняет выбор (cookie + `PATCH users/me` для залогиненных).
   - неавторизованный заход на `/en/dashboard` → редирект на `/en/login` с
     `callbackUrl` (middleware сохраняет локаль).
   - метаданные вкладки переведены; `<html lang>` соответствует локали.
   - деньги/даты в пилоте форматируются по активной локали.
3. `npm test` + `npx tsc --noEmit` — чисто; новые тесты форматтеров зелёные.

## Открытые допущения (по умолчанию, если не поправить)
- `localePrefix: "as-needed"` — RU без префикса, EN с `/en/`. (Альтернатива —
  `"always"`, тогда и `/ru/...`.)
- Пилот — страницы входа/регистрации; массовый вынос строк — отдельная Фаза 3.
- Определение языка для новых/анонимных: cookie `NEXT_LOCALE` → `Accept-Language`
  → `defaultLocale` (ru).
