"use strict";
function isMaterialSlide(q) {
  return ["info", "link"].includes(q.type);
}
function newAnswerField() {
  return { id: newId(), label: "", accepted: [], points: 1 };
}
function safeResourceURL(value) {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    !/^https?:\/\//i.test(value)
  )
    return false;
  try {
    const u = new URL(value);
    return (
      ["http:", "https:"].includes(u.protocol) && !u.username && !u.password
    );
  } catch {
    return false;
  }
}
function resourceLinkHTML(q) {
  return safeResourceURL(q.resourceUrl)
    ? `<p class="question-resource"><a class="btn light" href="${esc(q.resourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(q.resourceLabel?.trim() || "Открыть материал")} ↗</a></p>`
    : "";
}
function resourceEditorHTML(q) {
  return `<details class="resource-editor" ${q.type === "link" || q.resourceUrl ? "open" : ""}><summary>${q.type === "link" ? "Ссылка на материал" : "Добавить ссылку на материал"}</summary><label>Адрес ${q.type === "link" ? "" : "(необязательно)"}<input data-qfield="resourceUrl" type="url" maxlength="2048" value="${esc(q.resourceUrl || "")}" placeholder="https://…"></label><label>Текст кнопки<input data-qfield="resourceLabel" maxlength="100" value="${esc(q.resourceLabel || "Открыть материал")}"></label></details>`;
}
function fieldsEditorHTML(q) {
  return `<section class="fields-editor"><h3>Вопросы и поля ответа ${help("Каждое поле проверяется отдельно. Баллы за верные ответы складываются. Допустимые ответы укажите с новой строки; регистр, пунктуация и Е/Ё не учитываются.")}</h3>${(q.fields || []).map((f, i) => `<div class="field-editor"><div class="section-title"><b>Поле ${i + 1}</b><button class="btn danger" data-fields-action="remove" data-index="${i}" ${(q.fields || []).length <= 2 ? "disabled" : ""}>Удалить</button></div><label>Вопрос или подпись<input data-field-index="${i}" data-part-field="label" maxlength="300" value="${esc(f.label)}" placeholder="Например: Имя героя"></label><div class="field-answer-settings"><label>Допустимые ответы<textarea data-field-index="${i}" data-part-field="accepted" rows="2">${esc(f.accepted.join("\n"))}</textarea></label><label>Баллы<input data-field-index="${i}" data-part-field="points" type="number" min="1" max="100" step="1" value="${f.points}"></label></div></div>`).join("")}${(q.fields || []).length < 12 ? '<button class="btn light" data-fields-action="add">+ Добавить поле</button>' : ""}<p class="muted">Всего за слайд: <b id="fields-total">${q.points}</b> б.</p></section>`;
}
function extraQuestionIssues(q) {
  const out = [],
    add = (field, message) => out.push({ field, message });
  if (
    (q.type === "link" && !q.resourceUrl?.trim()) ||
    (q.resourceUrl && !safeResourceURL(q.resourceUrl))
  )
    add("resourceUrl", "Укажите ссылку, начинающуюся с https:// или http://.");
  if (q.type === "fields") {
    if (!Array.isArray(q.fields) || q.fields.length < 2 || q.fields.length > 12)
      add("fields", "На слайде должно быть от 2 до 12 полей ответа.");
    else
      q.fields.forEach((f, i) => {
        if (!f.label?.trim())
          add(
            `fields.${i}.label`,
            `Поле ${i + 1}: введите вопрос или подпись.`,
          );
        if (!f.accepted?.some((a) => a.trim()))
          add(
            `fields.${i}.accepted`,
            `Поле ${i + 1}: укажите допустимый ответ.`,
          );
        if (
          !Number.isInteger(Number(f.points)) ||
          Number(f.points) < 1 ||
          Number(f.points) > 100
        )
          add(
            `fields.${i}.points`,
            `Поле ${i + 1}: баллы должны быть целым числом от 1 до 100.`,
          );
      });
  }
  return out;
}
function fieldsPlayHTML(q, value) {
  return `<div class="field-answer-list">${q.fields.map((f, i) => `<label><span>${i + 1}. ${esc(f.label)} <small>${f.points} б.</small></span><input data-field-answer="${esc(f.id)}" name="field-${esc(f.id)}" maxlength="300" autocomplete="off" value="${esc(value?.[f.id] || "")}" placeholder="Введите ответ"></label>`).join("")}</div>`;
}
function fieldResult(a, id) {
  return (
    (a.parts || []).find((p) => p.field_id === id) || {
      correct: false,
      score: 0,
      similarity: 0,
    }
  );
}
function fieldsMonitorHTML(q, a, team) {
  return `<button class="answer-cell fields-cell ${!a.final ? "draft" : a.correct ? "ok" : a.score > 0 ? "partial" : "bad"}" data-action="inspect" data-team="${team}" data-question="${q.id}">${q.fields
    .map((f) => {
      const p = fieldResult(a, f.id);
      return `<span class="field-monitor-row"><b>${!a.final ? "◌" : p.correct ? "✓" : "×"} ${esc(f.label)}</b><span>${esc(a.value?.[f.id] || "—")}</span><small>${a.final ? `${p.score}/${f.points} б.` : "Черновик"}</small></span>`;
    })
    .join(
      "",
    )}<small>${a.final ? `Всего: ${a.score}/${q.points} б.` : "Не отправлено"}</small></button>`;
}
function fieldsReviewHTML(q, a) {
  return `<div class="field-results">${q.fields
    .map((f) => {
      const p = fieldResult(a, f.id);
      return `<section><h3 class="${p.correct ? "ok" : "bad"}">${p.correct ? "✓" : "×"} ${esc(f.label)} <small>${p.score}/${f.points} б.</small></h3><p>Ваш ответ: ${esc(a.value?.[f.id] || "—")}</p><p>Допустимые ответы: ${esc(f.accepted.join("; "))}</p><p>Совпадение: ${p.similarity}%</p></section>`;
    })
    .join("")}${q.explanation ? `<p>${esc(q.explanation)}</p>` : ""}</div>`;
}
function inspectFields(q, a, t) {
  dialog(
    `<div class="eyebrow">${esc(t.name)}</div><h2>${esc(questionLabel(q))}</h2><p>${a.final ? "Ответ отправлен" : "Черновик — может измениться"}</p><div class="field-results">${q.fields
      .map((f) => {
        const p = fieldResult(a, f.id);
        return `<section><h3>${esc(f.label)}</h3><p><b>Ответ:</b> ${esc(a.value?.[f.id] || "—")}</p><p>Допустимые ответы: ${esc(f.accepted.join("; "))}</p><p>Совпадение: ${p.similarity}% · <span data-field-grade-result="${f.id}" class="${p.correct ? "ok" : "bad"}">${p.score}/${f.points} б.</span></p>${a.final ? `<form class="field-grade-form" data-team="${t.id}" data-question="${q.id}" data-field="${f.id}"><label>Баллы (максимум ${f.points})<input name="score" type="number" min="0" max="${f.points}" step="0.5" value="${p.score}" required></label><button class="btn primary" type="submit">Сохранить оценку поля</button><span class="field-grade-status" role="status"></span></form>` : ""}</section>`;
      })
      .join("")}</div>`,
  );
}
if (!IS_PAGE_PREVIEW) {
  document.addEventListener("input", (e) => {
    const n = e.target;
    if (!n.dataset.partField) return;
    const q = S.edit.content.questions[S.qi],
      f = q.fields[Number(n.dataset.fieldIndex)];
    f[n.dataset.partField] =
      n.dataset.partField === "accepted"
        ? n.value.split("\n")
        : n.dataset.partField === "points"
          ? n.value === ""
            ? ""
            : Number(n.value)
          : n.value;
    q.points = q.fields.reduce((sum, f) => sum + Number(f.points || 0), 0);
    const total = $("#fields-total");
    if (total) total.textContent = q.points;
    const points = $('[data-qfield="points"]');
    if (points) points.value = q.points;
    mark();
  });
  document.addEventListener("change", (e) => {
    const n = e.target;
    if (
      n.matches("select[data-qfield]") &&
      S.edit?.content.questions[S.qi]?.[n.dataset.qfield] !== n.value
    )
      n.dispatchEvent(new Event("input", { bubbles: true }));
  });
  document.addEventListener(
    "click",
    (e) => {
      const b = e.target.closest("[data-fields-action]");
      if (!b) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const q = S.edit.content.questions[S.qi];
      if (b.dataset.fieldsAction === "add" && q.fields.length < 12)
        q.fields.push(newAnswerField());
      if (b.dataset.fieldsAction === "remove" && q.fields.length > 2)
        q.fields.splice(Number(b.dataset.index), 1);
      q.points = q.fields.reduce((sum, f) => sum + Number(f.points || 0), 0);
      mark();
      render();
    },
    true,
  );
  document.addEventListener(
    "submit",
    async (e) => {
      const f = e.target;
      if (!f.matches(".field-grade-form")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const b = f.querySelector("button"),
        status = f.querySelector(".field-grade-status");
      b.disabled = true;
      try {
        await api("grade", {
          run: S.monitor.run.id,
          team: f.dataset.team,
          question: f.dataset.question,
          field: f.dataset.field,
          score: Number(new FormData(f).get("score")),
        });
        status.textContent = "Сохранено";
        S.monitor = await api("monitor&run=" + S.monitor.run.id);
        const answer = S.monitor.teams
          .find((t) => t.id === f.dataset.team)
          ?.answers.find((a) => a.question_id === f.dataset.question);
        const result = answer && fieldResult(answer, f.dataset.field),
          resultNode = f
            .closest("section")
            .querySelector("[data-field-grade-result]");
        if (resultNode && result) {
          resultNode.textContent =
            result.score + "/" + f.querySelector("input").max + " б.";
          resultNode.className = result.correct ? "ok" : "bad";
        }
        const content = $("#monitor-content"),
          table = content?.querySelector(".table-scroll"),
          left = table?.scrollLeft || 0,
          top = table?.scrollTop || 0;
        if (content) {
          content.innerHTML = monitorHTML(S.monitor);
          const next = content.querySelector(".table-scroll");
          if (next) {
            next.scrollLeft = left;
            next.scrollTop = top;
          }
        }
      } catch (err) {
        status.textContent = err.message;
      } finally {
        b.disabled = false;
      }
    },
    true,
  );
}
