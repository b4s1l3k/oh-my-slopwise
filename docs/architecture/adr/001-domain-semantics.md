# ADR 001: Семантика финансового домена

- Статус: **Accepted**
- Дата: 13 сентября 2026 года
- Область: новый backend и публичный API `/api/v2`

## Контекст

Существующая реализация использует единую шкалу `1/100` для всех валют,
`Float` для курсов, `DateTime` для календарных дат, физическое изменение
финансовых строк и гибридную статистику. Эти свойства зафиксированы в
`/api/v1` как поведение legacy-приложения, но не переносятся в новый backend.

## Решение

### 1. Money и валютная политика

Доменное значение денег имеет вид:

```text
Money(currency, scaledAmount, scale)
```

- `currency` — трёхбуквенный код из versioned allowlist, в верхнем регистре;
- `scaledAmount` — целое число, включая ноль; в JSON оно передаётся строкой, а в PostgreSQL
  хранится как `BIGINT`;
- `scale` — число десятичных знаков от `0` до `6`, сохранённое вместе с
  финансовой записью;
- новая команда принимает только canonical scale, заданный текущей версией
  валютной политики;
- начальная политика использует ISO 4217 exponent, в частности `JPY` имеет
  scale `0`;
- денежная запись также сохраняет версию валютной политики, чтобы последующее
  изменение справочника не меняло смысл истории;
- одно пользовательское денежное значение находится в диапазоне
  `0..1_000_000_000_000` scaled units; входная сумма расхода или расчёта должна
  быть строго положительной;
- отрицательные значения допустимы только у ledger postings и positions, но не
  во входных DTO расхода или расчёта;
- сложение и сравнение разрешены только для совпадающих `currency` и `scale`;
- промежуточные вычисления используют `BigInteger`/`BigDecimal`, а запись в
  `Long` выполняется через exact overflow check;
- `Float` и `Double` запрещены для денег, курсов и финансовых промежуточных
  результатов.

Валюта расчёта группы задаётся при создании. Её можно изменить, только пока в
группе нет ни одного ledger posting; после первой финансовой операции она
неизменяема. Группа также фиксирует `settlementCurrencyScale` и версию валютной
политики: они не меняются до закрытия группы. Изменение ISO exponent для уже
используемого кода не переинтерпретирует историю; реденоминация требует нового
кода либо явной offline migration в новую группу/ledger.

Доли сначала распределяются в исходной валюте и в точности дают сумму расхода.
Remainder для `EQUAL` и `PERCENTAGE` распределяется по immutable `accountId`, а
не по порядку participants в request.
После FX-конвертации postings в валюте расчёта также в точности дают
сконвертированную сумму. Если положительная исходная доля после распределения
FX-остатка равна нулю в валюте расчёта, команда отклоняется с кодом
`AMOUNT_TOO_SMALL_FOR_SETTLEMENT_CURRENCY`.

### 2. Календарные даты и время

- дата расхода и расчёта — `businessDate`: `YYYY-MM-DD` в API, `LocalDate` в
  Kotlin и `DATE` в PostgreSQL;
- `businessDate` никогда не преобразуется через timezone;
- группа хранит обязательный IANA `zoneId`;
- понятие «сегодня» вычисляется через инжектированный `Clock` и `group.zoneId`;
- финансовая дата не может быть позже текущей даты группы; backdating разрешён;
- изменение `zoneId` не переписывает уже сохранённые `businessDate`;
- audit, event, idempotency и технические timestamps представлены как `Instant`,
  хранятся в `timestamptz` и передаются в RFC 3339 UTC;
- дата FX-провайдера является отдельной `effectiveDate` и не подменяет
  `businessDate` расхода.

### 3. FX quote и округление

Применяемый курс имеет однозначное направление:

```text
rate = settlement currency major units / 1 original currency major unit
```

- rate хранится как `NUMERIC(38,18)` и обрабатывается как `BigDecimal`;
- quote содержит `baseCurrency`, `quoteCurrency`, `requestedDate`,
  `effectiveDate`, `fetchedAt`, provider/source, provider quote reference или
  hash и признак `PROVIDER`/`MANUAL`;
- выбирается только последний quote, у которого
  `effectiveDate <= businessDate`;
- quote старше 14 календарных дней не используется;
- quote из будущего и ответ провайдера с неподтверждённой фактической датой
  отклоняются;
- same-currency conversion использует точный rate `1` и не обращается к сети;
- ручной курс передаётся decimal-строкой в том же направлении, проверяется на
  диапазон `0 < rate <= 1_000_000_000` и сохраняется с actor;
- cross-rate строится из двух legs одного provider snapshot и одной
  `effectiveDate`; смешивание provider/date запрещено. Division выполняется в
  `MathContext.DECIMAL128` с `HALF_EVEN`, а applied rate квантуется до 18 знаков
  `HALF_EVEN`; обе исходные legs сохраняются рядом с applied rate;
- applied quote, rate, исходная и сконвертированная суммы сохраняются в
  immutable expense revision; обновление FX cache не пересчитывает историю;
- запрос к провайдеру выполняется до открытия финансовой DB-транзакции;
- при отсутствии допустимого cached/provider quote команда возвращает
  `FX_RATE_UNAVAILABLE`; бесконечный fallback не применяется.

Сумма расхода конвертируется и округляется один раз в режиме `HALF_EVEN`.
Каждая точная сконвертированная доля сначала округляется вниз. Остаток до уже
округлённой общей суммы распределяется по наибольшей дробной части; при равной
дробной части раньше получает участник с лексикографически меньшим immutable
`accountId`. Порядок элементов request не влияет на результат.

Reversal posting является точным отрицанием ранее сохранённого posting. При
reversal FX не запрашивается и повторное округление не выполняется.

### 4. Expense revisions и ledger

Expense имеет стабильный идентификатор и последовательность immutable revisions.

- create создаёт revision `1`;
- edit является полной replacement-командой, требует `expectedVersion` и
  создаёт следующую revision;
- nullable `notes` и `category` очищаются явным `null`; неоднозначный hybrid
  PATCH не используется;
- финансовое изменение атомарно добавляет reversal прежних postings и postings
  новой revision;
- описательное изменение также создаёт revision, но не создаёт новые postings;
- void является отдельной командой с `reason` и `expectedVersion`; физическое
  удаление expense и postings запрещено;
- исправление и void выполняются только при активной membership всех участников,
  чьи позиции могут измениться;
- settlement является отдельной immutable ledger transaction;
- отмена settlement создаёт reversal; массовый reset является batch void, а не
  `deleteMany`;
- cash payment моделируется обычным settlement с необязательным
  `relatedExpenseId`; при создании расхода такие settlements могут быть записаны
  в той же транзакции, но последующий edit расхода их не изменяет.

Authoritative финансовая история состоит из сбалансированных postings. Сумма
postings каждой ledger transaction равна нулю. `group_member_position` является
транзакционно обновляемым индексом над postings и используется для settlement,
выхода участника и закрытия группы. Индекс обязан перестраиваться и сверяться с
postings; он не является вторым источником истины.

Финансовые команды выполняются с `Serializable` isolation, bounded retry с
jitter, optimistic aggregate version и idempotency key. Domain changes,
postings, position, idempotency result и outbox event фиксируются одной
транзакцией.

### 5. Membership и приглашения

- при создании группы active member становится только creator с ролью `ADMIN`;
- добавить другого пользователя без его согласия нельзя;
- текущая membership содержит status `ACTIVE`, `LEFT` или `REMOVED`, роль и
  version;
- каждый период участия хранится отдельным immutable episode с
  `activatedAt`, `endedAt` и причиной завершения;
- повторное принятие приглашения создаёт новый episode и назначает роль
  `MEMBER`; прежние административные права не восстанавливаются;
- в группе всегда есть хотя бы один active admin; последний admin сначала
  передаёт или выдаёт роль другому active member;
- выход и удаление разрешены только при нулевой raw position;
- inactive member нельзя добавить в новый split;
- edit, создающий ненулевую позицию inactive member, отклоняется; перед таким
  исправлением участника нужно явно реактивировать;
- закрытие группы является архивированием и разрешено только при нулевых raw
  positions; финансовая история физически не удаляется.

Group-specific payee details хранятся отдельно от membership. Пока membership
неактивна, они не раскрываются. Они сохраняются при повторном вступлении до
явной очистки пользователем, удаления аккаунта или удаления данных группы по
retention policy.

Invite является 256-bit bearer token. В БД хранится только hash. Создавать и
отзывать ссылку может только admin; одновременно у группы есть не более одной
активной share-ссылки. Срок действия — 7 суток. Ссылка многоразовая до expiry
или revoke, а повторное принятие тем же active member идемпотентно.

### 6. Raw positions, упрощение долга и privacy

Raw position в валюте расчёта группы является единственным authoritative
балансом пользователя:

- отрицательная position означает должника;
- положительная position означает кредитора;
- сумма positions группы всегда равна нулю.

Simplified debts являются только детерминированной UI-рекомендацией. Должники и
кредиторы сортируются по убыванию абсолютной position, затем по `accountId`; два
списка жадно сопоставляются. Наличие конкретного simplified edge не является
условием авторизации settlement.

Пользователь с отрицательной position может перевести средства любому active
кредитору группы с положительной position. В одной `Serializable`-транзакции
проверяется:

```text
0 < amount <= min(-debtorPosition, creditorPosition)
```

Разные валюты групп не взаимозачитываются.

Group DTO не содержит платёжные реквизиты других участников. Реквизиты
запрашиваются отдельным payment-instructions endpoint для одного выбранного
кредитора. Endpoint на primary в одном согласованном snapshot проверяет active
membership, знаки raw positions и право должника, возвращает только реквизиты
этого кредитора и пишет security audit без содержимого реквизитов.

### 7. Statistics и achievements

Ответ Insights явно разделён на четыре секции; объединение через
`max(current, lifetime)` запрещено.

- `current` строится по active groups и открытым positions. Для каждого
  aggregate сначала проверяется status последней revision, включая `VOID`:
  voided aggregate исключается целиком, иначе берётся latest effective revision;
- `allTimeEffective` сначала проверяет aggregate status по latest revision
  включая `VOID`: voided expense/settlement исключается целиком, иначе берётся
  latest effective revision; correction заменяет прежнее значение;
- `records` содержит монотонные исторические максимумы;
- `achievements` содержит прогресс и необратимые unlocks.

Денежные метрики называются по смыслу и группируются по валюте:

- `advancedByPayer` — полная сумма актуальных расходов, оплаченных пользователем;
- `attributedShare` — актуальные доли пользователя в расходах;
- `settledSent` — отправленные non-void settlements;
- `settledReceived` — полученные non-void settlements.

Achievement после unlock не отзывается при correction, void или архивировании
группы. Каталог achievement и правила evaluator имеют версию.

Insights строится идемпотентным асинхронным projector из семантических outbox
events. Ответ содержит `asOf`; lag имеет отдельный SLI. Недоступность projector
не откатывает Core command. Для каждой метрики каталог фиксирует source event,
actor, currency и поведение при correction/void. Projection поддерживает полный
rebuild и reconciliation. Legacy `UserStatisticFact` и soft-string dictionary в
новую схему не переносятся.

## Контракт и проверка

Эти решения являются источником для OpenAPI `/api/v2`, SQL/Flyway schema и
domain value objects. `/api/v1` остаётся только characterization reference.

До реализации финансового Core обязательны executable vectors для:

- canonical scale, bounds и overflow;
- календарных дат в разных `zoneId`;
- provider/manual/cross FX и 14-дневного cutoff;
- `HALF_EVEN`, largest remainder и стабильного tie-break;
- revision, reversal, void и cash settlement;
- raw positions, settlement limits и debt simplification;
- membership reactivation и last-admin guard;
- correction/void semantics статистики и необратимых achievements.

Legacy manifest `contracts/golden/manifest.json` является characterization v1 и
не считается выполнением этого требования. Target vectors создаются отдельным
versioned manifest/schema для v2: legacy и candidate adapters могут запускаться
на одном runner, но не обязаны разделять несовместимые v1 DTO и v2 outcomes.

## Последствия

- новый API намеренно несовместим с legacy money/date/expense DTO;
- финансовая история занимает больше места, зато воспроизводима и аудируема;
- edit и membership требуют optimistic concurrency и дополнительных конфликтов,
  которые клиент обрабатывает явно;
- Insights может отставать от Core, но финансовый баланс остаётся strongly
  consistent;
- privacy реквизитов больше не зависит от формы greedy-графа.
