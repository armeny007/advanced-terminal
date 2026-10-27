# advterm relay

WebSocket-хаб между приложением Advanced Terminal (host) и мобильным приложением (client).
Содержимое сообщений зашифровано на концах; релей секрета сопряжения не знает.

Деплой на mac-mini (launchd, порт 8787):

```
rsync -a relay/ mac-mini:~/advterm-relay/
ssh mac-mini 'cd ~/advterm-relay && /opt/homebrew/opt/node@22/bin/npm install --omit=dev && \
  cp com.advterm.relay.plist ~/Library/LaunchAgents/ && \
  launchctl unload ~/Library/LaunchAgents/com.advterm.relay.plist 2>/dev/null; \
  launchctl load ~/Library/LaunchAgents/com.advterm.relay.plist && sleep 1 && tail -2 relay.log'
```
