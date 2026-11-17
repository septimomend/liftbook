// UI translations. English text is the key; Ukrainian lives in UK. The user's own data
// (exercise, group and day names) is never translated.

let lang = "en";

export const LANGS = ["en", "uk"];

/** "auto" (or nothing) follows the device; otherwise the explicit choice. */
export function resolveLang(choice, deviceLangs = []) {
  if (LANGS.includes(choice)) return choice;
  for (const l of deviceLangs) {
    const base = String(l).toLowerCase().split("-")[0];
    if (LANGS.includes(base)) return base;
  }
  return "en";
}

export function setLang(l) {
  lang = LANGS.includes(l) ? l : "en";
  if (typeof document !== "undefined") document.documentElement.lang = lang;
}

export const getLang = () => lang;

const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? String(vars[k]) : m));

export function t(text, vars) {
  return fill(lang === "uk" ? UK[text] ?? text : text, vars);
}

const PLURALS = {
  en: { exercises: { one: "{n} exercise", other: "{n} exercises" } },
  uk: { exercises: { one: "{n} вправа", few: "{n} вправи", many: "{n} вправ", other: "{n} вправи" } },
};

/** Counted noun in the current language, e.g. tn(3, "exercises") -> "3 вправи". */
export function tn(n, word) {
  const forms = PLURALS[lang][word];
  const cat = new Intl.PluralRules(lang).select(n);
  return fill(forms[cat] ?? forms.other, { n });
}

export const UK = {
  // navigation
  "Today": "Сьогодні",
  "Plan": "План",
  "History": "Історія",
  "Settings": "Налаштування",
  "Could not start: {msg}": "Не вдалося запустити: {msg}",

  // today
  "Workout in progress": "Тренування триває",
  "Resume {day}": "Продовжити {day}",
  "Resume workout": "Продовжити тренування",
  "End this workout? Logged sets are kept.": "Завершити тренування? Записані підходи збережуться.",
  "End workout": "Завершити тренування",
  "No plan on this phone yet.": "На цьому телефоні ще немає плану.",
  "You're offline.": "Немає з'єднання з інтернетом.",
  "Google sign-in didn't complete.": "Вхід у Google не завершено.",
  "Sign in to Google Drive": "Увійти в Google Drive",
  "Import file": "Імпортувати файл",
  "or build a plan from scratch": "або створіть план з нуля",
  "Up next": "Далі",
  "Selected": "Вибрано",
  "Rest day": "День відпочинку",
  "Train anyway": "Все одно тренуватися",
  "Start {day}": "Почати {day}",

  // workout
  "{w} kg": "{w} кг",
  "kg": "кг",
  "reps": "повт.",
  "✎ edit": "✎ змінити",
  "Enter a weight": "Введіть вагу",
  "Save": "Зберегти",
  "Cancel": "Скасувати",
  "Done": "Виконано",
  "done": "виконано",
  "Weight": "Вага",
  "Reps": "Повторення",
  "Less weight": "Менша вага",
  "More weight": "Більша вага",
  "Fewer reps": "Менше повторень",
  "More reps": "Більше повторень",
  "Log set & rest {time}": "Записати підхід і відпочити {time}",
  "Resting · next: set {n} of {name}": "Відпочинок · далі: підхід {n} — {name}",
  "Resting": "Відпочинок",
  "Set {n} of {sets} · {min}–{max} reps": "Підхід {n} з {sets} · {min}–{max} повторень",
  "Tap to delete": "Натисніть, щоб видалити",
  "Delete set {n} ({set})?": "Видалити підхід {n} ({set})?",
  "Last time: {sets}": "Минулого разу: {sets}",
  "Alternatives": "Альтернативи",
  "Back to main": "Повернутися до основної",
  "Prev": "Назад",
  "Next": "Далі",
  "Finish": "Завершити",

  // rest timer
  "−15s": "−15с",
  "+15s": "+15с",
  "Skip": "Пропустити",
  "Rest over · {time} ago": "Відпочинок завершено · {time} тому",

  // plan editor
  "Add day": "Додати день",
  "Day {n}": "День {n}",
  "Delete {name} and its exercises?": "Видалити {name} разом із вправами?",
  "Move up": "Вище",
  "Move down": "Нижче",
  "Delete": "Видалити",
  "‹ Plan": "‹ План",
  "Day name": "Назва дня",
  "Exercises": "Вправи",
  "New exercise": "Нова вправа",
  "Add exercise": "Додати вправу",
  "Delete {name}?": "Видалити {name}?",
  "Change picture": "Змінити зображення",
  "Add picture": "Додати зображення",
  "Remove": "Прибрати",
  "Strength": "Силова",
  "Cardio": "Кардіо",
  "Name": "Назва",
  "Weight (kg, optional)": "Вага (кг, необов'язково)",
  "Enter a number": "Введіть число",
  "Picture": "Зображення",
  "Remove {name}?": "Прибрати {name}?",
  "Remove alternative": "Прибрати альтернативу",
  "Exercise name": "Назва вправи",
  "Muscle group": "Група м'язів",
  "Type": "Тип",
  "Duration": "Тривалість",
  "Working weight (kg)": "Робоча вага (кг)",
  "Sets": "Підходи",
  "Reps min": "Повторень від",
  "Reps max": "Повторень до",
  "Add alternative": "Додати альтернативу",
  "Alternative": "Альтернатива",

  // history
  "‹ History": "‹ Історія",
  "Exercise": "Вправа",
  "No sets logged yet.": "Підходів ще не записано.",
  "Nothing logged yet.": "Ще нічого не записано.",

  // settings
  "Language": "Мова",
  "Automatic (phone language)": "Автоматично (мова телефону)",
  "Rest between sets": "Відпочинок між підходами",
  "Google Drive": "Google Drive",
  "Backup file": "Файл резервної копії",
  "Export backup": "Експортувати копію",
  "Opens the share sheet — pick Google Drive (or Files) to save it.": "Відкриє меню «Поділитися» — виберіть Google Drive (або «Файли»), щоб зберегти.",
  "Load a backup or your liftbook-import.json. Replaces the data on this phone.": "Завантажте резервну копію або свій liftbook-import.json. Дані на цьому телефоні буде замінено.",
  "Replace all data on this phone with this file?": "Замінити всі дані на цьому телефоні даними з файлу?",
  "Backup failed: {msg}": "Не вдалося створити копію: {msg}",

  // sync
  "Tap to sync with Google Drive": "Натисніть, щоб синхронізувати з Google Drive",
  "Google sign-in needed.": "Потрібно увійти в Google.",
  "Liftbook needs access to its Drive files — sign in again and keep the Google Drive box ticked.": "Liftbook потрібен доступ до своїх файлів на Drive — увійдіть ще раз і залиште позначку Google Drive.",
  "Offline — changes will sync later.": "Немає з'єднання — зміни синхронізуються пізніше.",
  "Not configured.": "Не налаштовано.",
  "Sync failed: {reason}": "Помилка синхронізації: {reason}",
  "Not configured yet. Google sync turns on once the app's Google client ID is set (see docs/google-setup.md).": "Ще не налаштовано. Синхронізація з Google запрацює, коли буде вказано Google client ID застосунку (див. docs/google-setup.md).",
  "Last synced {time}": "Остання синхронізація: {time}",
  "Signed in, not synced yet.": "Вхід виконано, ще не синхронізовано.",
  "Not signed in. Your data stays on this phone until you sign in.": "Вхід не виконано. Дані зберігаються лише на цьому телефоні, доки ви не ввійдете.",
  "Syncing…": "Синхронізація…",
  "Sync now": "Синхронізувати",
  "Sync failed — tap to retry": "Не вдалося синхронізувати — торкніться, щоб повторити",
  "Rest between exercises": "Відпочинок між вправами",
  "Resting · next: {name}": "Відпочинок · далі: {name}",
  "Continue": "Далі",
  "Progress": "Прогрес",
  "Heaviest weight per workout": "Найбільша вага за тренування",
  "Replace pictures": "Замінити картинки",
  "Pick picture files named like the ones in the Liftbook folder on Drive (for example 1a2b3c4d5e6f.jpg). Each replaces the picture with the same name.": "Виберіть файли картинок з такими ж назвами, як у папці Liftbook на Drive (наприклад 1a2b3c4d5e6f.jpg). Кожен замінить картинку з тією ж назвою.",
  "Pictures replaced: {n}.": "Замінено картинок: {n}.",
  "Not matched: {names}": "Не знайдено відповідності: {names}",
  "Re-download pictures from Drive": "Завантажити картинки з Drive заново",
  "pictures updated: {n}": "оновлено картинок: {n}",
  "Sign in & sync": "Увійти й синхронізувати",
  "Sign out of Google on this phone? Your data stays here and on Drive.": "Вийти з Google на цьому телефоні? Дані залишаться тут і на Drive.",
  "Sign out": "Вийти",

  // backup file errors
  "This file is not a Liftbook backup (not valid JSON).": "Це не резервна копія Liftbook (некоректний JSON).",
  "This file is not a Liftbook backup.": "Це не резервна копія Liftbook.",
  "Unsupported backup format: {format}.": "Непідтримуваний формат копії: {format}.",
  "Backup is damaged: program is missing.": "Копію пошкоджено: немає плану.",
  "Backup is damaged: workout log is missing.": "Копію пошкоджено: немає журналу тренувань.",
};
