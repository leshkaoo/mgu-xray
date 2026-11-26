# Независимое Codex-ревью перед экспериментальной публикацией 0.2.2

2026-11-26. Отдельный reviewer-агент, только чтение, без изменения исходников,
публикации, доступа к BMW и запуска installer main. Это review нового кода,
не повторение старого Claude/Codex review 0.1.0 и не сертификат безопасности.

## Найденные блокеры baseline 0.2.1 — исправлены

1. **P1: пустые ACL tables** в конечном source-linked OAP. Генератор теперь содержит masterAccessTable4/masterRegistrationTable1 и штатные lifecycle ACL.
2. **P1: отсутствовал AppStatus service** и core lifecycle proxies. Добавлены AppStatus service, PrivateEntryPoint/AppBookmarks/WakeUpOnDemand/WodControl/Provisioning без Vehicle/CAN.
3. **P1: отсутствовал shrinkwrap**; MainApp отказывает пакетам без node_modules/shrinkwrap. Добавлен lockfileVersion1 с согласованными name/version, включён в package files[].
4. **P1: профиль лежал в заменяемом source**. Теперь `<OAP-home>/data/private/profile.txt`; source reinstall переносит data, не source.
5. **P1: disk budget26MiB меньше frozen Xray32,256,124 bytes**. Бюджет64MiB; отдельный owned runtime в data, очистка после child close.
6. **P1: Linux Pdeathsig привязан к создающему потоку**. Spawning goroutine закреплена `runtime.LockOSThread` до конца supervision/Wait. Проверка на Linux всё равно остаётся открыта.

Reviewer независимо собрал конечный OAP с настоящим upstream oap_link.build и
синтетическим donor: ACL, AppStatus, shrinkwrap и quota в итоговом tar подтверждены.

## Повторное ревью crash cleanup

Обнаружен и исправлен дополнительный P1: frozen32MiB мог остаться после совместного
SIGKILL/power loss Node+Go и забить quota при новом запуске. Теперь bounded sweep
проверяет owned mode0700 runtime, PID/boot_id/starttime marker. Удаляет только при
доказанном прежнем boot, reused PID или ESRCH; живые/неизвестные владельцы сохраняет.
Marker читается ограниченно, NOFOLLOW/NONBLOCK и fstat/UID; неизвестные файлы не
удаляются, symlink не обходятся. FIFO профиля также не блокирует open до fstat.

Итог повторного reviewer: **конкретных P0/P1-блокеров экспериментальной публикации
больше не найдено**. Разрешает активный канал с явной маркировкой experimental/non-beta.
Это не подтверждение реальной установки, SDK/MainApp, ABI, uplink, hard resource limits
или rollback на BMW. Наличие работающего mgu-uplink и безопасный профиль — явные
предусловия инструкции, не скрытая установка сетевой службы.

## Источники фактов

- pinned mgu-store deploy `reinstallApp`/`clearCodeCache`: persistent home/data и source/javascript/runner.
- pinned oap_link `completePermissions`, `needsShrinkwrap`, source `build` path.
- штатные lifecycle manifest/permissions/shrinkwrap из upstream waze_cluster/Store, без включения BMW SDK.
- Go `syscall/exec_linux.go`: Pdeathsig относится к creating thread.

Оставшиеся требования до beta/target-ready перечислены в packaging/CANDIDATE.md.
