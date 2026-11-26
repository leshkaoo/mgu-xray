# MGU-Xray

**Локальный инженерный прототип, не beta и не готовый пакет для автомобиля.**

Подготовлен **кандидат 0.2.1**: нативный RHMI RU/EN экран, background-контроллер,
согласованные engine/app пакеты и каталог Store. Это ещё **не проверенная
установка на BMW**. [Состав и ограничения](packaging/CANDIDATE.md),
[фактические проверки](packaging/CANDIDATE_TEST_REPORT.md).

Самостоятельный userspace-прокси на Xray для будущего приложения iDrive 7.
Без глобального VPN, изменения маршрутов/DNS/firewall и доступа к CAN.
Машина не подключалась; ABI/ядро именно G20 владельца не проверены.

## Что реализовано

- Строгий импорт `vless://` TCP REALITY и ограниченного Xray JSON.
- Каноническая конфигурация: один VLESS outbound, без direct fallback.
- SOCKS5 `127.0.0.1:10808`, HTTP `127.0.0.1:10809`, UDP выключен.
- Профиль только через stdin; ни аргументов с секретами, ни файла профиля.
- Проверка SHA256 и исполнение отдельной приватной копии движка.
- Проверка занятости портов, ограниченные повторы, остановка по SIGTERM.
- Локальные Go-тесты, синтетический REALITY-стенд, исследования формата Store.

XHTTP, подписки/Happ-export, хранилище серверов, проверка UI на iDrive, метрики,
жёсткие лимиты ресурсов, интеграция с приложениями и установка на MGU ещё не
реализованы. Полный JSON клиента с routing/dns/несколькими outbound намеренно
отклоняется, а не выполняется. Корректность подключения проверяется отдельно
от корректности конфигурации: см. [TEST_REPORT.md](TEST_REPORT.md).

## Локальная разработка (Mac)

Go 1.26.5 для оболочки; движок собирается Go 1.27.3 (toolchain download).
Исходники Xray должны находиться в `research/upstream/XTLS--Xray-core`,
checkout `676eaf66f8f05d4d558ee7a74b4736623d3feeb9` (v26.11.9).

```sh
go test -race ./...
go vet ./...
sh scripts/build.sh
/opt/homebrew/bin/python3 scripts/e2e-local.py
```

Проверка профиля без подключения: `build/mgu-xray < private/profile.txt`.
Папка private не попадает в git; создавайте её с правами 0700, файл — 0600.
Не присылайте настоящие ключи через Telegram и не коммитьте их.
Запуск требует `-run -engine <absolute-path> -engine-sha256 <trusted-hash>`;
хеш берётся из локального `build/engine-SHA256SUMS`, не из непроверенной ссылки.
Это не криптографическая подпись производителя.

На этом Mac 10808 уже занят Tunnel. Не останавливайте его ради теста.
`-socks-port` и `-http-port` позволяют выбрать отдельные unprivileged loopback
порты; импортируемый профиль не может выбирать адрес/порты слушателя.

## Документы

[Исследование](RESEARCH.md), [архитектура](ARCHITECTURE.md),
[риски](RISKS.md), [безопасность](SECURITY.md), [план](TODO.md),
[прогресс](PROGRESS.md). К BMW не подключались. GitHub содержит публичные
исходники и draft candidate, не активный установочный канал Store.

## Макет интерфейса

[Симулятор](simulator/README.md): `simulator/index.html` открывается локально в
браузере, показатели синтетические. Он не совпадает с нативным RHMI списком
кандидата и не является интерфейсом работающего Xray.

## English

Local engineering prototype only, **not vehicle-ready or beta**. Strict VLESS
TCP REALITY import, fixed loopback proxies, no direct fallback, stdin-only
secrets, SHA256-checked engine copy and bounded process supervision. Mac and
Linux cross-builds do not verify the owner's head unit ABI or runtime.
See TEST_REPORT.md for actual executed tests and remaining gates. No OEM,
CAN, network, firmware, jailbreak or vehicle changes are performed. XHTTP,
Happ subscriptions, iDrive UI, per-app integration and hard resource controls
are not production-ready. Candidate 0.2.1 adds an experimental native RHMI
background-capable control, not a verified BMW release. No public release or paid infrastructure.
