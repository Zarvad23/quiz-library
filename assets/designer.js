"use strict";
const IS_PAGE_PREVIEW = new URLSearchParams(location.search).has("preview");
const Studio = {
  screen: "site:home",
  device: "desktop",
  pages: null,
  drafts: {},
  quizId: null,
  selected: null,
  regions: [],
  view: false,
  history: [],
  future: [],
  inputGroup: null,
};
const pageNames = {
  home: "Главная · выбор роли",
  login: "Вход ведущего",
  join: "Создание команды",
  restore: "Восстановление команды",
  waiting: "Ожидание игры",
  "new-game": "Приглашение в новую викторину",
  "waiting-slide": "Ожидание следующего слайда",
  completed: "Завершение без результатов",
  start: "Начало викторины",
  question: "Вопрос",
  finish: "Результаты",
};
const regionNames = {
  brand: "Название сайта",
  venue: "Название площадки",
  content: "Основной блок",
  title: "Заголовок",
  description: "Описание",
  choices: "Выбор роли",
  participant: "Надпись «Участник»",
  host: "Надпись «Ведущий»",
  progress: "Прогресс",
  results: "Ответы и результаты",
};
function blankPage() {
  return {
    mode: "page",
    inherit: true,
    background: "#f6f5f0",
    backgroundImage: "",
    fontSize: 18,
    textColor: "#193c32",
    font: "sans",
    elements: [],
    regions: {},
  };
}
function fullPage(raw) {
  if (raw?.mode === "page")
    return {
      ...blankPage(),
      ...structuredClone(raw),
      regions: { ...(raw.regions || {}) },
    };
  const l = {
    ...blankPage(),
    ...structuredClone(raw || {}),
    mode: "page",
    regions: {},
  };
  l.elements = (l.elements || []).map((e) => ({
    ...e,
    y: 62 + e.y * 0.2,
    size: e.size || 32,
    font: e.font || "serif",
  }));
  return l;
}
function mergePage(base, over) {
  const a = base?.mode === "page" ? base : {},
    b = over?.mode === "page" ? over : {};
  const inherited = b.inherit === false ? {} : a;
  return {
    ...blankPage(),
    ...inherited,
    ...b,
    regions: { ...inherited.regions, ...b.regions },
    elements: [...(inherited.elements || []), ...(b.elements || [])],
  };
}
function studioEnsure() {
  if (!Studio.pages)
    Studio.pages = Object.fromEntries(
      Object.entries(S.boot.appearance || {}).map(([k, v]) => [k, fullPage(v)]),
    );
  for (const [key, legacy] of [
    ["waiting-slide", "waiting"],
    ["new-game", "waiting"],
    ["completed", "finish"],
  ])
    if (!Studio.pages[key] && Studio.pages[legacy])
      Studio.pages[key] = structuredClone(Studio.pages[legacy]);
  if (!S.quizzes.some((q) => q.id === Studio.quizId))
    Studio.quizId =
      S.edit?.id && S.quizzes.some((q) => q.id === S.edit.id)
        ? S.edit.id
        : S.quizzes[0]?.id;
  if (Studio.quizId && !Studio.drafts[Studio.quizId])
    Studio.drafts[Studio.quizId] = structuredClone(
      S.quizzes.find((q) => q.id === Studio.quizId),
    );
}
function studioQuiz() {
  studioEnsure();
  return Studio.drafts[Studio.quizId]?.content;
}
function studioKey() {
  return Studio.screen.startsWith("site:")
    ? Studio.screen.slice(5)
    : Studio.screen === "quiz:cover"
      ? "start"
      : Studio.screen === "quiz:completed"
        ? "completed"
        : Studio.screen === "quiz:finish"
          ? "finish"
          : "question";
}
function studioLayout() {
  studioEnsure();
  if (Studio.screen.startsWith("site:")) {
    const k = studioKey();
    return (Studio.pages[k] ??= blankPage());
  }
  const q = studioQuiz();
  if (!q) {
    Studio.screen = "site:home";
    return (Studio.pages.home ??= blankPage());
  }
  if (Studio.screen === "quiz:cover") return (q.cover = fullPage(q.cover));
  if (Studio.screen === "quiz:completed")
    return (q.completionLayout = fullPage(
      q.completionLayout ?? q.finishLayout,
    ));
  if (Studio.screen === "quiz:finish")
    return (q.finishLayout = fullPage(q.finishLayout));
  const question = q.questions.find((x) => "quiz:" + x.id === Studio.screen);
  if (!question) {
    Studio.screen = "quiz:cover";
    return (q.cover = fullPage(q.cover));
  }
  return (question.layout = fullPage(question.layout));
}
function studioRemember() {
  Studio.history.push(
    JSON.stringify({ pages: Studio.pages, drafts: Studio.drafts }),
  );
  if (Studio.history.length > 35) Studio.history.shift();
  Studio.future = [];
}
function studioUndo(redo = false) {
  const source = redo ? Studio.future : Studio.history,
    target = redo ? Studio.history : Studio.future;
  if (!source.length) return;
  target.push(JSON.stringify({ pages: Studio.pages, drafts: Studio.drafts }));
  const restored = JSON.parse(source.pop());
  Studio.pages = restored.pages;
  Studio.drafts = restored.drafts;
  Studio.selected = null;
  Studio.inputGroup = null;
  mark();
  studioRefresh();
}
function studioPagesHTML() {
  const q = studioQuiz();
  return `<h2>Страницы сайта</h2>${["home", "login", "join", "restore", "waiting", "new-game", "waiting-slide"].map((k) => `<button class="studio-screen ${Studio.screen === "site:" + k ? "selected" : ""}" data-studio-screen="site:${k}"><span>▤</span>${pageNames[k]}</button>`).join("")}<h2>Общие шаблоны викторин</h2>${["start", "question", "finish", "completed"].map((k) => `<button class="studio-screen ${Studio.screen === "site:" + k ? "selected" : ""}" data-studio-screen="site:${k}"><span>▤</span>${pageNames[k]}</button>`).join("")}<h2>Викторина</h2><label class="sr-only" for="studio-quiz">Выберите викторину</label><select id="studio-quiz">${S.quizzes.map((x) => `<option value="${x.id}" ${x.id === Studio.quizId ? "selected" : ""}>${esc(x.title)}</option>`).join("")}</select>${q ? `<button class="studio-screen ${Studio.screen === "quiz:cover" ? "selected" : ""}" data-studio-screen="quiz:cover"><span>▤</span>Начало викторины</button>${q.questions.map((x, i) => `<button class="studio-screen ${Studio.screen === "quiz:" + x.id ? "selected" : ""}" data-studio-screen="quiz:${x.id}"><span>${i + 1}</span><span>${esc(questionLabel(x, i))}</span></button>`).join("")}<button class="studio-screen ${Studio.screen === "quiz:finish" ? "selected" : ""}" data-studio-screen="quiz:finish"><span>✓</span>Результаты</button><button class="studio-screen ${Studio.screen === "quiz:completed" ? "selected" : ""}" data-studio-screen="quiz:completed"><span>✓</span>Завершение без результатов</button>` : '<p class="muted">Пока нет викторин</p>'}`;
}
function studioRender() {
  studioEnsure();
  return `<div class="studio"><header class="studio-header"><a href="#library" class="studio-exit">← Викторины</a><h1>Оформление</h1>${help("Выберите страницу слева. Нажмите на блок, чтобы настроить его справа. Перетаскивайте блоки мышью, меняйте ширину за угол рамки. Текст можно изменить двойным щелчком. Кнопки в предпросмотре не отправляют ответы.")}<span id="save-state" class="muted">${S.dirty ? "Есть изменения" : "Сохранено"}</span><button class="btn primary" data-studio-action="save">Сохранить</button></header><div class="studio-toolbar"><button class="btn light" data-studio-action="text">Текст</button><label class="btn light studio-upload">Изображение / GIF<input id="studio-upload" type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden></label><button class="btn ghost" data-studio-action="undo" title="Отменить">↶ Отменить</button><button class="btn ghost" data-studio-action="redo" title="Вернуть">↷ Вернуть</button><button class="btn light" data-studio-action="reset-page">Вернуть к дефолту</button><button class="btn ghost" data-studio-action="reset-all-dialog">Сбросить всё оформление</button><div class="studio-device"><button class="${Studio.device === "desktop" ? "selected" : ""}" data-studio-action="desktop">Компьютер</button><button class="${Studio.device === "mobile" ? "selected" : ""}" data-studio-action="mobile">Телефон</button></div><button class="btn light" data-studio-action="view">${Studio.view ? "Редактировать" : "Просмотр"}</button><button class="btn ghost" data-studio-action="fullscreen">⛶ Развернуть</button></div><div class="studio-body"><aside class="studio-pages" id="studio-pages">${studioPagesHTML()}</aside><section class="studio-stage" id="studio-stage" aria-label="Визуальный редактор страницы"><div class="studio-frame-wrap" id="studio-frame-wrap"><iframe id="studio-frame" src="index.php?preview=1" title="Предпросмотр страницы участника" sandbox="allow-scripts allow-same-origin"></iframe></div></section><aside class="studio-properties" id="studio-properties">${studioPropertiesHTML()}</aside></div></div>`;
}
function studioReset(all = false) {
  studioEnsure();
  studioRemember();
  const resetQuiz = (q) => {
    q.cover = blankPage();
    q.finishLayout = blankPage();
    q.completionLayout = blankPage();
    q.questions.forEach((question) => (question.layout = blankPage()));
  };
  if (all) {
    Studio.pages = Object.fromEntries(
      Object.keys(pageNames).map((k) => [k, blankPage()]),
    );
    for (const item of S.quizzes) {
      Studio.drafts[item.id] ??= structuredClone(item);
      resetQuiz(Studio.drafts[item.id].content);
    }
  } else if (Studio.screen.startsWith("site:"))
    Studio.pages[studioKey()] = blankPage();
  else {
    const q = studioQuiz(),
      l = { ...blankPage(), inherit: false };
    if (Studio.screen === "quiz:cover") q.cover = l;
    else if (Studio.screen === "quiz:finish") q.finishLayout = l;
    else if (Studio.screen === "quiz:completed") q.completionLayout = l;
    else {
      const question = q.questions.find(
        (x) => "quiz:" + x.id === Studio.screen,
      );
      if (question) question.layout = l;
    }
  }
  Studio.selected = null;
  Studio.inputGroup = null;
  mark();
  studioRefresh();
  toast(
    all
      ? "Всё оформление сброшено. Нажмите «Сохранить», чтобы применить."
      : "Оформление страницы сброшено. Нажмите «Сохранить», чтобы применить.",
  );
}
function studioPropertiesHTML() {
  const l = studioLayout(),
    sel = Studio.selected;
  let obj = null,
    label = "";
  if (sel?.kind === "element") {
    obj = l.elements.find((e) => e.id === sel.id);
    label = obj?.type === "text" ? "Текст" : "Изображение";
  } else if (sel?.kind === "region") {
    obj = l.regions[sel.id] || {};
    label = regionNames[sel.id] || "Блок страницы";
  }
  const fontOptions = (font) =>
    `<option value="sans" ${font !== "serif" ? "selected" : ""}>Простой</option><option value="serif" ${font === "serif" ? "selected" : ""}>Книжный</option>`;
  const alignOptions = (a) =>
    ["left", "center", "right"]
      .map(
        (v, i) =>
          `<option value="${v}" ${a === v ? "selected" : ""}>${["По левому краю", "По центру", "По правому краю"][i]}</option>`,
      )
      .join("");
  return `<h2>${obj ? label : "Страница"}</h2>${obj ? `<button class="studio-back" data-studio-action="deselect">← Настройки страницы</button>${sel.kind === "region" && !["title", "description", "brand", "venue", "participant", "host"].includes(sel.id) ? `<div class="studio-lock">▣ Элемент интерфейса ${help("Этот блок можно перемещать и оформлять. Кнопки и поля нельзя удалить или изменить их действие.")}</div>` : ""}${obj.type !== "image" && !(sel.kind === "region" && !["title", "description", "brand", "venue", "participant", "host"].includes(sel.id)) ? `<label>Текст<textarea data-studio-prop="text" rows="4" maxlength="2000">${esc(obj.text ?? Studio.regions.find((r) => r.id === sel.id)?.text ?? "")}</textarea></label>` : ""}${obj.type !== "image" ? `<label>Шрифт<select data-studio-prop="font">${fontOptions(obj.font)}</select></label><div class="two-col"><label>Размер<input type="number" min="12" max="100" data-studio-prop="size" value="${obj.size ?? Studio.regions.find((r) => r.id === sel.id)?.size ?? 24}"></label><label>Цвет<input type="color" data-studio-prop="color" value="${obj.color || "#193c32"}"></label></div><label>Выравнивание<select data-studio-prop="align">${alignOptions(obj.align || "left")}</select></label><label class="studio-check"><input type="checkbox" data-studio-prop="bold" ${obj.bold ? "checked" : ""}>Жирный</label>` : `<label>Адрес изображения<input data-studio-prop="url" value="${esc(obj.url)}"></label><label class="btn light studio-upload">Заменить изображение<input id="studio-replace-image" type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden></label>`}<label>Ширина, %<input type="range" min="${sel.kind === "region" ? 20 : 5}" max="100" data-studio-prop="w" value="${obj.w ?? Studio.regions.find((r) => r.id === sel.id)?.w ?? 100}"></label><details class="studio-coordinates"><summary>Положение</summary><div class="two-col"><label>По горизонтали<input type="number" step="1" min="${sel.kind === "region" ? -95 : 0}" max="98" data-studio-prop="${sel.kind === "region" ? "dx" : "x"}" value="${Math.round(obj[sel.kind === "region" ? "dx" : "x"] || 0)}"></label><label>По вертикали<input type="number" step="1" min="${sel.kind === "region" ? -95 : 0}" max="98" data-studio-prop="${sel.kind === "region" ? "dy" : "y"}" value="${Math.round(obj[sel.kind === "region" ? "dy" : "y"] || 0)}"></label></div></details>${sel.kind === "element" ? `<div class="studio-element-actions"><button class="btn light" data-studio-action="duplicate">Копировать</button><button class="btn light" data-studio-action="front">Выше</button><button class="btn light" data-studio-action="back">Ниже</button><button class="btn danger" data-studio-action="remove">Удалить</button></div>` : `<button class="btn light wide" data-studio-action="reset-region">Сбросить оформление блока</button>`}` : `<label>Цвет фона<input type="color" data-studio-page="background" value="${l.background}"></label><label class="btn light studio-upload">Фоновое изображение<input id="studio-bg-upload" type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden></label>${l.backgroundImage ? `<button class="btn ghost" data-studio-action="remove-background">Убрать фон</button>` : ""}<div class="two-col"><label>Размер текста<input type="number" min="16" max="28" data-studio-page="fontSize" value="${l.fontSize}"></label><label>Цвет текста<input type="color" data-studio-page="textColor" value="${l.textColor}"></label></div><label>Основной шрифт<select data-studio-page="font">${fontOptions(l.font)}</select></label>`}<h2 class="studio-elements-title">На странице</h2><div class="studio-object-list">${Studio.regions.map((r) => `<button data-studio-region="${r.id}" class="${sel?.kind === "region" && sel.id === r.id ? "selected" : ""}">▣ ${regionNames[r.id]}</button>`).join("")}${l.elements.map((e) => `<button data-studio-element="${e.id}" class="${sel?.kind === "element" && sel.id === e.id ? "selected" : ""}">${e.type === "text" ? "Т" : "▧"} ${esc(e.type === "text" ? e.text.slice(0, 28) || "Текст" : "Изображение")}</button>`).join("")}</div>`;
}
function studioProperties() {
  if ($("#studio-properties"))
    $("#studio-properties").innerHTML = studioPropertiesHTML();
}
function studioSize() {
  const stage = $("#studio-stage"),
    frame = $("#studio-frame"),
    wrap = $("#studio-frame-wrap");
  if (!stage || !frame) return;
  const w = Studio.device === "mobile" ? 390 : 1280,
    h = Studio.device === "mobile" ? 844 : 800;
  const scale = Math.min(
    1,
    Math.max(240, stage.clientWidth - 40) / w,
    Math.max(320, stage.clientHeight - 40) / h,
  );
  frame.style.width = w + "px";
  frame.style.height = h + "px";
  frame.style.transform = `scale(${scale})`;
  wrap.style.width = w * scale + "px";
  wrap.style.height = h * scale + "px";
}
let studioObserver;
function studioMount() {
  studioObserver?.disconnect();
  const frame = $("#studio-frame");
  if (!frame) return;
  frame.addEventListener("load", studioSync);
  studioObserver = new ResizeObserver(studioSize);
  studioObserver.observe($("#studio-stage"));
  studioSize();
  studioSync();
}
function studioSync() {
  const frame = $("#studio-frame");
  if (!frame) return;
  const quiz = structuredClone(
    studioQuiz() || {
      title: "Название викторины",
      description: "",
      questions: [],
      cover: blankPage(),
      finishLayout: blankPage(),
    },
  );
  let questionIndex = Studio.screen.startsWith("quiz:")
    ? quiz.questions.findIndex((q) => "quiz:" + q.id === Studio.screen)
    : 0;
  if (questionIndex < 0) questionIndex = 0;
  let l = studioLayout();
  if (Studio.screen.startsWith("quiz:"))
    l = mergePage(Studio.pages[studioKey()], l);
  frame.contentWindow.postMessage(
    {
      type: "studio-render",
      key: studioKey(),
      quiz,
      questionIndex,
      layout: l,
      settings: { ...S.boot.settings, feedback: S.settings.feedback },
      editing: !Studio.view,
      selected: Studio.selected,
    },
    location.origin,
  );
}
function studioRefresh() {
  if ($("#studio-pages")) $("#studio-pages").innerHTML = studioPagesHTML();
  studioProperties();
  studioSync();
}
function studioSelect(selection) {
  Studio.selected = selection;
  Studio.inputGroup = null;
  studioProperties();
  studioSync();
}
function studioNewElement(type, url = "") {
  const l = studioLayout();
  if (l.elements.length >= 40) {
    toast("Максимум 40 добавленных элементов");
    return;
  }
  studioRemember();
  const e = {
    id: newId(),
    type,
    text: "Новый текст",
    url,
    x: 8,
    y: 55,
    w: type === "image" ? 28 : 44,
    size: 32,
    color: "#193c32",
    font: "sans",
    align: "left",
    bold: false,
  };
  l.elements.push(e);
  Studio.selected = { kind: "element", id: e.id };
  mark();
  studioRefresh();
}
async function studioSave() {
  const before = JSON.stringify({ pages: Studio.pages, drafts: Studio.drafts });
  const quizzes = Object.values(Studio.drafts).map((d) => ({
    id: d.id,
    layouts: {
      cover: d.content.cover,
      finishLayout: d.content.finishLayout || blankPage(),
      completionLayout:
        d.content.completionLayout ?? d.content.finishLayout ?? blankPage(),
      ...Object.fromEntries(d.content.questions.map((q) => [q.id, q.layout])),
    },
  }));
  const result = await api("save_design", { pages: Studio.pages, quizzes });
  S.boot.appearance = result.appearance;
  S.dirty =
    before !== JSON.stringify({ pages: Studio.pages, drafts: Studio.drafts });
  await loadLibrary();
  if ($("#save-state"))
    $("#save-state").textContent = S.dirty ? "Есть изменения" : "Сохранено";
  toast("Оформление сохранено");
}
function appearanceFor() {
  let key = location.hash.slice(1) || "home",
    override = null;
  if (key === "join" && $(".restore")?.open) key = "restore";
  if (key === "play" && S.play) {
    const p = S.play;
    key = p.waiting
      ? p.newGame
        ? "new-game"
        : "waiting"
      : p.done
        ? p.feedback
          ? "finish"
          : "completed"
        : !p.started
          ? "start"
          : p.waitingForHost
            ? "waiting-slide"
            : "question";
    override =
      key === "start"
        ? p.quiz?.cover
        : key === "completed"
          ? (p.quiz?.completionLayout ?? p.quiz?.finishLayout)
          : key === "finish"
            ? p.quiz?.finishLayout
            : key === "question"
              ? p.quiz?.questions[p.answers.filter((a) => a.final).length]
                  ?.layout
              : null;
  }
  if (override?.mode !== "page" && override?.elements?.length)
    override = fullPage(override);
  const legacy = {
    "waiting-slide": "waiting",
    "new-game": "waiting",
    completed: "finish",
  };
  return mergePage(
    S.boot?.appearance?.[key] ?? S.boot?.appearance?.[legacy[key]],
    override,
  );
}
function decoratePage(l, editing = false, selection = null) {
  const page = $(".public-page");
  if (!page) return;
  page.querySelectorAll(".page-decoration-layer").forEach((n) => n.remove());
  page.classList.add("participant-surface");
  page.style.backgroundColor = l.background;
  page.style.backgroundImage = l.backgroundImage
    ? `url("${l.backgroundImage.replace(/["\\]/g, "")}" )`
    : "none";
  page.style.setProperty("--participant-size", l.fontSize + "px");
  page.style.setProperty("--participant-color", l.textColor);
  page.style.setProperty(
    "--participant-font",
    l.font === "serif"
      ? "Georgia, serif"
      : "'Trebuchet MS', 'Segoe UI', sans-serif",
  );
  const mappings = {
    brand: ".brand > span:last-child",
    venue: ".venue-name, .public-page > header > .status",
    content:
      ".welcome, .auth-card, .start-card, .question-play, .finish-head, .host-wait-panel",
    title: "main h1",
    description: ".start-card > p",
    choices: ".role-grid",
    participant: ".role-card:first-child h2",
    host: ".role-card:nth-child(2) h2",
    progress: ".play-progress",
    results: ".review-list",
  };
  for (const [key, selector] of Object.entries(mappings)) {
    const node = page.querySelector(selector);
    if (!node) continue;
    if (node.dataset.originalPageStyle === undefined)
      node.dataset.originalPageStyle = node.getAttribute("style") || "";
    node.setAttribute("style", node.dataset.originalPageStyle);
    if (
      [
        "title",
        "description",
        "brand",
        "venue",
        "participant",
        "host",
      ].includes(key)
    ) {
      if (node.dataset.originalPageText === undefined)
        node.dataset.originalPageText = node.textContent;
      node.textContent = node.dataset.originalPageText;
      if (key === "title" && page.querySelector(".restore[open]"))
        node.textContent = "Восстановить команду";
    }
    node.dataset.pageRegion = key;
    if (getComputedStyle(node).position === "static")
      node.style.position = "relative";
    const r = l.regions?.[key];
    if (r) {
      if (
        r.text !== undefined &&
        [
          "title",
          "description",
          "brand",
          "venue",
          "participant",
          "host",
        ].includes(key)
      )
        node.textContent = r.text;
      if (r.dx || r.dy)
        node.style.transform = `translate(${(r.dx / 100) * innerWidth}px,${(r.dy / 100) * innerHeight}px)`;
      if (r.w) node.style.width = (r.w / 100) * innerWidth + "px";
      if (r.size)
        node.style.fontSize =
          Math.max(16, r.size * Math.min(1, innerWidth / 900)) + "px";
      if (r.color) node.style.color = r.color;
      if (r.font)
        node.style.fontFamily =
          r.font === "serif"
            ? "Georgia, serif"
            : "'Trebuchet MS', 'Segoe UI', sans-serif";
      if (r.align) node.style.textAlign = r.align;
      if (r.bold !== undefined) node.style.fontWeight = r.bold ? "700" : "400";
    }
  }
  for (const node of page.querySelectorAll("[data-page-region]")) {
    if (
      !["content", "choices", "progress", "results", "brand", "venue"].includes(
        node.dataset.pageRegion,
      )
    )
      continue;
    const r = l.regions?.[node.dataset.pageRegion] || {};
    if (r.w || node.offsetWidth > innerWidth - 24)
      node.style.maxWidth = "calc(100vw - 24px)";
    const rect = node.getBoundingClientRect();
    const shiftX =
      rect.left < 12
        ? 12 - rect.left
        : rect.right > innerWidth - 12
          ? innerWidth - 12 - rect.right
          : 0;
    const pageBottom = Math.max(page.offsetHeight, innerHeight) - 12;
    const shiftY =
      rect.top + scrollY < 12
        ? 12 - rect.top - scrollY
        : rect.height < pageBottom - 12 && rect.bottom + scrollY > pageBottom
          ? pageBottom - rect.bottom - scrollY
          : 0;
    if (shiftX || shiftY)
      node.style.transform = `translate(${((r.dx || 0) / 100) * innerWidth + shiftX}px,${((r.dy || 0) / 100) * innerHeight + shiftY}px)`;
  }
  const layer = document.createElement("div");
  layer.className = "page-decoration-layer";
  const pageHeight = Math.max(page.offsetHeight, innerHeight);
  layer.style.height = pageHeight + "px";
  for (const e of l.elements || []) {
    const node = document.createElement("div");
    node.className = "page-element";
    node.dataset.pageElement = e.id;
    node.style.cssText = `left:${e.x}%;top:${e.y}%;width:${e.w}%;font-size:${Math.max(16, e.size * Math.min(1, innerWidth / 1100))}px;color:${e.color};font-family:${e.font === "serif" ? "Georgia,serif" : "inherit"};font-weight:${e.bold ? "700" : "400"};text-align:${e.align || "left"}`;
    if (e.type === "image") {
      const img = document.createElement("img");
      img.src = e.url;
      img.alt = "";
      img.draggable = false;
      node.append(img);
    } else node.textContent = e.text;
    layer.append(node);
  }
  page.append(layer);
  if (editing) {
    document.body.classList.add("preview-editing");
    previewMark(selection);
  }
}
function previewMark(sel) {
  $$(".preview-selected").forEach((n) =>
    n.classList.remove("preview-selected"),
  );
  $$(".preview-resize").forEach((n) => n.remove());
  if (!sel) return;
  const n =
    sel.kind === "element"
      ? $(`[data-page-element="${sel.id}"]`)
      : $(`[data-page-region="${sel.id}"]`);
  if (!n) return;
  n.classList.add("preview-selected");
  const handle = document.createElement("span");
  handle.className = "preview-resize";
  handle.setAttribute("aria-label", "Изменить ширину");
  n.append(handle);
}
let previewData = null,
  previewDrag = null;
function previewSend(value) {
  parent.postMessage({ type: "studio-event", ...value }, location.origin);
}
function previewRender(d) {
  previewData = d;
  document.body.classList.toggle("preview-editing", d.editing);
  S.boot = {
    host: false,
    setup: true,
    settings: d.settings,
    appearance: {},
    active: { title: d.quiz.title },
  };
  const quiz = structuredClone(d.quiz);
  quiz.cover = { ...quiz.cover, mode: "page" };
  quiz.questions.forEach((q) => (q.layout = { ...q.layout, mode: "page" }));
  let html = "";
  if (d.key === "home") html = home();
  else if (d.key === "login") html = login();
  else if (["join", "restore"].includes(d.key)) {
    html = joinPage();
  } else {
    const index = Math.min(
      d.questionIndex,
      Math.max(0, quiz.questions.length - 1),
    );
    const finals = ["finish", "completed"].includes(d.key)
      ? quiz.questions.map((q) => ({
          question_id: q.id,
          final: true,
          value:
            q.type === "fields"
              ? Object.fromEntries(
                  q.fields.map((f) => [f.id, f.accepted[0] || "Пример ответа"]),
                )
              : q.type === "text"
                ? "Пример ответа"
                : q.type === "number"
                  ? "33"
                  : [0],
          correct: true,
          similarity: 100,
          parts:
            q.type === "fields"
              ? q.fields.map((f) => ({
                  field_id: f.id,
                  correct: true,
                  similarity: 100,
                  score: f.points,
                }))
              : [],
          score: q.points,
        }))
      : quiz.questions.slice(0, index).map((q) => ({
          question_id: q.id,
          final: true,
          value: [],
          correct: true,
          score: q.points,
        }));
    if (d.key === "question" && !quiz.questions.length)
      quiz.questions = [
        {
          id: "sample",
          type: "single",
          text: "Текст вопроса",
          options: ["Первый вариант", "Второй вариант"],
          points: 1,
          layout: blankPage(),
        },
      ];
    S.value = quiz.questions[index]?.type === "fields" ? {} : [];
    S.play = {
      team: { name: "Команда" },
      quiz,
      answers: finals,
      waiting: ["waiting", "new-game"].includes(d.key),
      newGame: d.key === "new-game",
      title: quiz.title,
      waitingForHost: d.key === "waiting-slide",
      totalQuestions: quiz.questions.length,
      done: ["finish", "completed"].includes(d.key),
      started: ["question", "waiting-slide"].includes(d.key),
      feedback: d.key === "finish",
    };
    html = playPage();
  }
  $("#app").innerHTML = html;
  if (d.key === "restore") $(".restore")?.setAttribute("open", "");
  decoratePage(d.layout, d.editing, d.selected);
  const regions = $$("[data-page-region]").map((n) => ({
    id: n.dataset.pageRegion,
    text: n.textContent,
    size: Math.round(parseFloat(getComputedStyle(n).fontSize)),
    w: Math.round((n.getBoundingClientRect().width / innerWidth) * 100),
  }));
  previewSend({ kind: "regions", regions });
}
window.addEventListener("message", (e) => {
  if (e.origin !== location.origin) return;
  if (IS_PAGE_PREVIEW) {
    if (e.source === parent && e.data?.type === "studio-render")
      previewRender(e.data);
    return;
  }
  if (
    e.source !== $("#studio-frame")?.contentWindow ||
    e.data?.type !== "studio-event"
  )
    return;
  const d = e.data;
  if (d.kind === "key-action") {
    if (d.action === "undo" || d.action === "redo")
      studioUndo(d.action === "redo");
    else if (d.action === "remove" && Studio.selected?.kind === "element")
      $('[data-studio-action="remove"]')?.click();
  }
  if (d.kind === "ready") {
    studioSync();
  }
  if (d.kind === "regions") {
    Studio.regions = d.regions;
    if (!Studio.inputGroup) studioProperties();
  }
  if (d.kind === "select") {
    Studio.selected = d.selection;
    Studio.inputGroup = null;
    studioProperties();
  }
  if (d.kind === "drag-start") studioRemember();
  if (d.kind === "patch") {
    const l = studioLayout();
    if (d.selection.kind === "element") {
      const obj = l.elements.find((x) => x.id === d.selection.id);
      if (obj) Object.assign(obj, d.patch);
    } else {
      l.regions[d.selection.id] ??= { dx: 0, dy: 0 };
      Object.assign(l.regions[d.selection.id], d.patch);
    }
    Studio.selected = d.selection;
    mark();
    studioProperties();
    if (d.done) studioSync();
  }
});
if (IS_PAGE_PREVIEW) {
  document.addEventListener("DOMContentLoaded", () =>
    previewSend({ kind: "ready" }),
  );
  document.addEventListener(
    "submit",
    (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
    },
    true,
  );
  document.addEventListener(
    "click",
    (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
    },
    true,
  );
  document.addEventListener("input", (e) => e.stopImmediatePropagation(), true);
  document.addEventListener(
    "dblclick",
    (e) => {
      if (!previewData?.editing) return;
      const node = e.target.closest("[data-page-element],[data-page-region]");
      if (!node) return;
      const selection = node.dataset.pageElement
        ? { kind: "element", id: node.dataset.pageElement }
        : { kind: "region", id: node.dataset.pageRegion };
      if (
        selection.kind === "element" &&
        previewData.layout.elements.find((x) => x.id === selection.id)?.type !==
          "text"
      )
        return;
      if (
        selection.kind === "region" &&
        ![
          "title",
          "description",
          "brand",
          "venue",
          "participant",
          "host",
        ].includes(selection.id)
      )
        return;
      node.querySelector(".preview-resize")?.remove();
      node.contentEditable = "plaintext-only";
      node.focus();
      const range = document.createRange();
      range.selectNodeContents(node);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      node.addEventListener(
        "blur",
        () => {
          node.contentEditable = "false";
          previewSend({ kind: "drag-start" });
          previewSend({
            kind: "patch",
            selection,
            patch: { text: node.innerText },
            done: true,
          });
        },
        { once: true },
      );
      e.preventDefault();
      e.stopImmediatePropagation();
    },
    true,
  );
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (
        !previewData?.editing ||
        e.target.closest('[contenteditable="plaintext-only"]')
      )
        return;
      const node = e.target.closest("[data-page-element],[data-page-region]");
      if (!node) {
        previewSend({ kind: "select", selection: null });
        previewMark(null);
        return;
      }
      const selection = node.dataset.pageElement
        ? { kind: "element", id: node.dataset.pageElement }
        : { kind: "region", id: node.dataset.pageRegion };
      const obj =
        selection.kind === "element"
          ? previewData.layout.elements.find((x) => x.id === selection.id)
          : previewData.layout.regions[selection.id] || {};
      previewDrag = {
        node,
        selection,
        obj: { ...obj },
        startX: e.clientX,
        startY: e.clientY,
        resize: e.target.classList.contains("preview-resize"),
        moved: false,
        parentWidth:
          selection.kind === "region"
            ? innerWidth
            : node.parentElement.clientWidth,
        baseW:
          obj.w ||
          (node.getBoundingClientRect().width /
            node.parentElement.clientWidth) *
            100,
      };
      previewSend({ kind: "select", selection });
      previewMark(selection);
      try {
        node.setPointerCapture(e.pointerId);
      } catch {}
      e.preventDefault();
      e.stopImmediatePropagation();
    },
    true,
  );
  document.addEventListener(
    "pointermove",
    (e) => {
      if (!previewDrag) return;
      const d = previewDrag,
        dx = e.clientX - d.startX,
        dy = e.clientY - d.startY;
      if (!d.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
      if (!d.moved) {
        previewSend({ kind: "drag-start" });
        d.moved = true;
      }
      let patch;
      if (d.resize) {
        const base = d.baseW;
        patch = {
          w: Math.max(
            d.selection.kind === "region" ? 20 : 5,
            Math.min(100, base + (dx / d.parentWidth) * 100),
          ),
        };
        d.node.style.width =
          d.selection.kind === "region"
            ? (patch.w / 100) * innerWidth + "px"
            : patch.w + "%";
      } else if (d.selection.kind === "element") {
        const root = $(".page-decoration-layer");
        patch = {
          x: Math.max(
            0,
            Math.min(100 - d.obj.w, d.obj.x + (dx / innerWidth) * 100),
          ),
          y: Math.max(
            0,
            Math.min(98, d.obj.y + (dy / root.offsetHeight) * 100),
          ),
        };
        d.node.style.left = patch.x + "%";
        d.node.style.top = patch.y + "%";
      } else {
        patch = {
          dx: Math.max(
            -95,
            Math.min(95, (d.obj.dx || 0) + (dx / innerWidth) * 100),
          ),
          dy: Math.max(
            -95,
            Math.min(95, (d.obj.dy || 0) + (dy / innerHeight) * 100),
          ),
        };
        d.node.style.transform = `translate(${(patch.dx / 100) * innerWidth}px,${(patch.dy / 100) * innerHeight}px)`;
      }
      d.patch = patch;
      previewSend({ kind: "patch", selection: d.selection, patch });
      e.preventDefault();
      e.stopImmediatePropagation();
    },
    true,
  );
  const end = () => {
    if (!previewDrag) return;
    const d = previewDrag;
    previewDrag = null;
    if (d.moved)
      previewSend({
        kind: "patch",
        selection: d.selection,
        patch: d.patch,
        done: true,
      });
  };
  document.addEventListener("pointerup", end, true);
  document.addEventListener("pointercancel", end, true);
  document.addEventListener("keydown", (e) => {
    if (!previewData?.editing || e.target.isContentEditable) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      previewSend({ kind: "key-action", action: e.shiftKey ? "redo" : "undo" });
    }
    if (e.key === "Delete") {
      e.preventDefault();
      previewSend({ kind: "key-action", action: "remove" });
    }
    if (e.key === "Escape") {
      previewMark(null);
      previewSend({ kind: "select", selection: null });
    }
  });
}
if (!IS_PAGE_PREVIEW) {
  document.addEventListener(
    "click",
    async (e) => {
      const screen = e.target.closest("[data-studio-screen]"),
        region = e.target.closest("[data-studio-region]"),
        element = e.target.closest("[data-studio-element]"),
        button = e.target.closest("[data-studio-action]");
      if (screen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        Studio.screen = screen.dataset.studioScreen;
        Studio.selected = null;
        Studio.inputGroup = null;
        studioRefresh();
        return;
      }
      if (region || element) {
        e.preventDefault();
        e.stopImmediatePropagation();
        studioSelect({
          kind: region ? "region" : "element",
          id: region
            ? region.dataset.studioRegion
            : element.dataset.studioElement,
        });
        return;
      }
      if (!button) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const action = button.dataset.studioAction;
      try {
        switch (action) {
          case "save":
            button.disabled = true;
            await studioSave();
            break;
          case "reset-page":
            studioReset();
            break;
          case "reset-all-dialog":
            dialog(
              '<h2>Сбросить всё оформление?</h2><p>Вернутся стандартные цвета, шрифты и расположение блоков на всех страницах и во всех викторинах. Добавленные элементы оформления будут убраны. Тексты вопросов, материалы, ответы и баллы сохранятся.</p><div class="dialog-actions"><button class="btn danger" data-studio-action="reset-all">Сбросить всё оформление</button><button class="btn light" data-action="close-dialog">Отмена</button></div>',
            );
            break;
          case "reset-all":
            $("dialog")?.close();
            studioReset(true);
            break;
          case "text":
            studioNewElement("text");
            break;
          case "undo":
            studioUndo();
            break;
          case "redo":
            studioUndo(true);
            break;
          case "desktop":
          case "mobile":
            Studio.device = action;
            $$(".studio-device button").forEach((b) =>
              b.classList.toggle("selected", b.dataset.studioAction === action),
            );
            studioSize();
            studioSync();
            break;
          case "view":
            Studio.view = !Studio.view;
            button.textContent = Studio.view ? "Редактировать" : "Просмотр";
            studioSync();
            break;
          case "fullscreen":
            if (!document.fullscreenElement)
              await $(".studio").requestFullscreen();
            else await document.exitFullscreen();
            break;
          case "deselect":
            studioSelect(null);
            break;
          case "remove-background":
            studioRemember();
            studioLayout().backgroundImage = "";
            mark();
            studioRefresh();
            break;
          case "reset-region":
            if (Studio.selected?.kind === "region") {
              studioRemember();
              delete studioLayout().regions[Studio.selected.id];
              mark();
              studioRefresh();
            }
            break;
          case "duplicate": {
            const l = studioLayout(),
              obj = l.elements.find((x) => x.id === Studio.selected?.id);
            if (!obj || l.elements.length >= 40) return;
            studioRemember();
            const copy = {
              ...obj,
              id: newId(),
              x: Math.min(90, obj.x + 3),
              y: Math.min(90, obj.y + 3),
            };
            l.elements.push(copy);
            Studio.selected = { kind: "element", id: copy.id };
            mark();
            studioRefresh();
            break;
          }
          case "remove": {
            const l = studioLayout();
            if (Studio.selected?.kind !== "element") return;
            studioRemember();
            l.elements = l.elements.filter((x) => x.id !== Studio.selected.id);
            Studio.selected = null;
            mark();
            studioRefresh();
            break;
          }
          case "front":
          case "back": {
            const l = studioLayout(),
              i = l.elements.findIndex((x) => x.id === Studio.selected?.id);
            if (i < 0) return;
            const next = i + (action === "front" ? 1 : -1);
            if (next < 0 || next >= l.elements.length) return;
            studioRemember();
            [l.elements[i], l.elements[next]] = [
              l.elements[next],
              l.elements[i],
            ];
            mark();
            studioRefresh();
            break;
          }
        }
      } catch (err) {
        toast(err.message);
      } finally {
        button.disabled = false;
      }
    },
    true,
  );
  document.addEventListener(
    "input",
    (e) => {
      const t = e.target,
        key = t.dataset.studioProp,
        page = t.dataset.studioPage;
      if (!key && !page) return;
      e.stopImmediatePropagation();
      if (Studio.inputGroup !== t) {
        studioRemember();
        Studio.inputGroup = t;
      }
      const l = studioLayout();
      let obj;
      if (page) obj = l;
      else if (Studio.selected?.kind === "element")
        obj = l.elements.find((x) => x.id === Studio.selected.id);
      else if (Studio.selected?.kind === "region")
        obj = l.regions[Studio.selected.id] ??= { dx: 0, dy: 0 };
      if (!obj) return;
      const k = key || page;
      const value =
        t.type === "checkbox"
          ? t.checked
          : ["size", "fontSize", "w", "x", "y", "dx", "dy"].includes(k)
            ? Number(t.value)
            : t.value;
      if (["url", "backgroundImage"].includes(k) && value && !safeMedia(value))
        return;
      obj[k] = value;
      mark();
      studioSync();
    },
    true,
  );
  document.addEventListener(
    "change",
    async (e) => {
      const t = e.target;
      if (t.id === "studio-quiz") {
        Studio.quizId = t.value;
        Studio.screen = "quiz:cover";
        Studio.selected = null;
        Studio.inputGroup = null;
        studioEnsure();
        studioRefresh();
        return;
      }
      if (
        !["studio-upload", "studio-bg-upload", "studio-replace-image"].includes(
          t.id,
        ) ||
        !t.files?.[0]
      )
        return;
      e.stopImmediatePropagation();
      try {
        const result = await upload(t.files[0]);
        if (result.type !== "image")
          throw Error("Выберите изображение или GIF.");
        if (t.id === "studio-upload") studioNewElement("image", result.url);
        else {
          studioRemember();
          const l = studioLayout();
          if (t.id === "studio-bg-upload") l.backgroundImage = result.url;
          else {
            const obj = l.elements.find((x) => x.id === Studio.selected?.id);
            if (obj) obj.url = result.url;
          }
          mark();
          studioRefresh();
        }
      } catch (err) {
        toast(err.message);
      }
    },
    true,
  );
  document.addEventListener("keydown", (e) => {
    if (
      location.hash !== "#design" ||
      e.target.matches("input,textarea,select") ||
      e.target.isContentEditable
    )
      return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      studioUndo(e.shiftKey);
    }
    if (e.key === "Escape") studioSelect(null);
    if (e.key === "Delete" && Studio.selected?.kind === "element")
      $('[data-studio-action="remove"]')?.click();
  });
}
function studioLeave() {
  Studio.pages = null;
  Studio.drafts = {};
  Studio.selected = null;
  Studio.history = [];
  Studio.future = [];
  Studio.inputGroup = null;
  studioObserver?.disconnect();
}

if (!IS_PAGE_PREVIEW)
  document.addEventListener(
    "toggle",
    (e) => {
      if (e.target.matches?.(".restore") && location.hash === "#join")
        decoratePage(appearanceFor());
    },
    true,
  );
