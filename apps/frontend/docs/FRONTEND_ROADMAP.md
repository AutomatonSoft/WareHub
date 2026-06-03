# Frontend Roadmap (Фаза 2)

## Цель
Повысить качество `sofortbot-frontend` по скорости UX, надежности, безопасности данных и удобству сопровождения после первой волны рефакторинга.

## Порядок выполнения

1. [P0] Глобальный Error Boundary + единый стандарт Empty/Error состояний
- Scope: error boundaries на уровне приложения/роутов (`error.tsx`), единые блоки retry и консистентные empty/error компоненты на ключевых страницах.
- Done when: на каждой критичной странице есть предсказуемый fallback UI и действие повторного запроса.
- Status: Done (2026-05-05)

2. [P0] Внедрить React Query (или аналог) для server state
- Scope: заменить ручную логику fetch/loading/error на тяжелых страницах (Inventory, Sofort list, XL/JV, Hood, Profile) на общий слой кэша/инвалидации.
- Done when: дедупликация запросов, фоновое обновление, инвалидация кэша и optimistic updates стандартизированы.
- Status: Done (2026-05-05)

3. [P0] Реальная пагинация/виртуализация для больших таблиц
- Scope: таблицы с большим объемом данных (`Inventory`, `Sofort list`) с виртуализацией и стабильной стратегией высоты строк.
- Done when: плавный скролл и интерактивность при 5k+ строк без фризов UI.
- Status: Done (2026-05-05)

4. [P1] Дизайн-токены + правила вариантов компонентов
- Scope: формализовать токены (отступы, радиусы, шкала шрифтов, уровни поверхностей, state-цвета) и матрицу вариантов Button/Input/Card/Table.
- Done when: нет ad-hoc дублирования стилей, все базовые компоненты используют только общие токены.
- Status: Done (2026-05-05)

5. [P1] Усилить UX форм через общий слой валидации
- Scope: единая клиентская валидация, inline-ошибки, блокировка submit, dirty-state tracking и единые success/error тосты.
- Done when: все основные формы работают по одинаковым правилам валидации и обратной связи.
- Status: Done (2026-05-05)

6. [P1] Расширенные фильтры (пресеты и сохраненные фильтры)
- Scope: добавить сохраненные пресеты фильтров для Inventory/Sofort list/Marketplace с URL-синхронизацией и быстрым восстановлением.
- Done when: пользователь может сохранять, переименовывать, применять и очищать пресеты; пресеты живут в рамках пользовательской сессии.
- Status: Done (2026-05-05)

7. [P1] Аудит доступности: проход 2 (WCAG 2.2)
- Scope: формулировки для screen-reader, проверки keyboard trap, порядок фокуса, edge-cases по контрасту и корректность aria-live.
- Done when: автоматические проверки + ручной keyboard/screen-reader smoke pass для ключевых маршрутов.
- Status: Done (2026-05-05)

8. [P2] Бюджет производительности + контроль bundle split
- Scope: анализ бандлов по роутам, dynamic import для тяжелых панелей, политика по image budget и проверка стоимости гидратации.
- Done when: заданный performance budget контролируется в CI, а самые тяжелые маршруты ощутимо облегчены.
- Status: Done (2026-05-05)

9. [P2] Полная UX-телеметрия (наблюдаемость фронта)
- Scope: клиентский error reporting, тайминги пользовательских действий, метрики задержек таблиц и инструментирование критических flow.
- Done when: есть дашборд по фронтовым ошибкам/латентности, а топ-регрессии быстро диагностируются.
- Status: Done (2026-05-05)

10. [P2] Визуальная регрессия + расширение E2E
- Scope: screenshot-based regression тесты для основных страниц и расширение e2e на create/edit/delete и межканальные сценарии.
- Done when: CI блокирует визуальные поломки, а ключевые бизнес-flow покрыты глубже, чем smoke-тесты.
- Status: Done (2026-05-05)

## Режим работы
- Выполняем строго по порядку.
- Каждый пункт заканчивается: изменениями в коде + тестами + короткой записью в changelog.
- Если для пункта нужна архитектурная поблажка, сначала оформляем ADR.

---

# Frontend Roadmap (Фаза 3)

1. [P0] CI для e2e и visual regression
- Scope: включить e2e smoke и visual regression в GitHub Actions, добавить сохранение артефактов Playwright.
- Done when: workflow запускает quality + e2e smoke, а visual suite включается флагом (`E2E_VISUAL=1`) и публикует артефакты.
- Status: Done (2026-05-05)

2. [P1] Зафиксировать baseline visual snapshots
- Scope: сгенерировать и закрепить эталонные скриншоты для ключевых страниц в стабильном CI-окружении.
- Done when: визуальные диффы детектируются детерминированно, без флак.
- Status: Done (2026-05-05)

3. [P1] OpenAPI-first typed frontend client
- Scope: генерация типизированного API-клиента из OpenAPI и вынос ручных fetch-типов.
- Done when: ключевые feature-модули используют единый сгенерированный client/типы.
- Status: Done (2026-05-05)

4. [P1] CI-проверка полноты i18n ключей
- Scope: автоматическая проверка соответствия ключей между `en/ru/de` словарями.
- Done when: пропущенные переводы блокируют CI.
- Status: Done (2026-05-05)

5. [P2] E2E на create/edit/delete с изолированными тест-данными
- Scope: углубить сценарии CRUD с безопасной фикстурой данных и cleanup.
- Done when: критические user-flow покрыты end-to-end без ручной подготовки.
- Status: Done (2026-05-05)

---

# Frontend Roadmap (Фаза 4)

1. [P0] Стабилизация e2e в CI (suite split + retries)
- Scope: разделить e2e на smoke/visual/mutation наборы, добавить retries и контролируемый параллелизм для CI.
- Done when: каждый набор запускается отдельным job, флаки снижены, артефакты сохраняются по наборам.
- Status: Done (2026-05-05)

2. [P1] OpenAPI drift-check в CI
- Scope: проверять, что сгенерированные типы синхронизированы с OpenAPI-схемой.
- Done when: CI падает при рассинхронизации schema/types.
- Status: Done (2026-05-05)

3. [P1] A11y automation (axe)
- Scope: добавить автоматические accessibility проверки ключевых страниц в e2e.
- Done when: критические a11y-regressions блокируют PR.
- Status: Done (2026-05-05)

4. [P1] Frontend observability dashboard
- Scope: собрать рабочие дашборды по UI errors/latency в Sentry.
- Done when: есть живые панели для triage регрессий.
- Status: Done (2026-05-05)

5. [P2] i18n cleanup и словарные snapshot-тесты
- Scope: очистить проблемные локализации и добавить snapshot/структурные тесты словарей.
- Done when: словари стабильны и изменения контролируются тестами.
- Status: Done (2026-05-05)

---

# Frontend Roadmap (Фаза 5)

1. [P0] Реальные baseline visual snapshots в репо
- Scope: зафиксировать эталонные скриншоты для visual-regression e2e и контролировать их наличие.
- Done when: baseline-файлы присутствуют в `e2e/__screenshots__/...` и проверка baseline проходит.
- Status: Done (2026-05-06)

2. [P0] Уборка i18n-кодировки (моджибейк)
- Scope: очистить битые/нечитабельные строки переводов в `ru/de`.
- Done when: пользовательские тексты читаемы, без поломок кодировки.
- Status: Done (2026-05-06)

3. [P1] Unified API client layer
- Scope: добавить единый typed request wrapper поверх OpenAPI типов и постепенно убрать разрозненные fetch-слои.
- Done when: ключевые feature API модули используют единый client.
- Status: Done (2026-05-06)

4. [P1] Error-code contract mapping
- Scope: единый словарь `backend error code -> UI message`.
- Done when: критичные флоу показывают стандартизированные сообщения ошибок.
- Status: Done (2026-05-06)

5. [P2] Performance regression test в CI
- Scope: автоматическая проверка деградации производительности ключевых страниц.
- Done when: регрессии latency/Web Vitals обнаруживаются до merge.
- Status: Done (2026-05-06)

---

# Frontend Roadmap (Фаза 6)

1. [P0] Стандартизировать локальный запуск E2E (env + инструкция)
- Scope: явный шаблон `E2E_LOGIN/E2E_PASSWORD` в `.env.example` и краткая инструкция запуска в README.
- Done when: разработчик без поиска по чату может запустить `test:e2e:smoke` локально.
- Status: Done (2026-05-06)

2. [P0] Единый Table layout contract для всех листингов
- Scope: унифицировать ширины/выравнивание/overflow/ellipsis для Inventory/Sofort list/Marketplace.
- Done when: нет выезда текста за ячейки и нет "пустых дыр" по ширине на desktop.
- Status: Done (2026-05-06)

3. [P1] Sticky header + sticky first columns в больших таблицах
- Scope: закрепить заголовок и ключевые колонки (`PLACE`, `KID`) при вертикальном/горизонтальном скролле.
- Done when: навигация по 1000+ строк остаётся читаемой без потери контекста.
- Status: Done (2026-05-06)

4. [P1] Массовые действия для листингов
- Scope: checkbox selection + bulk actions (выставить/снять, экспорт, смена room/type).
- Done when: операции над группой позиций выполняются за 1-2 действия.
- Status: Done (2026-05-06)

5. [P1] Серверная сортировка и фильтрация по контракту API
- Scope: убрать клиентские "тяжёлые" операции там, где есть backend-поддержка query params.
- Done when: сортировка/фильтры стабильны на больших объёмах и соответствуют backend source of truth.
- Status: Done (2026-05-06)

6. [P1] Плотный mobile/tablet режим для таблиц
- Scope: адаптивная стратегия (card rows на mobile, compact table на tablet).
- Done when: критичные сценарии доступны без горизонтального скролла на популярных ширинах.
- Status: Done (2026-05-06)

7. [P2] UX-полировка поиска
- Scope: дебаунс, подсветка совпадений, clear button, сохраняемый последний запрос по странице.
- Done when: поиск быстрее и предсказуемее, без лишних ререндеров.
- Status: Done (2026-05-06)

8. [P2] Экспорт CSV/XLSX с текущими фильтрами
- Scope: кнопка экспорта, формирование файла по текущему состоянию таблицы и фильтров.
- Done when: пользователь выгружает актуальную выборку без ручной подготовки.
- Status: Done (2026-05-06)

9. [P2] Skeleton/loading states для всех тяжёлых экранов
- Scope: унифицированные skeleton-блоки вместо "прыжков" интерфейса.
- Done when: perceived performance лучше, CLS ниже.
- Status: Done (2026-05-06)

10. [P2] Storybook для ключевых UI-компонентов
- Scope: вынести базовые состояния Button/Input/TableRow/Filters в Storybook.
- Done when: визуальные регрессии ловятся раньше, а UI-изменения обсуждаются на изолированных примерах.
- Status: Done (2026-05-06)

---

# Frontend Roadmap (Фаза 7)

1. [P0] Реальный backend-контракт для room/type/listing фильтров
- Scope: передавать `room/type/listing/sort/dir` в API и использовать серверную фильтрацию/сортировку, сохраняя безопасный клиентский fallback.
- Done when: запросы таблицы отправляют все активные фильтры в backend query params.
- Status: Done (2026-05-06)

2. [P0] Персистентные bulk-операции через API
- Scope: массовые изменения должны фиксироваться на backend, а не только в UI-state.
- Done when: bulk update отражается после refresh.
- Status: Done (2026-05-06)

3. [P1] E2E покрытие новых table-flow
- Scope: тесты на search/filter/sort/bulk/export/mobile-карточки.
- Done when: критические сценарии Фазы 6-7 покрыты в e2e.
- Status: Done (2026-05-06)

---

# Frontend Roadmap (Фаза 8)

1. [P0] Интегрировать advanced Sofort-list e2e в smoke-suite CI
- Scope: включить `e2e/sofort-list-advanced.spec.ts` в `test:e2e:smoke`, чтобы регрессии table-flow ловились на каждом PR.
- Done when: smoke-suite стабильно запускает этот spec локально и в CI.
- Status: Done (2026-05-07)

2. [P1] Усилить auth helper для e2e (диагностика неуспешного логина)
- Scope: расширить `e2e/helpers/auth.ts` понятной диагностикой причин, почему логин не прошёл.
- Done when: при падении логина видно причину (HTTP/валидация/редирект), а не общий timeout.
- Status: Done (2026-05-07)

3. [P1] Разнести table-flow e2e по отдельному npm script
- Scope: добавить отдельный script (`test:e2e:table`) для быстрого локального прогона таблиц.
- Done when: table regressions можно гонять отдельно без полного smoke.
- Status: Done (2026-05-07)

---

# Frontend Roadmap (Phase 9)

1. [P0] E2E preflight before smoke/table
- Scope: add mandatory preflight checks for frontend/backend reachability and `E2E_LOGIN/E2E_PASSWORD`.
- Done when: `test:e2e:smoke` and `test:e2e:table` fail early with clear setup errors.
- Status: Done (2026-05-07)

2. [P1] Smoke for backend health fallback in UI shell
- Scope: ensure UI shows explicit error-state when backend is unavailable.
- Done when: graceful-degradation regressions are caught in e2e.
- Status: Done (2026-05-07)

3. [P1] Flaky tests retry-profile isolation
- Scope: move unstable tests into dedicated Playwright project with tuned retry/timeout.
- Done when: fewer false-positive CI failures while smoke remains strict.
- Status: Done (2026-05-07)

4. [P1] Query params contract checks for tables
- Scope: validate URL and backend request sync for `q/filter/sort/page`.
- Done when: URL-state vs API-state mismatch is detected automatically.
- Status: Done (2026-05-07)

5. [P1] Mobile table snapshots
- Scope: add mobile visual baselines for Inventory and Sofort list.
- Done when: mobile layout/card regressions block CI.
- Status: Done (2026-05-07)

6. [P2] A11y smoke for filters/tables
- Scope: focused keyboard/aria tests for table toolbar + filter controls.
- Done when: critical table a11y regressions are caught before merge.
- Status: Done (2026-05-07)

7. [P2] Export files format/encoding
- Scope: automated checks for headers/UTF-8 BOM/types for CSV/XLS export.
- Done when: export regressions are caught by unit/e2e tests.
- Status: Done (2026-05-07)

8. [P2] Table-filter interaction performance test
- Scope: measure interaction latency (search/filter) in e2e perf suite.
- Done when: baseline interaction budget exists.
- Status: Done (2026-05-07)

9. [P2] E2E debugging runbook docs
- Scope: add diagnostics steps (auth, proxy, ports, traces).
- Done when: newcomers can localize e2e failures quickly.
- Status: Done (2026-05-07)

10. [P2] CI artifacts naming convention
- Scope: unify Playwright trace/video/screenshot artifact names by suite/job.
- Done when: CI triage is faster due to predictable artifact structure.
- Status: Done (2026-05-07)

---

# Frontend Roadmap (Phase 10)

1. [P0] Single auth helper across all e2e smoke specs
- Scope: remove duplicated login/env checks and use only `e2e/helpers/auth.ts`.
- Done when: login flow and auth diagnostics are centralized.
- Status: Done (2026-05-07)

2. [P1] Stabilize channels smoke selectors
- Scope: replace fragile placeholder selectors with role/label/test-id.
- Done when: channels smoke is stable locally and in CI.
- Status: Done (2026-05-07)

3. [P1] Extract page-object helpers for Inventory/Sofort list
- Scope: reusable filter/sort/export commands in `e2e/helpers`.
- Done when: duplicated table e2e code is reduced and easier to maintain.
- Status: Done (2026-05-07)

4. [P1] Normalize locale/timezone in e2e reports
- Scope: unified env output (locale/timezone/baseURL) in preflight.
- Done when: regional mismatch triage is faster.
- Status: Done (2026-05-07)

5. [P1] Retry degradation control
- Scope: CI metric for retries and failures in flaky pool.
- Done when: instability trend is visible and controlled.
- Status: Done (2026-05-07)

6. [P2] Export contract unit tests (pure)
- Scope: pure unit tests for CSV/XML builder functions.
- Done when: export format validation runs fast outside browser.
- Status: Done (2026-05-07)

7. [P2] Snapshot budget for visual suite
- Scope: limits for snapshot artifact size/count.
- Done when: sudden artifact growth is detected in CI.
- Status: Done (2026-05-07)

8. [P2] Document tagging policy (`@flaky`, `@slow`, `@visual`)
- Scope: unified test tagging rules.
- Done when: new tests consistently land in the right suite.
- Status: Done (2026-05-07)

9. [P2] Route-level network mocking utilities
- Scope: helpers for controlled network failures/timeouts in e2e.
- Done when: negative scenarios are faster to write and clearer.
- Status: Done (2026-05-07)

10. [P2] CI summary markdown for e2e jobs
- Scope: concise automatic GitHub Actions summary for suite results/artifacts.
- Done when: e2e status is readable without opening every job.
- Status: Done (2026-05-07)


---

# Frontend Roadmap (Phase 11: Visual Upgrade)

1. [P0] Unified design token system
- Scope: standardize tokens for color, typography, spacing, radius, shadows and surface layers.
- Done when: base UI components use design tokens only, without ad-hoc values.
- Status: In progress (2026-05-07)

2. [P1] Typography hierarchy
- Scope: unified heading/body scale, line-height rhythm and readability across tables/forms.
- Done when: visual hierarchy is consistent on all key pages.
- Status: In progress (2026-05-07)

3. [P1] State color system
- Scope: unify default/hover/active/disabled/focus/success/warning/error palette behavior.
- Done when: same states look the same across the app.
- Status: In progress (2026-05-07)

4. [P1] Table and card polish
- Scope: reduce visual noise, align spacing, borders, shadows and content density.
- Done when: listings look clean and balanced on desktop/tablet.
- Status: Done (2026-05-07)

5. [P1] Loading/empty/error visual states
- Scope: unified skeleton/empty/error states with no layout shift.
- Done when: transitions between states feel smooth and stable.
- Status: Done (2026-05-07)

6. [P1] Interactive control states
- Scope: standardize hover/focus/pressed/disabled for Button/Input/Select/Filters.
- Done when: control feedback is consistent and predictable.
- Status: Done (2026-05-07)

7. [P2] Sidebar/Header visual refresh
- Scope: improve hierarchy, active states, density and alignment.
- Done when: navigation is faster to scan and looks more modern.
- Status: Done (2026-05-07)

8. [P2] Form visual unification
- Scope: common field heights, label/help/error structure, and vertical rhythm.
- Done when: forms look cohesive and easier to scan.
- Status: Done (2026-05-07)

9. [P2] Responsive visual strategy
- Scope: improve mobile/tablet layouts, compact states and complex block wrapping.
- Done when: UI stays stable on common screen widths.
- Status: Done (2026-05-07)

10. [P2] Micro-animations
- Scope: add subtle animations for enters/switches/filter interactions without overload.
- Done when: UI feels alive while staying fast.
- Status: Done (2026-05-07)

---

# Frontend Roadmap (Фаза 12: Visual Polish RU)

1. [P0] Переключатель языка в Header
- Scope: добавить в `AppHeader` компактный language switch (`EN/RU/DE`) с сохранением выбора и мгновенным обновлением `useLabels`.
- Done when: язык меняется из хедера на любой странице без перезагрузки и сохраняется между сессиями.
- Status: Done (2026-05-07)

2. [P0] Ровные и красивые Skeleton-состояния
- Scope: унифицировать skeleton-компоненты по размерам/радиусам/отступам для таблиц, карточек и форм; убрать визуальные «скачки».
- Done when: loading-state выглядит аккуратно и одинаково во всех ключевых экранах.
- Status: Done (2026-05-07)

3. [P0] Исправить горизонтальный overflow при 100% scale
- Scope: найти и убрать блоки, которые выталкивают layout вправо (toolbar/filter/table/header), добавить безопасные ограничения ширины.
- Done when: на 100% масштабе нет горизонтального скролла на основных страницах.
- Status: Done (2026-05-07)

4. [P1] Снижение визуального шума
- Scope: уменьшить лишние бордеры/тени/контрастные фоны, выровнять плотность и иерархию акцентов.
- Done when: интерфейс выглядит чище, спокойнее и легче читается.
- Status: Done (2026-05-07)

5. [P1] Красивые анимации интерфейса
- Scope: добавить мягкие page/section enter-анимации, улучшить переходы dropdown/filter/modal без перегруза.
- Done when: интерфейс ощущается «живым», но быстрым и не отвлекающим.
- Status: Done (2026-05-07)

6. [P1] Иконки и единый стиль иконографии
- Scope: привести размеры/толщину/цвет иконок к одному стандарту, добавить недостающие иконки в toolbar/карточки/статусы.
- Done when: иконки визуально консистентны и помогают быстрее сканировать UI.
- Status: Done (2026-05-07)

7. [P1] Полировка Header/Sidebar композиции
- Scope: улучшить композицию верхней панели и навигации: ритм отступов, баланс блоков, читаемость на tablet/mobile.
- Done when: navigation и header выглядят собранно на всех разрешениях.
- Status: Done (2026-05-07)

8. [P2] Премиальные пустые состояния (Empty States)
- Scope: добавить аккуратные иллюстрированные/иконные empty-блоки с полезными действиями.
- Done when: пустые страницы не выглядят «сломанными» и направляют пользователя к действию.
- Status: Done (2026-05-07)

9. [P2] Визуальная система статусов (success/warning/error/info)
- Scope: унифицировать плашки, бейджи и inline-статусы по цветам, контрасту и типографике.
- Done when: статусы сразу распознаются и не конфликтуют между экранами.
- Status: Done (2026-05-07)

10. [P2] Визуальная консистентность модалок
- Scope: привести все модальные окна к единому стилю (структура, кнопки, отступы, анимация появления/закрытия).
- Done when: модальные окна выглядят как единая система, без «разных стилей» в разных разделах.
- Status: Done (2026-05-07)


---

# Frontend Roadmap (Фаза 13: Visual Quality 2.0)

1. [P0] Переключатель плотности интерфейса (Comfortable/Compact)
- Scope: добавить в header toggle плотности, сохранить выбор в localStorage и применить глобально к таблицам/контролам.
- Done when: пользователь переключает плотность в 1 клик, и состояние сохраняется между сессиями.
- Status: Done (2026-05-07)

2. [P1] Градиентные поверхности нового уровня
- Scope: сделать аккуратные layered background-секции для страниц Inventory/Sofort/Marketplace.
- Done when: экраны визуально глубже, но без потери читаемости.
- Status: Done (2026-05-12)

3. [P1] Улучшение типографики в таблицах
- Scope: усилить иерархию заголовков/данных/вторичного текста, унифицировать line-height в строках таблиц.
- Done when: таблицы легче сканируются взглядом.
- Status: Planned

4. [P1] Визуальные разделители и групповка фильтров
- Scope: разделить primary/secondary фильтры и добавить более явные группы управления.
- Done when: панель фильтров воспринимается как структурированный блок, а не «лента кнопок».
- Status: Planned

5. [P1] Hover-preview улучшения для карточек товара
- Scope: сделать единый hover preview pattern (фото/быстрые детали) без резких скачков layout.
- Done when: preview-интеракции плавные и предсказуемые.
- Status: Planned

6. [P2] Empty-state иллюстрации по разделам
- Scope: разные тематические empty-state визуалы для Inventory/Sofort/Marketplace.
- Done when: пустые состояния имеют контекст страницы.
- Status: Planned

7. [P2] Микроанимации для сортировок и фильтров
- Scope: мягкие анимации для смены сортировки/применения фильтра/изменения row-count.
- Done when: действия ощущаются живыми, без лишней перегрузки.
- Status: Planned

8. [P2] Унификация отступов на desktop 1366/1536/1920
- Scope: выровнять горизонтальные ритмы page container/toolbar/table/shell на основных desktop ширинах.
- Done when: нет ощущений «слишком пусто» или «слишком плотно» между блоками.
- Status: Planned

9. [P2] Визуальный polish для скролл-зон
- Scope: единый стиль scrollbar + тени краёв для длинных таблиц/панелей.
- Done when: зоны прокрутки выглядят аккуратно и читаемо.
- Status: Planned

10. [P2] Финальный visual QA чек-лист
- Scope: пройти чек-лист по контрасту, фокусу, выравниванию, переполнению и адаптиву на ключевых страницах.
- Done when: визуальные баги собраны в 0 для критичных flow.
- Status: Planned









