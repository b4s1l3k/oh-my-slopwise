# Архитектура SLOPwise Personal

Документы `01`–`08` описывают фактическую архитектуру приложения по состоянию на 12 сентября 2026 года и построены по исходному коду, Prisma-схеме, миграциям, конфигурации и тестам. Документ `09` — отдельное предложение по целевой архитектуре и миграции, а не реализованное состояние. Планы из соседних файлов `docs/*-plan.md` также не считаются реализованной архитектурой, если соответствующего кода ещё нет.

## Навигация

1. [Системный контекст](01-system-context.md) — назначение системы, акторы, внешние зависимости и runtime-границы.
2. [Домен и модель данных](02-domain-and-data-model.md) — сущности, связи, денежная модель и инварианты.
3. [Backend и HTTP API](03-backend-and-api.md) — request flow, сервисы, endpoint-ы, транзакции и ошибки.
4. [Frontend](04-frontend.md) — App Router, страницы, компоненты, состояние и пользовательские сценарии.
5. [Безопасность](05-security.md) — аутентификация, авторизация, приватность и trust boundaries.
6. [Развёртывание и эксплуатация](06-deployment-and-operations.md) — конфигурация, Docker, миграции и внешние интеграции.
7. [Тестирование и качество](07-testing-and-quality.md) — тестовые контуры, команды и покрытие.
8. [Ограничения и развитие](08-known-constraints.md) — технические ограничения, расхождения документации и планы.
9. [Целевая архитектура и полное переписывание](09-target-architecture-and-full-rewrite.md) — Kotlin backend, client-agnostic API, web/WebView/native-клиенты и критерии будущего выделения сервисов.

## Краткая характеристика

SLOPwise Personal — single-module full-stack приложение для учёта совместных расходов. UI и HTTP backend собираются и запускаются одним процессом Next.js. Отдельного backend-сервиса нет.

Основной стек:

- Node.js 22 в production image;
- Next.js 15 App Router и React 19;
- TypeScript в strict mode;
- Auth.js/NextAuth с Credentials provider и JWT-сессиями;
- TanStack Query для клиентского server state;
- Tailwind CSS и локальные UI-компоненты в стиле shadcn/Radix;
- Prisma ORM и PostgreSQL; локальный compose закрепляет PostgreSQL 16;
- Zod для transport-валидации;
- Vitest для unit- и DB-интеграционных тестов.

Типичный архитектурный поток core use case:

```text
React page/component
  -> fetch /api/v1/*
  -> Next.js route handler
  -> session check + Zod validation
  -> service function
  -> Prisma transaction/query
  -> PostgreSQL
```

Для profile, registration, user search, activity и group requisites route handler обращается к Prisma напрямую, минуя service layer. Query/path параметры валидируются вручную лишь частично; единой проверки shape/length для них нет.

## Карта исходного кода

| Область | Расположение | Ответственность |
|---|---|---|
| Страницы и layouts | `src/app` | Маршрутизация, server/client boundaries, композиция экранов |
| HTTP API | `src/app/api` | Аутентификация запроса, парсинг, валидация, HTTP-ответ |
| Прикладная логика | `src/services` | Use cases, права на доменные операции, транзакции, orchestration |
| Чистая логика и cross-cutting helpers | `src/lib` | Расчёты, схемы Zod, auth/config, Prisma singleton, форматирование |
| UI | `src/components` | Формы, layout, профиль, достижения, переиспользуемые UI primitives |
| Общие типы | `src/types` | Prisma-derived типы; сейчас используются ограниченно |
| Модель БД | `prisma/schema.prisma` | Сущности, отношения, индексы и referential actions |
| Эволюция БД | `prisma/migrations` | Последовательность SQL-миграций и backfill статистики |
| Развёртывание | `Dockerfile`, `docker-entrypoint.sh` | Standalone image, применение миграций, запуск Next.js |

## Доминирующие принципы и исключения

- Деньги хранятся целыми числами в единой внутренней шкале 1/100 денежной единицы; для валют без официальных сотых, например JPY, это прикладная условность.
- JSON command DTO в основном проходят Zod-валидацию; path/query/Auth.js inputs имеют неполную отдельную или ручную validation.
- Основная core-логика располагается в `src/services`, но несколько простых routes выполняют persistence напрямую.
- Членство и роль проверяются сервером, а для критических мутаций повторно проверяются внутри транзакции.
- Там, где use case создаёт activity и/или lifetime facts, эти записи выполняются в той же транзакции; покрытие событий не является полным.
- Балансы вычисляются из расходов и расчётов, а не хранятся отдельным изменяемым агрегатом.
- Полученные достижения и lifetime-факты сохраняются независимо от удаляемых групп и расходов.

## Статус проверки

- На 12 сентября 2026 года для `HEAD 05f7644`: `npx tsc --noEmit` проходит без ошибок.
- Обычный `npm test`: 306 тестов проходят, 96 DB-зависимых сценариев пропускаются по feature flag.
- Production `npm run build` проходит при доступе к Google Fonts.
- Полный `npm run test:db` на защищённом `TEST_DATABASE_URL`: 402 теста проходят; guard запрещает application DB и имя без маркера `test`.
