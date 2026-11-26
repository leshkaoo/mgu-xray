# MGU-Xray — исследование совместимости

Дата: 2026-11-26. Исследование выполнено на Mac, **без соединения с автомобилем**.
Сведения из чужих README — доказательства устройства чужих сборок, а не результаты на G20 владельца.

## Предварительная проверка готовых решений

| Решение | Установлено по исходникам | Решение для проекта |
|---|---|---|
| Xray Core | Поддерживает VLESS/REALITY и XHTTP; отдельный userspace-процесс; MPL-2.0 | Основной движок; не писать собственный протокол |
| sing-box | Поддерживаемая альтернатива; v1.14.4 опубликован 2026-10-24; LICENSE содержит GPL-3.0-or-later и дополнительное ограничение названия/ассоциации | Резерв; не заменять Xray без проверки эквивалентности профилей |
| jap-wireproxy | Готовый MGU userspace SOCKS5 для **WireGuard**, с supervisor и измерениями | Использовать как источник требований к платформе; не умеет преобразовывать Happ VLESS в WireGuard |
| mgu-uplink | Уже обеспечивает интернет выбранным UID; состояние/lease-файлы | Не дублировать управление интерфейсами/маршрутами/firewall |
| mgu-updater / Store | Уже поддерживает HTTP CONNECT и SOCKS5 для загрузок | Использовать явную существующую настройку прокси, без патча Store |
| mgu-render | Существующий renderer/IPC/управление фокусом | Интеграция только с уже установленным совместимым экземпляром; не устанавливать/обновлять автоматически |

Платных услуг не приобреталось. Готового проверенного MGU VLESS/REALITY-приложения среди изученных проектов не найдено; отсутствие во всём интернете не утверждается.

## Зафиксированные источники

Все локальные upstream checkout находятся в `research/upstream/`, не являются частью собственного кода.

| Репозиторий | Commit исследования | Основные файлы |
|---|---|---|
| [robertnisipeanu/mgu-store](https://github.com/robertnisipeanu/mgu-store) | `37702a880f1ed5fd346f4c944127fb276920be9c` | `deploy/README.md`, `docs/PUBLISHING.md`, `native/mgu-updater/README.md`, `native/mgu-render/PROTOCOL.md` |
| [robertnisipeanu/idrive-apps](https://github.com/robertnisipeanu/idrive-apps) | `8a21e0868b845947bb1caaf840b959720ca1dfc5` | `README.md`, release/native sources; автомобильные cluster-patch функции вне нашего scope |
| [JustAnotherPU/mgu-apps](https://github.com/JustAnotherPU/mgu-apps) | `42cd2242d9e75c48aace6ee40274451a88c920a7` | `tools/jap-wireproxy/{README.md,build.sh,component.json,systemd/jap-wireproxy.service}` |
| [cauliflowermossgrape/idrive7-apps](https://github.com/cauliflowermossgrape/idrive7-apps) | `e60248a075f0782665885838446dbccba15bbc30` | `kit/renderd/README.md`, `README.mgu-render.md`, `kit/runtime/` |
| [XTLS/Xray-core](https://github.com/XTLS/Xray-core) | release `v26.11.9` → `676eaf66f8f05d4d558ee7a74b4736623d3feeb9` | `go.mod`: `go 1.27`; `LICENSE`: MPL-2.0 |

GitHub API release/issues/pull snapshots: `research/evidence.json`. Это выборка последних открытых записей, **не полный security audit**. Изучены заголовки и описания выборки, не каждый комментарий/патч всех PR. Например, mgu-store #374 сообщает boot loop на другой платформе; sing-box #4737 сообщает потенциальные dependency vulnerabilities. Это сообщения пользователей, не подтверждённые здесь диагнозы или применимость к нашей конфигурации. По текущим issues нельзя объявлять любую сборку безопасной.

Официальные XTLS страницы успешно прочитаны по HTTPS (HTTP 200); URL/размер/SHA256 снимков в `research/web/index.json`:

- [transport / REALITY](https://xtls.github.io/config/transport.html)
- [VLESS outbound](https://xtls.github.io/config/outbounds/vless.html)
- [XHTTP](https://xtls.github.io/config/transports/splithttp.html)
- [SOCKS inbound](https://xtls.github.io/config/inbounds/socks.html)

Страницы документации меняются независимо от релиза движка: окончательный oracle схемы — pinned engine `run -test` плюс интеграционные тесты.

## ABI и окружение: что известно и чего нет

**Доказано исходниками сторонних проектов:**

- `jap-wireproxy/build.sh` собирает `CGO_ENABLED=0 GOOS=linux GOARCH=amd64`; проверяет статический ELF x86-64.
- `jap-node22/README.md` сообщает glibc 2.27 на исследованной MGU; renderer собирается под Ubuntu 18.04/glibc 2.27. Это **не снято с G20 владельца**.
- `mgu-python/README.md` указывает loader `/lib/ld-linux-x86-64.so.2`, а не `/lib64/...`.
- `jap-wireproxy/README.md`: нет TUN, только подписанные kernel modules; локальный SOCKS5 выбран осознанно.
- Node на MGU — 8.x; исходники tool/app должны учитывать его ограничения. Новые зависимости Node 18+ нельзя молча устанавливать вместо OEM Node.
- Пример чужого реального теста: BMW X5 G05 / systemd 237, 2026-11-08. Это не целевая G20.

**Не подтверждено на цели:** `uname -m/-r`, CPU flags, точная libc/kernel/syscall совместимость с Go 1.27, seccomp, writable mount layout, UID/GID, свободные порты, память/CPU, доступный uplink, версия deploy/renderer/Store. User-reported firmware 11/2024.25, updater 0.8.62, Store 0.9.45, renderer 0.6.26 записаны в исходном ТЗ, но не перепроверены.

Статический cross-build исключает динамический loader/glibc dependency, но **не доказывает** поддержку ядра, syscalls, DNS, сертификатов или реальные resource costs. До разрешённого чтения цели ABI остаётся гипотезой с сильными upstream-доказательствами.

## Процессы и watchdog: требования к жизненному циклу

`jap-wireproxy/README.md`, раздел Head-unit rules: recmgr считывает restart list при загрузке. Остановка службы, которой нет в загруженном списке, может перезапустить головное устройство. mgu-deploy поэтому откладывает первый старт новой службы до следующей загрузки. Нельзя проверять supervisor ручным `systemctl stop/restart` на машине.

`deploy/README.md` описывает snapshots, check/failure rollback и ограничения start limits; `deploy/CHANGELOG.md` — служебные crashhandler/recmgr protections. Доверять этим механизмам можно только после проверки **установленной** версии и разрешённого lifecycle test. Нет гарантии, что старый deploy знает новые поля.

Чужой wireproxy unit: MemoryLimit=96M, CPUQuota=200%, RestartSec=30, privilege drop в UID 3921, CapabilityBoundingSet только для setup/drop. Эти значения — не бюджет Xray. Для Xray нужны собственные измерения; UID 3921 нельзя забирать. Никаких autostart/units/hooks в инженерном локальном комплекте.

## Сеть и proxy inheritance

`mgu-uplink/README.md`: UID routing через таблицу 110 и firewall, status `/run/mgu-uplink/status.json`, lease `/run/mgu-uplink/lease.json`. Системный default route и resolver не заменяются, но **сам uplink меняет сетевые правила**. MGU-Xray не должен редактировать его реализацию или активировать новые uplink режимы.

`native/mgu-updater/README.md:174-199`: Store Settings → Proxy принимает `http://host:port` или `socks5://host:port`; загрузки GitHub/catalog/package/icons/redirects и build downloads используют настройку; ошибка прокси не переключает их на прямой канал. TLS certificate checks сохраняются. Это явная настройка **updater**, не глобальная наследуемая настройка всех приложений.

`op: proxy-set` существует, но privileged socket API защищён startup-secret Store/phone page (`README.md:443,455-461`). Не читать и не копировать чужой Store secret ради интеграции. Владелец может использовать штатный UI после отдельного разрешения на изменение настройки; rollback должен сохранить прежнее значение без вывода credentials.

| Потребитель | Установлено сейчас | Реальная проверка |
|---|---|---|
| MGU Store/updater | Явная HTTP/SOCKS5 настройка в исходниках; не глобальный proxy | Не выполнена |
| RideTube | Прокси/наследование в изученной выборке не подтверждены | Нужны актуальные исходники/разрешённый тест |
| Bube | Не подтверждено | Не выполнена |
| M-Copilot | Не подтверждено | Не выполнена |
| Spotify | Не подтверждено; OEM приложение не патчить | Не выполнена |
| Browser apps | Зависит от конкретного приложения/WebView; env vars не гарантия | Не выполнена |
| mgu-uplink | Предоставляет uplink, не transparent proxy для всех приложений | Не выполнена |
| My BMW / ConnectedDrive / RTTI / weather / VIN-код | OEM MGU/ATM/backend пути не установлены | Только отдельное read-only исследование; не критерий release |

`127.0.0.1` — локальный listener, но не полноценная авторизация: upstream wireproxy README предупреждает, что userspace Tailscale может пробрасывать tailnet traffic на localhost. Нужно проверить существующий Tailscale shields/ACL отдельно; ничего не менять автоматически. SOCKS UDP отключён в MVP; HTTP CONNECT/SOCKS TCP only.

## UI/SDK

`native/mgu-render/PROTOCOL.md`: stream Unix socket `/run/mgu-render/render.sock` (0660, `tm_oap_app`), запасной community socket `/run/mgu-renderd/renderd.sock`, `mgu-render/1`, framing LE type/length, capability negotiation `X_READY`, `X_GRAB`, `X_CCU`, TOUCH. Возможности renderer зависят от реально загруженного gate и версии; нельзя объявлять rotary/touch working по одному mock UI.

`kit/renderd/README.md`: design space 1920×720, focus/popup yielding, software fallback. Full-screen rendering и управление не должны заслонять камеры/предупреждения. Motion state не исследован: настройка только вне driving display, пока нет проверенного parked signal.

`docs/PUBLISHING.md`: BMW oap-sdk не redistributable; SDK берётся на unit из stock donor. Не коммитить SDK, firmware, готовый bundle с BMW SDK. Чужой renderer install использует HMI widget mount/touch nft/inputgate: **не выполнять** в рамках строгого no OEM edits ограничения.

## Пакет/каталог/USB

`deploy/README.md:367-443`: tool `<id>@<x.y.z>.tgz` содержит `component.json`, `files/`, необязательные `units/` и `dropins/`. `files[].path/from/mode`; `restart: []` ничего не запускает. Native engine должен быть tool, не self-installing OAP JavaScript.

`docs/PUBLISHING.md`: catalog schema 2, components с id/kind/version и artifact name/size/sha256/url; локальные относительные URL допустимы. GitHub `catalog` release, HTTPS catalog и USB folder поддерживаются; branch layout — `mgu-repo.json` schema 1. App/tool IDs глобальны; tentative `izum-mgu-xray` пока **не проверен на цели**. Для отдельного UI app нужен собственный prefix/id; дефис tool ID не доказывает пригодность OAP app ID.

USB source импортируется штатным Store/installer; локальный bundle ещё не проверен парсером установленного updater. Не публиковать и не называть его recovery-ready до lifecycle/rollback/USB validation. SHA256 защищает от случайной подмены относительно каталога, но не заменяет доверие к самому каталогу/источнику.

## Лицензии и границы переиспользования

- mgu-store / idrive-apps: GPL-3.0; копирование кода требует соблюдения GPL, не считать весь код MIT.
- JustAnotherPU/mgu-apps: MIT в корне, но `jap-runas` GPL-3.0-or-later, wireproxy ISC, wireguard-go MIT, дополнительные модули собственных лицензий. Смотреть `THIRD_PARTY_LICENSES`.
- cauliflowermossgrape/idrive7-apps: MIT в корне; renderer включает другие компоненты/notice-файлы. BMW donor SDK исключён из распространения.
- Xray release: MPL-2.0, Go dependencies и runtime требуют собственных notices. `go.sum` — integrity lock, не сборник лицензий.
- sing-box release LICENSE: GPL-3.0-or-later плюс правило имени/ассоциации; перед дистрибуцией нужен отдельный review.

Самостоятельный supervisor, взаимодействующий с отдельным engine процессом, не требует копировать GPL installer/UI. Использование upstream packer локально не делает сборку автоматически полностью лицензированной. Публикация gated до полного dependency inventory, source provenance, notices и secret scan истории/артефактов.

## Ближайшие доказательства, которых не хватает

1. Linux isolated runtime и повторяемая engine сборка/нагрузочные измерения.
2. Dummy REALITY endpoint и негативные TLS/auth/network tests без внешних секретов.
3. Independent architecture/security review с исправлениями.
4. После отдельного разрешения — read-only ABI/version/port probe проверенной машины.
5. После отдельных разрешений на **каждую запись** — parked stable-power install, настройки прокси и restore/rollback tests. До этого не beta и не target-ready.

## Фоновый lifecycle — кандидат 0.2.1

Существующее решение изучено до изменения: `JustAnotherPU/mgu-apps`, pinned
`42cd2242d9e75c48aace6ee40274451a88c920a7`, `kit/runtime/life.js`:
ACTIVE удерживается для скрытой работы (hold), HMI-visible учитывается отдельно;
INACTIVE позволяет MainApp завершать ненужные процессы. Использована эта модель,
не копировалась реализация. Наш сериализованный контроллер дополнительно проверяет
отказы и отмену запуска. Это источник требований, не доказательство реального
поведения установленного на машине MainApp/SDK. MEMORY_LOW/shutdown не обходятся.
