# Ограничения и развитие

Этот документ отделяет фактическую архитектуру от целевого улучшения. Он не означает, что перечисленные изменения уже реализованы.

## Сводка ограничений

### Высокий приоритет

| Область | Текущее состояние | Риск |
|---|---|---|
| Production migrations | Custom psql runner без distributed lock/checksum verification | Параллельный rollout или crash window может вызвать duplicate DDL failure, рассинхронизацию history/schema или блокировку startup |
| CI gates | Docker build без test/typecheck steps | Regression может быть опубликована и сразу отправлена в redeploy |
| Application admin | Роль выводится только из `ADMIN_EMAIL` при login | Регистрация незанятого admin email или старый JWT создают неочевидный access lifecycle |
| Observability | Нет structured logs, request IDs, metrics, traces и app health | Production failure трудно обнаружить и расследовать |
| Legacy `amountBase` | Nullable, migration не выполняла backfill | Старые foreign-currency строки могут интерпретировать original amount как group currency |

### Средний приоритет

| Область | Текущее состояние | Риск |
|---|---|---|
| Balance queries | Полная история группы/всех групп загружается на каждый расчёт | Рост latency и памяти вместе с историей |
| API contracts | Prisma models и несколько error shapes выходят наружу | Сильная связность frontend/persistence, сложное единое error UX |
| Frontend cache | Неполная invalidation activity/statistics/groups/overview | Пользователь видит устаревшие данные |
| UI error states | Часть ошибок отображается как отсутствие данных | Ошибка баланса может выглядеть как отсутствие долгов |
| Frontend hotspots | Group page/settings/expense form объединяют несколько ответственностей | Высокая цена изменения и сложность тестирования |
| Invite concurrency | Нет unique active invite на группу | Одновременно могут существовать несколько действующих токенов |
| Idempotency | POST endpoints не имеют idempotency key | Network retry может продублировать операцию |
| Settlement history | Все settlements без pagination | Неограниченный размер ответа группы |
| Currency rates | Float и неограниченно старый/будущий nearest fallback | Ошибка точности или устаревший fallback без provenance |

### Низкий/накопительный приоритет

- `Friendship` и legacy `ExpenseSplit.share` не используются;
- `src/types/index.ts` почти не переиспользуется, DTO дублируются в components;
- Zustand и часть UI dependencies не используются;
- user search не имеет debounce/cancellation;
- theme state не синхронизируется между mounted navigation variants;
- accessibility semantics неполны для custom filters/toggles/toasts;
- destructive UI использует native `confirm` наряду с Radix dialogs;
- нет общего authorization helper/policy и API client.
- UI не использует `GET /expenses/:id`, `GET /groups/:id/settlements`, group description, expense category и avatar editing/rendering; часть statistics response также не показывается. Settlement date/notes записываются, но отдельная история manual settlements в UI отсутствует.

## Корректность отдельных сценариев

### Изменение валюты расхода с наличным расчётом

Связанный cash settlement считается фактом передачи денег. При update расхода его `amount`, `currency` и `amountBase` больше не переписываются; за исправленным расходом следуют только payer, business date и notes. Проверка допустимости наличного платежа выполняется по `amountBase`, поэтому старая и новая валюты не сравниваются напрямую.

При смене payer `recordSettlementHistory` удаляет прежние `MONEY_RETURNED` и `SETTLEMENT_RECEIVED` этого settlement и оставляет оба факта только у актуального получателя.

### Membership после выхода

Нулевой raw balance проверяется при деактивации участника. После изменения/удаления расхода и reset manual settlements общий `assertNoInactiveMemberBalances` повторно проверяет всех inactive users внутри той же транзакции; операция откатывается, если вернула кому-либо ненулевую позицию.

Если участник погасил долю cash settlement-ом и вышел, linked expense может стать нередактируемым: новые splits разрешены только active users, а сохранённый cash settlement всё ещё требует долю inactive sender. Reactivation или удаление expense разблокирует сценарий.

### FX rounding

Expense total округляется один раз. Split values сначала переводятся с floor, затем FX remainder детерминированно распределяется по наибольшей дробной части и исходному порядку участников. Для каждой успешно записанной операции выполняется `sum(split.amountBase) = expense.amountBase`.

Если positive total или positive split не представим хотя бы одной минимальной единицей валюты группы, операция отклоняется с `CONVERTED_AMOUNT_TOO_SMALL`; `amountBase = 0` для положительной записанной суммы не допускается.

### Date-only semantics

Expense и Settlement всё ещё используют `DateTime` в БД, однако boundary трактует поле как business date: формы отправляют `YYYY-MM-DD` без browser timezone conversion, backend нормализует literal date prefix в UTC midnight, edit сохраняет тот же prefix, а expense list форматирует день в UTC. Поэтому выбранный день не сдвигается в UTC-negative timezone. В будущем контракт и схема должны перейти на явный date-only тип; будущие даты пока разрешены и немедленно участвуют в текущем balance, as-of фильтрации нет.

Exchange parser не сверяет дату корневого XML-документа с requested day. Для будущей/особой даты источник может вернуть другой фактический набор, который будет сохранён под requested date и станет постоянным exact cache hit.

### Achievement notification

Achievement progress GET не изменяет БД. Явный POST unseen сохраняет unlocks и забирает pending rows одним conditional `UPDATE ... RETURNING`; конкурентные устройства получают непересекающиеся наборы уведомлений.

### Stable simplified debts

Raw balances детерминированы, но при равных creditor/debtor values выбор counterparty зависит от порядка map insertion. DB queries ledger-а не задают стабильный `orderBy`, поэтому simplified edges могут измениться при том же экономическом состоянии.

Group projection и balances — независимые GETs, каждый отдельно строит graph. При равных позициях один запрос теоретически может выбрать и раскрыть реквизиты другого creditor, чем тот, которого показывает balance UI.

### Lifetime semantics

Lifetime facts намеренно остаются после удаления source entity. При update часть фактов корректируется, часть record maxima не уменьшается. Это гибрид «исторического достижения» и «актуализируемого факта», поэтому каждый новый `kind` должен явно определить lifecycle create/update/delete.

Profile `groups.other` вычисляется как исторический максимум active groups минус lifetime HOME/TRIP/COUPLE counts, хотя существует отдельный `GROUP_JOINED_OTHER` fact. При группах разных типов в разные периоды значение OTHER может быть занижено.

Concurrent group/member changes при default isolation могут вычислить рекорд active/member count по неполному snapshot. `keepRecordMaximum` предотвращает уменьшение уже видимого максимума, но не гарантирует наблюдение общей конкурентной величины.

`CURRENCY` fact имеет несимметричный lifecycle: update последней живой траты в валюте запускает reconciliation и может удалить факт, а delete последней траты reconciliation не вызывает и сохраняет факт как lifetime history.

Migration backfill считает PEER и group-size по всем membership rows без `isActive` и temporal overlap, тогда как runtime join logic использует одновременно active members. Исторически восстановленные metrics могут иметь другую семантику.

### Password representation

Registration требует минимум восемь символов и максимум 72 UTF-8 байта. Login повторяет byte guard до `bcrypt.compare`, поэтому suffix за bcrypt-limit не может пройти как эквивалент существующего пароля.

### Group ordering timestamp

Список групп сортируется по `Group.updatedAt DESC`, но timestamp обновляется непоследовательно. Expense CRUD, manual settlement, non-empty reset, member remove, invite accept и group update его меняют; direct addMember, invite create/revoke, requisites update и zero-count reset — нет. Поле не является строгим временем последней доменной активности.

## Масштабирование

Текущая архитектура оптимальна для небольшого personal deployment. При росте данных первыми bottleneck станут:

1. overview, загружающий все операции всех active groups;
2. group detail, повторно строящий debt graph ради privacy реквизитов;
3. achievements, одновременно читающие current и historical metrics;
4. activity screen с fan-out `1 + N` HTTP requests;
5. последовательная запись cash settlements/statistic facts внутри transactions;
6. offset pagination на больших значениях page.

Возможные направления эволюции:

- server-side aggregates/materialized positions с контролем consistency;
- cursor pagination;
- единый batch activity endpoint;
- cache/version для debt graph;
- bounded queries и limits;
- разделение synchronous ledger write и производной аналитики через outbox/worker, если появится соответствующая инфраструктура.

Последний пункт меняет consistency model и требует отдельного ADR; сейчас синхронная transaction обеспечивает более простую корректность.

## Границы модульности

Service layer достаточно явный для текущего размера, но не полностью изолирован:

- Prisma import находится непосредственно в services;
- несколько API routes сами выполняют persistence operations;
- transport responses основаны на Prisma shapes;
- authorization checks дублируются;
- error codes представлены строками `Error.message`.

Если backend продолжит расти, естественная следующая граница — application services с типизированными commands/results, typed domain errors и persistence ports. Это можно сделать внутри Next.js без немедленного выделения отдельного процесса.

В текущем repository нет Kotlin, Gradle, Spring Boot, WebFlux или gRPC. Создание Kotlin backend будет отдельной миграцией архитектуры и runtime topology, а не описанием существующей системы.

## Frontend evolution

Наиболее безопасная последовательность декомпозиции:

1. единый typed API client и normalizer error response;
2. query-key factory и таблица invalidation dependencies;
3. выделение feature hooks из group/settings pages;
4. разделение ExpenseForm на command state, split editor, currency editor и submit adapter;
5. явные loading/error/empty states;
6. browser component tests и несколько критических E2E flows;
7. accessibility audit custom controls и mobile layouts.

## Security evolution

Для публичного deployment нужны:

- controlled application-admin provisioning;
- email normalization/verification;
- rate limits и abuse monitoring;
- password reset и session revocation policy;
- local-only callback URL validation;
- security headers/CSP;
- image domain allowlist;
- request/array bounds;
- CSRF/origin policy для custom mutation routes;
- audit событий admin и изменения реквизитов.

## Operations evolution

Минимальный production hardening:

1. добавить unit/typecheck в CI до image publish;
2. добавить app health/readiness и smoke test image;
3. заменить custom migration engine на `prisma migrate deploy` либо добавить locking/checksum/recovery runbook;
4. копировать `public` в runner image;
5. настроить structured logs, request ID, error reporting и основные latency/error metrics;
6. документировать backup/restore и rollback;
7. задать environment validation при startup.

## Расхождения существующей документации

### `CLAUDE.md`

- проект назван monorepo, фактически это single Next.js application;
- упомянут `GroupMember.defaultRate`, которого нет;
- `paymentRequisites` представлен как поле, хотя есть три профильных и три membership override поля;
- Friendship фактически не создаётся автоматически;
- cash payment хранится не в split, а в связанном Settlement;
- manual settlement хранится в group currency, cash settlement — в expense currency плюс `amountBase`;
- floating point отсутствует у денежных сумм, но используется для rates/customRate;
- не весь persistence проходит через services;
- greedy simplification не доказывает глобальный минимум переводов.

### `SETUP.md`

- перечисляет четыре валюты вместо текущих двадцати;
- описывает `amountBase` и overview как всегда RUB, хотя это валюта расчёта каждой группы;
- использует старые имена `NEXTAUTH_*`, тогда как `.env.example` использует `AUTH_*`;
- автоматическая migration применима к Docker entrypoint, но не к `npm run dev`.

### Prisma comments

Комментарии некоторых `amountBase` полей говорят «в рублях». Фактическая семантика — settlement currency группы.

## Плановые документы

`docs/localization-plan.md` и `docs/receipt-scanning-plan.md` являются roadmap, не current-state architecture.

### Локализация

Пока отсутствуют `next-intl`, locale-prefixed routes, message catalogs, persisted locale и language switcher. Текущий root layout фиксирован на `lang="ru"`, сообщения преимущественно русские.

### Сканирование чеков

Пока отсутствуют QR decoder, ФНС integration, receipt transport/domain models, UI загрузки/распределения позиций и соответствующие tests/env. Расход создаётся только через ручную форму.

Перед реализацией каждого плана нужно обновить его assumptions относительно текущих API contracts, currencies, component decomposition и security boundaries.
