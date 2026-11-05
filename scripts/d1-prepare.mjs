// Готовит базу D1 «forma» для Telegram-напоминаний: находит или создаёт её и накатывает схему.
// Печатает id в $GITHUB_OUTPUT (id=...). При любом сбое выходит с кодом 0 и пустым id:
// тогда сайт выкладывается без Telegram-напоминаний, а не ломается.
// Нужно право токена Cloudflare «D1: Edit».
import { execFileSync } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const NAME = "forma";
const run = (args) => execFileSync("npx", ["wrangler", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const find = () => {
  const list = JSON.parse(run(["d1", "list", "--json"]));
  return list.find((item) => item.name === NAME)?.uuid ?? "";
};
const output = (id) => {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `id=${id}\n`);
};

try {
  let id = find();
  if (!id) {
    console.log("D1: базы нет, создаю");
    run(["d1", "create", NAME]);
    id = find();
  }
  if (!id) throw new Error("не удалось получить id базы");
  // wrangler ищет базу по привязке в конфиге, поэтому даём временный конфиг.
  const config = join(tmpdir(), "forma-d1.json");
  writeFileSync(config, JSON.stringify({ name: "forma-migrate", d1_databases: [{ binding: "DB", database_name: NAME, database_id: id }] }));
  run(["d1", "execute", NAME, "--remote", "--config", config, "--file", "migrations/d1/001_telegram.sql"]);
  console.log("D1: база готова");
  output(id);
} catch (error) {
  const text = String(error?.stderr || error?.message || error).split("\n").slice(0, 6).join(" ");
  console.log(`::warning::D1 не подготовлена, сайт будет без Telegram-напоминаний. Проверьте право токена «D1: Edit». ${text}`);
  output("");
}
