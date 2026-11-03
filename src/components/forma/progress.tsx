import { lazy, Suspense, useEffect, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { fmt, fmtShort } from "@/lib/format";
import {
  addDays,
  baseTarget,
  dayKey,
  MICRO_REPORT,
  multiply,
  previewAdaptive,
  rdi,
  sumNutrients,
} from "@/lib/nutrition";
import { deletePhoto, fileToJpeg, listPhotos, savePhoto, type ProgressPhoto } from "@/lib/photos";
import { useForma } from "@/lib/store";
import { Card, Field } from "@/components/forma/bits";

const WeightChart = lazy(() => import("@/components/forma/weight-chart"));

export function ProgressScreen() {
  const profile = useForma((state) => state.profile);
  const weights = useForma((state) => state.weights);
  const logs = useForma((state) => state.logs);
  const adaptive = useForma((state) => state.adaptive);
  const addWeight = useForma((state) => state.addWeight);
  const removeWeight = useForma((state) => state.removeWeight);
  const applyAdaptive = useForma((state) => state.applyAdaptive);
  const setBanner = useForma((state) => state.setBanner);
  const [kg, setKg] = useState("");
  const [when, setWhen] = useState(dayKey());
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [note, setNote] = useState("");
  const [photoError, setPhotoError] = useState("");

  useEffect(() => {
    void listPhotos().then(setPhotos).catch(() => setPhotoError("Фотодневник недоступен в этом браузере."));
  }, []);

  if (!profile) return null;
  const today = dayKey();
  const current = baseTarget(profile, adaptive.target);
  const preview = previewAdaptive({ profile, weights, logs, currentTarget: current });
  const next = adaptive.lastApplied ? addDays(adaptive.lastApplied, 7) : today;
  const week = averageWindow(logs, today, 7);
  const fortnight = averageWindow(logs, today, 14);

  return (
    <div className="flex flex-col gap-3 px-5 pt-6">
      <header>
        <p className="text-sm text-muted">Прогресс</p>
        <h1 className="font-display text-3xl">Вес и нутриенты</h1>
      </header>

      <Card>
        <h2 className="font-semibold">Вес</h2>
        {weights.length >= 2 ? (
          <Suspense fallback={<p className="mt-3 text-sm text-muted">Строим график…</p>}>
            <div className="mt-3">
              <WeightChart points={weights} />
            </div>
          </Suspense>
        ) : (
          <p className="mt-2 text-sm text-muted">Добавьте ещё одну точку — график появится со второго взвешивания.</p>
        )}
        <form
          className="mt-3 grid grid-cols-[1fr_1fr_auto] gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const value = Number(kg.replace(",", "."));
            if (!value || value < 35 || value > 250) return;
            addWeight(when, Math.round(value * 10) / 10);
            setKg("");
          }}
        >
          <input className="field tabular-nums" inputMode="decimal" aria-label="Вес" placeholder="кг" value={kg} onChange={(event) => setKg(event.target.value)} />
          <input className="field" type="date" aria-label="Дата взвешивания" max={today} value={when} onChange={(event) => setWhen(event.target.value)} />
          <button className="btn btn-primary" type="submit">
            Ок
          </button>
        </form>
        <ul className="mt-3 flex flex-col gap-2 text-sm">
          {[...weights].reverse().slice(0, 6).map((item) => (
            <li key={item.id} className="flex items-center justify-between">
              <span>
                {fmtShort(item.date)} · <span className="tabular-nums">{fmt(item.kg, 1)} кг</span>
              </span>
              <button type="button" aria-label="Удалить вес" onClick={() => removeWeight(item.id)}>
                <Trash2 className="size-4 text-muted" />
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="font-semibold">Норма по фактическому весу</h2>
        <p className="mt-1 text-sm text-muted">
          Раз в неделю цель сдвигается по тренду, а не по формуле. 1 кг ≈ 7700 ккал. Сдвиг не больше 200 ккал. Сейчас по формуле или прошлому пересчёту: {fmt(current)} ккал.
        </p>
        <p className="mt-2 text-sm">Следующий автоматический пересчёт: {fmtShort(next)}.</p>
        {preview.ok ? (
          <p className="mt-2 text-sm">
            За {preview.days} дн. вес {preview.deltaKg > 0 ? "+" : ""}
            {fmt(preview.deltaKg, 2)} кг, средний рацион {fmt(preview.avgIntake)} ккал, оценка расхода {fmt(preview.tdee)}. Предлагаемая цель {fmt(preview.target)} ккал.
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted">{preview.reason}</p>
        )}
        <button
          type="button"
          className="btn btn-primary mt-3 w-full"
          disabled={!preview.ok}
          onClick={() => {
            const message = applyAdaptive(true);
            if (message) setBanner(message);
          }}
        >
          Пересчитать сейчас
        </button>
      </Card>

      <Card>
        <h2 className="font-semibold">Пробелы в нутриентах</h2>
        <p className="mt-1 text-sm text-muted">
          {fortnight && fortnight.days >= 14
            ? "Две недели дневника — оценка уже устойчивее."
            : week && week.days >= 7
              ? "Неделя записей есть. Через две недели картина станет спокойнее."
              : `Пока ${week?.days ?? 0} дн. с едой из семи. Отчёт предварительный, не диагноз.`}
        </p>
        <p className="mt-1 text-sm text-muted">Ориентиры USDA / NIH для взрослых. Омега-3 включает растительную ALA.</p>
        <div className="mt-4 flex flex-col gap-3">
          {MICRO_REPORT.map((item) => {
            const value = week?.avg[item.key] ?? 0;
            const goal = rdi(profile.sex, item.key);
            const ratio = goal > 0 ? value / goal : 0;
            const gap = item.kind === "limit" ? ratio > 1 : ratio < 0.7;
            return (
              <div key={item.key}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                  <span className={gap ? "font-semibold text-primary" : ""}>
                    {item.label}
                    {gap ? (item.kind === "limit" ? " · много" : " · мало") : ""}
                  </span>
                  <span className="tabular-nums text-muted">
                    {fmt(value, value < 10 ? 1 : 0)} / {fmt(goal, goal < 10 ? 1 : 0)} {item.unit}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-track">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold">Фото прогресса</h2>
        <p className="mt-1 text-sm text-muted">Необязательно. Снимки остаются на устройстве, в резервную копию попадают только если отметить это в профиле.</p>
        {photoError ? <p className="mt-2 text-sm text-muted">{photoError}</p> : null}
        <Field label="Заметка">
          <input className="field" value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
        <label className="btn btn-primary mt-3 w-full">
          <Camera className="size-4" />
          Снимок
          <input
            className="sr-only"
            type="file"
            accept="image/*"
            capture="user"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void (async () => {
                if (photos.length >= 24) {
                  setPhotoError("Хватит 24 снимков — удалите старый.");
                  return;
                }
                const { dataUrl } = await fileToJpeg(file, 720, 0.7);
                const photo: ProgressPhoto = { id: crypto.randomUUID(), date: today, note: note.trim(), dataUrl };
                await savePhoto(photo);
                setPhotos(await listPhotos());
                setNote("");
              })();
            }}
          />
        </label>
        <ul className="mt-3 grid grid-cols-3 gap-2">
          {photos.map((photo) => (
            <li key={photo.id} className="relative">
              <img src={photo.dataUrl} alt={photo.note || "Фото прогресса"} className="aspect-[3/4] w-full rounded-md object-cover" />
              <button
                type="button"
                className="absolute top-1 right-1 flex size-8 items-center justify-center rounded-full bg-bg/80"
                aria-label="Удалить фото"
                onClick={() => {
                  void deletePhoto(photo.id).then(() => setPhotos((prev) => prev.filter((item) => item.id !== photo.id)));
                }}
              >
                <Trash2 className="size-3.5" />
              </button>
              <p className="mt-1 text-xs text-muted">{fmtShort(photo.date)}</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function averageWindow(
  logs: { date: string; nutrients: import("@/lib/types").Nutrients }[],
  today: string,
  span: number,
) {
  const start = addDays(today, -(span - 1));
  const slice = logs.filter((item) => item.date >= start && item.date <= today);
  const days = new Set(slice.map((item) => item.date)).size;
  if (!days) return null;
  const avg = multiply(sumNutrients(slice.map((item) => item.nutrients)), 1 / days);
  return { avg, days };
}
