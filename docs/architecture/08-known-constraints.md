# Ограничения и развитие

Этот документ отделяет фактическую архитектуру от целевых улучшений. Исправленные
риски здесь не перечисляются как ограничения.

## Сводка ограничений

### Высокий приоритет

| Область | Текущее состояние | Риск |
|---|---|---|
| Production migrations | Custom `psql` runner имеет advisory lock, checksum verification и атомарную history transaction, но нет automatic image/recovery smoke; все SQL-файлы принудительно transactional | Неподдерживаемая non-transactional DDL или неизвестный recovery case может заблокировать startup |
| CI residual gaps | Typecheck, contract, golden, coverage, build и standalone E2E блокируют publish; нет lint, dependency/security scan, Docker startup и migrator recovery smoke | Ошибка упаковки image, supply-chain или entrypoint может проявиться после публикации |
| Application admin | Роль выводится из `ADMIN_EMAIL` при login | Регистрация незанятого admin email и старый JWT создают неочевидный access lifecycle |
| Observability | Есть liveness/readiness и client request ID, но нет structured request logs, metrics, tracing, alerting и SLO | Production failure трудно расследовать и измерять |
| Idempotency | Create endpoints не принимают idempotency key | Network/mobile retry может продублировать group, expense, manual settlement или feedback |

### Средний приоритет

| Область | Текущее состояние | Риск |
|---|---|---|
| Balance overview | Один SQL не загружает full ledger и возвращает только incident edges, но охватывает все active groups без account-level projection и pagination counterparties | DB work и response size растут с числом групп, контрагентов и валют |
| Residual feeds | Account activity и group list имеют cursor continuation; group activity ограничена 50, feedback — 100 без continuation | Старые group-audit/admin-feedback rows недоступны через API |
| API errors | Success DTO изолированы, но error envelopes неоднородны, domain codes — строки | Новый backend и клиенты сложнее типизировать одинаково |
| Frontend cache | Широкая correctness-first invalidation; identity cache явно не очищается | Избыточный refetch и риск stale state при смене пользователя без полной навигации |
| Frontend hotspots | Group page/settings/expense form объединяют несколько ответственностей | Высокая цена изменения и сложность component testing |
| FX correctness | Rates хранятся как decimal, но TypeScript runtime считает через `number`; cached fallback не ограничен возрастом, XML response date не проверяется | Возможны binary rounding и экономически устаревший курс без provenance |
| Audit coverage | Activity не охватывает все mutations | Неполный operational audit trail |

### Низкий/накопительный приоритет

- user search не имеет debounce;
- theme state не синхронизируется между одновременно mounted navigation variants;
- accessibility semantics неполны для custom filters/toggles/toasts;
- destructive UI смешивает native `confirm` и Radix dialogs;
- нет единого typed authorization policy/domain error layer;
- часть простых routes обращается к Prisma напрямую;
- UI пока не показывает отдельную settlement history, group description и часть
  уже хранимых expense/profile полей;
- `kind` lifetime-факта остаётся soft dictionary: формат проверяет БД, но список
  допустимых значений контролирует приложение.

## Корректность и принятая семантика

### Финансовые данные и membership

Calendar dates хранятся PostgreSQL `DATE`, instants — `TIMESTAMPTZ(3)`, rates —
`NUMERIC(20,10)`, деньги — integer minor units. Expense total округляется один
раз, а FX remainder детерминированно распределяется между splits; БД требует
равенство и original, и base totals.

`group_member_positions` синхронно поддерживается triggers. БД не позволяет
создать финансовую операцию для inactive member, деактивировать участника с
ненулевой position или удалить membership, нужную истории. Изменение старого
расхода также не может вернуть баланс вышедшему пользователю.

Cash settlement — неизменяемый факт переданных денег: его amount/currency/base
не следуют за исправлением расхода. Разрешено менять получателя вслед за новым
payer, дату и notes; aggregate constraints требуют существующий split и не дают
превысить его суммы.

### Deterministic debt и requisites privacy

Упрощение долгов сортирует равные positions по user ID. Group detail и balances
строят graph из одной authoritative projection, поэтому одинаковое состояние
даёт одинакового creditor и одинаковое раскрытие реквизитов. Это детерминизм,
но greedy algorithm не обещает математически минимальное число переводов для
любой возможной сети.

### Lifetime statistics и achievements

Lifetime facts переживают удаление source entity. Исправление существующего
expense/settlement заменяет актуализируемые факты; record maxima и уже открытые
achievements намеренно не уменьшаются. PostgreSQL projections обновляются в той
же транзакции и могут быть атомарно пересобраны через
`npm run db:rebuild-projections`.

Achievement GET не пишет в БД. Явный POST unseen синхронизирует unlocks и
атомарно claims notification rows, поэтому два клиента не получают одно
уведомление.

## Масштабирование

Уже устранены full-ledger balance reads, unbounded group/expense/settlement
feeds, account activity `1 + N` и недетерминированные debt ties. Rates хранятся
как decimal, но вычисления текущего TypeScript backend всё ещё используют
binary floating point. Ближайшие bottleneck:

1. account overview без account-level projection и pagination counterparties;
2. group activity и admin feedback без continuation;
3. синхронная последовательная запись большого числа cash/statistic facts;
4. transaction contention одной популярной группы;
5. отсутствие нагрузочного baseline и production telemetry.

Следующие безопасные улучшения:

- cursor-pagination group activity и admin feedback;
- account overview projection с отдельно сохранёнными totals и paginated
  counterparty balances;
- typed application commands/results, domain errors и persistence ports;
- idempotency records для create commands;
- outbox для audit/analytics, только после ADR о consistency/freshness;
- load tests и индексы, подтверждённые `EXPLAIN (ANALYZE, BUFFERS)`, а не
  добавленные предположительно.

Микросервисы сейчас не нужны: Group/Expense/Settlement/Balance образуют один
strongly-consistent financial aggregate. Их преждевременное разделение добавит
distributed transactions и больше способов получить drift. Сначала следует
выделить модульный Kotlin Core с одной PostgreSQL и стабильным API; отдельными
сервисами позже могут стать только доказанно независимые FX/notification/reporting
контуры.

## Границы модульности

Frontend уже зависит от generated OpenAPI DTO только внутри API clients/hooks и
маппит transport models в UI view models. Backend всё ещё связан с Prisma внутри
services, authorization checks частично дублируются, а строковые ошибки не
образуют типизированный application API.

Следующая внутренняя граница до переписывания:

```text
route -> command mapper/validator -> application handler
      -> persistence port -> Prisma adapter
      -> explicit result -> response mapper
```

Это можно вводить вертикальными срезами без смены runtime. В будущем Kotlin
backend должен реализовать тот же OpenAPI/golden/E2E contract, а не копировать
Prisma-модели или текущую структуру таблиц.

## Операционные следующие шаги

1. вынести migration runner в singleton deploy job и добавить recovery runbook;
2. добавить Docker image startup/health/migration smoke в CI;
3. structured logs с request ID, metrics/traces и alerts;
4. backup/restore drill и projection reconciliation runbook;
5. startup validation env и осознанный sizing pool/replicas.

Плановые `docs/localization-plan.md` и `docs/receipt-scanning-plan.md` не являются
реализованной архитектурой.
