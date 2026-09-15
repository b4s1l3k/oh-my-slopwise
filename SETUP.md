# Локальный запуск

## Требования

- Node.js 22;
- Docker Desktop;
- PostgreSQL с доступными расширениями `citext` и `pg_trgm` (они уже входят в
  используемый Docker image; для managed PostgreSQL их должен разрешить оператор);
- доступ к `cbr.ru` для автоматических курсов валют. Без него можно использовать
  уже сохранённый или ручной курс.

## Быстрый старт

```bash
cp .env.example .env
docker compose up -d db
npm run setup
npm run dev
```

Приложение откроется на <http://localhost:3000>. Baseline создаёт только схему:
demo-пользователей и demo-данных нет. Первый аккаунт создаётся через регистрацию.

`npm run setup` устанавливает зависимости строго по lockfile, генерирует Prisma Client и применяет
готовые миграции через `prisma migrate deploy`. `npm run dev` самостоятельно
миграции не применяет.

## Переменные окружения

Актуальный шаблон находится в `.env.example`; для локального запуска скопируйте
его в `.env`, который читают и Prisma CLI, и Next.js:

- `DATABASE_URL` — PostgreSQL DSN;
- `AUTH_SECRET` — секрет Auth.js длиной не менее 32 символов;
- `AUTH_URL` — публичный URL приложения;
- `NEXT_PUBLIC_API_BASE_URL` — browser API boundary, обычно `/api/v1`;
- `BACKEND_API_BASE_URL` — абсолютный server-side URL backend, если он вынесен
  из Next.js приложения;
- `ADMIN_EMAIL` — необязательный email application admin.

## Работа со схемой

```bash
# Применить существующие миграции
npm run db:deploy

# Создать новую migration при изменении Prisma schema
npm run db:migrate -- --name change_description

# Открыть Prisma Studio
npm run db:studio

# Удалить локальные данные и заново применить baseline
npm run db:reset
```

`db:reset` разрушителен и предназначен только для локальной или тестовой БД.

## Деньги и валюты

Группа задаёт settlement currency. Расход хранит исходные `amount/currency`, а
`amountBase` и split base amounts — в валюте группы. Автоматический cross-rate
рассчитывается через курс ЦБ к RUB на календарную дату расхода; пользователь
может указать ручной курс.
