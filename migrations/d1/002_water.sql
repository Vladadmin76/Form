-- Вода из Telegram: записи от бота и последнее состояние, которое сообщило приложение.
-- Скрипт можно запускать повторно.
CREATE TABLE IF NOT EXISTS tg_water (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_hash TEXT NOT NULL,
  day TEXT NOT NULL,
  ml INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  claimed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS tg_water_device ON tg_water (device_hash, claimed);

CREATE TABLE IF NOT EXISTS tg_water_state (
  device_hash TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  ml INTEGER NOT NULL DEFAULT 0,
  goal INTEGER NOT NULL DEFAULT 0
);
