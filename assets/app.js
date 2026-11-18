"use strict";
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)],
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const newId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
const icons = {
  book: '<path d="M3 4h6a4 4 0 0 1 3 2 4 4 0 0 1 3-2h6v15h-6a4 4 0 0 0-3 2 4 4 0 0 0-3-2H3z"/><path d="M12 6v15"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  live: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  art: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="m3 16 6-5 4 4 3-3 5 5"/>',
  settings:
    '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  users:
    '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a4 4 0 0 1 0 8m2 3a5 5 0 0 1 3 6"/>',
  check: '<path d="m5 12 4 4 10-10"/>',
  logout: '<path d="M9 4H4v16h5m5-13 5 5-5 5m-5-5h10"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
};
const icon = (n) =>
  `<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[n] || icons.book}</svg>`;
const S = {
  boot: null,
  quizzes: [],
  active: null,
  settings: {},
  edit: null,
  qi: 0,
  dirty: false,
  designerTarget: "cover",
  selected: null,
  token: localStorage.getItem("pereplet_team") || "",
  play: null,
  value: null,
  runFilter: "",
  monitor: null,
};
let poll = null,
  draftTimer = null,
  draftQueue = Promise.resolve(),
  busy = false,
  pageVersion = 0;
function toast(m) {
  $("#toast").textContent = m;
  $("#toast").classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $("#toast").classList.remove("show"), 4500);
}
async function api(action, data, extra = {}) {
  const headers = {
    "X-CSRF-Token": S.boot?.csrf || "",
    "X-Team-Token": S.token,
    ...extra.headers,
  };
  const options = {
    method: data === undefined ? "GET" : "POST",
    headers,
    cache: "no-store",
    ...extra,
  };
  if (data !== undefined) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(data);
  }
  const res = await fetch(`api.php?action=${action}`, options);
  let result;
  try {
    result = await res.json();
  } catch {
    throw Error(
      "Сервер вернул неожиданный ответ. Проверьте PHP и лимит загрузки файлов.",
    );
  }
  if (!res.ok) {
    const error = Error(result.error || "Ошибка запроса");
    error.issues = result.issues;
    error.status = res.status;
    throw error;
  }
  return result;
}
const btn = (text, action, cls = "primary", attrs = "") =>
  `<button class="btn ${cls}" data-action="${action}" ${attrs}>${text}</button>`;
const brand = () =>
  `<a class="brand" href="#home"><span class="brand-icon">${icon("book")}</span><span>Переплёт</span></a>`;
const help = (text) =>
  `<button type="button" class="info-button" data-action="info" data-help="${esc(text)}" aria-label="Справка">i</button>`;
function title(kicker, heading, sub, actions = "") {
  return `<header class="page-heading"><div>${kicker ? `<div class="eyebrow">${kicker}</div>` : ""}<h1>${heading}</h1>${sub ? `<p>${sub}</p>` : ""}</div><div class="heading-actions">${actions}</div></header>`;
}
function shell(content, nav = "library") {
  return `<aside class="sidebar">${brand()}<div class="sidebar-label">СТУДИЯ ВЕДУЩЕГО</div><nav>${[
    ["library", "grid", "Мои викторины"],
    ["monitor", "live", "Монитор игры"],
    ["design", "art", "Оформление"],
    ["settings", "settings", "Настройки"],
    ["updates", "clock", "Обновления"],
  ]
    .map(
      ([id, ic, label]) =>
        `<a class="nav-item ${nav === id ? "active" : ""}" href="#${id}">${icon(ic)}${label}${id === "monitor" ? '<span class="nav-dot"></span>' : ""}</a>`,
    )
    .join(
      "",
    )}</nav><div class="sidebar-bottom"><span class="avatar">В</span><div><b>Ведущий</b></div><button class="icon-btn" data-action="logout" title="Выйти">${icon("logout")}</button></div></aside><div class="workspace"><div class="topbar"><span>${esc(S.settings.venue || S.boot.settings.venue)}</span></div><main>${content}</main></div>`;
}
function home() {
  return `<div class="public-page"><header>${brand()}<span class="venue-name">${esc(S.boot.settings.venue)}</span></header><main class="welcome"><h1>Викторины</h1><div class="role-grid"><button class="role-card" data-action="participant"><span class="role-icon">${icon("users")}</span><h2>Я участник</h2><span class="role-link">Присоединиться ${icon("arrow")}</span></button><button class="role-card host-role" data-action="host"><span class="role-icon">${icon("book")}</span><h2>Я ведущий</h2><span class="role-link">Войти ${icon("arrow")}</span></button></div></main></div>`;
}
function login() {
  return `<div class="public-page"><header>${brand()}</header><main class="auth-card"><h1>Вход ведущего</h1>${!S.boot.setup ? "<p>Вход пока недоступен.</p>" : `<form id="login-form"><label>Пароль ведущего<input name="password" type="password" required autocomplete="current-password" autofocus></label><button class="btn primary wide" type="submit">Войти в студию ${icon("arrow")}</button></form>`}<a href="#home" class="text-link">← На главную</a></main></div>`;
}
async function loadLibrary() {
  const data = await api("quizzes");
  S.quizzes = data.quizzes;
  S.active = data.active;
  S.settings = data.settings;
  S.boot.appearance = data.appearance || {};
}
function library() {
  const activeQuiz = S.active && JSON.parse(S.active.snapshot);
  const questionCount = S.quizzes.reduce(
    (n, q) => n + q.content.questions.length,
    0,
  );
  return shell(
    `${title("", "Мои викторины", "", btn(icon("plus") + " Создать викторину", "new"))}${draftLibraryBanner()}<section class="stats"><div><span class="stat-icon">${icon("book")}</span><b>${S.quizzes.length}</b><span>викторин</span></div><div><span class="stat-icon">${icon("grid")}</span><b>${questionCount}</b><span>вопросов</span></div><div><span class="stat-icon">${icon("live")}</span><b>${S.active ? "1" : "0"}</b><span>активных игр</span></div></section>${S.active ? `<div class="active-banner"><span class="pulse"></span><div><b>Сейчас в игре: ${esc(activeQuiz.title)}</b>${help("Новые команды присоединяются к активной викторине. Изменения в конструкторе применятся при следующем запуске.")}</div><a href="#monitor" class="btn light">Монитор игры ${icon("arrow")}</a>${btn("Завершить", "stop", "ghost")}</div>` : ""}<div class="section-title"><h2>Коллекция викторин <span>${S.quizzes.length}</span></h2><div><label class="search-label"><input id="search" type="search" placeholder="Поиск викторины…" aria-label="Поиск викторины"></label>${btn("Импорт JSON", "import", "light")}</div></div><div class="quiz-grid">${S.quizzes.map((q, i) => `<article class="quiz-card" data-search="${esc(q.title.toLocaleLowerCase())}"><div class="quiz-cover tone-${i % 4}"><span class="cover-no">КОЛЛЕКЦИЯ / ${String(i + 1).padStart(2, "0")}</span><span class="cover-art">${["✳", "❧", "✦", "⌘"][i % 4]}</span>${S.active?.quiz_id === q.id ? '<span class="badge live">В эфире</span>' : '<span class="badge">Не запущена</span>'}<span class="cover-rule"></span></div><div class="quiz-card-body"><div class="card-meta">${q.content.questions.length} вопросов <span>·</span> ${q.content.questions.reduce((n, x) => n + x.points, 0)} баллов</div><h3>${esc(q.title)}</h3><p>${esc(q.description || "")}</p><div class="card-buttons">${btn("Открыть конструктор", "edit", "light", `data-id="${q.id}"`)}<button class="icon-btn" title="Запустить викторину" aria-label="Запустить ${esc(q.title)}" data-action="activate" data-id="${q.id}">▶</button></div></div></article>`).join("")}<button class="new-card" data-action="new"><span>${icon("plus")}</span><h3>Создать викторину</h3></button></div>`,
  );
}
const types = {
  single: "Один ответ",
  multiple: "Несколько ответов",
  text: "Текстовый ответ",
  number: "Числовой ответ",
  info: "Информационный слайд",
  fields: "Несколько текстовых полей",
  link: "Ссылка на материал",
};
function newQuestion(type = "single") {
  const fields = type === "fields" ? [newAnswerField(), newAnswerField()] : [];
  return {
    id: newId(),
    type,
    text: "Новый вопрос",
    options: ["Вариант 1", "Вариант 2"],
    correct: [0],
    accepted: ["Ответ"],
    number: 0,
    tolerance: 0,
    fields,
    resourceUrl: "",
    resourceLabel: "Открыть материал",
    points: isMaterialSlide({ type }) ? 0 : type === "fields" ? 2 : 1,
    media: "",
    mediaType: "image",
    explanation: "",
    layout: { background: "#f5f0e6", elements: [] },
  };
}
function editQuiz(id, skipDraft = false) {
  if (!skipDraft && offerQuizDraft(id)) return;
  S.editorIssues = [];
  const item = S.quizzes.find((q) => q.id === id);
  S.edit = item
    ? JSON.parse(JSON.stringify(item))
    : {
        id: null,
        content: {
          title: "Новая викторина",
          description: "",
          questions: [],
          cover: { background: "#eee5d3", elements: [] },
        },
      };
  S.qi = 0;
  S.dirty = false;
  location.hash = "editor";
  render();
}
function editor() {
  const e = S.edit,
    c = e.content,
    q = c.questions[S.qi];
  return shell(
    `${title("КОНСТРУКТОР / " + (e.id ? "РЕДАКТИРОВАНИЕ" : "НОВАЯ ВИКТОРИНА"), esc(c.title), "", `<span id="save-state" class="muted">${S.dirty ? "Есть изменения" : "Сохранено"}</span>${btn("Сохранить", "save")}`)}${editorIssuesHTML()}<p id="draft-status" class="draft-status ${draftStorageFailed ? "bad" : ""}">${draftStorageFailed ? "Не удалось записать черновик. Не закрывайте страницу до сохранения." : ""}</p><div class="editor-meta panel"><label>Название<input data-field="title" value="${esc(c.title)}" maxlength="120"></label><label>Описание<textarea data-field="description" rows="2" maxlength="1000">${esc(c.description)}</textarea></label></div><div class="panel quiz-options"><h2>Проведение викторины</h2><label>Результаты у участников<select data-field="resultsMode"><option value="inherit" ${(c.resultsMode || "inherit") === "inherit" ? "selected" : ""}>По общей настройке</option><option value="show" ${c.resultsMode === "show" ? "selected" : ""}>Показывать баллы и ответы после прохождения</option><option value="hide" ${c.resultsMode === "hide" ? "selected" : ""}>Не показывать результаты и правильные ответы</option></select></label><label class="toggle"><input type="checkbox" data-field="paced" ${c.paced ? "checked" : ""}><span><b>Ведущий открывает слайды по кнопке</b>${help("При запуске все слайды закрыты. В мониторе ведущий открывает их по очереди. Будущие вопросы не передаются участникам. Настройка применяется при следующем запуске викторины.")}</span></label></div><div class="editor-grid"><aside class="question-list panel"><div class="section-title"><h3>Содержание</h3><span>${c.questions.length}</span></div>${c.questions.map((x, i) => `<button class="question-tab ${S.qi === i ? "selected" : ""} ${slideHasIssue(i) ? "invalid" : ""}" data-action="question" data-index="${i}"><span>${String(i + 1).padStart(2, "0")}</span><div><b>${esc(questionLabel(x, i))}</b><small>${types[x.type]}${slideHasIssue(i) ? " · Ошибка" : ""}</small></div></button>`).join("")}${btn(icon("plus") + " Добавить вопрос", "add-question", "light wide")}<div class="editor-tools">${btn("Скачать JSON", "export-quiz", "ghost wide")}${e.id ? btn("Удалить викторину", "delete-quiz", "danger wide") : ""}</div></aside><section class="question-editor panel">${
      q
        ? `<div class="section-title"><div class="eyebrow">ВОПРОС ${S.qi + 1}</div><div>${btn("↑", "move-up", "ghost", 'aria-label="Переместить выше"')}${btn("↓", "move-down", "ghost", 'aria-label="Переместить ниже"')}${btn("Копия", "duplicate-question", "ghost")}${btn("Удалить", "remove-question", "danger")}</div></div><div class="two-col"><label>Тип задания<select data-qfield="type">${Object.entries(
            types,
          )
            .map(
              ([k, v]) =>
                `<option value="${k}" ${q.type === k ? "selected" : ""}>${v}</option>`,
            )
            .join(
              "",
            )}</select></label><label>Баллы<input type="number" min="1" max="100" data-qfield="points" value="${q.points}" ${["info", "link", "fields"].includes(q.type) ? "disabled" : ""}></label></div><label>${["info", "link", "fields"].includes(q.type) ? "Текст слайда (необязательно)" : "Текст задания"}<textarea data-qfield="text" rows="3" maxlength="2000">${esc(q.text)}</textarea></label>${q.type === "fields" ? fieldsEditorHTML(q) : ["single", "multiple"].includes(q.type) ? `<label>Варианты ответа <small>Отметьте правильные</small></label><div class="options-editor">${q.options.map((o, i) => `<div><input type="${q.type === "single" ? "radio" : "checkbox"}" name="correct" data-correct="${i}" aria-label="Вариант ${i + 1} правильный" ${q.correct.includes(i) ? "checked" : ""}><input data-option="${i}" value="${esc(o)}" maxlength="300" aria-label="Вариант ${i + 1}"><button class="icon-btn" data-action="remove-option" data-index="${i}" title="Удалить вариант">×</button></div>`).join("")}</div>${q.options.length < 12 ? btn("+ Ещё вариант", "add-option", "ghost") : ""}` : q.type === "text" ? `<label>Допустимые ответы ${help("Каждый допустимый ответ укажите с новой строки.")}<textarea rows="4" data-qfield="accepted">${esc(q.accepted.join("\n"))}</textarea></label>${help("Регистр, пробелы, пунктуация и различие Е/Ё не учитываются. Баллы начисляются за точное совпадение; процент сходства помогает оценить опечатки. Оценку можно изменить в мониторе.")}` : q.type === "number" ? `<div class="two-col"><label>Правильное число<input type="number" step="any" data-qfield="number" value="${q.number}"></label><label>Погрешность ±<input type="number" step="any" min="0" data-qfield="tolerance" value="${q.tolerance}"></label></div>` : help("Слайд без проверки ответа и начисления баллов. Участник переходит дальше кнопкой «Продолжить».")}${resourceEditorHTML(q)}<hr><h3>Материалы к вопросу</h3><div class="media-fields"><label>Формат<select data-qfield="mediaType">${[
            ["image", "Изображение / GIF"],
            ["video", "Видео"],
            ["audio", "Аудио"],
          ]
            .map(
              ([k, v]) =>
                `<option value="${k}" ${q.mediaType === k ? "selected" : ""}>${v}</option>`,
            )
            .join(
              "",
            )}</select></label><label>Ссылка или загруженный файл<input data-qfield="media" value="${esc(q.media)}" placeholder="HTTPS-ссылка или загрузка с компьютера"></label><label class="btn light upload-label">Загрузить<input id="question-upload" type="file" accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm,audio/*" hidden></label></div>${media(q)}<label>Пояснение после игры<textarea rows="2" data-qfield="explanation" maxlength="1500">${esc(q.explanation)}</textarea></label>`
        : `<div class="empty"><span>✦</span><h2>Нет вопросов</h2>${btn("Добавить первый вопрос", "add-question")}</div>`
    }</section></div>`,
  );
}
function media(q) {
  if (!q.media) return "";
  const url = esc(q.media);
  return q.mediaType === "video"
    ? `<video class="question-media" src="${url}" controls preload="metadata"></video>`
    : q.mediaType === "audio"
      ? `<audio class="question-media" src="${url}" controls preload="metadata"></audio>`
      : `<img class="question-media" src="${url}" alt="Иллюстрация к заданию" loading="lazy">`;
}
function mark() {
  S.dirty = true;
  if ($("#save-state")) $("#save-state").textContent = "Есть изменения";
  queueQuizDraft();
  refreshEditorIssues();
}
async function save() {
  const editing = S.edit;
  persistQuizDraft();
  try {
    const issues = clientQuizIssues(editing.content);
    if (issues.length) {
      const error = Error("Исправьте отмеченные поля.");
      error.issues = issues;
      throw error;
    }
    const content = structuredClone(editing.content),
      before = JSON.stringify(content),
      oldKey = editing.draftKey || editing.id;
    const result = await api("save_quiz", {
      id: editing.id || undefined,
      content,
    });
    editing.id = result.id;
    if (S.edit === editing) {
      S.dirty = JSON.stringify(editing.content) !== before;
      S.editorIssues = [];
      if (!S.dirty) {
        if (oldKey) removeQuizDraft(oldKey);
        removeQuizDraft(result.id);
        editing.draftKey = result.id;
      } else persistQuizDraft();
    }
    await loadLibrary();
    if (S.edit === editing && !S.dirty) {
      const canonical = S.quizzes.find((q) => q.id === editing.id);
      if (canonical) editing.content = structuredClone(canonical.content);
    }
    if (S.edit === editing && location.hash === "#editor") await render();
    toast("Викторина сохранена");
  } catch (error) {
    if (S.edit === editing) await showQuizSaveFailure(error);
    else dialog(`<h2>Викторина не сохранена</h2><p>${esc(error.message)}</p>`);
  }
}

function design() {
  return studioRender();
}
function targetLayout() {
  return studioLayout();
}
function layoutHTML(l, editing = false) {
  return (l?.elements || [])
    .map(
      (e, i) =>
        `<div class="canvas-element ${editing && S.selected === e.id ? "chosen" : ""}" ${editing ? `data-element="${esc(e.id)}" tabindex="0" aria-label="${e.type === "text" ? "Текст" : "Изображение"}: перетащите для перемещения"` : ""} style="left:${Number(e.x)}%;top:${Number(e.y)}%;width:${Number(e.w)}%;font-size:${Number(e.size) / 10}cqw;color:${esc(e.color)};z-index:${i + 1}">${e.type === "text" ? esc(e.text) : `<img src="${esc(e.url)}" alt="" draggable="false">`}</div>`,
    )
    .join("");
}
function slide(l) {
  return "";
}

function settings() {
  const c = S.settings;
  return shell(
    `${title("", "Настройки", "")}<form id="settings-form" class="panel settings-panel"><h2>Общие</h2><label>Название библиотеки или площадки<input name="venue" maxlength="120" value="${esc(c.venue)}"></label><label>Максимум команд<input name="maxTeams" type="number" min="1" max="500" value="${c.maxTeams || 100}"></label><label class="toggle"><input name="registration" type="checkbox" ${c.registration ? "checked" : ""}><span><b>Принимать новые команды</b>${help("Уже зарегистрированные команды смогут продолжить игру при закрытой регистрации.")}</span></label><label class="toggle"><input name="feedback" type="checkbox" ${c.feedback ? "checked" : ""}><span><b>Показать результаты после прохождения</b>${help("Правильные ответы доступны команде только после завершения всех заданий.")}</span></label><hr><h2>Доступ ведущего</h2>${help("Смена пароля завершает другие сеансы ведущего.")}<label>Текущий пароль<input name="oldPassword" type="password" autocomplete="current-password"></label><label>Новый пароль ${help("Оставьте поле пустым, чтобы не менять пароль.")}<input name="password" type="password" minlength="12" autocomplete="new-password" placeholder="Минимум 12 символов"></label><button class="btn primary" type="submit">Сохранить настройки</button></form><div class="settings-help"><span>Подключение ${help("Устройства должны быть в одной Wi-Fi сети. Участникам нужен адрес сайта с IP ноутбука, без #library.")}</span><span>Резервная копия ${help("Завершите игру и остановите Apache, затем скопируйте data и uploads. Викторины можно экспортировать в JSON, результаты — в CSV.")}</span></div>`,
    "settings",
  );
}
function answerText(q, a) {
  if (q.type === "fields")
    return q.fields
      .map((f) => f.label + ": " + (a.value?.[f.id] || "—"))
      .join("; ");
  return Array.isArray(a.value)
    ? a.value.map((i) => q.options[i]).join("; ")
    : a.value;
}
function monitorHTML(data) {
  const { run, quiz, teams, history } = data;
  const visibleQuestions = monitorQuestions(quiz),
    answerIds = new Set(
      (quiz?.questions || [])
        .filter((q) => !isMaterialSlide(q))
        .map((q) => q.id),
    );
  const finalCount = teams.reduce(
    (n, t) =>
      n +
      t.answers.filter((a) => a.final && answerIds.has(a.question_id)).length,
    0,
  );
  const finished = teams.filter(
    (t) => t.answers.filter((a) => a.final).length === quiz?.questions.length,
  ).length;
  return `${title("", "Монитор игры", "", `<span id="connection" class="status"><i></i> Обновлено сейчас</span>${run ? `<a class="btn light" href="api.php?action=export&run=${run.id}">Скачать CSV</a>` : ""}`)}<div class="monitor-controls"><label>Сеанс игры<select id="run-filter"><option value="">Текущая игра</option>${history.map((h) => `<option value="${h.id}" ${S.runFilter === h.id ? "selected" : ""}>${esc(h.title)} · ${new Date(h.started * 1000).toLocaleString("ru-RU")}${h.ended ? " · завершена" : ""}</option>`).join("")}</select></label><label class="monitor-info-toggle"><input id="monitor-show-info" type="checkbox" ${S.monitorShowInfo ? "checked" : ""}>Информационные слайды и ссылки</label>${help("Монитор обновляется каждые 2 секунды. Черновики видны до отправки и не приносят баллы.")}</div>${
    !run
      ? '<div class="empty panel"><span>⌁</span><h2>Нет активной игры</h2><a href="#library" class="btn primary">К викторинам</a></div>'
      : `${pacedControlsHTML(data)}<div class="monitor-title"><h2>${esc(quiz.title)}</h2><span class="badge ${run.ended ? "" : "live"}">${run.ended ? "Игра завершена" : "Игра в эфире"}</span></div><section class="stats monitor-stats"><div><span class="stat-icon">${icon("users")}</span><b>${teams.length}</b><span>команд в игре</span></div><div><span class="stat-icon">${icon("check")}</span><b>${finalCount}</b><span>отправленных ответов</span></div><div><span class="stat-icon">${icon("book")}</span><b>${finished}</b><span>команд на финише</span></div></section><div class="legend"><span class="ok">● Верно</span><span class="partial">● Частично</span><span class="bad">● Неверно</span><span class="draft">◌ Черновик</span><span>— Нет ответа</span>${help("Нажмите ответ, чтобы открыть подробности и изменить баллы. Для нескольких вариантов нужен полностью верный набор. Текст сравнивается без регистра, пробелов, пунктуации и различия Е/Ё.")}</div><div class="table-scroll panel"><table class="monitor-table"><thead><tr><th class="monitor-score-cell" scope="col">Баллы</th><th class="monitor-team-cell" scope="col">Команда</th>${visibleQuestions.map((q, i) => `<th title="${esc(questionLabel(q, q.ordinal - 1))}"><span>${isMaterialSlide(q) ? "Слайд" : "Вопрос"} ${String(q.ordinal).padStart(2, "0")}</span><small>${esc(q.text.slice(0, 42))}</small></th>`).join("")}</tr></thead><tbody>${
          teams.length
            ? [...teams]
                .sort(
                  (a, b) => b.score - a.score || a.name.localeCompare(b.name),
                )
                .map(
                  (t) =>
                    `<tr><td class="monitor-score-cell"><strong class="score">${t.score}</strong></td><th class="monitor-team-cell" scope="row"><b>${esc(t.name)}</b><small><i class="presence ${data.now - t.seen < 15 ? "online" : ""}"></i>${data.now - t.seen < 15 ? "На связи" : "Нет связи >15 с"} · ${t.answers.filter((a) => a.final).length}/${quiz.questions.length}</small></th>${visibleQuestions
                      .map((q) => {
                        const a = t.answers.find((a) => a.question_id === q.id);
                        return `<td>${a && q.type === "fields" ? fieldsMonitorHTML(q, a, t.id) : a ? `<button class="answer-cell ${!a.final ? "draft" : isMaterialSlide(q) ? "neutral" : a.correct ? "ok" : "bad"}" data-action="inspect" data-team="${t.id}" data-question="${q.id}"><b>${!a.final ? "◌ " : isMaterialSlide(q) ? "→ " : a.correct ? "✓ " : "× "}${esc(isMaterialSlide(q) ? "Просмотрено" : answerText(q, a) || "—")}</b><small>${!a.final ? "Не отправлено" : q.type === "text" ? `Совпадение ${a.similarity}% · ${a.score}/${q.points} б.` : `${a.score}/${q.points} б.`}</small></button>` : '<span class="muted">—</span>'}</td>`;
                      })
                      .join("")}</tr>`,
                )
                .join("")
            : `<tr><td colspan="${visibleQuestions.length + 2}"><div class="empty"><h3>Нет команд</h3></div></td></tr>`
        }</tbody></table></div>`
  }`;
}
function monitor(data) {
  return shell(
    `<div id="monitor-content">${monitorHTML(data)}</div>`,
    "monitor",
  );
}
async function refreshMonitor() {
  if (document.hidden || $("dialog[open]")) return;
  const version = pageVersion;
  try {
    const d = await api("monitor" + (S.runFilter ? "&run=" + S.runFilter : ""));
    if (version !== pageVersion) return;
    const sameRun = S.monitor?.run?.id === d.run?.id;
    S.monitor = d;
    const focus = $("#run-filter") === document.activeElement;
    const content = $("#monitor-content");
    if (!focus && content) {
      // Read after the request: the host may have scrolled while it was in flight.
      const table = content.querySelector(".table-scroll");
      const left = sameRun ? table?.scrollLeft || 0 : 0;
      const top = sameRun ? table?.scrollTop || 0 : 0;
      content.innerHTML = monitorHTML(d);
      const updatedTable = content.querySelector(".table-scroll");
      if (updatedTable) {
        updatedTable.scrollLeft = left;
        updatedTable.scrollTop = top;
      }
    }
  } catch (e) {
    if ($("#connection")) {
      $("#connection").textContent = "Нет обновления · переподключение…";
      $("#connection").classList.add("bad");
    }
  }
}
function joinPage() {
  return `<div class="public-page"><header>${brand()}<span class="status"><i></i>${esc(S.boot.settings.venue)}</span></header><main class="auth-card"><h1>Создать команду</h1><p id="join-status">${S.boot.active ? "Сегодня играем в «" + esc(S.boot.active.title) + "»" : "Ожидание викторины"}</p><form id="join-form"><label>Название команды<input name="name" required minlength="2" maxlength="60" placeholder="Например, Книжные лисы" autocomplete="off"></label><button class="btn primary wide" type="submit">Создать команду ${icon("arrow")}</button></form><details class="restore"><summary>Уже участвовали? Восстановить команду</summary><form id="restore-form"><label>Код восстановления<input name="token" required minlength="48" maxlength="48" autocomplete="off"></label><button class="btn light" type="submit">Восстановить</button></form></details><a href="#home" class="text-link">← На главную</a></main></div>`;
}
function playPage() {
  const p = S.play;
  if (!p) return "";
  if (p.waiting)
    return `<div class="public-page"><header>${brand()}<span>${esc(p.team.name)}</span></header><main class="auth-card"><h1>Ожидание игры</h1><p>${p.newGame ? "Новая викторина «" + esc(p.title) + "»." : "Нет активной викторины."}</p>${p.newGame ? btn("Присоединиться к новой игре", "new-team") : ""}${btn("Показать код команды", "team-code", "light wide")}<a href="#home" class="text-link">На главную</a></main></div>`;
  const { quiz, answers } = p;
  const finals = answers.filter((a) => a.final),
    index = finals.length;
  const q = quiz.questions[index];
  return `<div class="public-page participant-page"><header>${brand()}<div class="team-chip">${icon("users")} ${esc(p.team.name)} ${btn("Код команды", "team-code", "ghost")}</div></header><main class="play-area">${
    p.done
      ? `<div class="finish-head"><h1>Викторина завершена</h1><p>${esc(p.team.name)}</p>${p.feedback ? `<div class="finish-score">${finals.reduce((n, a) => n + (a.score || 0), 0)}<small>из ${quiz.questions.reduce((n, q) => n + q.points, 0)} баллов</small></div>` : ""}</div>${
          p.feedback
            ? `<div class="review-list">${quiz.questions
                .filter((q) => !isMaterialSlide(q))
                .map((q, i) => {
                  const a = finals.find((a) => a.question_id === q.id);
                  return `<details class="panel"><summary><span class="${a.correct ? "ok" : isMaterialSlide(q) ? "neutral" : "bad"}">${q.type === "info" ? "→" : a.correct ? "✓" : "×"}</span><b>${i + 1}. ${esc(questionLabel(q))}</b><span>${a.score}/${q.points}</span></summary>${q.type === "fields" ? fieldsReviewHTML(q, a) : `<p>Ваш ответ: ${esc(answerText(q, a) || "Прочитано")}</p>${q.type === "text" ? `<p>Совпадение: ${a.similarity}%. Допустимые ответы: ${esc(q.accepted.join("; "))}</p>` : q.type === "number" ? `<p>Правильное число: ${q.number}, погрешность ±${q.tolerance}</p>` : ["single", "multiple"].includes(q.type) ? `<p>Правильный ответ: ${esc(q.correct.map((i) => q.options[i]).join("; "))}</p>` : ""}${q.explanation ? `<p>${esc(q.explanation)}</p>` : ""}`}</details>`;
                })
                .join("")}</div>`
            : ""
        }<a href="#home" class="btn light">На главную</a>`
      : !p.started
        ? `<div class="start-card">${slide(quiz.cover)}<div class="eyebrow">КОМАНДА «${esc(p.team.name)}»</div><h1>${esc(quiz.title)}</h1><p>${esc(quiz.description)}</p><div class="start-meta"><span>${p.totalQuestions ?? quiz.questions.length} слайдов</span><span>${p.totalPoints ?? quiz.questions.reduce((n, q) => n + q.points, 0)} баллов</span></div>${btn("Начать викторину " + icon("arrow"), "start")}</div>`
        : p.waitingForHost
          ? hostWaitHTML(p)
          : `<div class="play-progress"><span>${esc(quiz.title)}</span><b>${index + 1} / ${p.totalQuestions ?? quiz.questions.length}</b><div><span style="width:${(100 * index) / (p.totalQuestions ?? quiz.questions.length)}%"></span></div></div><article class="question-play panel">${slide(q.layout)}<div class="eyebrow">${isMaterialSlide(q) ? "СЛАЙД" : "ВОПРОС " + String(index + 1).padStart(2, "0")} · ${types[q.type]}${q.points ? " · " + q.points + " б." : ""}</div><h1>${esc(q.text)}</h1>${media(q)}${resourceLinkHTML(q)}<form id="answer-form">${q.type === "fields" ? fieldsPlayHTML(q, S.value) : ["single", "multiple"].includes(q.type) ? `<div class="play-options">${q.options.map((o, i) => `<label class="play-option"><input type="${q.type === "single" ? "radio" : "checkbox"}" name="answer" value="${i}" ${(Array.isArray(S.value) ? S.value : []).includes(i) ? "checked" : ""}><span class="option-letter">${String.fromCharCode(65 + i)}</span><span>${esc(o)}</span></label>`).join("")}</div>` : !isMaterialSlide(q) ? `<label>Ваш ответ<input id="typed-answer" name="answer" maxlength="300" ${q.type === "number" ? 'inputmode="decimal"' : ""} autocomplete="off" value="${esc(S.value || "")}" placeholder="${q.type === "number" ? "Введите число" : "Введите ответ"}" required></label>` : ""}<div class="answer-bottom"><span id="draft-state" class="muted" role="status" aria-live="polite"></span><button type="submit" class="btn primary">${isMaterialSlide(q) ? "Продолжить" : "Отправить ответ"} ${icon("arrow")}</button></div></form></article>`
  }</main></div>`;
}
function setPlayValue() {
  const p = S.play;
  if (p?.waiting || p?.done || p?.waitingForHost) {
    S.value = null;
    return;
  }
  const q = p.quiz.questions[p.answers.filter((a) => a.final).length];
  const saved = p.answers.find((a) => a.question_id === q.id);
  const local = localStorage.getItem("pereplet_draft_" + p.run + "_" + q.id);
  S.value = local
    ? JSON.parse(local)
    : (saved?.value ??
      (q.type === "fields"
        ? {}
        : ["single", "multiple"].includes(q.type)
          ? []
          : ""));
}
async function playLoad() {
  const p = await api("play");
  const start =
    localStorage.getItem("pereplet_started_" + p.run) === "1" ||
    p.answers?.some((a) => a.final);
  S.play = { ...p, started: start };
  setPlayValue();
}
async function playPoll() {
  if (document.hidden || busy) return;
  const version = pageVersion;
  try {
    const data = await api("play");
    if (version !== pageVersion) return;
    if (
      data.run !== S.play.run ||
      data.waiting !== S.play.waiting ||
      data.released !== S.play.released ||
      data.waitingForHost !== S.play.waitingForHost ||
      data.answers?.filter((a) => a.final).length !==
        S.play.answers?.filter((a) => a.final).length ||
      (data.done &&
        JSON.stringify(data.answers) !== JSON.stringify(S.play.answers)) ||
      data.feedback !== S.play.feedback
    ) {
      await playLoad();
      render();
    }
  } catch (e) {
    if ($("#draft-state"))
      $("#draft-state").textContent = "Нет связи с сервером";
  }
}
function localDraft() {
  const p = S.play,
    q = p.quiz.questions[p.answers.filter((a) => a.final).length];
  localStorage.setItem(
    "pereplet_draft_" + p.run + "_" + q.id,
    JSON.stringify(S.value),
  );
  clearTimeout(draftTimer);
  if ($("#draft-state")) $("#draft-state").textContent = "";
  const payload = {
    run: p.run,
    question: q.id,
    value: structuredClone(S.value),
    final: false,
  };
  draftTimer = setTimeout(() => {
    draftQueue = draftQueue
      .catch(() => {})
      .then(() => api("answer", payload))
      .then(() => {
        if ($("#draft-state")) $("#draft-state").textContent = "";
      })
      .catch(() => {
        if ($("#draft-state"))
          $("#draft-state").textContent = "Нет связи с сервером";
      });
  }, 500);
}
async function render() {
  $("#context-help")?.remove();
  clearInterval(poll);
  const version = ++pageVersion;
  const route = location.hash.slice(1) || "home";
  let html = "";
  try {
    if (
      [
        "library",
        "editor",
        "design",
        "settings",
        "monitor",
        "updates",
      ].includes(route) &&
      !S.boot.host
    ) {
      location.hash = "login";
      return;
    }
    if (["library", "design", "settings"].includes(route)) await loadLibrary();
    if (version !== pageVersion) return;
    if (route === "home") html = home();
    else if (route === "login") html = login();
    else if (route === "join") {
      S.boot = await api("bootstrap");
      html = joinPage();
      poll = setInterval(async () => {
        if (document.hidden) return;
        try {
          const boot = await api("bootstrap");
          if (version !== pageVersion) return;
          S.boot = boot;
          if ($("#join-status"))
            $("#join-status").textContent = boot.active
              ? "Сегодня играем в «" + boot.active.title + "»"
              : "Ожидание викторины";
        } catch {
          /* Keep the form usable during a short network outage. */
        }
      }, 4000);
    } else if (route === "library") html = library();
    else if (route === "editor") {
      if (!S.edit) {
        location.hash = "library";
        return;
      }
      html = editor();
    } else if (route === "design") html = design();
    else if (route === "settings") html = settings();
    else if (route === "updates") {
      S.updates = await api("update_status");
      html = updatesPage();
    } else if (route === "monitor") {
      S.monitor = await api(
        "monitor" + (S.runFilter ? "&run=" + S.runFilter : ""),
      );
      html = monitor(S.monitor);
      poll = setInterval(refreshMonitor, 2000);
    } else if (route === "play") {
      if (!S.token) {
        location.hash = "join";
        return;
      }
      if (!S.play) await playLoad();
      html = playPage();
      poll = setInterval(playPoll, 4000);
    } else {
      location.hash = "home";
      return;
    }
    if (version !== pageVersion) return;
    $("#app").innerHTML = html;
    if (route === "updates") updatesMount();
    if (route === "design") studioMount();
    else decoratePage(appearanceFor());
  } catch (e) {
    toast(e.message);
    if (route === "play") {
      S.play = null;
      location.hash = "join";
    } else
      $("#app").innerHTML =
        `<div class="auth-card"><h1>Не удалось открыть страницу</h1><p>${esc(e.message)}</p>${btn("Повторить", "retry", "primary")}</div>`;
  }
}
function dialog(content) {
  $("dialog")?.remove();
  const d = document.createElement("dialog");
  d.innerHTML = `<button class="dialog-close icon-btn" data-action="close-dialog" aria-label="Закрыть">×</button>${content}`;
  document.body.append(d);
  d.showModal();
  d.addEventListener("click", (e) => {
    if (e.target === d) d.close();
  });
  return d;
}
function confirmLeave() {
  persistQuizDraft();
  return (
    !S.dirty ||
    confirm("Есть несохранённые изменения. Продолжить без сохранения?")
  );
}
async function upload(file) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("api.php?action=upload", {
    method: "POST",
    headers: { "X-CSRF-Token": S.boot.csrf },
    body: fd,
  });
  const data = await res.json();
  if (!res.ok) throw Error(data.error);
  return data;
}
function download(name, value) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function addElement(type, url = "") {
  const l = targetLayout();
  if (l.elements.length >= 40) {
    toast("На холсте может быть максимум 40 элементов");
    return;
  }
  const e = {
    id: newId(),
    type,
    text: "Новый текст",
    url,
    x: 8,
    y: 12,
    w: 60,
    size: 32,
    color: "#163c32",
  };
  l.elements.push(e);
  S.selected = e.id;
  mark();
  render();
}
document.addEventListener("click", async (e) => {
  if (!e.target.closest('[data-action="info"], #context-help'))
    $("#context-help")?.remove();
  const link = e.target.closest('a[href^="#"]');
  if (
    link &&
    !link.target &&
    S.dirty &&
    ["editor", "design"].includes(location.hash.slice(1)) &&
    link.hash !== location.hash
  ) {
    if (!confirmLeave()) {
      e.preventDefault();
      return;
    }
    S.dirty = false;
    S.edit = null;
  }
  const b = e.target.closest("[data-action]");
  if (!b) return;
  const action = b.dataset.action;
  if (busy) return;
  try {
    switch (action) {
      case "info": {
        let tip = $("#context-help");
        if (!tip) {
          tip = document.createElement("div");
          tip.id = "context-help";
          tip.setAttribute("popover", "auto");
          tip.setAttribute("role", "note");
          document.body.append(tip);
        }
        tip.textContent = b.dataset.help;
        if (tip.showPopover) tip.showPopover();
        else tip.hidden = false;
        const rect = b.getBoundingClientRect();
        tip.style.left =
          Math.max(12, Math.min(rect.left, innerWidth - tip.offsetWidth - 12)) +
          "px";
        tip.style.top =
          (rect.bottom + tip.offsetHeight + 20 < innerHeight
            ? rect.bottom + 8
            : Math.max(12, rect.top - tip.offsetHeight - 8)) + "px";
        return;
      }
      case "retry":
        await init();
        return;
      case "host":
        location.hash = S.boot.host ? "library" : "login";
        return;
      case "participant":
        S.play = null;
        location.hash = S.token ? "play" : "join";
        return;
      case "logout":
        if (!confirmLeave()) return;
        await api("logout", {});
        S.boot = await api("bootstrap");
        S.quizzes = [];
        S.monitor = null;
        S.active = null;
        S.edit = null;
        S.dirty = false;
        location.hash = "home";
        return;
      case "new":
        if (!confirmLeave()) return;
        editQuiz();
        return;
      case "edit":
        if (!confirmLeave()) return;
        editQuiz(b.dataset.id);
        return;
      case "save":
        busy = true;
        await save();
        return;
      case "question":
        S.qi = Number(b.dataset.index);
        render();
        return;
      case "add-question":
        if (S.edit.content.questions.length >= 150) {
          toast("Максимум 150 вопросов");
          return;
        }
        S.edit.content.questions.push(newQuestion());
        S.qi = S.edit.content.questions.length - 1;
        mark();
        render();
        return;
      case "remove-question":
        if (!confirm("Удалить этот вопрос?")) return;
        S.edit.content.questions.splice(S.qi, 1);
        S.qi = Math.max(0, S.qi - 1);
        mark();
        render();
        return;
      case "duplicate-question": {
        if (S.edit.content.questions.length >= 150) {
          toast("Максимум 150 вопросов");
          return;
        }
        const q = structuredClone(S.edit.content.questions[S.qi]);
        q.id = newId();
        S.edit.content.questions.splice(++S.qi, 0, q);
        mark();
        render();
        return;
      }
      case "move-up":
      case "move-down": {
        const arr = S.edit.content.questions,
          n = S.qi + (action === "move-up" ? -1 : 1);
        if (n < 0 || n >= arr.length) return;
        [arr[S.qi], arr[n]] = [arr[n], arr[S.qi]];
        S.qi = n;
        mark();
        render();
        return;
      }
      case "add-option":
        S.edit.content.questions[S.qi].options.push("Новый вариант");
        mark();
        render();
        return;
      case "remove-option": {
        const q = S.edit.content.questions[S.qi],
          n = Number(b.dataset.index);
        q.options.splice(n, 1);
        q.correct = q.correct
          .filter((x) => x !== n)
          .map((x) => (x > n ? x - 1 : x));
        mark();
        render();
        return;
      }
      case "activate":
        if (
          !confirm(
            "Запустить новую игру? Текущая игра завершится. Все команды начнут новый сеанс без прежнего прогресса.",
          )
        )
          return;
        await api("activate", { id: b.dataset.id });
        await render();
        toast("Викторина в эфире. Можно приглашать команды!");
        return;
      case "stop":
        if (
          !confirm(
            "Завершить активную игру? Ответы сохранятся в истории монитора.",
          )
        )
          return;
        await api("stop", {});
        render();
        return;
      case "delete-quiz":
        if (
          !confirm(
            "Удалить викторину из коллекции? Прошедшие игры сохранятся в истории.",
          )
        )
          return;
        await api("delete_quiz", { id: S.edit.id });
        S.dirty = false;
        S.edit = null;
        location.hash = "library";
        return;
      case "export-quiz":
        download("quiz.json", S.edit.content);
        return;
      case "import": {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json,application/json";
        input.onchange = async () => {
          try {
            if (input.files[0].size > 2000000) throw Error("Файл больше 2 МБ.");
            const content = JSON.parse(await input.files[0].text());
            const result = await api("save_quiz", { content });
            await loadLibrary();
            editQuiz(result.id);
            toast("Викторина импортирована");
          } catch (e) {
            toast(e.message);
          }
        };
        input.click();
        return;
      }
      case "add-text":
        addElement("text");
        return;
      case "add-image":
        dialog(
          '<h2>Изображение по ссылке</h2><form id="image-form"><label>HTTPS-ссылка<input name="url" type="url" required placeholder="https://…"></label><button class="btn primary" type="submit">Добавить</button></form>',
        );
        return;
      case "remove-element": {
        const l = targetLayout();
        l.elements = l.elements.filter((x) => x.id !== S.selected);
        S.selected = null;
        mark();
        render();
        return;
      }
      case "layer-up": {
        const l = targetLayout(),
          i = l.elements.findIndex((x) => x.id === S.selected);
        l.elements.push(l.elements.splice(i, 1)[0]);
        mark();
        render();
        return;
      }
      case "start":
        localStorage.setItem("pereplet_started_" + S.play.run, "1");
        S.play.started = true;
        render();
        return;
      case "team-code":
        dialog(
          `<h2>Код команды</h2><textarea readonly rows="3">${esc(S.token)}</textarea>${btn("Скопировать код", "copy-token", "primary wide")}`,
        );
        return;
      case "copy-token":
        try {
          await navigator.clipboard.writeText(S.token);
          toast("Код скопирован");
        } catch {
          $("dialog textarea").select();
          toast("Код выделен. Скопируйте вручную.");
        }
        return;
      case "new-team":
        S.play = null;
        location.hash = "join";
        return;
      case "close-dialog":
        $("dialog").close();
        return;
      case "inspect": {
        const t = S.monitor.teams.find((t) => t.id === b.dataset.team),
          q = S.monitor.quiz.questions.find((q) => q.id === b.dataset.question),
          a = t.answers.find((a) => a.question_id === q.id);
        if (q.type === "fields") {
          inspectFields(q, a, t);
          return;
        }
        dialog(
          `<div class="eyebrow">${esc(t.name)}</div><h2>${esc(q.text)}</h2><p><b>Ответ:</b> ${esc(answerText(q, a) || "Прочитано")}</p><p><b>Статус:</b> ${a.final ? "Отправлен" : "Черновик — может измениться"}</p>${q.type === "text" ? `<p>Совпадение: ${a.similarity}%</p><p>Допустимые ответы: ${esc(q.accepted.join("; "))}</p>` : q.type === "number" ? `<p>Ожидается ${q.number} ±${q.tolerance}</p>` : !isMaterialSlide(q) && q.options.length ? `<p>Правильный ответ: ${esc(q.correct.map((i) => q.options[i]).join("; "))}</p>` : ""}${a.final && !isMaterialSlide(q) ? `<form id="grade-form" data-team="${t.id}" data-question="${q.id}"><label>Баллы (максимум ${q.points})<input name="score" type="number" min="0" max="${q.points}" step="0.5" value="${a.score}" required></label><button type="submit" class="btn primary">Сохранить оценку</button></form>` : ""}`,
        );
        return;
      }
    }
  } catch (err) {
    toast(err.message);
  } finally {
    busy = false;
  }
});
document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.id === "search") {
    $$("[data-search]").forEach(
      (c) =>
        (c.hidden = !c.dataset.search.includes(t.value.toLocaleLowerCase())),
    );
    return;
  }
  if (t.dataset.field) {
    S.edit.content[t.dataset.field] =
      t.type === "checkbox" ? t.checked : t.value;
    mark();
  }
  if (t.dataset.qfield) {
    const q = S.edit.content.questions[S.qi],
      key = t.dataset.qfield;
    q[key] =
      key === "accepted"
        ? t.value.split("\n")
        : ["number", "tolerance", "points"].includes(key)
          ? t.value === ""
            ? ""
            : Number(t.value)
          : t.value;
    if (key === "type") {
      q.correct = q.correct.length ? [q.correct[0]] : [0];
      if (isMaterialSlide(q)) q.points = 0;
      else if (q.type === "fields") {
        if (!q.fields?.length) q.fields = [newAnswerField(), newAnswerField()];
        q.points = q.fields.reduce((n, f) => n + Number(f.points || 0), 0);
      } else q.points = Math.max(1, Math.min(100, Number(q.points) || 1));
      mark();
      render();
    } else mark();
  }
  if (t.dataset.option !== undefined) {
    S.edit.content.questions[S.qi].options[Number(t.dataset.option)] = t.value;
    mark();
  }
  if (t.dataset.correct !== undefined) {
    const q = S.edit.content.questions[S.qi],
      i = Number(t.dataset.correct);
    q.correct =
      q.type === "single"
        ? [i]
        : t.checked
          ? [...new Set([...q.correct, i])]
          : q.correct.filter((x) => x !== i);
    mark();
  }
  if (t.closest("#answer-form")) {
    const q =
      S.play.quiz.questions[S.play.answers.filter((a) => a.final).length];
    S.value =
      q.type === "fields"
        ? Object.fromEntries(
            $$("[data-field-answer]").map((n) => [
              n.dataset.fieldAnswer,
              n.value,
            ]),
          )
        : ["single", "multiple"].includes(q.type)
          ? $$("#answer-form input:checked").map((x) => Number(x.value))
          : t.value;
    localDraft();
  }
  if (t.id === "canvas-bg") {
    targetLayout().background = t.value;
    $("#canvas").style.background = t.value;
    mark();
  }
  if (t.id.startsWith("el-")) {
    const element = targetLayout().elements.find((x) => x.id === S.selected),
      key = t.id.slice(3);
    element[key] = ["size", "x", "y", "w"].includes(key)
      ? Number(t.value)
      : t.value;
    if (key === "url" && !safeMedia(t.value)) return;
    const node = $('[data-element="' + element.id + '"]');
    if (node) {
      node.style.left = element.x + "%";
      node.style.top = element.y + "%";
      node.style.width = element.w + "%";
      node.style.fontSize = element.size / 10 + "cqw";
      node.style.color = element.color;
      if (element.type === "text") node.textContent = element.text;
      else node.querySelector("img").src = element.url;
    }
    mark();
  }
});
function safeMedia(url) {
  return (
    /^https:\/\//i.test(url) ||
    /^uploads\/[a-f0-9]+\.(jpg|png|gif|webp|mp4|webm|mp3|ogg|wav)$/.test(url)
  );
}
document.addEventListener("change", async (e) => {
  const t = e.target;
  try {
    if (t.id === "question-upload" && t.files[0]) {
      toast("Загружаем материал…");
      const data = await upload(t.files[0]);
      Object.assign(S.edit.content.questions[S.qi], {
        media: data.url,
        mediaType: data.type,
      });
      mark();
      render();
    }
    if (t.id === "design-upload" && t.files[0]) {
      toast("Загружаем изображение…");
      const data = await upload(t.files[0]);
      addElement("image", data.url);
    }
    if (t.id === "design-target") {
      S.designerTarget = t.value;
      S.selected = null;
      render();
    }
    if (t.id === "design-quiz") {
      if (!confirmLeave()) {
        render();
        return;
      }
      S.edit = structuredClone(S.quizzes.find((q) => q.id === t.value));
      S.dirty = false;
      S.designerTarget = "cover";
      S.selected = null;
      render();
    }
    if (t.id === "layer-select") {
      S.selected = t.value;
      render();
    }
    if (t.id === "run-filter") {
      S.runFilter = t.value;
      render();
    }
  } catch (err) {
    toast(err.message);
  }
});
document.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (busy) return;
  busy = true;
  const f = e.target,
    fd = new FormData(f),
    submit = f.querySelector('[type="submit"]');
  if (submit) submit.disabled = true;
  try {
    if (f.id === "login-form") {
      await api("login", { password: fd.get("password") });
      S.boot.host = true;
      location.hash = "library";
    }
    if (f.id === "join-form") {
      const d = await api("join", { name: fd.get("name") });
      S.token = d.token;
      localStorage.setItem("pereplet_team", S.token);
      S.play = null;
      location.hash = "play";
    }
    if (f.id === "restore-form") {
      const previous = S.token;
      try {
        S.token = String(fd.get("token")).trim();
        await playLoad();
        localStorage.setItem("pereplet_team", S.token);
        location.hash = "play";
      } catch (err) {
        S.token = previous;
        throw err;
      }
    }
    if (f.id === "settings-form") {
      await api("settings", {
        venue: fd.get("venue"),
        maxTeams: Number(fd.get("maxTeams")),
        registration: fd.has("registration"),
        feedback: fd.has("feedback"),
        oldPassword: fd.get("oldPassword"),
        password: fd.get("password"),
      });
      await render();
      toast("Настройки сохранены");
    }
    if (f.id === "answer-form") {
      clearTimeout(draftTimer);
      await draftQueue.catch(() => {});
      const p = S.play,
        q = p.quiz.questions[p.answers.filter((a) => a.final).length];
      await api("answer", {
        run: p.run,
        question: q.id,
        value: S.value,
        final: true,
      });
      localStorage.removeItem("pereplet_draft_" + p.run + "_" + q.id);
      await playLoad();
      await render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    if (f.id === "image-form") {
      const url = String(fd.get("url"));
      if (!safeMedia(url)) throw Error("Нужна HTTPS-ссылка.");
      $("dialog").close();
      addElement("image", url);
    }
    if (f.id === "grade-form") {
      await api("grade", {
        run: S.monitor.run.id,
        team: f.dataset.team,
        question: f.dataset.question,
        score: Number(fd.get("score")),
      });
      $("dialog").close();
      await refreshMonitor();
      toast("Оценка обновлена");
    }
  } catch (err) {
    toast(err.message);
  } finally {
    busy = false;
    if (submit) submit.disabled = false;
  }
});
let drag = null;
document.addEventListener("pointerdown", (e) => {
  const node = e.target.closest("[data-element]");
  if (!node) return;
  const l = targetLayout(),
    el = l.elements.find((x) => x.id === node.dataset.element),
    rect = $("#canvas").getBoundingClientRect();
  S.selected = el.id;
  drag = {
    node,
    el,
    rect,
    startX: e.clientX,
    startY: e.clientY,
    x: el.x,
    y: el.y,
    moved: false,
  };
  try {
    node.setPointerCapture(e.pointerId);
  } catch {
    /* Synthetic events have no active pointer. */
  }
  e.preventDefault();
});
document.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const d = drag;
  d.el.x = Math.max(
    0,
    Math.min(100 - d.el.w, d.x + ((e.clientX - d.startX) / d.rect.width) * 100),
  );
  d.el.y = Math.max(
    0,
    Math.min(85, d.y + ((e.clientY - d.startY) / d.rect.height) * 100),
  );
  d.node.style.left = d.el.x + "%";
  d.node.style.top = d.el.y + "%";
  d.moved = true;
});
const endDrag = () => {
  if (!drag) return;
  if (drag.moved) mark();
  drag = null;
  render();
};
document.addEventListener("pointerup", endDrag);
document.addEventListener("pointercancel", endDrag);
window.addEventListener("hashchange", (e) => {
  if (S.dirty) {
    if (!confirmLeave()) {
      history.replaceState(null, "", e.oldURL);
      return;
    }
    persistQuizDraft();
    S.dirty = false;
    S.edit = null;
  }
  if (location.hash !== "#design") studioLeave();
  render();
  window.scrollTo(0, 0);
});
window.addEventListener("beforeunload", (e) => {
  persistQuizDraft();
  if (S.dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
async function init() {
  if (IS_PAGE_PREVIEW) return;
  try {
    S.boot = await api("bootstrap");
    await render();
  } catch (e) {
    $("#app").innerHTML =
      `<main class="auth-card"><h1>Нужна настройка сервера</h1><p>${esc(e.message)}</p>${btn("Повторить", "retry")}</main>`;
  }
}
init();
