# Локальный запуск

## Требования
- Node.js 20+
- Docker Desktop

## Быстрый старт

```bash
# 1. Установить зависимости
npm install

# 2. Запустить PostgreSQL (порт 5433)
docker-compose up -d

# 3. Применить миграции БД
DATABASE_URL="[Secrets32]:[Secrets33]:[Secrets34]:[Secrets35]/splitwise" \
  npx prisma migrate dev --name init

# 4. Заполнить тестовыми данными
DATABASE_URL="[Secrets32]:[Secrets33]:[Secrets34]:[Secrets35]/splitwise" \
  npx tsx prisma/seed.ts

# 5. Запустить сайт
npm run dev
```

Открыть: http://localhost:3000

## Тестовые аккаунты (после seed)

| Email              | Пароль   |
|--------------------|----------|
| alice@demo.com     | password |
| bob@demo.com       | password |
| carol@demo.com     | password |

У всех трёх есть общая группа "Квартира на Тверской" с расходами.

## Полезные команды

```bash
# Просмотр БД в браузере
DATABASE_URL="[Secrets32]:[Secrets33]:[Secrets34]:[Secrets35]/splitwise" npx prisma studio

# Сбросить и пересоздать БД
DATABASE_URL="[Secrets32]:[Secrets33]:[Secrets34]:[Secrets35]/splitwise" npx prisma migrate reset --force

# Остановить Docker
docker-compose down
```

## Переменные окружения (.env.local)

```
DATABASE_URL="[Secrets32]:[Secrets33]:[Secrets34]:[Secrets35]/splitwise"
NEXTAUTH_SECRET="dev-secret-change-in-production-32chars!!"
NEXTAUTH_URL="http://localhost:3000"
```
