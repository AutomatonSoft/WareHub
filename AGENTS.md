# AGENTS.md -- WareHub Engineering Rules

## 1. Главный принцип

WareHub - production-grade система. Любое изменение в этом репозитории должно повышать или сохранять безопасность, читаемость, поддерживаемость и масштабируемость.

Обязательные правила:

- Production важнее скорости разработки.
- Грязные временные решения запрещены, если они создают архитектурный или операционный долг без явного согласования.
- Любое изменение должно быть маленьким, проверяемым и обратимым.
- Любой агент обязан строго соблюдать scope задачи.
- Если задача не требует изменения production, stage, deploy или migrations, их трогать запрещено.
- Если информации недостаточно, агент обязан явно указать, что требуется подтверждение.
- Нельзя придумывать факты о проекте, инфраструктуре, данных или окружениях.
- Нельзя скрывать неудачные проверки, ошибки, риски и ограничения.

## 2. Архитектурные правила

- Базовый подход: Clean Architecture.
- Внутри компонентов должна соблюдаться layered architecture.
- Для внешних интеграций использовать подход Hexagonal / Ports-and-Adapters.
- Один модуль, класс, структура или функция должны иметь одну ответственность.
- Monolith-by-accident запрещен.
- God objects, god services, god modules запрещены.
- Нельзя создавать большой `utils/common` как свалку разнотипной логики.
- Нельзя писать большие функции без необходимости и без явной декомпозиции.
- Нельзя раздувать файлы без обоснованной ответственности.
- Бизнес-логика во frontend запрещена.
- Frontend отвечает только за UI, UX, формы, отображение и локальное UI-state.
- Backend и сервисы отвечают за бизнес-логику, валидацию, авторизацию, данные и интеграции.
- Infra отвечает только за запуск, окружения, deploy, routing и observability.
- Mobile не должен дублировать backend business logic.
- Shared contracts должны быть явными: API, OpenAPI, DTO, schema.
- Нельзя смешивать presentation, business logic, persistence и infra в одном месте.
- У каждого нового модуля должны быть понятные границы и явная ответственность.

## 3. Границы monorepo

### `apps/backend`

- Rust backend.
- Axum API.
- Auth, permissions и core product logic живут здесь.
- SQLx queries и migrations разрешены только для таблиц, владельцем которых является backend.
- Handlers должны быть thin.
- Бизнес-логика должна находиться в use-case, service или domain layer.
- Доступ к базе должен находиться в repository/query layer.
- Логика frontend и mobile здесь запрещена.

### `apps/frontend`

- Next.js UI.
- React components.
- TypeScript.
- Heavy business logic запрещена.
- Direct database access запрещен.
- Production secrets запрещены.
- API calls должны идти только через typed client или service layer.
- В browser bundle может попадать только `NEXT_PUBLIC_*`.
- UI не должен принимать критические бизнес-решения.

### `apps/mobile`

- Flutter client.
- Direct database access запрещен.
- Production secrets запрещены.
- Бизнес-правила должны приходить из backend/API.
- Mobile обязан использовать явные API contracts.
- Нельзя дублировать backend validation как единственный источник истины.

### `services/database-service`

- Django/DRF service.
- Разрешены только явно принадлежащие ему доменные зоны.
- Django migrations разрешены только для owned tables.
- Нельзя менять таблицы, владельцем которых является Rust backend.
- Нельзя создавать конфликтующие migrations с SQLx.

### `services/orchestrator`

- FastAPI orchestration jobs.
- Jobs должны быть idempotent.
- Retry-safe логика обязательна.
- Hidden side effects запрещены.
- Long-running jobs должны логироваться.
- External calls должны иметь timeout и retry policy.

### `infra`

- Docker Compose.
- Nginx.
- Deploy scripts.
- Env templates.
- Runtime configuration.
- Бизнес-логика здесь запрещена.
- Секреты внутри Docker images запрещены.
- Реальные `.env` в git запрещены.

### `docs`

- Architecture docs.
- ADR.
- Runbooks.
- CI/CD policies.
- Migration и rollback policies.

### `tools`

- Developer tools.
- Scripts.
- Generators.
- Automation helpers.
- Production business logic здесь запрещена.

## 3.1. Team ownership и execution boundaries

### Current operating mode

Текущий режим проекта: `single-developer`.

До отдельного явного решения о возвращении Said:

- Ravil является единственным активным implementation и review owner всего репозитория;
- Ravil может самостоятельно выполнять задачи в `apps/**`, `services/**`, `deploy/**`, `infra/**` и `.github/**`;
- агенты, работающие от имени Ravil, могут анализировать и изменять `services/**`, включая service business logic, tests, models и migrations, если это входит в явно утверждённый task scope;
- Said не получает новые WareHub-задачи и не должен автоматически назначаться reviewer;
- существующее описание Said ownership ниже считается целевой командной моделью на момент его возвращения, а не текущим активным назначением.

Этот current operating mode является явным owner override и имеет приоритет над ограничениями, запрещающими агентам Ravil изменять `services/**`.

Ограничения безопасности сохраняются независимо от operating mode:

- migrations сначала диагностируются и тестируются локально;
- server migrations требуют отдельного разрешения;
- deploy, GHCR publish, stage/prod changes требуют отдельного разрешения;
- destructive commands запрещены;
- secrets нельзя выводить или коммитить.

При возвращении Said требуется отдельный PR, который:

1. отключает `single-developer` override;
2. возвращает Said активное ownership для `services/**`;
3. обновляет `.github/CODEOWNERS`;
4. синхронизирует его новую ветку с актуальным `stage`.

### Ravil ownership

Ravil является основным владельцем следующих областей:

- `apps/backend/**`
- `apps/frontend/**`
- `apps/mobile/**`
- `deploy/**`
- `infra/**`
- `.github/**`

Ravil также отвечает за:

- CI/CD;
- Docker и Compose integration;
- GHCR publish;
- stage и production rollout;
- nginx;
- certbot;
- server configuration;
- deployment scripts;
- выполнение migrations на stage и production;
- promotion `stage -> main`;
- интеграцию изменений между `apps/**` и `services/**`.

Агенты, работающие от имени Ravil, могут анализировать и изменять эти области в пределах явно заданного task scope.

### Said ownership

Said является основным владельцем:

- `services/**`;
- `services/database-service/**`;
- `services/orchestrator/**`;
- service business logic;
- Django/DRF API;
- FastAPI service logic;
- service adapters и integrations;
- service-owned models;
- service-owned database schema;
- service-owned migrations;
- service tests.

Database ownership определяется не только каталогом, но и владельцем таблицы.

Said не должен изменять SQLx migrations или таблицы, принадлежащие `apps/backend`, без отдельного согласования с Ravil.

Агенты, работающие от имени Ravil, не должны самостоятельно реализовывать изменения внутри `services/**`, если задача явно не содержит owner override. Вместо этого агент обязан подготовить полное техническое задание для Said.

Агенты, работающие от имени Said, не должны самостоятельно изменять `apps/**`, `deploy/**`, `infra/**` или `.github/**`. Вместо этого агент обязан подготовить техническое задание для Ravil.

### Shared and cross-cutting ownership

Следующие области являются совместными:

- `AGENTS.md`;
- root `docker-compose*.yml`;
- root `.env.example`;
- `start-dev.ps1`;
- `start-dev-mac.sh`;
- root scripts;
- shared API contracts;
- OpenAPI schemas;
- root configuration;
- documentation, одновременно влияющая на `apps/**` и `services/**`.

Изменения в совместных областях требуют явного согласования scope.

Ни один агент не должен молча изменять одновременно Ravil-owned и Said-owned области.

Cross-zone изменение должно выполняться одним из способов:

1. два отдельных coordinated PR;
2. один явно согласованный integration PR;
3. отдельные commits с чётко разделённым ownership.

### Required ownership check

Перед изменением файлов агент обязан:

1. перечислить предполагаемые файлы;
2. определить владельца каждого файла;
3. подтвердить, что файлы находятся в разрешённом scope;
4. остановиться при пересечении ownership без явного approval.

Если задача находится вне ownership агента, агент обязан вернуть:

- root cause;
- требуемое изменение;
- точные файлы;
- API или data contract;
- acceptance criteria;
- validation requirements;
- полное ТЗ для соответствующего владельца.

Агент не должен выполнять изменение вне своей ownership-зоны только потому, что технически может это сделать.

## 4. OOP, SOLID и модульный дизайн

### Object-Oriented / Modular Design

- Использовать ООП и модульный дизайн там, где это уместно.
- Предпочитать composition over inheritance.
- Иерархии наследования без сильной причины запрещены.
- God classes запрещены.
- Global mutable state запрещен.
- Public APIs должны быть маленькими и явными.
- Внутренние детали реализации должны быть скрыты за interfaces, traits и adapters.
- Доменные сущности должны быть выражены явно, а не в виде случайных `dict`, `map` или строковых наборов.
- Нельзя разбрасывать business rules по controllers, components и scripts.
- Anemic architecture, где правила размазаны по случайным местам, запрещена.

### SOLID

1. Single Responsibility Principle:
   - один модуль, класс, структура или функция имеет одну причину для изменения.
2. Open/Closed Principle:
   - поведение расширяется через новые modules, strategies, traits и adapters, а не через центральные `if/else`-комбайны.
3. Liskov Substitution Principle:
   - реализации должны безопасно заменяться через объявленный interface или trait contract.
4. Interface Segregation Principle:
   - большие универсальные interfaces запрещены;
   - interfaces должны делиться по use-case.
5. Dependency Inversion Principle:
   - high-level business logic не должна напрямую зависеть от low-level infrastructure details.

### Dependency rules

- Domain и application logic не должны зависеть от деталей framework.
- Database, HTTP clients, file storage и external APIs должны быть за adapters.
- Dependency injection использовать там, где это улучшает testability и separation.
- Нельзя создавать external clients случайно внутри business logic.
- Нельзя прятать зависимости в global singletons.
- Side effects должны быть явными.

## 5. Clean Code principles

- Код должен быть простым, читаемым и намеренным.
- Имена должны объяснять смысл.
- Комментарии должны объяснять `why`, а не дублировать `what`.
- Clever code запрещен, если простое решение закрывает задачу.
- Deep nesting избегать.
- Guard clauses использовать там, где они улучшают читаемость.
- Long parameter lists избегать.
- Для сложных параметров использовать DTO или config objects.
- Boolean flags, радикально меняющие поведение функции, избегать.
- Лучше две явные функции, чем одна функция с `mode=true/false`.
- Magic numbers и magic strings запрещены.
- Использовать constants, enums и config.
- Нельзя скрывать side effects.
- Нельзя смешивать parsing, validation, business logic, persistence и presentation в одной функции.
- Любой код должен быть понятен на review без гадания.

## 6. DRY, KISS, YAGNI

### DRY

- Нельзя дублировать business rules.
- Нельзя дублировать validation logic между frontend, mobile и backend как источник истины.
- Нельзя дублировать API contracts.
- Общую логику выносить только тогда, когда duplication реальная и стабильная.
- Premature shared abstraction запрещена.

### KISS

- Выбирать самое простое решение, которое закрывает production requirement.
- Предпочитать boring и proven solutions.
- Нельзя усложнять архитектуру без необходимости.
- Любая сложность должна быть оправдана.

### YAGNI

- Нельзя строить абстракции заранее.
- Нельзя добавлять speculative features.
- Нельзя добавлять queues, plugins или frameworks без реальной необходимости.
- Каждая абстракция должна решать существующую проблему.

## 7. SRP и размер файлов

- Большие файлы допустимы только при сильной предметной причине.
- Большие файлы не должны становиться dumping ground для несвязанных обязанностей.
- При росте ответственности файл должен быть разделен по domain boundaries.
- Модуль должен быть достаточно маленьким для review и сопровождения.
- Если файл трудно объяснить кратко, его ответственность вероятно нарушена.

## 8. Backend rules

- Axum handlers должны быть thin и orchestration-only.
- Валидация входных данных обязательна.
- Authorization и permission checks обязательны для защищенных операций.
- Domain logic не должна жить в handlers.
- SQLx queries должны быть reviewable и понятными.
- `unwrap` и `expect` на production path запрещены без сильного обоснования.
- Ошибки должны быть typed и mapped в безопасные API responses.
- Long-running или side-effect-heavy операции должны выноситься из request path, если это оправдано.

## 9. Frontend rules

- Frontend не является источником бизнес-истины.
- Нельзя переносить critical business decisions в UI.
- Нельзя ходить в database напрямую.
- Секреты, токены и private credentials во frontend запрещены.
- Сетевые вызовы должны быть централизованы через typed clients или service layer.
- Компоненты должны быть маленькими и composable.
- UI-state и server-state не должны смешиваться без явной причины.
- Большие page components должны декомпозироваться.

## 10. Mobile rules

- Mobile использует backend/API как источник истины.
- Нельзя хранить production secrets в приложении.
- Нельзя дублировать backend validation как authoritative logic.
- API contracts должны быть явными и стабильными.
- Локальный кеш не должен подменять серверную консистентность.
- Ошибки синхронизации должны быть наблюдаемыми и диагностируемыми.

## 11. Service integration boundaries

- `database-service` и `backend` должны иметь явные ownership boundaries по данным и миграциям.
- Одна таблица - один migration owner.
- `orchestrator` координирует процессы, но не захватывает domain ownership чужих сервисов.
- Межсервисные контракты должны быть явными и version-aware.
- Внешние интеграции должны быть изолированы в dedicated adapters.

## 12. Database и migration ownership

- SQLx и Django migrations требуют unified ownership.
- Одна таблица должна иметь одного владельца миграций.
- Rust SQLx может быть primary migration owner для core product schema.
- Django migrations могут управлять только clearly-owned Django tables.
- Implicit production migrations на startup запрещены.
- Prod migrations разрешены только отдельным explicit pipeline или manual step.
- Перед prod migration обязателен backup.
- Destructive migrations требуют manual approval.
- Предпочтительны backward-compatible migrations.
- Нельзя удалять или переименовывать columns без staged migration plan.
- Нельзя менять типы колонок без оценки rollback.
- Нельзя выполнять destructive data migration без backup.
- Нельзя запускать migrations в production без подтверждения.

### Staged migration pattern

1. Add new nullable column or table.
2. Deploy code that writes both old and new structures if needed.
3. Backfill data.
4. Switch reads to new structure.
5. Stop using old structure.
6. Drop old structure only after separate approval.

## 13. API, DTO и contract rules

- API contracts - это product contracts.
- Request и response DTO должны быть explicit.
- Нельзя отдавать raw database models напрямую во frontend или mobile.
- Breaking API changes требуют coordinated migration или versioning.
- Frontend и mobile должны использовать typed API clients там, где это возможно.
- OpenAPI или schema drift должны проверяться в CI позже.
- API errors должны быть structured и predictable.
- Нельзя возвращать raw stack traces клиентам.
- Pagination, filtering и sorting должны быть explicit.
- DTO не должны случайно раскрывать internal или private fields.
- Backend validation обязательна, даже если frontend уже валидирует.

## 14. Error handling rules

- Silent failures запрещены.
- Нельзя swallowing exceptions без logging и context.
- Нельзя использовать raw `unwrap` или `expect` в Rust production paths без сильного обоснования.
- Generic logs без context запрещены.
- User-facing errors должны быть безопасными.
- Internal logs должны помогать debugging без утечки secrets.
- External API failures должны иметь timeout и retry behavior там, где это оправдано.
- Background jobs должны быть retry-safe и idempotent.
- Ошибки должны быть typed или structured там, где это возможно.
- Нельзя скрывать failed checks.
- Нельзя маскировать реальные проблемы фразой `works on my machine`.

## 15. Data access rules

- Direct database access from frontend and mobile запрещен.
- Backend database access должен идти через repository/query layer.
- N+1 queries избегать.
- Для multi-step state changes использовать transactions.
- Transaction scope должен быть маленьким.
- Нельзя смешивать database writes с несвязанными external side effects без consistency strategy.
- Для high-traffic queries нужны явные indexes.
- Все destructive operations должны быть intentional и auditable.
- Queries должны быть reviewable.
- Raw SQL без необходимости использовать нельзя, если есть безопасный typed вариант.
- Если raw SQL нужен, он должен быть понятным, параметризованным и безопасным.

## 16. Integration rules

- Marketplace и third-party integrations должны быть изолированы.
- External API clients должны жить в dedicated integration/adapters modules.
- Marketplace-specific logic не должна быть разбросана по UI или core domain.
- Каждый внешний запрос должен иметь timeout.
- Retries должны быть bounded.
- Для sync, import и export jobs обязательна idempotency.
- Rate limits должны соблюдаться.
- Credentials разрешены только из environment или secrets storage.
- Credentials в code, docs или logs запрещены.
- Integration failures должны быть observable.
- Mapping и transformation logic должны быть testable.
- Long imports и exports должны быть resumable или безопасно повторяемыми.

## 17. Secrets и security

- Никогда не коммитить `.env`.
- Никогда не коммитить `.env.local`.
- Никогда не коммитить `.env.stage`.
- Никогда не коммитить `.env.prod`.
- Разрешен только `.env.example`.
- Private keys, certs и tokens в repo запрещены.
- Secrets в logs запрещены.
- Secrets во frontend bundle запрещены.
- Secrets inside Docker images запрещены.
- Production secrets должны быть изолированы от stage.
- Целевые GitHub Environments:
  - `stage`
  - `production`
- Если секрет раскрыт, он подлежит ротации.
- Старый `sofortbot-infra/.env` уже появлялся в git history; значения из него считаются кандидатами на ротацию до production cutover.
- Обязателен principle of least privilege.
- SSH keys должны быть environment-specific.
- Registry tokens должны быть minimally scoped.
- Database users должны иметь только необходимые права.
- Нельзя вставлять secrets в issues, PRs, docs или prompts.
- Если секрет найден в repo, history или logs, работу надо остановить и явно сообщить о риске.

## 18. CI/CD и environments

- GitHub является canonical platform.
- Разрешенные ветки:
  - `main`
  - `stage`
  - `feature/*`
  - `fix/*`
  - `hotfix/*`
  - `integration/*`
  - `said/*`
  - `docs/*`
- Flow:
  - `feature/*` -> PR -> `stage`
  - `said/*` -> PR -> `stage`
  - `integration/*` -> PR -> `stage`
  - `docs/*` -> PR -> `stage`
  - `stage` -> PR -> `main`
  - `hotfix/*` -> PR -> `main` -> back-merge `main` to `stage`
- Старая legacy-ветка `SAID` заморожена и не должна использоваться для новой работы.
- Новые ветки Said обязаны использовать формат `said/<task-name>`.
- Direct push в `said/*` другим разработчиком запрещён без согласования с Said.
- Force-push в team branches запрещён.
- Direct push в `main` запрещен.
- Direct push в `stage` запрещен.
- Перед merge обязательны required checks.
- Stage deploy должен быть automatic after merge to `stage`.
- Production deploy должен быть только после manual approval и только после merge to `main`.
- Fully automatic production deploy запрещен.
- Для audited releases deploy по тегу `latest` запрещен.
- Использовать immutable version tags:
  - `v1.0.0`
  - `v1.0.0-rc.1`
- Каждый production deploy обязан иметь:
  - version
  - validation
  - backup status
  - migration status
  - healthcheck
  - rollback plan

## 19. Docker и infra rules

- Stage и prod на одном сервере требуют жесткой изоляции.
- Использовать explicit compose project names:
  - `warehub_stage`
  - `warehub_prod`
- Должны быть разделены:
  - ports
  - networks
  - volumes
  - env files
  - DBs
  - backup dirs
- Shared writable volumes между stage и prod запрещены без явного обоснования.
- Dockerfiles должны быть минимальными и воспроизводимыми.
- Secrets внутри images запрещены.
- Healthchecks обязательны для deploy validation.
- `docker compose config` должен проходить перед deploy.
- Infra scripts должны быть idempotent там, где это возможно.
- Infra changes должны иметь rollback notes.
- Nginx changes должны быть validated before reload.

## 20. Testing и quality gates

- Каждое осмысленное изменение должно иметь validation.

### Backend

- `cargo check`
- `cargo test`
- `cargo clippy`
- `cargo fmt`

### Frontend

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- tests where available

### Services

- `python -m compileall`
- framework checks
- tests where available

### Mobile

- `flutter analyze`
- `flutter test` where available

### Infra

- `docker compose config`
- nginx config validation where applicable

Обязательные правила:

- Если tests отсутствуют, нельзя фальсифицировать успех.
- Отсутствующие tests должны быть документированы.
- Для deploy slices обязательны smoke checks.
- Выполненные проверки должны быть указаны в отчете агента.
- Нельзя писать `done`, если проверки не запускались.

## 21. Logging и observability

- Structured logs обязательны.
- Шумные debug logs в production запрещены.
- Secrets и PII в logs запрещены.
- Errors должны содержать достаточный context.
- Health endpoints обязательны для сервисов.
- Сбои внешних интеграций должны быть видимыми.
- Background jobs должны показывать state и progress там, где это уместно.
- Logs должны помогать диагностике без раскрытия чувствительных данных.
- Sentry и monitoring integration не должны утекать secrets.

## 22. Performance rules

- Избегать N+1 queries.
- Для списков использовать pagination.
- У внешних запросов должны быть timeouts.
- Blocking operations в async handlers запрещены без обоснования.
- Крупные background jobs должны быть queued или orchestrated.
- Frontend должен избегать unnecessary re-renders.
- Oversized frontend bundles запрещены.
- Queries по большим таблицам требуют indexes.
- Нельзя загружать неограниченные datasets в memory.
- Для больших imports и exports использовать streaming или batching.
- Performance-sensitive изменения требуют measurement или явного reasoning.

## 23. Documentation rules

- Architecture decisions должны фиксироваться в `docs/adr`.
- Runbooks должны находиться в `docs/runbooks`.
- CI/CD documentation должна находиться в `docs/ci-cd`.
- Сложные изменения требуют объяснения.
- Любое production-impacting change требует rollback notes.
- Docs должны обновляться вместе с code changes, если поведение или архитектура изменились.
- Docs не должны содержать secrets.
- Docs обязаны различать current state и target state.
- Если что-то неизвестно, помечать как `Needs confirmation`.
- Если что-то не найдено, помечать как `Not found`.

## 24. Refactoring rules

- Refactoring должен быть безопасным и контролируемым.
- Нельзя рефакторить unrelated areas во время feature work.
- Нельзя совмещать большой refactor с production deploy.
- Поведение должно сохраняться, если задача явно не меняет поведение.
- Перед refactor нужно зафиксировать current behavior и acceptance criteria.
- После refactor нужно запускать релевантные checks.
- Большие файлы делить по ответственности, а не случайным образом.
- Предпочтительна incremental migration вместо big bang rewrite.
- Silent behavior changes запрещены.
- Refactor PR обязан объяснять risk и validation.

## 25. Code review rules

- Каждый PR должен быть reviewable.
- Маленькие PR предпочтительны.
- PR title обязан описывать outcome.
- PR обязан указывать risk level.
- PR обязан указывать validation commands.
- Для production-impacting changes PR обязан указывать rollback notes.
- Hidden behavior changes запрещены.
- Unrelated formatting noise запрещен.
- Generated files запрещены, если они не требуются задачей.
- Merge запрещен, если required checks failed.
- Merge запрещен, если scope неясен.

## 26. File и naming rules

- Имена должны быть описательными и domain-aware.
- Нельзя использовать расплывчатые имена:
  - `data`
  - `item`
  - `temp`
  - `stuff`
  - `helper`
  - `manager`
  без явного обоснования.
- Большие `utils/common` файлы запрещены.
- Предпочтительны feature-specific и domain-specific модули.
- Naming должно быть консистентным между backend, frontend, mobile и services.
- Имя файла должно отражать ответственность.
- DTO names должны отражать направление API:
  - `CreateProductRequest`
  - `ProductResponse`
  - `UpdateInventoryCommand`
- Misleading names запрещены.
- При смене ответственности имя должно быть пересмотрено.

## 27. Safe-slice workflow

- Работать нужно маленькими безопасными slices.
- Один slice = одна ясная цель.
- Каждый slice обязан содержать:
  - goal
  - files changed
  - validation commands
  - acceptance criteria
  - rollback plan
- Нельзя объединять в одном slice:
  - refactor
  - feature
  - deploy
  - migration
  если это не согласовано явно.
- Предпочтительны reversible changes.
- Изменения в production и stage требуют explicit approval.
- Миграция в monorepo должна идти в контролируемых slices:
  1. skeleton/docs
  2. copy code excluding secrets/artifacts
  3. fix paths/local dev
  4. CI only
  5. stage deploy
  6. backup + explicit migrations
  7. prod deploy with manual approval
  8. archive old repos

## 28. Что агентам запрещено

- Не трогать production без explicit approval.
- Не трогать stage без explicit approval.
- Не деплоить без явного запроса.
- Не запускать migrations без явного запроса.
- Не редактировать реальные `.env` файлы.
- Не создавать реальные `.env` файлы.
- Не коммитить secrets.
- Не создавать CI/CD workflows до запрошенного slice.
- Не копировать историю старых repo.
- Не вводить монолитные границы.
- Не переносить business logic во frontend.
- Не удалять функциональность молча.
- Не делать unrelated improvements.
- Не скрывать failed checks.
- Не фальсифицировать test results.
- Не заявлять production readiness без validation.
- Не менять architecture boundaries без документированного объяснения.
- Не модифицировать database schema вне migration policy.
- Не добавлять зависимости без причины.
- Не использовать image tags `latest` для audited releases.
- Не хранить secrets в Docker images.
- Не раскрывать production credentials в local, dev или stage.

## 29. Required response format for agents

При завершении задачи агент обязан сообщить:

- Summary.
- Files changed.
- Directories changed.
- Validation commands run.
- Validation results.
- Tests/checks not run and why.
- Risks.
- Rollback notes.
- Production/stage impact.
- Next recommended step.

Если задача не меняла код, агент все равно обязан указать:

- what was changed;
- what was not touched;
- what remains for next slice.

## 30. Definition of Done

Задача считается выполненной только если:

- Scope соблюден.
- Код или документация соответствуют архитектуре.
- В изменениях нет secrets.
- Нет лишних файлов.
- Нет unrelated changes.
- Проверки выполнены или честно указано, почему они не выполнены.
- Нет production side effects.
- Нет stage side effects.
- Rollback понятен.
- Изменения можно review через PR.
- Документация обновлена, если изменение влияет на архитектуру, deploy или migrations.
- Агент предоставил итоговый отчет в required response format.
