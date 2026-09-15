# Архитектура SLOPwise Personal

Документы `01`–`08` описывают фактическую архитектуру приложения и построены по
исходному коду, Prisma-схеме, миграциям, конфигурации и тестам. Документ `09` —
отдельное предложение по целевой архитектуре, а `10` фиксирует уже реализованную
migration boundary. Планы из соседних файлов `docs/*-plan.md` не считаются
реализованной архитектурой, пока соответствующего кода нет.

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
10. [Граница frontend/backend](10-frontend-backend-boundary.md) — generated OpenAPI types, запреты зависимостей и запуск E2E против backend-кандидата.

### Принятые ADR

- [ADR 001: Семантика финансового домена](adr/001-domain-semantics.md) — Money, даты, FX, immutable revisions и ledger, membership, debt/privacy и статистика.

## Краткая характеристика

SLOPwise Personal — single-module full-stack приложение для учёта совместных расходов. UI и HTTP backend собираются и запускаются одним процессом Next.js. Отдельного backend-сервиса нет.

Основной стек:

- Node.js 22 Alpine в production image;
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
  -> feature hook (src/hooks/api)
  -> TanStack Query + centralized query keys/invalidation
  -> domain API client
  -> shared HTTP client
  -> /api/v1/* or configured backend base URL
  -> Next.js route handler
  -> session check + Zod validation
  -> service function
  -> Prisma transaction/query
  -> PostgreSQL
```

Для profile, registration, user search и group requisites route handler
обращается к Prisma напрямую, минуя service layer. Account activity проходит
через `activity.service.ts`. Query/path параметры валидируются вручную лишь
частично; единой проверки shape/length для них нет.

## Карта исходного кода

| Область | Расположение | Ответственность |
|---|---|---|
| Страницы и layouts | `src/app` | Маршрутизация, server/client boundaries, композиция экранов |
| HTTP API | `src/app/api` | Аутентификация запроса, парсинг, валидация, HTTP-ответ |
| Frontend application boundary | `src/hooks/api` | Query/mutation options, query keys, cancellation, pagination и cache invalidation |
| Прикладная логика | `src/services` | Use cases, права на доменные операции, транзакции, orchestration |
| Чистая логика и cross-cutting helpers | `src/lib` | Расчёты, схемы Zod, auth/config, Prisma singleton, форматирование |
| UI | `src/components` | Формы, layout, профиль, достижения, переиспользуемые UI primitives |
| HTTP-контракт | `contracts/openapi`, `contracts/typescript` | Canonical OpenAPI, generated transport types и язык-независимые test protocols |
| Общие UI-типы | `src/types` | Типы web-приложения; Prisma-типы в public type surface не используются |
| Модель БД | `prisma/schema.prisma` | Сущности, отношения, индексы и referential actions |
| Baseline БД | `prisma/migrations` | Единственная fresh-install migration без legacy upgrade/backfill |
| Развёртывание | `Dockerfile`, `docker-entrypoint.sh` | Standalone image, применение миграций, запуск Next.js |

## Доминирующие принципы и исключения

- Деньги хранятся целыми числами в единой внутренней шкале 1/100 денежной единицы; для валют без официальных сотых, например JPY, это прикладная условность.
- JSON command DTO в основном проходят Zod-валидацию; path/query/Auth.js inputs имеют неполную отдельную или ручную validation.
- Основная core-логика располагается в `src/services`, но несколько простых routes выполняют persistence напрямую.
- Членство и роль проверяются сервером, а для критических мутаций повторно проверяются внутри транзакции.
- Там, где use case создаёт activity и/или lifetime facts, эти записи выполняются в той же транзакции; покрытие событий не является полным.
- Web create-команды используют `Idempotency-Key`; resource, idempotency record и transactional side effects фиксируются атомарно, TTL ключа — 24 часа.
- Source ledger состоит из расходов/splits/settlements, а текущие balances
  обслуживаются транзакционной, полностью rebuildable проекцией positions.
- Полученные достижения и lifetime-факты сохраняются независимо от удаляемых групп и расходов.
- Feature pages/components не импортируют domain API clients и не создают TanStack
  queries/mutations напрямую. `src/hooks/api` является единственной прикладной границей
  frontend; router, toast, session и form state остаются в UI.

## Статус проверки

- Единственная baseline migration рассчитана на чистую БД; upgrade/backfill
  предыдущих схем не поддерживается.
- `npm run test:regression` объединяет typecheck, contract, golden, unit/DB,
  build и standalone E2E gates.
- DB runners принимают только изолированные URL с test/e2e-маркером и не должны
  подключаться к application или production БД.
- Актуальные результаты и coverage thresholds принадлежат CI/configuration, а
  не этому документу.
