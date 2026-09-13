# Тестирование и качество

## Инструменты

Тестовый runner — Vitest 4. Конфигурация:

- environment `node`;
- globals включены;
- include `src/**/*.test.ts` и `contracts/**/*.test.ts`;
- alias `@` указывает на `src`;
- setup-файл подменяет `DATABASE_URL` на проверенный `TEST_DATABASE_URL` только для DB-контура;
- V8 coverage проверяет backend/contract boundary с обязательными порогами:
  statements 90%, branches 85%, functions 90%, lines 92%.

Файлы `*.test.tsx` конфигурацией не включаются.

## Команды

| Команда | Назначение |
|---|---|
| `npm test` | Быстрые unit/mocked suites; DB suites пропускаются |
| `npm run typecheck` | TypeScript strict typecheck без emit |
| `npm run test:contract` | OpenAPI/source parity и mocked HTTP route contract tests |
| `npm run test:golden` | Schema/runner tests и 186 language-neutral vectors против legacy adapter |
| `npm run test:watch` | Интерактивный Vitest |
| `npm run test:db` | Полный suite на `TEST_DATABASE_URL` с последовательным выполнением файлов |
| `npm run test:coverage` | Полный DB suite на `TEST_DATABASE_URL` с V8 coverage |
| `npm run test:e2e` | 221 HTTP/browser E2E на чистой `splitwise_e2e` с локальным Next.js dev server |
| `npm run test:e2e:production` | Те же 221 E2E против собранного standalone server, как в Docker image |
| `npm run test:e2e:headed` | Тот же E2E-контур с видимым Chrome |
| `npm run test:e2e:ui` | Интерактивный Playwright UI |
| `npx tsc --noEmit` | Проверка типов |
| `npm run build` | Prisma generation внутри image выполняется отдельно, затем production Next build |
| `npm run test:quality` | Typecheck, unit/contract, golden и production build |
| `npm run test:regression` | Полный gate: quality, DB и E2E |

DB runner выставляет `RUN_DB_INTEGRATION_TESTS=true`, применяет pending migrations и запускает Vitest с `--no-file-parallelism`, обязательным из-за конфликтов Serializable transactions между тестовыми файлами. По умолчанию URL выводится из `DATABASE_URL` заменой имени на `<database>_test`; `TEST_DATABASE_URL` позволяет задать иной адрес. Guard требует PostgreSQL, самостоятельный маркер `test` в имени и несовпадение с application `DATABASE_URL`; после проверки setup подменяет URL до импорта Prisma.

## Фактический результат повторной проверки

Snapshot: 13 сентября 2026 года, working tree на основе baseline `d0fa6d9` с OpenAPI v1 contract.

```text
Fast run:   49 files passed, 14 skipped; 814 tests passed, 132 skipped
Full run:   63 files passed; 946 tests passed
Coverage:   92.24% statements; 85.97% branches; 96.64% functions; 95.14% lines
Contract:   84 tests passed
Golden:     9 runner/schema tests; 186/186 vectors with legacy adapter
E2E:        71 spec files; 221 tests against the standalone production server
TypeScript: no errors
Build:      passed
```

Полный DB-run выполнен на отдельной `splitwise_test` после применения всех 16
миграций. E2E-run самостоятельно сбросил `splitwise_e2e`, применил те же 16
миграций, поднял standalone production server на `127.0.0.1:3100` и прошёл в
системном Google Chrome. Подготовка standalone assets повторяет копирование
`.next/static` и `public` в Docker image.
Обычный `npm test` не подключается к БД и оставляет 132 DB-сценария skipped.

## Быстрый контур

Unit и mocked tests покрывают:

- денежное форматирование, parsing и даты;
- equal/exact/percentage split algorithm;
- balance simplification;
- позицию пользователя в расходе;
- поддерживаемые валюты;
- Zod validation расходов, групп, расчётов, профиля и feedback;
- achievement definitions/evaluation/icons;
- преобразование статистики;
- HTTP mapping доменных ошибок;
- Auth.js callbacks и Credentials authorization с mocks;
- отдельную pure simulation сброса расчётов.

Отдельный HTTP contract suite напрямую вызывает все v1 route handlers с
mocked auth/services/Prisma. Он фиксирует 32 success responses, единый 401 для
31 защищённой операции, validation/error envelopes, route-specific 403/404,
registration без session и явные response projections. Fixtures содержат
полные resource shapes и проверяют, что persistence-only поля не попадают в
JSON. Каждый успешный handler-response проходит JSON Schema из OpenAPI; coverage
операций выводится из самой спецификации, поэтому новая операция без response-
примера роняет suite. Response objects закрыты для лишних полей на любом уровне.
Request schemas сохраняют фактическую v1-семантику strip unknown fields.

Golden-контур хранит 186 JSON-сценариев в `contracts/golden`: expense/splits/FX,
balances/settlements, membership/dates, statistics/achievements и auth/errors.
Текущий manifest запускается через legacy TypeScript adapter. Runner технически
умеет подключать будущий candidate process adapter и сравнивать результаты, но
реальный backend-кандидат пока отсутствует; поэтому suite ещё не является
доказанным backend-to-backend parity gate. Compare-режим отличает ADR-approved
расхождения от неожиданного drift; протокол не зависит от языка реализации.

Чистые финансовые функции хорошо изолированы от framework и БД, поэтому их матрицы выполняются быстро и детерминированно.

## DB-интеграционный контур

Четырнадцать файлов регистрируют 132 сценария для реальных Prisma/service flows:

| Suite | Основной охват |
|---|---|
| `expenses.service.test.ts` | CRUD, authorization, splits, currency, cash settlement lifecycle, pagination, atomicity |
| `groups.service.test.ts` | Create/update/delete, members, roles, balances, cascade behavior |
| `settlements.service.test.ts` | Debt validation, partial payment, membership, transaction behavior |
| `balances.service.test.ts` | Group и overview balances |
| `exchange.service.test.ts` | CBR parsing/cache/fallback/conversion |
| `invites.service.test.ts` | Create/revoke/accept/reactivation role reset |
| `achievements.service.test.ts` | Persisted unlock и notification behavior |
| `feedback.service.test.ts` | Create/list |
| `persistence.integration.test.ts` | Cross-service persistence, cascades, lifetime facts |
| `persistence-atomicity.integration.test.ts` | Rollback и отсутствие частичных side effects |
| `persistence-concurrency.integration.test.ts` | Serializable conflicts, retry и idempotency |
| `persistence-constraints.integration.test.ts` | Реальные FK/unique/check constraints и cascades |
| `persistence-money.integration.test.ts` | Money/FX границы и точное minor-unit округление |
| `statistics-history.integration.test.ts` | Lifetime history после edit/delete/group lifecycle |

Тесты создают и удаляют строки только в `TEST_DATABASE_URL`. Команда применяет миграции, но не поднимает PostgreSQL и не создаёт саму БД: окружение должно предоставить изолированную БД с выведенным или явно заданным именем.

Устаревшее ожидание `summary.total > 60` заменено сравнением с экспортируемым `ACHIEVEMENT_COUNT`, поэтому DB-тест больше не дублирует изменяемый размер каталога достижений.

## HTTP/browser E2E-контур

Playwright-тесты разнесены по предметным файлам в `e2e`, а не собраны в один
монолитный сценарий. Отдельные suites покрывают:

- регистрацию, login/logout, callback/open redirect и повреждённую session cookie;
- desktop/mobile navigation, role-based UI и отсутствие runtime console/page errors;
- lifecycle групп, настройки, участников, выход/возврат и приглашения;
- equal/exact/percentage splits, FX, округление, календарные даты и денежные границы;
- создание, изменение, удаление и пагинацию расходов;
- наличные и ручные расчёты, balances/overview, requisites и reset;
- activity, lifetime statistics, achievements и однократную выдачу уведомлений;
- profile, feedback, admin UI, authorization и validation envelopes реального HTTP;
- конкурентные расходы, расчёты, membership и приглашения;
- транзакционный rollback, inactive membership и FX/money rounding boundaries;
- mass assignment, forged ownership, XSS/SQL/path payloads;
- UI loading/error/retry, deep links, keyboard/focus, mobile layout и theme/FAQ;
- live dashboard через реальный API/DB без route mocks;
- отзыв платёжных реквизитов после полного расчёта;
- раскрытие percentage/FX/cash/notes деталей расхода;
- полную anonymous/forbidden HTTP-матрицу и recovery приглашений.

`e2e/global-setup.ts` принимает только URL БД с маркером `_e2e`/`-e2e`, создаёт
БД при отсутствии, выполняет `prisma migrate reset` и создаёт фиксированных
пользователей. Suite выполняется с `workers: 1`: сценарии используют уникальные
имена сущностей, но одну локальную БД. При ошибке сохраняются trace и screenshot;
HTML-report пишется в `playwright-report`. Оба каталога артефактов исключены из Git.

## Test pyramid

```mermaid
flowchart TB
    e2e[Real HTTP + browser E2E\n221 scenarios]
    runtime[HTTP/OpenAPI schema contracts\n84 прошли]
    golden[Language-neutral golden\n186 vectors]
    db[DB service integration\n132 прошли]
    unit[Unit/mocked + mapper/guard]

    e2e --> runtime --> golden --> db --> unit
```

## Сильные стороны

- плотное покрытие арифметики и boundary validation;
- DB test code охватывает права, последовательные transaction rechecks и cascades;
- проверка happy path, edge cases и error cases;
- финансовые суммы и время в большинстве unit tests заданы явно;
- service boundary тестируется без поднятия Next.js context.
- success-ответы DB-backed routes проходят через явные transport mapper-ы;
- legacy и будущий Kotlin backend могут использовать одни golden JSON fixtures.

## Непокрытые уровни

- Firefox/WebKit и настоящие mobile browser engines; сейчас E2E запускается в Chrome;
- автоматический axe-аудит accessibility и visual regression;
- exhaustive chaos/fallback states для продолжительных и частичных сетевых сбоев;
- custom migration entrypoint, upgrade from older schemas и recovery paths;
- Docker image smoke/startup/health;
- нагрузочные конкурентные прогоны и длительный contention; базовые реальные race-сценарии покрыты;
- CI deploy webhook failure/rollback;
- security infrastructure, которой пока нет в приложении: rate limiting и CSRF abuse monitoring.

Фактические DB-paths дополнительно проверяют atomic rollback snapshots,
constraints/cascades, денежные границы, историю statistics и реальные
конкурентные settlement/invite/membership операции с Serializable retry.

## Quality gates

В repository нет lint script. TypeScript strict включён, но `skipLibCheck` также включён.
Coverage thresholds enforced в `vitest.config.ts`.

Publish workflow до сборки image запускает typecheck, OpenAPI contract, golden,
полный DB suite с coverage thresholds, production build и все Playwright E2E
против `.next/standalone/server.js`.
Deploy не начинается при падении любого слоя.

## Рекомендуемый порядок локальной проверки изменений

1. `npx tsc --noEmit`;
2. `npm test`;
3. для contract/domain semantics — `npm run test:contract` и `npm run test:golden`;
4. для изменений services/schema/migrations — `npm run test:db` на изолированной БД;
5. `npm run build`;
6. `npm run test:e2e` для быстрой локальной проверки API/UI/auth/financial changes;
7. `npm run test:e2e:production` перед merge/release после `npm run build`.
