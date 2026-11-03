# Инструкция: выложить «Форму» на GitHub и на свой сервер

Эта инструкция относится к архиву `forma-github.zip`. Внутри него пресет уже `node-server`, а фраза дня и фото уже ходят в DeepSeek. Живой дневник, которым пользователь тестирует сейчас, не менялся.

Ты разворачиваешь готовое веб-приложение «Форма». Не переписывай экраны, формулы и дневник. Не включай вход через Grok и не подключай базу данных: дневник хранится в браузере, а не на сервере.

## Что это

- Стек: Node.js, Vite, React, TanStack Start, Nitro.
- Калории, штрихкод, вода, витамины и резервная копия считаются в браузере.
- Сервер нужен, чтобы отдать сайт по домену и вызвать DeepSeek.
- Два вызова идут с сервера, ключ в браузер не попадает: фраза дня и оценка блюда по фото.
- Без ключа эти две функции показывают запасной текст. Остальное работает.
- Поиск неизвестного штрихкода идёт из браузера в Open Food Facts. Отдельный ключ не нужен.
- Дневник телефона на сервер не попадает. Перенос между устройствами — файлом резервной копии из профиля.

## Чего не делать

- Не коммить и не вставлять в репозиторий `DEEPSEEK_API_KEY`, `.env`, пароли сервера.
- Не задавать `GROK_PROJECT_ID`, `GROK_AUTH_CLIENT_ID`, `GROK_AUTH_CLIENT_SECRET`, `GROK_AUTH_ISSUER`, `BETTER_AUTH_URL`, `DATABASE_URL`.
- Не возвращать пресет Nitro на `vercel`.
- Не переписывать `src/lib/ai.ts`: DeepSeek там уже подключён.

## 1. Репозиторий GitHub

Распакуй `forma-github.zip`. Внутри уже есть `.gitignore`. Залей содержимое в новый репозиторий, лучше приватный. Не заливай `node_modules`. Файл `.grok/app-env.json` оставь: в нём `"VITE_AUTH_ENABLED": "false"`, секретов нет.

## 2. Ключ DeepSeek

Ключ пользователь даст сам. В репозиторий и в чат его не пиши. Только в `/opt/forma/.env` на сервере:

```
DEEPSEEK_API_KEY=ключ-пользователя
```

Права файла `600`. Код уже читает эту переменную в `src/lib/ai.ts`.

Куда ходит код, для проверки, не для переделки:

- Адрес: `https://api.deepseek.com/chat/completions`
- Заголовок: `Authorization: Bearer` и значение `DEEPSEEK_API_KEY`
- Модель: `deepseek-flash`
- Фраза дня и фото блюда используют один и тот же ключ
- Если переменная пустая, запрос в DeepSeek не отправляется

После того как ключ вписан в `.env`, достаточно `systemctl restart forma`. Заново собирать проект из-за одного ключа не нужно.

## 3. Сервер

Нужно: Linux, Node.js 22 или новее, nginx, домен, который уже указывает на этот сервер.

```bash
git clone <адрес-репозитория> /opt/forma
cd /opt/forma
npm ci
export VITE_AUTH_ENABLED=false
npm run build
```

`npm run build` пропустит миграции, потому что `DATABASE_URL` нет. Это нормально.

Точка входа после сборки: `.output/server/index.mjs`. Если Nitro напишет другой путь, используй его.

Файл `/opt/forma/.env`, права `600`:

```
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
NITRO_HOST=127.0.0.1
NITRO_PORT=3000
VITE_AUTH_ENABLED=false
DEEPSEEK_API_KEY=
```

Systemd, `/etc/systemd/system/forma.service`:

```
[Unit]
Description=Forma
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/forma
EnvironmentFile=/opt/forma/.env
ExecStart=/usr/bin/node /opt/forma/.output/server/index.mjs
Restart=on-failure
User=www-data

[Install]
WantedBy=multi-user.target
```

Если у `www-data` нет прав на `/opt/forma`, заведи отдельного пользователя и поставь его в `User=`.

```bash
systemctl daemon-reload
systemctl enable --now forma
curl -sI http://127.0.0.1:3000/ | head
```

В ответе должен быть `200` и HTML со словом «Форма».

## 4. Домен и HTTPS

Камера штрихкода на телефоне работает только по https.

```
server {
    listen 80;
    server_name example.com;
    client_max_body_size 8m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

```bash
certbot --nginx -d example.com
```

Открой `https://example.com` с телефона. Должен появиться дневник без страницы входа.

## 5. Проверка

- Профиль создаётся, дневник пишется, после обновления страницы данные на месте.
- В другом браузере дневник пустой. Так и должно быть.
- Штрихкод: сайт открыт по https, камера спрашивает разрешение.
- Вода: стаканы по 200 мл.
- Если ключ задан: фраза дня — своя, не из запаса. Фото блюда тоже отвечает.
- Если ключа нет: фраза дня из запаса, фото пишет, что распознавание недоступно. Это не поломка.

## 6. Обновление

```bash
cd /opt/forma
git pull
npm ci
export VITE_AUTH_ENABLED=false
npm run build
systemctl restart forma
```
