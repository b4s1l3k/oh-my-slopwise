# Распознавание чеков по QR ФНС → сплит «кто что ел»

## Context

Пользователь хочет добавлять расходы, сканируя QR-код на российском фискальном
чеке. Цель — не просто предзаполнить сумму, а разложить чек на позиции и дать
раскидать их по участникам («кто что ел»), после чего расход сохраняется обычным
`splitType: EXACT`. Это убирает ручной ввод сумм и делает дележ ресторанного
счёта точным до копейки.

Ключевой факт: QR на чеке содержит только `{t, s, fn, i, fp, n}` (дата, итог,
идентификаторы) — **позиций в нём нет**. Позиции добираются вторым запросом к
официальному API ФНС `irkkt-mobile.nalog.ru:8888` (тот, что использует
приложение «Проверка чеков»). ФНС возвращает суммы **в копейках** — ровно как
внутренняя модель, без float-конвертаций.

Решения: (1) полный объём «кто что ел» в v1; (2) фото/QR **не хранить**;
(3) движок — официальный API ФНС; QR-путь сразу в v1.

## Архитектура пайплайна

```
камера/фото (в браузере) → decode QR клиентски (@zxing/browser)
  → POST /api/v1/receipts/scan { qr }           ← на сервер уходит только строка QR, не фото
  → fns.service: session (refresh_token) → POST /v2/ticket → GET /v2/tickets/{id}
  → нормализация → ReceiptData { merchant, date, currency:"RUB", total, items[] }
  → Zod-валидация
  → экран «кто что ел»: назначаем позиции участникам
  → computeReceiptSplits → EXACT splits {userId, amount} (сумма === total)
  → существующая submit-логика ExpenseForm (без изменений серверного контракта)
```

Фото никогда не покидает устройство: QR декодится в браузере, серверу передаётся
только короткая строка QR.

---

## Серверная часть

### 1. Бутстрап-скрипт авторизации ФНС — `scripts/fns-auth.ts` (новый)
Разовая интерактивная авторизация для получения `refresh_token`:
- `POST /v2/auth/phone/request` `{phone, client_secret, os:"Android"}` → SMS.
- ввод кода из stdin → `POST /v2/auth/phone/verify` `{phone, client_secret, code, os}`
  → печатает `refresh_token` (и `sessionId`) для вставки в `.env.local`.
- Запуск: `npx tsx scripts/fns-auth.ts` (задокументировать в CLAUDE.md).
- Альтернативная ветка ИНН+пароль (`/v2/mobile/users/lkfl/auth`) — опционально флагом.

### 2. Клиент ФНС — `src/services/fns.service.ts` (новый)
Зеркалит стиль `src/services/exchange.service.ts:16-45` (глобальный `fetch`,
`AbortSignal.timeout(8000)`, домен-код ошибки на `!res.ok`):
- `getSession()` — кэш `sessionId` в памяти модуля; при отсутствии/протухании
  `POST /v2/mobile/users/refresh` `{client_secret, refresh_token}` из env.
- `fetchReceipt(qr): Promise<ReceiptData>`:
  - `POST /v2/ticket` c заголовком `sessionId` и телом `{qr}` → `{id, status}`.
  - `GET /v2/tickets/{id}` (`sessionId`, `Device-Id`, `Device-OS`, `clientVersion`)
    → receipt JSON; с небольшим retry (2–3 попытки, пауза), если чек ещё «не готов»
    (status ожидания).
  - нормализация `ticket.document.receipt`:
    `items[].{name, quantity, price(коп), sum(коп)}`, `totalSum`, `dateTime`,
    `user`/`retailPlace` → merchant, `currency:"RUB"`.
  - домен-коды: `RECEIPT_NOT_FOUND`, `RECEIPT_NOT_READY`, `FNS_AUTH_FAILED`,
    `FNS_UNAVAILABLE`.
- Заголовки/`client_secret` — константы модуля + `FNS_CLIENT_SECRET` из env
  (свапабельно, если ФНС ротирует секрет).
- Graceful degradation: если позиций нет (оффлайн-чек/ещё не в системе) —
  вернуть `items: []` с корректными `total/date/merchant`.

### 3. Валидация — `src/lib/validations/receipt.ts` (новый)
- `scanRequestSchema = z.object({ qr: z.string().regex(/t=.+&s=.+&fn=.+&i=.+&fp=.+&n=.+/) })`.
- Экспорт типа `ReceiptData` и `receiptDataSchema` (merchant, date ISO,
  currency, total int, items[{name, quantity int, price int, sum int}]) —
  которым `fns.service` валидирует ответ ФНС перед отдачей (ответ = данные, не доверяем слепо).

### 4. Роут — `src/app/api/v1/receipts/scan/route.ts` (новый)
Паттерн как `groups/[id]/expenses/route.ts`:
- `auth()` guard → 401.
- `scanRequestSchema.safeParse(body)` → 422 при ошибке.
- `try { fnsService.fetchReceipt(qr) } catch (e) { handleServiceError(e) }`.
- Возврат `{ receipt }`.

### 5. Коды ошибок — `src/lib/api-errors.ts` (+ тест)
Добавить в `ERROR_MAP` и в `CASES` теста (`api-errors.test.ts`) 4 кода:
`RECEIPT_NOT_FOUND`→404, `RECEIPT_NOT_READY`→409, `FNS_AUTH_FAILED`→502,
`FNS_UNAVAILABLE`→503 — с точными русскими сообщениями. Обновить
`CASES.length` (18 → 22) и тест уникальности сообщений.

---

## Клиентская часть

### 6. Зависимость
Добавить `@zxing/browser` (+ `@zxing/library`) — декод QR из живой камеры
(`BrowserQRCodeReader.decodeFromVideoDevice`) и из фото
(`decodeFromImageUrl`). Одна зависимость покрывает оба входа.

### 7. Чистая матметодика сплита — `src/lib/utils/receipt-split.ts` (+ тест, новый)
`computeReceiptSplits(items, assignments): {userId, amount}[]`:
- каждую позицию делим поровну между назначенными участниками; остаток
  (floor-деление) кидаем **первому** назначенному — тот же паттерн, что
  `split-calculator.ts` для EQUAL/PERCENTAGE («остаток первому»).
- агрегируем по `userId`, суммы целочисленные в копейках.
- **инвариант:** сумма результата === сумма `item.sum` по назначенным позициям.
- Тест `receipt-split.test.ts` (house-style, репозиторий держит ~99% покрытия):
  один участник; поровну без остатка; поровну с остатком-первому; агрегация по
  нескольким позициям; инвариант суммы.

### 8. Сканер — `src/components/expenses/receipt-scanner.tsx` (новый)
Radix `Dialog` (Sheet в проекте нет — используем `Dialog`, как хостится
`ExpenseForm`):
- живая камера (fallback `<input type="file" accept="image/*" capture="environment">`),
- декод QR клиентски → `POST /api/v1/receipts/scan { qr }`,
- состояние loading/ошибка через `useMutation` + `toast({variant:"destructive"})`
  (паттерн `expense-form.tsx:96-161`),
- на успех → колбэк `onReceipt(receipt: ReceiptData)`.

### 9. Экран «кто что ел» — `src/components/expenses/receipt-split.tsx` (новый)
- список `items`, под каждой — аватары участников (из `members`), тап = вкл/выкл
  назначения; шаринг позиции = несколько выбранных.
- живой пересчёт «сколько с каждого» через `computeReceiptSplits`.
- «Применить» активна, только когда каждая позиция назначена ≥1 участнику
  (иначе суммы не сойдутся); либо кнопка «остальное на всех».
- на «Применить» → колбэк с `{ title, date, total, splits:[{userId,amount}] }`.

### 10. Встраивание в форму — `src/components/expenses/expense-form.tsx`
- кнопка «Сканировать чек» сверху формы (видна только при создании, `!isEdit`).
- открывает `ReceiptScanner` → затем `ReceiptSplit`; на «Применить» проставляем
  **существующие** стейты формы: `setTitle`, `setAmountStr`,
  `setExpenseCurrency("RUB")`, `setDate`, `setSplitType("EXACT")`,
  `setSelectedIds`, `setExactAmounts` (record `userId→сумма` в мажорных единицах,
  как ждёт форма, `expense-form.tsx:66-70,305-314`).
- если `items: []` (оффлайн-чек) — пропускаем экран назначения, только
  предзаполняем `title/amount/date`, дележ вручную.
- Серверный контракт submit не меняется: всё уходит существующим
  `POST …/expenses` с `splitType:"EXACT"` и валидируется текущей Zod-логикой
  (сумма долей === сумма расхода уже гарантирована шагом 7).

### 11. Конфиг
- `.env.local`: `FNS_CLIENT_SECRET`, `FNS_REFRESH_TOKEN` (+ опц. `FNS_INN`/`FNS_PASSWORD`).
- CLAUDE.md: раздел про чек-скан, переменные, запуск `scripts/fns-auth.ts`.

---

## Что переиспользуем (не пишем заново)
- `exchange.service.ts:16-45` — шаблон внешнего HTTP-клиента (fetch + timeout + домен-коды + graceful fallback).
- `handleServiceError` / `api-errors.ts` — маппинг домен-кодов в HTTP+русский текст.
- `calculateSplits` EXACT (`split-calculator.ts:25-30`) — форма уже гонит EXACT-сплиты через него на submit.
- `parseMoneyInput`/`formatMoney` (`format.ts`) — копейки/формат.
- `Dialog`, `Button`, `useToast` (`components/ui/*`) — вся UI-обвязка.
- Стейты `ExpenseForm` (`selectedIds`, `exactAmounts`, `title`, `amountStr`, `date`) — предзаполняем их, submit-путь не трогаем.

## Файлы
**Новые:** `scripts/fns-auth.ts`, `src/services/fns.service.ts`,
`src/services/fns.service.test.ts`, `src/lib/validations/receipt.ts`,
`src/lib/validations/receipt.test.ts`, `src/app/api/v1/receipts/scan/route.ts`,
`src/lib/utils/receipt-split.ts`, `src/lib/utils/receipt-split.test.ts`,
`src/components/expenses/receipt-scanner.tsx`,
`src/components/expenses/receipt-split.tsx`.
**Правим:** `src/lib/api-errors.ts` (+тест), `src/components/expenses/expense-form.tsx`,
`package.json`, `.env.local`, `CLAUDE.md`.

## Проверка (end-to-end)
1. `npx tsx scripts/fns-auth.ts` → получить `refresh_token`, вписать в `.env.local`.
2. `npm test` — новые pure-тесты: `receipt-split.test.ts`, `fns.service.test.ts`
   (мок `global.fetch` как в `exchange.service.test.ts`: успех, not-ready+retry,
   not-found, refresh, unavailable), `receipt.test.ts`, `api-errors.test.ts`.
3. `npx tsc --noEmit` — чисто.
4. `npm run dev` → группа → «Расход» → «Сканировать чек» → навести на реальный
   фискальный чек → проверить: позиции подтянулись, назначение раскидывает суммы,
   «Применить» заполняет EXACT, расход сохраняется, баланс сходится.
5. Негатив: не-фискальный QR → аккуратная ошибка-тост; оффлайн-чек без позиций →
   предзаполнение только суммы/даты.

## Открытые допущения (по умолчанию, если не поправить)
- QR-lib: `@zxing/browser` (живая камера + фото).
- Валюта чека всегда `RUB`; если у группы расчётная валюта не RUB — расход
  создаётся в RUB, пересчёт `amountBase` делает существующий сервис.
- `total` для расхода берём из `totalSum` ФНС; при расхождении с суммой позиций —
  остаток первому участнику (house-паттерн).

## Источники по API ФНС
- rutaxapi (b3cat): https://github.com/b3cat/rutaxapi/blob/master/README.md
- «Пишем клиент для нового API nalog.ru» — LEFT JOIN: https://leftjoin.ru/all/nalog-ru-client/
- «Получаем список товаров из чека ИФНС» — Хабр: https://habr.com/ru/articles/761416/
