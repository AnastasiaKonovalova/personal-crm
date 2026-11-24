# Покрытие сценариев

Задача 7.1. Каждый сценарий `specs/contact-birthdays/spec.md` и `specs/data-ownership/spec.md` - и чем он покрыт. Строки - на 2026-11-24.

Виды тестов: **unit** - Vitest без базы; **база** - Vitest на настоящей базе; **e2e** - HTTP без JavaScript на `localhost:3000`; **Playwright** - браузер; **разметка** - компонент строкой HTML.

Непокрытых сценариев нет.

## contact-birthdays

### Дата рождения в контакте

| Сценарий | Чем покрыт |
|---|---|
| Контакт без даты рождения | unit `tests/validation.test.ts:197`; не попадает в блок - база `tests/birthdays-scenario.test.ts:135` |
| Дата с годом | база `tests/birthdays-scenario.test.ts:79`; строка в карточке - e2e `tests/e2e/birthdays.e2e.ts:174` |
| Дата без года | база `tests/birthdays-scenario.test.ts:89`; unit `tests/validation.test.ts:203` |
| Удаление даты | база `tests/birthdays-scenario.test.ts:99` |
| Без JavaScript | e2e `tests/e2e/birthdays.e2e.ts:84`; действие - база `tests/group-actions.test.ts:244` |
| Существующие контакты после выкатки | миграция `tests/migration-on-data.test.ts:498` |

### 29 февраля в невисокосный год

| Сценарий | Чем покрыт |
|---|---|
| Выбор по умолчанию | unit `tests/validation.test.ts:272`; 28 февраля отмечено в форме - e2e `tests/e2e/birthdays.e2e.ts:70` |
| Выбор 1 марта | unit `tests/validation.test.ts:276` |
| Выбор виден только при 29 февраля | Playwright `tests/browser/birthdays.spec.ts:29` |
| Выбор без JavaScript при другой дате | unit `tests/validation.test.ts:285`; e2e `tests/e2e/birthdays.e2e.ts:99` |
| Смена даты с 29 февраля | база `tests/birthdays-scenario.test.ts:115`; CHECK в базе - миграция `tests/migration-on-data.test.ts:533` |

### Проверка даты рождения

| Сценарий | Чем покрыт |
|---|---|
| Год без дня и месяца | unit `tests/validation.test.ts:221` |
| Месяц без дня | unit `tests/validation.test.ts:225` |
| Несуществующий день | unit `tests/validation.test.ts:230` |
| 29 февраля в невисокосный год | unit `tests/validation.test.ts:235` |
| 29 февраля без года | unit `tests/validation.test.ts:241` |
| Дата в будущем | unit `tests/validation.test.ts:249` |
| Слишком ранний год | unit `tests/validation.test.ts:255` |
| Ошибка не теряет введённое | база `tests/group-actions.test.ts:215`, `:270` (правка); e2e `tests/e2e/birthdays.e2e.ts:115` |
| Запрос в обход формы | unit `tests/validation.test.ts:264` |

### День рождения в карточке

| Сценарий | Чем покрыт |
|---|---|
| Карточка с датой | unit `tests/birthdays.test.ts:214`; e2e `tests/e2e/birthdays.e2e.ts:174` |
| Карточка без даты | e2e `tests/e2e/birthdays.e2e.ts:184` |
| Карточка с 29 февраля | unit `tests/birthdays.test.ts:224`; e2e `tests/e2e/birthdays.e2e.ts:189` |

### Ближайший день рождения

| Сценарий | Чем покрыт |
|---|---|
| Через Новый год | unit `tests/birthdays.test.ts:25` |
| Вчера | unit `tests/birthdays.test.ts:29` |
| Вчера через Новый год | unit `tests/birthdays.test.ts:33` |
| Позавчера | unit `tests/birthdays.test.ts:37` |
| 29 февраля по умолчанию в невисокосный год | unit `tests/birthdays.test.ts:41` |
| 1 марта по выбору | unit `tests/birthdays.test.ts:45` |
| 29 февраля в високосный год | unit `tests/birthdays.test.ts:49` |
| Часовой пояс владельца | unit `tests/birthdays.test.ts:54` |

### Блок «Скоро день рождения»

| Сценарий | Чем покрыт |
|---|---|
| Опоздавшие сверху, дальше ближайшие | unit `tests/birthdays.test.ts:67`; база `tests/birthdays-scenario.test.ts:135` |
| Одинаковый день | unit `tests/birthdays.test.ts:77` |
| Граница окна | unit `tests/birthdays.test.ts:85`; база `tests/birthdays-scenario.test.ts:164` |
| Над «Пора связаться» | e2e `tests/e2e/birthdays.e2e.ts:294` |
| Блок в группе | база `tests/birthdays-scenario.test.ts:171`; e2e `tests/e2e/birthdays.e2e.ts:310` |
| Поиск | e2e `tests/e2e/birthdays.e2e.ts:319` |
| Вторая страница списка | e2e `tests/e2e/birthdays.e2e.ts:343` |

### Блок без дней рождения

| Сценарий | Чем покрыт |
|---|---|
| Никого в окне | e2e `tests/e2e/birthdays.e2e.ts:427` |
| Дат рождения нет ни у кого | e2e `tests/e2e/birthdays.e2e.ts:421` |

### Строка блока «Скоро день рождения»

| Сценарий | Чем покрыт |
|---|---|
| Вчера с годом | unit `tests/birthdays.test.ts:99` |
| Сегодня с годом | unit `tests/birthdays.test.ts:108` |
| Завтра без года | unit `tests/birthdays.test.ts:117`; разметка `tests/birthdays-block.test.ts:43` |
| Послезавтра | unit `tests/birthdays.test.ts:126` |
| Через несколько дней | unit `tests/birthdays.test.ts:132` |
| Через 5 и 7 дней | unit `tests/birthdays.test.ts:141` |
| Возраст через Новый год | unit `tests/birthdays.test.ts:147` |
| Дата 29 февраля в строке | unit `tests/birthdays.test.ts:156` |
| Переход в карточку | разметка `tests/birthdays-block.test.ts:43`; e2e `tests/e2e/birthdays.e2e.ts:326` |

### Сколько строк в блоке «Скоро день рождения»

| Сценарий | Чем покрыт |
|---|---|
| Больше пяти | разметка `tests/birthdays-block.test.ts:34`; Playwright `tests/browser/birthdays.spec.ts:130` |
| Свернуть | Playwright `tests/browser/birthdays.spec.ts:130` |
| Пять и меньше | разметка `tests/birthdays-block.test.ts:24` |

### Пагинация блока «Скоро день рождения»

| Сценарий | Чем покрыт |
|---|---|
| Много дней рождения | Playwright `tests/browser/birthdays.spec.ts:155` |
| Листание блока | Playwright `tests/browser/birthdays.spec.ts:155` |
| Повторное раскрытие | Playwright `tests/browser/birthdays.spec.ts:155` |

### Блок «Скоро день рождения» без JavaScript

| Сценарий | Чем покрыт |
|---|---|
| Браузер без JavaScript | Playwright `tests/browser/birthdays.spec.ts:222` |

### Отметка «Поздравил(а)»

| Сценарий | Чем покрыт |
|---|---|
| Поздравил(а) | база `tests/birthdays-scenario.test.ts:214`; без перезагрузки, заметка в карточке - Playwright `tests/browser/birthdays.spec.ts:189`; кнопка в строке - разметка `tests/birthdays-block.test.ts:60` |
| Считается как «Связались» | база `tests/birthdays-scenario.test.ts:241` |
| Конкретная дата связи | база `tests/birthdays-scenario.test.ts:255` |
| Поздравили вчерашнего | unit `tests/birthdays.test.ts:184`; база `tests/birthdays-scenario.test.ts:226` |
| До следующего дня рождения | unit `tests/birthdays.test.ts:196`; база `tests/birthdays-scenario.test.ts:232` |
| Последний в блоке | e2e `tests/e2e/birthdays.e2e.ts:385` |
| Поздравил(а) без JavaScript | e2e `tests/e2e/birthdays.e2e.ts:367`; адрес возврата - unit `tests/block-return.test.ts:10` |
| Только в блоке | e2e `tests/e2e/birthdays.e2e.ts:399` |
| Чужой контакт | база `tests/ownership-scenario.test.ts:160` |

## data-ownership

### Только свои данные на экранах

| Сценарий | Чем покрыт |
|---|---|
| Список и поиск | база `tests/ownership-scenario.test.ts:126` |
| Пора связаться | база `tests/ownership-scenario.test.ts:142` |
| Скоро день рождения | база `tests/ownership-scenario.test.ts:150` |
| Группы и фильтр | база `tests/ownership-scenario.test.ts:170` |

### Новый пользователь

| Сценарий | Чем покрыт |
|---|---|
| Первый вход | e2e `tests/e2e/login.e2e.ts:538` (нет обоих блоков) |
