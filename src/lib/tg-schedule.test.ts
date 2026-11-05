import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dueReminders, localParts, nextSent, parsePrefs, type TgPrefs } from "./tg-schedule.ts";

const base: TgPrefs = {
  tz: "Europe/Moscow",
  water: { on: true, from: 9 * 60, to: 21 * 60, every: 120 },
  meals: [{ id: "b", label: "Завтрак", minute: 8 * 60 + 30 }],
};

// 2026-11-05 по Москве (UTC+3)
const at = (hhmm: string) => Date.parse(`2026-11-05T${hhmm}:00+03:00`);

describe("localParts", () => {
  it("считает местное время по часовому поясу", () => {
    assert.deepEqual(localParts(Date.parse("2026-11-05T21:30:00Z"), "Europe/Moscow"), { day: "2026-11-06", minute: 30 });
    assert.deepEqual(localParts(Date.parse("2026-11-05T21:30:00Z"), "America/Los_Angeles"), { day: "2026-11-05", minute: 13 * 60 + 30 });
  });
});

describe("dueReminders", () => {
  it("присылает воду в нужные слоты и не раньше", () => {
    assert.equal(dueReminders(base, [], at("09:00")).length, 1);
    assert.equal(dueReminders(base, [], at("09:15")).length, 0);
    assert.equal(dueReminders(base, [], at("11:00"))[0].key, "w:2026-11-05:660");
    assert.equal(dueReminders(base, [], at("21:00")).length, 1);
    assert.equal(dueReminders(base, [], at("23:00")).length, 0);
  });
  it("берёт напоминание, попавшее между запусками cron", () => {
    // 08:30 попадает в окно запуска 08:40
    const due = dueReminders(base, [], at("08:40"));
    assert.equal(due.length, 1);
    assert.match(due[0].text, /Завтрак/);
  });
  it("не повторяет уже отправленное", () => {
    assert.equal(dueReminders(base, ["w:2026-11-05:540"], at("09:00")).length, 0);
  });
  it("вода выключена: только еда", () => {
    const prefs = { ...base, water: { ...base.water, on: false } };
    assert.equal(dueReminders(prefs, [], at("09:00")).length, 0);
    assert.equal(dueReminders(prefs, [], at("08:30")).length, 1);
  });
  it("окно через полночь не теряет напоминание в конце суток", () => {
    const prefs: TgPrefs = { ...base, water: { on: true, from: 23 * 60 + 55, to: 23 * 60 + 59, every: 60 }, meals: [] };
    const due = dueReminders(prefs, [], Date.parse("2026-11-06T00:05:00+03:00"));
    assert.equal(due.length, 1);
    assert.equal(due[0].key, "w:2026-11-05:1435");
  });
});

describe("nextSent", () => {
  it("убирает ключи старше вчерашнего дня", () => {
    const now = at("12:00");
    const out = nextSent(["w:2026-11-01:540", "w:2026-11-04:540"], ["w:2026-11-05:540"], now, "Europe/Moscow");
    assert.deepEqual(out.sort(), ["w:2026-11-04:540", "w:2026-11-05:540"]);
  });
});

describe("parsePrefs", () => {
  const ok = { tz: "Europe/Moscow", water: { on: true, from: 540, to: 1260, every: 120 }, meals: [{ id: "b", label: " Завтрак ", minute: 510 }] };
  it("принимает нормальные настройки и чистит текст", () => {
    assert.equal(parsePrefs(ok)?.meals[0].label, "Завтрак");
  });
  it("отклоняет плохие данные", () => {
    assert.equal(parsePrefs({ ...ok, tz: "Не/Пояс" }), null);
    assert.equal(parsePrefs({ ...ok, water: { ...ok.water, every: 5 } }), null);
    assert.equal(parsePrefs({ ...ok, water: { ...ok.water, from: 1300, to: 600 } }), null);
    assert.equal(parsePrefs({ ...ok, meals: [{ id: "b", label: "", minute: 10 }] }), null);
    assert.equal(parsePrefs(null), null);
  });
});
