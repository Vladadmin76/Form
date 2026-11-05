-- Telegram-напоминания: привязка чата и расписание. Дневник сюда не попадает (он хранится в браузере).
-- Скрипт можно запускать повторно.
CREATE TABLE IF NOT EXISTS tg_links (
  device_hash TEXT PRIMARY KEY,
  chat_id INTEGER NOT NULL UNIQUE,
  tg_username TEXT,
  linked_at INTEGER NOT NULL,
  tz TEXT NOT NULL DEFAULT 'UTC',
  water_on INTEGER NOT NULL DEFAULT 0,
  water_from INTEGER NOT NULL DEFAULT 540,
  water_to INTEGER NOT NULL DEFAULT 1260,
  water_every INTEGER NOT NULL DEFAULT 120,
  meals_json TEXT NOT NULL DEFAULT '[]',
  sent_json TEXT NOT NULL DEFAULT '[]',
  fail_count INTEGER NOT NULL DEFAULT 0,
  disabled_at INTEGER
);

CREATE TABLE IF NOT EXISTS tg_tokens (
  token_hash TEXT PRIMARY KEY,
  device_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);

CREATE INDEX IF NOT EXISTS tg_tokens_device ON tg_tokens (device_hash);
