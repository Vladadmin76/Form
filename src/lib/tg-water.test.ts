import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseWater } from "./tg-water.ts";

const ml = (text: string) => {
  const r = parseWater(text);
  return r && "ml" in r ? r.ml : r;
};

describe("parseWater", () => {
  it("просто «выпил» это один стакан", () => {
    for (const t of ["выпил", "Выпила", "выпил стакан", "выпил стакан воды", "стакан", "Я выпил!", "выпил воды"]) assert.equal(ml(t), 200, t);
  });
  it("стаканы", () => {
    assert.equal(ml("2 стакана"), 400);
    assert.equal(ml("выпил 3 стакана"), 600);
    assert.equal(ml("два стакана"), 400);
    assert.equal(ml("выпила пять стаканов воды"), 1000);
    assert.equal(ml("1,5 стакана"), 300);
    assert.equal(ml("полтора стакана"), 300);
  });
  it("полстакана это 100 мл", () => {
    assert.equal(ml("полстакана"), 100);
    assert.equal(ml("выпил пол стакана"), 100);
  });
  it("миллилитры и литры", () => {
    assert.equal(ml("400"), 400);
    assert.equal(ml("400 мл"), 400);
    assert.equal(ml("выпил 600 мл"), 600);
    assert.equal(ml("100"), 100);
    assert.equal(ml("0,5 л"), 500);
    assert.equal(ml("выпил 1 литр"), 1000);
  });
  it("голое число до 10 это стаканы", () => {
    assert.equal(ml("2"), 400);
    assert.equal(ml("10"), 2000);
    assert.deepEqual(parseWater("11"), { error: "range" });
  });
  it("слишком много или мало отклоняется", () => {
    assert.deepEqual(parseWater("5000 мл"), { error: "range" });
    assert.deepEqual(parseWater("20 мл"), { error: "range" });
    assert.deepEqual(parseWater("0 стаканов"), { error: "range" });
  });
  it("не про воду не трогаем", () => {
    for (const t of ["привет", "как дела", "хочу есть", "выпил кофе", ""]) assert.equal(parseWater(t), null, t);
  });
});
