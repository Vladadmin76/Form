# Выкладка «Формы» на Cloudflare Workers (бесплатно)

Отдельный Worker `forma`. Другие проекты и их Worker'ы не затрагиваются.
База данных не нужна: дневник хранится в браузере телефона.
Пресет Nitro: `cloudflare_module` (`vite.config.ts`), имя Worker'а задано там же.

## Один раз

1. **Токен Cloudflare.** dash.cloudflare.com → My Profile → API Tokens → Create Token →
   шаблон «Edit Cloudflare Workers». Токен лучше завести новый, только для «Формы».
   Если на аккаунте несколько аккаунтов Cloudflare, в шаблоне выберите нужный.
2. **Токен в GitHub.** Репозиторий `form` → Settings → Secrets and variables → Actions →
   New repository secret: имя `CLOUDFLARE_API_TOKEN`, значение — токен.
3. **Первый деплой.** Вкладка Actions → «Deploy to Cloudflare Workers» → Run workflow
   (или любой пуш в `main`). До появления секрета запуск не падает, а пропускает деплой.
4. **Ссылка.** В Cloudflare: Workers & Pages → `forma` → адрес вида `https://forma.<поддомен>.workers.dev`.
   Если Cloudflare просит завести поддомен `workers.dev`, это делается один раз в Workers & Pages.
5. **Ключ DeepSeek (по желанию).** Workers & Pages → `forma` → Settings → Variables and Secrets →
   Add → тип **Secret**, имя `DEEPSEEK_API_KEY`, значение — ключ. Именно Secret, не обычная переменная:
   обычные переменные, не описанные в конфиге, стираются при каждом деплое. Ключ в GitHub и в чат не писать.
   Без ключа работают запасные фразы, а фото блюда пишет, что распознавание недоступно.

## Дальше

Любой пуш в `main` сам собирает и обновляет сайт. Секреты и ключ при этом сохраняются.

## Проверка

- Откройте ссылку на телефоне, создайте профиль, добавьте сайт на экран «Домой».
- Фраза дня появляется сама. Если ключ задан, она своя, если нет, из запасных.
- Камера штрихкода работает, потому что `workers.dev` отдаёт https.

## Если что-то не так

- Деплой пишет про account id: добавьте в `deploy.yml` в `env` строку `CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}`
  и создайте секрет с id аккаунта (виден в Cloudflare справа на странице Workers & Pages).
- Ошибка прав токена: пересоздайте токен по шаблону «Edit Cloudflare Workers».
- Бесплатный тариф: 100 000 запросов в сутки и ограничение времени процессора на запрос. Ожидание ответа ИИ в него не входит.

## Локальная проверка (по желанию)

```
npm ci
VITE_AUTH_ENABLED=false npm run build
echo "DEEPSEEK_API_KEY=ключ" > .dev.vars   # файл в .gitignore
npx wrangler dev
```
