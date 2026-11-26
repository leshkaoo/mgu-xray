# Риски и release gates

Исследование 2026-11-26, без доступа к автомобилю. Severity — инженерная оценка, не подтверждённая неисправность цели.

| Риск | Уровень | Защита / gate | Статус |
|---|---|---|---|
| Ошибочная цель/ABI/kernel/UID | Высокий | Проверенный endpoint и read-only probe только после разрешения; не доверять старому IP | Цель не проверена |
| recmgr/crashhandler перезагружает MGU при stop/crash | Критический | Никаких car services в локальном MVP; review installed deploy, boot-list lifecycle, parked test с recovery | Заблокировано до разрешённого target test |
| Стандартный installer меняет OEM integration files | Высокий | Не запускать installer; отдельное согласование узкого перечня записей | См. конфликт ниже |
| Renderer install затрагивает HMI/touch routing | Высокий | Только уже установленный renderer, capability-check; не обновлять gate/HMI | Не проверено |
| Xray требует Go 1.27 / совместимости syscalls | Высокий | Пин toolchain, статический linux/amd64, Linux и real-target smoke tests | Cross-build не доказывает запуск |
| Proxy доступен через tailnet→localhost | Высокий | Проверить существующую Tailscale конфигурацию, при необходимости authenticated proxy design | Не проверено; loopback не auth boundary |
| Утечка секретов через config/errors/engine logs/git | Высокий | Строгий parser/allowlist, 0600/0700, generic errors, не передавать URI в argv, bounded/redacted logs, artifact/history scans | Нужны тесты |
| Непроверенный Xray JSON включает listeners/routing/dns/exec | Высокий | Не запускать импорт как есть; извлекать только поддержанный outbound в собственную canonical config | Нужны негативные тесты |
| Прямой fallback / DNS утечки | Высокий | Нет freedom/direct fallback; destination names идут proxy; TLS auth errors fail closed; app must explicitly proxy | Нужен capture/connection test |
| Память/CPU/backoff/потеря uplink | Высокий | Budget measurement, finite restart/backoff, graceful stop, no boot loops, no launch by default | Не измерено на цели |
| Несовместимый Happ export/XHTTP variant | Средний | Ограниченный поддержанный schema; неизвестное отклонять, не обходить export restrictions | Реальные разрешённые profiles отсутствуют |
| Ожидание восстановления ConnectedDrive/VIN/RTTI | Средний | Не обещать: ATM/backend/auth вне proxy scope | Причины не исследованы |
| Package hash без доверенного source | Средний | Пин commit/toolchain/deps, deterministic rebuild, private/public согласовать, публикация только после review | Ничего не опубликовано |
| Неполные license notices | Высокий для распространения | Полный engine/dependency/runtime inventory и notices, отсутствие BMW SDK | Distribution gate |
| UI отвлекает при движении | Высокий | Setup вне driving display пока motion unknown; не трогать safety signals/CAN | Car UI не проверен |

## Конфликт строгого ограничения и обычного Store install

ТЗ запрещает OEM file/service edits, изменения firewall/DNS/global routing и jailbreak. При этом стандартный `mgu-deploy` при установке service packages **может обновлять** systemd units, recmgr и crashhandler lists, а renderer — HMI mount/inputgate/touch nft. `mgu-uplink` сам использует UID routes/firewall.

Разрешение «делай локальный прототип» не разрешает эти изменения автомобиля. Поэтому:

- Локальный инженерный tool kit: только свои бинарники/документы, **без units/hooks/autostart**.
- Никакой установки/обновления renderer/uplink, использования Store secret или изменения действующей proxy setting автоматически.
- Финальная service/app интеграция требует отдельного согласования точного перечня записей. Если no OEM edits остаётся абсолютным, следует отказаться от service installer и ограничить supported delivery до приемлемой владельцу схемы, которая доказуемо не нарушает запрет.
- Нельзя называть этот неразрешённый этап «готовым» или обходить ограничение другим installer.

## Запрещённые действия остаются вне scope

CAN writes, силовая/тормозная/рулевая система, ATM/BDC/DSC/DME/DDE/EGS, VIN/eSIM/cert/license/firmware/reset, OEM auth/backend bypass, jailbreak changes. Никаких трат, публикации, car connection/install/reboot/network change без соответствующего отдельного разрешения. Stop при неопределённости integrity/rollback.

## Ссылки доказательств

Commit-pinned источники, точные файлы и границы достоверности перечислены в `RESEARCH.md`; API snapshots — `research/evidence.json`, HTTPS doc metadata — `research/web/index.json`. Ни один упомянутый upstream test не выдаётся за выполненный тест MGU-Xray или G20 владельца.
