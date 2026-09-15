# Граница frontend/backend

Статус: реализованная граница внутри legacy repository и обязательный migration
gate для будущего backend. Legacy Next.js route handlers пока остаются в одном
production image с web, но frontend больше не имеет исходной зависимости от их
моделей, Prisma или Zod-схем.

## Разрешённое направление зависимостей

```text
pages/components
  -> frontend ViewModel + hooks
  -> domain API clients
  -> one HTTP client
  -> generated OpenAPI transport types
  -> HTTP /api/v1

legacy route handlers
  -> legacy services/persistence
  -> explicit response mappers
  -> generated OpenAPI transport types
```

Frontend и backend сходятся только на `contracts/openapi/v1.openapi.json` и
наблюдаемом HTTP-поведении. Они не импортируют код друг друга. Сгенерированный
TypeScript-файл — производный артефакт спецификации, а не источник контракта.

## Contract package

- `contracts/openapi/v1.openapi.json` — canonical HTTP contract;
- `contracts/generated/typescript/v1.generated.ts` — полный generated graph;
- `contracts/typescript/v1.ts` — тонкий набор стабильных имён transport DTO;
- `npm run contract:generate` — воспроизводимая генерация;
- `npm run contract:check` — проверка, что committed generated-код совпадает со
  спецификацией байт-в-байт.

API clients получают и request, и response DTO только из `@contract/v1`.
Удалён ручной `src/lib/api/v1/response-dtos.ts`; frontend clients больше не
импортируют типы из backend validation. Изменение required field, enum или
nullability в OpenAPI теперь вызывает ошибку TypeScript в конкретном mapper-е,
форме или вызове API.

Transport DTO завершаются внутри feature hooks. В TanStack Query cache и UI
попадают независимые ViewModel. Поэтому техническое переименование поля нового
backend локализуется в transport mapper-е и не распространяется по компонентам.

## Автоматическая защита

`src/architecture/web-api-boundary.test.ts` сканирует TypeScript AST и запрещает:

- `fetch`, URL `/api/v1` и HTTP libraries вне единственного HTTP adapter;
- импорт domain API clients вне feature hooks;
- прямой TanStack Query в feature UI;
- transport DTO в pages/components/hooks;
- импорт `services`, Prisma, backend routes, backend validation и persistence из
  frontend-кода;
- обратный импорт hooks/components/client/ViewModel из backend-кода.

Проверка выполняется обычным `npm test`, поэтому случайную повторную связанность
нельзя незаметно внести в pull request.

## Переключение backend

Для browser build API origin задаётся `NEXT_PUBLIC_API_BASE_URL`. Предпочтительный
production вариант — оставить `/api/v1` same-origin и переключить upstream на
edge/reverse proxy. Так URL компонентов вообще не меняются. Прямой cross-origin
режим допустим после появления bearer/OIDC и явной CORS/CSRF политики; текущую
Auth.js cookie нельзя бездумно передавать другому origin.

Новый Kotlin backend считается совместимым только после трёх независимых gates:

1. generated client компилируется от той же OpenAPI;
2. candidate process проходит language-neutral golden vectors;
3. полный Playwright suite проходит против внешнего candidate stack.

Единая обязательная команда cutover объединяет эти проверки:

```bash
CANDIDATE_GOLDEN_ADAPTER=./backend/bin/golden-adapter \
E2E_BASE_URL=http://127.0.0.1:4100 \
E2E_FIXTURE_ADAPTER=./backend/bin/e2e-fixture-adapter \
npm run test:migration:candidate
```

Она последовательно проверяет codegen/OpenAPI, typecheck web, все быстрые тесты,
оптимизированный web build, все golden-векторы в compare-режиме и полный
browser/HTTP E2E. Candidate E2E должен указывать только на специально поднятый
тестовый stack и его сбрасываемое test storage, а не на production deployment.
Остановить или пропустить отдельный неуспешный этап нельзя.

Каждый успешный HTTP-вызов через общий E2E helper дополнительно сопоставляется с
OpenAPI по method/path и проверяется закрытой JSON Schema. Поэтому candidate
gate ловит не только визуальные регрессии, но и лишние поля, неверные типы,
required/nullability/enum drift в реально отданных новым backend ответах.

Playwright больше не обязан знать ORM кандидата. `E2E_FIXTURE_ADAPTER` получает
versioned JSON-команду reset/seed и сам готовит только тестовое storage нового
backend. Протокол описан в `contracts/e2e`; Prisma находится только в сменном
legacy adapter. Запуск:

```bash
E2E_BASE_URL=http://127.0.0.1:4100 \
E2E_FIXTURE_ADAPTER=./backend/build/install/e2e-fixtures/bin/e2e-fixtures \
npm run test:e2e:candidate
```

## Что ещё физически не разделено

Legacy API routes и web пока собираются одним Next.js image. Auth.js уже не
импортирует Prisma и проверяет пароль через HTTP credentials endpoint, однако
его session cookie всё ещё принадлежит web runtime и не является контрактом для
Kotlin backend. Это намеренно не маскируется как завершённое разделение.
Окончательная runtime-граница появится, когда Kotlin backend станет отдельным
deployable, web/BFF перестанет применять Prisma migrations, а identity перейдёт
на OIDC/bearer boundary. До этого момента перенос каталогов TypeScript backend
сам по себе не уменьшит риск и создаст большой механический diff.

При cutover edge меняет upstream целиком после contract/golden/E2E gates. Web не
переписывается, компоненты не меняются, а legacy API удаляется отдельным шагом
после подтверждённого переключения.
