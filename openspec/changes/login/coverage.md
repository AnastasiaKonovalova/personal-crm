# Покрытие сценариев

Чем проверен каждый сценарий спек этого изменения (задача 9.1). Названия тестов — как в коде.

Обозначения файлов:
- **login.e2e** — `tests/e2e/login.e2e.ts` (HTTP e2e на запущенном приложении, письма из Mailpit)
- **login.spec** — `tests/browser/login.spec.ts` (Playwright, настоящий браузер)
- **ownership** — `tests/ownership-scenario.test.ts` (интеграционный, настоящая база)
- **migration** — `tests/migration-on-data.test.ts`
- **validation** — `tests/validation.test.ts`, **mail** — `tests/mail.test.ts`, **group-actions** — `tests/group-actions.test.ts`, **groups** — `tests/groups-scenario.test.ts`, **empty-list** — `tests/empty-list-view.test.ts`

## user-auth

| Сценарий | Чем покрыт |
| --- | --- |
| Открыл приложение без входа | login.e2e «Открыл приложение без входа» |
| Прямая ссылка без входа | login.e2e «Прямая ссылка без входа» |
| Отправка формы без входа | login.e2e «Отправка формы без входа»; group-actions «sends every action to the sign-in page and changes nothing» |
| Проверка здоровья без входа | login.e2e «Проверка здоровья без входа» |
| Ссылка для новой почты | login.e2e «Ссылка для новой почты» |
| Ссылка для известной почты | login.e2e «Ссылка для известной почты» |
| Первый вход создаёт пользователя | login.e2e «Первый вход создаёт пользователя» |
| Почта с пробелами и большими буквами | login.e2e «Почта с пробелами и большими буквами» (через форму) и «Почта с пробелами и большими буквами» outside the form (прямой запрос в Better Auth: тот же пользователь, лимит считает нормализованный адрес); validation «trims the spaces and lowers the case» |
| Неверный адрес в форме | login.e2e «Неверный адрес в форме»; validation «rejects an address that is not complete» |
| Пустая почта | login.e2e «Пустая почта»; validation «rejects an empty email and spaces only» |
| Неверный адрес в запросе мимо формы | login.e2e «Неверный адрес в запросе мимо формы»; validation «rejects what a request outside the form may send» |
| Ссылка открыта второй раз | login.e2e «Ссылка открыта второй раз» |
| Ссылке больше 15 минут | login.e2e «Ссылке больше 15 минут» |
| Запросил новую ссылку | login.e2e «Запросил новую ссылку» |
| Кнопка на экране устаревшей ссылки | login.spec «the button on the expired-link screen opens the sign-in page» |
| Четвёртый запрос за 10 минут | login.e2e «Четвёртый запрос за 10 минут» |
| Лимит после пробелов и регистра | login.e2e «Лимит после пробелов и регистра» |
| Лимит одной почты не мешает другой | login.e2e «Лимит одной почты не мешает другой» |
| После 10 минут снова можно | login.e2e «После 10 минут снова можно» |
| Содержимое письма | login.e2e «Содержимое письма»; mail «has the sender, the subject, the button, the term and the phrase about ignoring» |
| Письмо локально | login.e2e «Письмо локально» |
| Письмо в автотесте | CI: сервис Mailpit в `.github/workflows/ci.yml` (jobs `unit` и `e2e`, задача 8.1), e2e читают письма из Mailpit прогона; CI на PR #11 зелёный |
| Письмо на сервере | Вручную после выкатки: владелец получает настоящее письмо и входит (Workflow follow-up в `tasks.md`) |
| Заход продлевает вход | login.e2e «Заход продлевает вход» |
| 30 дней без захода | login.e2e «30 дней без захода» |
| Два устройства | login.e2e «Два устройства» |
| Почта в шапке | login.e2e «Почта в шапке»; браузер 6.3 (1280, 390, длинная почта) |
| Выход | login.e2e «Выход» |
| Выход на одном устройстве | login.e2e «Выход на одном устройстве» |
| A и B | login.spec «A and B: B does not see A's contact in the list, in search or by a direct link» |

## data-ownership

| Сценарий | Чем покрыт |
| --- | --- |
| Новый контакт | ownership «makes the creator the owner of a new contact»; migration «a record without an owner cannot exist…» |
| Новая группа из формы контакта | ownership «makes the creator the owner of a group made in the contact form» |
| Список и поиск | ownership «does not show a contact of A in the list, the search or the total of B»; login.spec «A and B» |
| Пора связаться | ownership «does not show an overdue contact of A in the «Пора связаться» of B» |
| Группы и фильтр | ownership «does not show a group of A to B: not in the groups, not in the filter, not in the form» |
| Чужой контакт по ссылке | login.e2e «Чужой контакт по ссылке»; login.spec «A and B» |
| Чужая группа по ссылке | login.e2e «Чужая группа по ссылке» |
| Правка чужого контакта запросом | ownership «does not read or change a contact of A for a request of B» |
| Чужая группа в запросе | ownership «does not rename or delete a group of A and does not put a contact of B into it» |
| Свой контакт в чужую группу | ownership «does not put a contact of B into a group of A by its id» |
| Две группы «Друзья» | ownership «lets A and B each have a group «Друзья» with their own contacts»; migration «…a group name is unique per user» |
| Первый вход | login.e2e «Первый вход»; empty-list «no contacts at all: «Контактов пока нет» and the hint «Добавь первый контакт»»; браузер 6.4 |
| Выкатка на базе с данными | migration «0003 login: all contacts and groups go to one user…», «0003 login: an empty database migrates without an owner email», проверка без почты владельца (`it.each`); локальная база в 3.3 (числа строк до и после совпали). После выкатки — вручную: те же числа строк, что в бэкапе |
| Другой пользователь после выкатки | Вручную после выкатки: вход под другой почтой — пустой список. До выкатки то же покрывают ownership и login.e2e «Первый вход» |
| Сид | Вручную в 4.4: после `pnpm db:seed` на пустой базе все контакты и группы у `OWNER_EMAIL`, без него — понятная ошибка. То, что другой пользователь их не видит, покрывают ownership-тесты |

## contact-groups

| Сценарий | Чем покрыт |
| --- | --- |
| Пустое имя | group-actions «rejects an empty name»; validation «rejects an empty name» |
| Такое имя уже есть | group-actions «rejects a name that already exists»; groups «rejects the same name in another case» |
| «Ё» и «е» не различаются | groups «does not tell «ё» from «е»» |
| Слишком длинное имя | validation «rejects a name longer than 50 characters» |
| Такое имя у другого пользователя | ownership «creates the group of B without an error when A has one with the same name» |
| «Новая группа» с именем чужой группы | ownership «gives B their own group when «Новая группа» in the form has the name of a group of A» |

## Итог

Непокрытых сценариев нет. Без автотеста: «Сид» (ручная проверка 4.4). После выкатки вручную: «Письмо на сервере», «Выкатка на базе с данными», «Другой пользователь после выкатки».
