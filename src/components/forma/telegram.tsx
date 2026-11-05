import { useCallback, useEffect, useRef, useState } from "react";
import { fromTime, toTime, tgLink, tgSavePrefs, tgStatus, tgTest, tgUnlink, type TgStatus } from "@/lib/tg-client";
import type { TgPrefs, TgWater } from "@/lib/tg-schedule";
import { useForma } from "@/lib/store";
import { Card } from "@/components/forma/bits";

const EVERY = [30, 60, 90, 120, 180];
const DEFAULT_WATER: TgWater = { on: false, from: 540, to: 1260, every: 120 };

function everyLabel(minutes: number) {
  return minutes % 60 === 0 ? `${minutes / 60} ч` : minutes < 60 ? `${minutes} мин` : `${minutes / 60} ч`;
}

// Настройки напоминаний в Telegram: подключение бота, вода, проверка, отключение.
export function TelegramCard() {
  const reminders = useForma((state) => state.reminders);
  const [status, setStatus] = useState<TgStatus | null>(null);
  const [offline, setOffline] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [water, setWater] = useState<TgWater>(DEFAULT_WATER);
  const loaded = useRef(false);

  const refresh = useCallback(async () => {
    const res = await tgStatus();
    if (!res.data) {
      setOffline(true);
      return null;
    }
    setOffline(false);
    setStatus(res.data);
    return res.data;
  }, []);

  useEffect(() => {
    void refresh().then((data) => {
      if (data?.prefs) setWater(data.prefs.water);
      loaded.current = Boolean(data?.connected);
    });
  }, [refresh]);

  // Пока человек в Telegram, раз в 3 секунды спрашиваем, подключился ли он (до ~10 минут).
  useEffect(() => {
    if (!link) return;
    let polls = 0;
    const id = window.setInterval(() => {
      polls += 1;
      void refresh().then((data) => {
        if (data?.connected) {
          if (data.prefs) setWater(data.prefs.water);
          loaded.current = true;
          setLink(null);
          setNote("");
        }
      });
      if (polls >= 200) {
        setLink(null);
        setNote("Время вышло. Нажмите «Подключить бота» ещё раз.");
      }
    }, 3000);
    return () => window.clearInterval(id);
  }, [link, refresh]);

  const connected = Boolean(status?.connected);
  const mealsKey = JSON.stringify(reminders.filter((item) => item.enabled).map((item) => [item.id, item.label, item.time]));

  // Отправляем настройки на сервер: часовой пояс, вода и включённые напоминания о еде.
  useEffect(() => {
    if (!connected) return;
    const id = window.setTimeout(() => {
      const prefs: TgPrefs = {
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        water,
        meals: reminders.filter((item) => item.enabled && item.label.trim()).map((item) => ({ id: item.id, label: item.label.trim(), minute: fromTime(item.time) })),
      };
      void tgSavePrefs(prefs).then((res) => {
        if (!res.ok && res.status !== 0) setNote("Не удалось сохранить настройки.");
      });
    }, 600);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, water, mealsKey]);

  const connect = async () => {
    setBusy(true);
    setNote("");
    const res = await tgLink();
    setBusy(false);
    if (res.ok && res.data) setLink(res.data.url);
    else setNote(res.status === 429 ? "Слишком много попыток. Подождите немного." : "Не получилось создать ссылку. Попробуйте позже.");
  };

  const unlink = async () => {
    if (!window.confirm("Отключить Telegram-напоминания?")) return;
    setBusy(true);
    await tgUnlink();
    loaded.current = false;
    setBusy(false);
    setLink(null);
    setNote("");
    await refresh();
  };

  const test = async () => {
    setBusy(true);
    const res = await tgTest();
    setBusy(false);
    setNote(res.ok ? "Проверка отправлена, загляните в Telegram." : "Не удалось отправить. Подключите бота заново.");
  };

  return (
    <Card>
      <h2 className="font-semibold">Telegram</h2>
      <p className="mt-1 text-sm text-muted">Напоминания приходят в чат с ботом, даже когда «Форма» закрыта.</p>
      {offline && !status ? <p className="mt-3 text-sm text-muted">Нет связи с сервером.</p> : null}
      {status && !status.available ? <p className="mt-3 text-sm text-muted">Бот пока не подключён к сайту.</p> : null}
      {status?.available && !connected ? (
        <div className="mt-3 flex flex-col gap-2">
          {link ? (
            <>
              <a className="btn btn-primary" href={link} target="_blank" rel="noopener noreferrer">
                Открыть бота
              </a>
              <p className="text-sm text-muted">Нажмите «Начать» (Start) в Telegram и вернитесь сюда. Ссылка действует 10 минут.</p>
            </>
          ) : (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void connect()}>
              Подключить бота
            </button>
          )}
        </div>
      ) : null}
      {connected ? (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-sm">Подключено{status?.username ? `: @${status.username}` : ""}</p>
          {status?.disabled ? (
            <div className="rounded-md bg-surface-2 p-3 text-sm">
              <p>Отправка остановлена: бота заблокировали или чат удалён.</p>
              <button type="button" className="mt-2 text-sm font-semibold text-primary" onClick={() => void connect()}>
                Подключить заново
              </button>
              {link ? (
                <a className="btn btn-primary mt-2" href={link} target="_blank" rel="noopener noreferrer">
                  Открыть бота
                </a>
              ) : null}
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <span>Напоминать про воду</span>
            <button type="button" className="chip" data-on={water.on} onClick={() => setWater({ ...water, on: !water.on })}>
              {water.on ? "Вкл" : "Выкл"}
            </button>
          </div>
          {water.on ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm text-muted">
                С
                <input className="field mt-1" type="time" value={toTime(water.from)} onChange={(event) => setWater({ ...water, from: Math.min(fromTime(event.target.value), water.to) })} />
              </label>
              <label className="text-sm text-muted">
                До
                <input className="field mt-1" type="time" value={toTime(water.to)} onChange={(event) => setWater({ ...water, to: Math.max(fromTime(event.target.value), water.from) })} />
              </label>
              <label className="col-span-2 text-sm text-muted">
                Каждые
                <select className="field mt-1" value={water.every} onChange={(event) => setWater({ ...water, every: Number(event.target.value) })}>
                  {EVERY.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {everyLabel(minutes)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
          <p className="text-sm text-muted">Завтрак, обед и ужин берутся из списка «Напоминания» выше (включённые). Сообщение может прийти с опозданием до 15 минут.</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void test()}>
              Отправить проверку
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void unlink()}>
              Отключить
            </button>
          </div>
        </div>
      ) : null}
      {note ? <p className="mt-3 text-sm text-muted">{note}</p> : null}
    </Card>
  );
}
