# Candidate 0.2.0 — фактическая проверка, 2026-11-26

Среда: Mac M4 arm64. Доступа к машине и установки не было. Linux/amd64 — cross-build, не исполнение Linux.

- `go test -race ./...`: PASS. Добавлена проверка отмены supervisor при потере ожидаемого UI-родителя.
- `go vet ./...`: PASS.
- `python3 scripts/test-package.py`: PASS, 6/6 (синтетические ELF/notice/checksum fixtures, не запуск ELF).
- Cross-build Go supervisor darwin/arm64 + linux/amd64: PASS. Xray взят из ранее воспроизводимо собранного pinned engine v26.11.9; изменения в Xray не вносились.
- Повторная сборка обновлённого supervisor в отдельном temp-каталоге: byte-identical на обоих target. Повторная упаковка candidate: одинаковые SHA256SUMS двух пакетов и каталога.
- `python3 scripts/e2e-local.py`: PASS после исправления ожидания старта, включая SIGTERM и освобождение обоих портов; тест без нативного контроллера сохранён отдельно.
- `node scripts/test-native.cjs`: PASS, 19 проверок. Настоящий fs проверяет права, symlink и размер профиля; мок child-process проверяет stdin/аргументы, хеш, дубли запуска, остановку, redaction и shutdown. Отдельный явно поддельный RHMI/OnlineApp проверяет wiring компонентов, dedupe ACTION, RU/EN и stop-on-hide. Реальный BMW SDK здесь не выполняется.
- `python3 scripts/e2e-native.py`: PASS. Настоящий Node Control → Go supervisor → Xray → синтетический REALITY-server, только loopback. SOCKS5 + HTTP, потеря uplink без direct fallback, восстановление, отклонение неверного UUID, SIGKILL Node-адаптера → parent monitor → закрытие обоих proxy listeners.
- Во время повторного прогона выявлена гонка старого тестового ожидания: TCP connect мог попасть в краткое резервирование порта до старта Xray. Исправлено ожиданием фиксированного lifecycle сообщения перед проверкой слушателей. Это также исключает ложное принятие connection-refused за отказ неверного UUID.
- `node scripts/verify-candidate.cjs`: PASS. Размеры/хеши catalog; отсутствуют SDK, профиль и service hooks; запущена настоящая upstream validateTool с read-only fs и без deploy main; порча payload отклонена. Хеши UI metadata совпадают с packaged binaries. Настоящий upstream oap_link.build с **синтетическим** donor собрал OAP bundle дважды с одинаковыми bytes. Фиксированные UUID, source-package и icon генерируются без SDK.

Непроверенное: firmware target, настоящий donor/runtime, Linux syscalls/ABI и жёсткие лимиты, установленный Store parser и private-release auth, install/update/remove/rollback/recovery, MGU сеть/UID, real per-app proxy, rotary/touch/визуальное отображение. Загрузка draft assets не доказывает ничего из этого. Новый код ещё не прошёл независимое повторное ревью.
