# Advanced Terminal — мобильное приложение (Expo / React Native)

Управление терминалами и сессиями Claude Code с iPhone. Связь с Mac — через релей
(`relay/`), содержимое шифруется на концах (AES-256-GCM, ключ из кода сопряжения);
релей видит только зашифрованные кадры.

## Запуск (Expo Go)

```
cd mobile
npm install            # или bun install
npx expo start         # QR для Expo Go на iPhone; `--ios` — симулятор
```

Expo Go SDK 58 должен стоять на телефоне/симуляторе.

## Сопряжение

1. На Mac в Advanced Terminal: 📱 «Мобильное приложение» → адрес релея → «Создать код
   сопряжения» → включить связь.
2. В приложении: «Сканировать QR» (или вставить код `advterm://pair?relay=…&key=…`).
   Deep link тоже работает: `exp://<host>:8081/--/pair?relay=…&key=…`
   (`xcrun simctl openurl booted "<url>"` для симулятора).

## Что умеет

- Список вкладок и терминалов со статусами Claude (как в Telegram-боте), «＋» — новый терминал.
- Экран терминала: живой снимок экрана (headless xterm на Mac), промпт/команды
  Claude (`/model`, `! ls`…), клавиши Enter/Esc/стрелки/Tab/^C, меню «⋯»:
  новая/продолжить/возобновить/перезапуск, архив.
- Баннер «Claude ждёт» на списке терминалов (hooks → attention).

## Структура

- `App.tsx` — навигация, сопряжение по ссылке
- `src/link.ts` — WebSocket к релею (role=client), автопереподключение, подписка на экран
- `src/crypto.ts` — зеркало `src/main/mobile/crypto.ts`
- `src/store.ts` — состояние (useSyncExternalStore)
- `src/screens/*` — экраны
- Протокол: `../src/shared/mobile-protocol.ts` (импортируется только как типы)
