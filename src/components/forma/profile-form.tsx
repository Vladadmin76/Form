import { useMemo, useState } from "react";
import { ACTIVITIES, bmi, bmiStage, bmr, calorieFloor, dayKey, tdee, waterGoalFor } from "@/lib/nutrition";
import type { ActivityLevel, Profile, Sex } from "@/lib/types";
import { fmt } from "@/lib/format";
import { Field } from "@/components/forma/bits";

type Draft = {
  weight: string;
  height: string;
  age: string;
  sex: Sex | null;
  activity: ActivityLevel;
  deficit: number;
  water: string;
};

function draftFrom(profile: Profile | null): Draft {
  if (!profile) {
    return { weight: "", height: "", age: "", sex: null, activity: "moderate", deficit: 500, water: "" };
  }
  return {
    weight: String(profile.weightKg),
    height: String(profile.heightCm),
    age: String(profile.age),
    sex: profile.sex,
    activity: profile.activity,
    deficit: profile.deficitKcal,
    water: String(profile.waterGoalMl),
  };
}

export function ProfileForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial: Profile | null;
  submitLabel: string;
  onSubmit: (profile: Profile) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(initial));
  const parsed = useMemo(() => parseDraft(draft, initial), [draft, initial]);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (parsed.profile) onSubmit(parsed.profile);
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Вес, кг">
          <input
            id="weight"
            className="field tabular-nums"
            inputMode="decimal"
            value={draft.weight}
            onChange={(event) => setDraft({ ...draft, weight: event.target.value })}
          />
        </Field>
        <Field label="Рост, см">
          <input
            id="height"
            className="field tabular-nums"
            inputMode="decimal"
            value={draft.height}
            onChange={(event) => setDraft({ ...draft, height: event.target.value })}
          />
        </Field>
      </div>
      <Field label="Возраст">
        <input
          id="age"
          className="field tabular-nums"
          inputMode="numeric"
          value={draft.age}
          onChange={(event) => setDraft({ ...draft, age: event.target.value })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ["female", "Женщина"],
            ["male", "Мужчина"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`btn ${draft.sex === id ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setDraft({ ...draft, sex: id })}
          >
            {label}
          </button>
        ))}
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm text-muted">Активность</legend>
        {ACTIVITIES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setDraft({ ...draft, activity: item.id })}
            className={`rounded-lg border px-3 py-3 text-left ${draft.activity === item.id ? "border-primary bg-surface-2" : "border-border bg-surface"}`}
          >
            <span className="flex items-baseline justify-between gap-3">
              <span className="font-semibold">{item.label}</span>
              <span className="tabular-nums text-sm text-muted">×{fmt(item.factor, item.factor % 1 ? 3 : 0)}</span>
            </span>
            <span className="mt-0.5 block text-sm text-muted">{item.hint}</span>
          </button>
        ))}
      </fieldset>
      <Field label={`Дефицит, ${draft.deficit} ккал в день`}>
        <input
          type="range"
          min={200}
          max={1000}
          step={50}
          value={draft.deficit}
          onChange={(event) => setDraft({ ...draft, deficit: Number(event.target.value) })}
        />
      </Field>
      {initial ? (
        <Field label="Цель по воде, мл">
          <input
            className="field tabular-nums"
            inputMode="numeric"
            value={draft.water}
            onChange={(event) => setDraft({ ...draft, water: event.target.value })}
          />
        </Field>
      ) : null}
      {parsed.view ? (
        <div className="card p-4">
          <p className="font-display text-2xl tabular-nums">ИМТ {fmt(parsed.view.bmi, 1)}</p>
          <p className="mt-1 font-semibold">{parsed.view.stage}</p>
          <p className="text-sm text-muted">{parsed.view.stageDetail}</p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted">Базовый обмен</dt>
              <dd className="tabular-nums text-base font-semibold">{fmt(parsed.view.bmr)} ккал</dd>
            </div>
            <div>
              <dt className="text-muted">С активностью</dt>
              <dd className="tabular-nums text-base font-semibold">{fmt(parsed.view.tdee)} ккал</dd>
            </div>
            <div>
              <dt className="text-muted">Дефицит</dt>
              <dd className="tabular-nums text-base font-semibold">{fmt(draft.deficit)} ккал</dd>
            </div>
            <div>
              <dt className="text-muted">Цель в день</dt>
              <dd className="tabular-nums text-base font-semibold">{fmt(parsed.view.target)} ккал</dd>
            </div>
          </dl>
          {parsed.view.floored ? (
            <p className="mt-3 text-sm text-muted">Ниже {fmt(parsed.view.floor)} ккал цель не опускаем.</p>
          ) : null}
          {parsed.view.young ? (
            <p className="mt-2 text-sm text-muted">Формула для взрослых, для подростка цифры только ориентир.</p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted">{parsed.error}</p>
      )}
      <button id="save-profile" className="btn btn-primary" type="submit" disabled={!parsed.profile}>
        {submitLabel}
      </button>
    </form>
  );
}

function parseDraft(draft: Draft, initial: Profile | null): {
  profile: Profile | null;
  error: string;
  view: null | {
    bmi: number;
    stage: string;
    stageDetail: string;
    bmr: number;
    tdee: number;
    target: number;
    floor: number;
    floored: boolean;
    young: boolean;
  };
} {
  const weight = Number(draft.weight.replace(",", "."));
  const height = Number(draft.height.replace(",", "."));
  const age = Number(draft.age.replace(",", "."));
  if (!weight || !height || !age || !draft.sex) {
    return { profile: null, error: "Нужны вес, рост, возраст и пол.", view: null };
  }
  if (weight < 35 || weight > 250 || height < 120 || height > 230 || age < 14 || age > 90) {
    return { profile: null, error: "Проверьте числа: вес 35–250, рост 120–230, возраст 14–90.", view: null };
  }
  const partial = { weightKg: weight, heightCm: height, age, sex: draft.sex, activity: draft.activity, deficitKcal: draft.deficit, waterGoalMl: 0, createdAt: "" };
  const index = bmi(weight, height);
  const stage = bmiStage(index);
  const base = bmr(partial);
  const burn = tdee({ ...partial, waterGoalMl: 2000, createdAt: dayKey() });
  const floor = calorieFloor(draft.sex);
  const raw = burn - draft.deficit;
  const target = Math.max(floor, raw);
  const water = draft.water ? Number(draft.water) : initial?.waterGoalMl || waterGoalFor(weight);
  if (!water || water < 500 || water > 6000) {
    return { profile: null, error: "Цель по воде: от 500 до 6000 мл.", view: null };
  }
  return {
    error: "",
    profile: {
      weightKg: Math.round(weight * 10) / 10,
      heightCm: Math.round(height),
      age: Math.round(age),
      sex: draft.sex,
      activity: draft.activity,
      deficitKcal: draft.deficit,
      waterGoalMl: Math.round(water),
      createdAt: initial?.createdAt ?? dayKey(),
    },
    view: {
      bmi: index,
      stage: stage.title,
      stageDetail: stage.detail,
      bmr: base,
      tdee: burn,
      target,
      floor,
      floored: raw < floor,
      young: age < 18,
    },
  };
}
