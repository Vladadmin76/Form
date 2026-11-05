// Добавляет привязку D1 в собранный конфиг Worker'а (.output/server/wrangler.json).
// Использование: node scripts/inject-d1.mjs <database_id>
// Привязка DB добавляется только если id задан, иначе сайт выкладывается без Telegram-напоминаний.
import { readFileSync, writeFileSync } from "node:fs";

const file = new URL("../.output/server/wrangler.json", import.meta.url);
const id = (process.argv[2] ?? "").trim();
const config = JSON.parse(readFileSync(file, "utf8"));
if (id) {
  config.d1_databases = [{ binding: "DB", database_name: "forma", database_id: id }];
  console.log("D1: привязка DB добавлена");
} else {
  delete config.d1_databases;
  console.log("D1: id не задан, привязка DB не добавлена");
}
writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
