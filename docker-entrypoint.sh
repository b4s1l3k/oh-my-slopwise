#!/bin/sh
# Применяет миграции к БД, затем запускает сервер.

if [ -z "$DATABASE_URL" ]; then
  echo "‼‼ DATABASE_URL НЕ ЗАДАН — задайте переменную окружения контейнеру, иначе БД работать не будет."
else
  # маскируем пароль в логе
  echo "→ DATABASE_URL задан: $(echo "$DATABASE_URL" | sed -E 's#(//[^:]+):[^@]+@#\1:***@#')"
fi

echo "→ prisma migrate deploy..."
if node ./node_modules/prisma/build/index.js migrate deploy --schema=./prisma/schema.prisma; then
  echo "✓ Миграции применены"
else
  echo "⚠⚠ migrate deploy УПАЛ (см. ошибку выше). Регистрация будет отдавать 500, пока БД/миграции не в порядке."
fi

echo "→ Запуск сервера на :${PORT:-3000}"
exec node server.js
