# Покрытие сценариев keep-in-touch (задача 6.2)

Все 48 сценариев из `specs/keep-in-touch/spec.md` и то, чем покрыт каждый. Составлено 2026-10-31.

Обозначения:

- **unit** - `pnpm test`, чистые функции и валидация, база не нужна
- **integ** - `pnpm test`, `tests/contact-scenario.test.ts`, реальная локальная база
- **ssr** - `pnpm test`, `tests/reminders-block.test.ts`, серверная разметка блока
- **e2e** - `pnpm test:e2e`, HTTP-запросы к запущенному приложению, формы как без JS
- **руками** - проверено в браузере (Claude in Chrome, прод-сборка, локальная сид-база, 2026-10-31)

| № | Сценарий | Чем покрыт |
|---|----------|-----------|
| 1 | Контакт без частоты | unit `validation.test.ts` («saves a contact without a cadence»); integ «orders the block» (контакт без частоты не в блоке) |
| 2 | Существующие контакты после выкатки | **автотеста пока нет** (нужна база «до миграции»): тест на временной базе - задача «Проверка миграций на данных до выкатки» в `specs/backlog.md`; на проде это не проверяем; локально миграция применена, старые контакты получили `NULL` (задача 2.1) |
| 3 | Частота в форме создания | e2e «creates a contact with the weekly frequency» |
| 4 | Смена частоты в карточке | integ «changes the frequency from the card and recounts the term»; e2e «changes the frequency in the card without JavaScript» |
| 5 | Дата не указана | unit «requires a date for a specific date» |
| 6 | Дата в прошлом | unit «rejects a past date when creating»; e2e «a specific date in the past is refused» |
| 7 | Правка контакта с прошедшей датой | integ «saves a contact with a passed date after only its phone is edited»; unit «lets the saved past date pass» |
| 8 | Повторное сохранение частоты в карточке | unit «validates the frequency form of the card the same way»; integ «keeps a saved past date when the frequency form of the card is sent again unchanged» |
| 9 | Замена прошедшей даты на другую прошедшую | unit «rejects replacing the saved past date with another past date» |
| 10 | Смена даты на период | integ «switches from a specific date to a period and drops the date»; unit «accepts every period and drops a stray date» |
| 11 | Новая заметка | integ «keeps the cadence after a new note and starts the term again» (срок = сегодня + месяц) |
| 12 | Правка старой заметки | integ «does not move the term when an old note is edited» |
| 13 | Контакт без заметок | unit `dueDate` («counts a contact without notes from its creation»); integ «counts a contact without notes from its creation» |
| 14 | Календарный месяц | unit `addPeriod` («adds a calendar month») |
| 15 | Конец месяца | unit `addPeriod` («clamps to the last day», «gives 29 February in a leap year») |
| 16 | Частота сохраняется после общения | integ «keeps the cadence after a new note» |
| 17 | Общение по разовой дате | integ «clears a specific date when the note is made soon before it» (и «…already overdue») |
| 18 | Заметка задолго до даты | integ «keeps a specific date when the note is made long before it» |
| 19 | День срока | unit `status` («is soon, not overdue, on the due day») |
| 20 | Просрочено | unit `status` («is overdue by one day») |
| 21 | Окно для недели | unit `status` («uses a 2-day window for a week») |
| 22 | Окно для месяца | unit `status` («uses a 7-day window for a month and a specific date») |
| 23 | Порядок просроченных | unit `sortForReminders` («puts the contact longer overdue higher», Анна/Борис); integ «orders the block» |
| 24 | Скоро ниже просроченных | unit `sortForReminders` («puts soon below overdue»); integ «orders the block» |
| 25 | Поиск | e2e «the block is not shown in search or on the second page» |
| 26 | Просроченный в блоке | e2e «a contact created 20 days ago is 13 days overdue and shown in the block»; unit `dueText` |
| 27 | Скоро в блоке | e2e «a contact whose term is tomorrow is shown in the block as «До <date>»»; unit `dueText` («names the due day today, otherwise the date»). |
| 28 | Переход в карточку | e2e (ссылка на карточку в строке блока); руками - клик по имени открыл нужную карточку |
| 29 | Больше пяти | unit `blockView` («shows the first 5 and offers to expand»); ssr «offers «Показать все (N)»…»; руками - раскрытие без перезагрузки |
| 30 | Свернуть | руками - «Свернуть» вернул 5 строк и «Показать все (N)» без перезагрузки (логика в компоненте, юнит-теста нет) |
| 31 | Пять и меньше | unit `blockView` («drops the expansion and the controls»); ssr «has no «Показать все» button for 5 rows or fewer» |
| 32 | Много контактов в блоке | unit `blockView` («shows 10 per page when expanded»); руками - «Страница 1 из 5», «Назад» неактивна |
| 33 | Листание блока | unit `blockView`; руками - «Вперёд» меняет страницу без перезагрузки, общий список не меняется |
| 34 | Последняя страница | unit `blockView` (страница 3 из 23: строки 20–30); руками - на последней странице «Вперёд» неактивна |
| 35 | Повторное раскрытие | руками - после «Свернуть» и нового раскрытия блок открыт на странице 1 (логика в компоненте, юнит-теста нет) |
| 36 | Осталось пять | unit `blockView` («drops the expansion and the controls when 5 rows or fewer are left») |
| 37 | Осталось меньше пяти в свёрнутом блоке | unit `blockView` (3 и 5 строк, кнопки нет); ssr «has no «Показать все» button» |
| 38 | Последний контакт | ssr «says everyone is in touch, with an icon»; unit `blockView` («handles an empty block») |
| 39 | Браузер без JavaScript | e2e «without JavaScript the page holds every row; only JavaScript trims it to 5»; ssr (все строки в разметке) |
| 40 | Все на связи | ssr «says everyone is in touch, with an icon» |
| 41 | Частота нигде не задана | ssr «hints at setting a frequency when nobody has one» |
| 42 | Связались из блока | e2e ««Связались» in the block without JavaScript» (редирект на `/`, заметка, срок в карточке); руками - с JS без перезагрузки |
| 43 | Связались в раскрытом блоке | руками - блок раскрыт на странице 2, «Связались», страница не перезагрузилась, блок остался на странице 2; unit `blockView` («stays expanded on the same page») |
| 44 | Связались в карточке | e2e ««Связались» in the card redirects back to the card»; руками - с JS заметка сразу сверху ленты |
| 45 | Срок в будущем | e2e (после «Связались» в карточке «Следующий раз — до»); unit `formatDueDate` |
| 46 | Просрочено в карточке | e2e (в карточке «просрочено на 13 дней») |
| 47 | Просроченный в списке | e2e «the list in search shows a dot for each overdue contact» (точка и текст для скринридера) |
| 48 | Контакт без частоты | e2e (точек ровно столько, сколько просроченных; у остальных нет) |

## Что не покрыто автотестами

- №2 - миграция на данных: тест «до → после» на временной базе, задача «Проверка миграций на данных до выкатки» в `specs/backlog.md`
- №30, 35 - переключатели блока живут в компоненте; проверены руками, при желании можно вынести переходы состояния в `reminders-view.ts` и покрыть юнит-тестами
- Пульсация точек под `prefers-reduced-motion` (требование «Точки в списке контактов», не сценарий): в разметке есть `motion-reduce:animate-none`, глазами не проверено (в `specs/backlog.md`)
