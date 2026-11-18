"use strict";
const QUIZ_DRAFT_STORAGE =
  "pereplet_quiz_drafts_v1:" + location.pathname.replace(/\/index\.php$/i, "/");
let draftSaveTimer = null,
  draftStorageFailed = false;
function quizDrafts() {
  try {
    const v = JSON.parse(localStorage.getItem(QUIZ_DRAFT_STORAGE) || "[]");
    return Array.isArray(v)
      ? v.filter((x) => x?.edit?.content && typeof x.key === "string")
      : [];
  } catch {
    return [];
  }
}
function persistQuizDraft() {
  clearTimeout(draftSaveTimer);
  if (IS_PAGE_PREVIEW || location.hash !== "#editor" || !S.edit || !S.dirty)
    return false;
  try {
    const e = S.edit;
    e.draftKey ??= e.id || "new-" + newId();
    const drafts = quizDrafts().filter((x) => x.key !== e.draftKey);
    drafts.unshift({
      key: e.draftKey,
      edit: {
        id: e.id,
        content: structuredClone(e.content),
        draftKey: e.draftKey,
      },
      qi: S.qi,
      savedAt: Date.now(),
    });
    localStorage.setItem(QUIZ_DRAFT_STORAGE, JSON.stringify(drafts));
    draftStorageFailed = false;
    const node = $("#draft-status");
    if (node) {
      node.textContent = "Черновик на этом устройстве";
      node.classList.remove("bad");
    }
    return true;
  } catch {
    draftStorageFailed = true;
    const node = $("#draft-status");
    if (node) {
      node.textContent =
        "Не удалось записать черновик. Не закрывайте страницу до сохранения.";
      node.classList.add("bad");
    }
    return false;
  }
}
function queueQuizDraft() {
  if (IS_PAGE_PREVIEW || location.hash !== "#editor") return;
  clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(persistQuizDraft, 250);
}
function removeQuizDraft(key) {
  try {
    localStorage.setItem(
      QUIZ_DRAFT_STORAGE,
      JSON.stringify(quizDrafts().filter((d) => d.key !== key)),
    );
  } catch {}
}
function draftLibraryBanner() {
  const drafts = quizDrafts();
  return drafts.length
    ? `<section class="draft-recovery panel"><div><h2>Несохранённые черновики</h2><p>На этом устройстве есть изменения, которые ещё не сохранены в викторинах.</p></div><div class="draft-recovery-list">${drafts.map((d) => `<div><span><b>${esc(d.edit.content.title || "Без названия")}</b><small>${new Date(d.savedAt).toLocaleString("ru-RU")}</small></span><button class="btn light" data-host-action="restore-draft" data-key="${esc(d.key)}">Восстановить</button><button class="icon-btn" data-host-action="delete-draft" data-key="${esc(d.key)}" title="Удалить черновик" aria-label="Удалить черновик">×</button></div>`).join("")}</div></section>`
    : "";
}
function offerQuizDraft(id) {
  const draft = quizDrafts().find((d) => (id ? d.edit.id === id : !d.edit.id));
  if (!draft) return false;
  dialog(
    `<h2>Есть несохранённый черновик</h2><p>${esc(draft.edit.content.title || "Новая викторина")}</p><div class="dialog-actions"><button class="btn primary" data-host-action="restore-draft" data-key="${esc(draft.key)}">Восстановить черновик</button><button class="btn light" data-host-action="open-saved" data-id="${esc(id || "")}">${id ? "Открыть сохранённую версию" : "Создать другую викторину"}</button></div>`,
  );
  return true;
}
function restoreQuizDraft(key) {
  const d = quizDrafts().find((d) => d.key === key);
  if (!d) return;
  S.edit = structuredClone(d.edit);
  S.qi = Math.min(d.qi || 0, Math.max(0, S.edit.content.questions.length - 1));
  S.editorIssues = clientQuizIssues(S.edit.content);
  S.dirty = true;
  $("dialog")?.close();
  if (location.hash !== "#editor") history.pushState(null, "", "#editor");
  render().then(() => {
    const node = $("#save-state");
    if (node) node.textContent = "Восстановлен черновик";
  });
}
function questionLabel(q, index) {
  return (
    q.text?.trim() ||
    (q.type === "info"
      ? "Информационный слайд"
      : q.type === "link"
        ? "Ссылка на материал"
        : q.type === "fields"
          ? "Несколько полей ответа"
          : "Вопрос") + (Number.isInteger(index) ? " " + (index + 1) : "")
  );
}
function clientQuizIssues(content) {
  const errors = [],
    add = (index, field, message) =>
      errors.push({
        index,
        questionId: index === null ? null : content.questions[index]?.id,
        field,
        message,
      });
  if (!content.title?.trim()) add(null, "title", "Укажите название викторины.");
  for (const [i, q] of content.questions.entries()) {
    if (!["info", "link", "fields"].includes(q.type) && !q.text?.trim())
      add(i, "text", "Заполните текст вопроса.");
    if (["single", "multiple"].includes(q.type)) {
      if (q.options.length < 2)
        add(i, "options", "Добавьте минимум два варианта ответа.");
      else if (q.options.some((v) => !v.trim()))
        add(i, "options", "Заполните все варианты ответа или удалите пустые.");
      if (!q.correct?.length) add(i, "correct", "Отметьте правильный ответ.");
      else if (q.type === "single" && q.correct.length !== 1)
        add(i, "correct", "Должен быть один правильный ответ.");
      else if (q.correct.some((n) => n < 0 || n >= q.options.length))
        add(
          i,
          "correct",
          "Выберите правильный ответ из существующих вариантов.",
        );
    }
    if (q.type === "text" && !q.accepted.some((v) => v.trim()))
      add(i, "accepted", "Укажите хотя бы один допустимый ответ.");
    if (q.type === "number")
      for (const [field, message] of Object.entries({
        number: "Укажите правильное число.",
        tolerance: "Укажите допустимую погрешность (можно 0).",
      }))
        if (q[field] === "" || !Number.isFinite(Number(q[field])))
          add(i, field, message);
    for (const issue of extraQuestionIssues(q))
      add(i, issue.field, issue.message);
    if (q.media) {
      let ok =
        /^uploads\/[a-f0-9]+\.(jpg|png|gif|webp|mp4|webm|mp3|ogg|wav)$/.test(
          q.media,
        );
      try {
        const u = new URL(q.media);
        ok ||= u.protocol === "https:" && !u.username;
      } catch {}
      if (!ok)
        add(i, "media", "Загрузите файл или укажите HTTPS-ссылку на медиа.");
    }
  }
  return errors;
}
function slideHasIssue(i) {
  return (S.editorIssues || []).some((x) => x.index === i);
}
function issuesListHTML(issues) {
  return `<ul class="validation-issues">${issues.map((issue, n) => `<li><button data-host-action="go-error" data-error="${n}"><b>${issue.index === null ? "Название викторины" : "Слайд " + (issue.index + 1)}</b><span>${esc(issue.message)}</span></button></li>`).join("")}</ul>`;
}
function editorIssuesHTML() {
  return `<div id="editor-errors">${S.editorIssues?.length ? `<section class="editor-error-panel" role="alert"><h2>Викторина не сохранена</h2>${issuesListHTML(S.editorIssues)}</section>` : ""}</div>`;
}
function refreshEditorIssues() {
  if (!S.editorIssues?.length || location.hash !== "#editor") return;
  S.editorIssues = clientQuizIssues(S.edit.content);
  $$('[aria-invalid="true"]').forEach((n) => {
    n.removeAttribute("aria-invalid");
    n.classList.remove("field-invalid");
  });
  if ($("#editor-errors")) $("#editor-errors").outerHTML = editorIssuesHTML();
  $$(".question-tab").forEach((n, i) =>
    n.classList.toggle("invalid", slideHasIssue(i)),
  );
}
async function showQuizSaveFailure(error) {
  S.dirty = true;
  persistQuizDraft();
  S.editorIssues = error.issues?.length
    ? error.issues
    : clientQuizIssues(S.edit.content);
  await render();
  dialog(
    `<div class="save-error-modal" role="alert"><div class="save-error-symbol">!</div><h2>Викторина не сохранена</h2><p>${esc(error.message)}</p>${S.editorIssues.length ? issuesListHTML(S.editorIssues) : ""}<p class="${draftStorageFailed ? "bad" : "muted"}">${draftStorageFailed ? "Не закрывайте страницу: черновик не удалось записать." : "Изменения остались в черновике этого браузера."}</p><button class="btn primary wide" data-host-action="fix-errors">${S.editorIssues.length ? "Перейти к ошибке" : "Вернуться к редактированию"}</button></div>`,
  );
}
async function focusQuizIssue(index) {
  const issue = S.editorIssues?.[index];
  $("dialog")?.close();
  if (!issue) return;
  if (issue.index !== null) S.qi = issue.index;
  await render();
  const selectors = {
    title: '[data-field="title"]',
    options: "[data-option]",
    correct: "[data-correct]",
  };
  const part = /^fields\.(\d+)\.(label|accepted|points)$/.exec(issue.field);
  const node = part
    ? $(`[data-field-index="${part[1]}"][data-part-field="${part[2]}"]`)
    : issue.field === "fields"
      ? $("[data-part-field]")
      : issue.field === "options"
        ? $$("[data-option]").find((n) => !n.value.trim()) || $("[data-option]")
        : $(selectors[issue.field] || `[data-qfield="${issue.field}"]`);
  if (node) {
    if (node.closest("details")) node.closest("details").open = true;
    node.classList.add("field-invalid");
    node.setAttribute("aria-invalid", "true");
    node.scrollIntoView({ block: "center", behavior: "smooth" });
    node.focus({ preventScroll: true });
  }
}
function pacedControlsHTML(data) {
  const { run, quiz } = data;
  if (!run?.paced) return "";
  const n = run.released || 0,
    q = quiz.questions[n],
    last = quiz.questions[n - 1];
  return `<section class="paced-controls panel"><div><h3>Показ слайдов ведущим</h3><p>${n ? "Открыт слайд " + n + ": " + esc(questionLabel(last, n - 1)) : "Участники ожидают первый слайд"}</p></div>${q ? `<button class="btn primary" data-host-action="release-next" data-run="${esc(run.id)}" data-expected="${n}" ${run.ended ? "disabled" : ""}>Показать слайд ${n + 1}</button><span class="muted">${esc(questionLabel(q, n))}</span>` : '<span class="badge">Все слайды открыты</span>'}</section>`;
}
if (!IS_PAGE_PREVIEW) {
  document.addEventListener(
    "click",
    async (e) => {
      const b = e.target.closest("[data-host-action]");
      if (!b) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      try {
        switch (b.dataset.hostAction) {
          case "restore-draft":
            restoreQuizDraft(b.dataset.key);
            break;
          case "delete-draft":
            if (confirm("Удалить этот несохранённый черновик?")) {
              removeQuizDraft(b.dataset.key);
              render();
            }
            break;
          case "open-saved":
            $("dialog")?.close();
            editQuiz(b.dataset.id || undefined, true);
            break;
          case "go-error":
            await focusQuizIssue(Number(b.dataset.error));
            break;
          case "fix-errors":
            if (S.editorIssues?.length) await focusQuizIssue(0);
            else $("dialog")?.close();
            break;
          case "release-next":
            b.disabled = true;
            await api("release_next", {
              run: b.dataset.run,
              expected: Number(b.dataset.expected),
            });
            await refreshMonitor();
            break;
        }
      } catch (err) {
        dialog(
          `<h2>Не удалось выполнить действие</h2><p>${esc(err.message)}</p><button class="btn primary" data-action="close-dialog">Закрыть</button>`,
        );
      } finally {
        b.disabled = false;
      }
    },
    true,
  );
  document.addEventListener(
    "change",
    (e) => {
      if (
        e.target.matches("select[data-field]") &&
        S.edit &&
        S.edit.content[e.target.dataset.field] !== e.target.value
      ) {
        S.edit.content[e.target.dataset.field] = e.target.value;
        mark();
      }
      if (e.target.id === "monitor-show-info") {
        S.monitorShowInfo = e.target.checked;
        localStorage.setItem(
          "pereplet_monitor_info",
          S.monitorShowInfo ? "1" : "0",
        );
        const content = $("#monitor-content"),
          table = content?.querySelector(".table-scroll"),
          left = table?.scrollLeft || 0,
          top = table?.scrollTop || 0;
        if (content && S.monitor) {
          content.innerHTML = monitorHTML(S.monitor);
          const next = content.querySelector(".table-scroll");
          if (next) {
            next.scrollLeft = left;
            next.scrollTop = top;
          }
        }
      }
    },
    true,
  );
  window.addEventListener("pagehide", persistQuizDraft);
}

function monitorQuestions(quiz) {
  return (quiz?.questions || [])
    .map((q, i) => ({ ...q, ordinal: i + 1 }))
    .filter(
      (q) =>
        !isMaterialSlide(q) ||
        (S.monitorShowInfo ??=
          localStorage.getItem("pereplet_monitor_info") === "1"),
    );
}
function hostWaitHTML(p) {
  const total = p.totalQuestions ?? p.quiz.questions.length,
    index = p.answers.filter((a) => a.final).length;
  return `<div class="play-progress"><span>${esc(p.quiz.title)}</span><b>${index} / ${total}</b><div><span style="width:${total ? (100 * index) / total : 0}%"></span></div></div><section class="panel host-wait-panel" role="status"><h1>Ожидание следующего слайда</h1></section>`;
}
