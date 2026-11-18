"use strict";
function newerVersion(a, b) {
  const x = a.split(".").map(Number),
    y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return x[i] > y[i];
  }
  return false;
}
function releaseScreenshotsHTML(release) {
  const shots = release.screenshots || [];
  if (!shots.length) return "";
  return `<section class="release-screenshots" aria-label="Скриншоты обновления"><h4>Скриншоты</h4><div class="release-screenshot-grid">${shots.map((shot, i) => `<button class="release-screenshot" data-update-action="screenshot" data-index="${i}" aria-label="Открыть скриншот ${i + 1}: ${esc(shot.caption)}"><span class="release-screenshot-preview"><img src="${esc(shot.url)}" alt="${esc(shot.caption)}" loading="lazy" decoding="async" referrerpolicy="no-referrer"><span class="release-image-error" hidden>Изображение недоступно</span><span class="release-image-number">${i + 1} / ${shots.length}</span></span><span class="release-screenshot-caption">${esc(shot.caption)}<span aria-hidden="true">⤢</span></span></button>`).join("")}</div></section>`;
}
function openReleaseScreenshot(index, replace = false) {
  const shots = S.updates?.check.release?.screenshots || [];
  if (!shots.length) return;
  index = (index + shots.length) % shots.length;
  const shot = shots[index];
  const html = `<div class="release-viewer" data-image-index="${index}"><div class="release-viewer-heading" aria-live="polite"><span>Скриншот ${index + 1} из ${shots.length}</span><h2>${esc(shot.caption)}</h2></div><div class="release-viewer-image"><img src="${esc(shot.url)}" alt="${esc(shot.caption)}" referrerpolicy="no-referrer"><p class="release-image-error" hidden>Изображение недоступно. Проверьте подключение к интернету.</p></div>${shots.length > 1 ? '<div class="release-viewer-nav"><button class="btn light" data-update-action="screenshot-prev" aria-label="Предыдущий скриншот">← Предыдущий</button><button class="btn light" data-update-action="screenshot-next" aria-label="Следующий скриншот">Следующий →</button></div>' : ""}</div>`;
  const existing = $("dialog.release-screenshot-dialog[open]");
  if (replace && existing) {
    const action = document.activeElement?.dataset.updateAction;
    existing.querySelector(".release-viewer").outerHTML = html;
    existing.setAttribute("aria-label", shot.caption);
    if (["screenshot-prev", "screenshot-next"].includes(action))
      existing.querySelector(`[data-update-action="${action}"]`)?.focus();
    return;
  }
  dialog(html);
  $("dialog").classList.add("release-screenshot-dialog");
  $("dialog").setAttribute("aria-label", shot.caption);
}
function updatesPage() {
  const u = S.updates,
    c = u.check,
    r = c.release,
    newer = r && newerVersion(r.version, u.version),
    blocked = u.active || u.requirements.length;
  return shell(
    `${title("", "Обновления", "", '<button class="btn light" data-update-action="check">Проверить обновления</button>')}<section class="panel update-card"><div class="section-title"><h2>Установлена версия ${esc(u.version)}</h2><span class="badge">${newer ? "Доступно обновление" : "Текущая установка"}</span></div>${u.active ? '<p class="update-message">Сейчас идёт игра. Установка и откат доступны после её завершения.</p>' : ""}${u.requirements.length ? `<div class="update-message bad" role="alert"><b>Для установки нужно настроить PHP</b><ul>${u.requirements.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}${c.error ? `<p class="update-message" role="status">${esc(c.error)}</p>` : ""}${r ? `<h3>Версия ${esc(r.version)}</h3><p class="muted">${newer ? "Готова к установке" : r.version === u.version ? "У вас установлена последняя опубликованная версия" : "У вас установлена более новая версия"}</p>${r.notes ? `<pre class="release-notes">${esc(r.notes)}</pre>` : ""}${releaseScreenshotsHTML(r)}<a class="text-link" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">Открыть релиз на GitHub ↗</a>${newer ? `<div class="update-actions"><button class="btn primary" data-update-action="install-dialog" ${blocked ? "disabled" : ""}>Установить ${esc(r.version)}</button></div>` : ""}` : !c.checked ? "<p>Проверка обновлений ещё не выполнялась.</p>" : ""}<p class="muted update-check-time">${c.checked ? "Последняя проверка: " + new Date(c.checked * 1000).toLocaleString("ru-RU") : ""}</p><div id="update-progress" class="update-message" role="status" hidden></div></section><section class="panel update-card"><h2>Источник обновлений</h2><form id="update-config-form"><label>Публичный репозиторий GitHub<input name="repository" value="${esc(u.settings.repository)}" placeholder="владелец/репозиторий" required maxlength="200"></label><label class="toggle"><input name="automatic" type="checkbox" ${u.settings.automatic ? "checked" : ""}><span>Автоматически проверять новые версии ${help("Проверка выполняется при работе ведущего с панелью, не чаще раза в час. Установка всегда запускается вручную.")}</span></label><label>Пароль ведущего для изменения источника<input name="password" type="password" autocomplete="current-password" required></label><button class="btn light" type="submit">Сохранить источник</button></form></section><section class="panel update-card"><h2>Предыдущая версия</h2>${u.rollback ? `<p>Можно вернуться к версии ${esc(u.rollback.version)}. Викторины, загруженные материалы и ответы сохранятся.</p><button class="btn light" data-update-action="rollback-dialog" ${blocked ? "disabled" : ""}>Вернуть предыдущую версию</button>` : '<p class="muted">После первого успешного обновления здесь появится возможность отката.</p>'}${u.history.length ? `<h3>История</h3><div class="update-history">${u.history.map((x) => `<div><b>${esc(x.from)} → ${esc(x.to)}</b><span>${x.operation === "rollback" ? "Откат" : "Обновление"} · ${x.status === "success" ? "Выполнено" : "Не установлено"}</span><small>${new Date(x.time * 1000).toLocaleString("ru-RU")}</small>${x.error ? `<p>${esc(x.error)}</p>` : ""}</div>`).join("")}</div>` : ""}</section>`,
    "updates",
  );
}
function updatesMount() {
  const u = S.updates;
  if (
    u.settings.automatic &&
    (!u.check.checked || Date.now() / 1000 - u.check.checked > 3600)
  )
    updatesCheck(false);
}
async function updatesCheck(force) {
  if (window.updatesChecking) return;
  window.updatesChecking = true;
  const node = $("#update-progress");
  if (node) {
    node.hidden = false;
    node.textContent = "Проверяем новые версии…";
  }
  try {
    const value = await api("update_check", { force });
    S.updates = value;
    if (location.hash === "#updates") $("#app").innerHTML = updatesPage();
  } catch (e) {
    if (node) node.textContent = e.message;
  } finally {
    window.updatesChecking = false;
  }
}
function updateDialog(action) {
  const rollback = action === "rollback",
    u = S.updates;
  dialog(
    `<h2>${rollback ? "Вернуть предыдущую версию?" : "Установить обновление?"}</h2><p>${rollback ? "Будет восстановлен код предыдущей версии. Текущие викторины, материалы и ответы сохранятся." : "Будет создана резервная копия программы и базы. Во время установки сайт будет временно недоступен."}</p><div class="dialog-actions"><button class="btn primary" data-update-action="${action}">${rollback ? "Вернуть версию" : "Установить обновление"}</button><button class="btn light" data-action="close-dialog">Отмена</button></div>`,
  );
}
async function updatesApply(action) {
  $("dialog")?.close();
  const progress = $("#update-progress");
  progress.hidden = false;
  progress.textContent =
    action === "install"
      ? "Загружаем и проверяем пакет. Затем сохраним резервную копию и установим версию…"
      : "Восстанавливаем предыдущую версию…";
  $$("[data-update-action],#update-config-form button").forEach(
    (b) => (b.disabled = true),
  );
  window.updatesInstalling = true;
  try {
    const u = S.updates;
    await api(
      "update_" + action,
      action === "install"
        ? { version: u.check.release.version }
        : { id: u.rollback.id },
    );
    window.updatesInstalling = false;
    location.reload();
  } catch (e) {
    progress.textContent = e.message;
    progress.setAttribute("role", "alert");
    const reload = document.createElement("button");
    reload.className = "btn light";
    reload.textContent = "Обновить страницу";
    reload.onclick = () => location.reload();
    progress.append(document.createElement("br"), reload);
  } finally {
    window.updatesInstalling = false;
    $$("[data-update-action],#update-config-form button").forEach(
      (b) => (b.disabled = false),
    );
  }
}
if (!IS_PAGE_PREVIEW) {
  document.addEventListener(
    "click",
    async (e) => {
      const b = e.target.closest("[data-update-action]");
      if (!b) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (window.updatesInstalling) return;
      try {
        switch (b.dataset.updateAction) {
          case "screenshot":
            openReleaseScreenshot(Number(b.dataset.index));
            break;
          case "screenshot-prev":
          case "screenshot-next":
            openReleaseScreenshot(
              Number($(".release-viewer").dataset.imageIndex) +
                (b.dataset.updateAction === "screenshot-next" ? 1 : -1),
              true,
            );
            break;
          case "check":
            await updatesCheck(true);
            break;
          case "install-dialog":
            updateDialog("install");
            break;
          case "rollback-dialog":
            updateDialog("rollback");
            break;
          case "install":
          case "rollback":
            await updatesApply(b.dataset.updateAction);
            break;
        }
      } catch (e) {
        toast(e.message);
      }
    },
    true,
  );
  document.addEventListener("keydown", (e) => {
    if (
      !$("dialog.release-screenshot-dialog[open]") ||
      !["ArrowLeft", "ArrowRight"].includes(e.key)
    )
      return;
    e.preventDefault();
    openReleaseScreenshot(
      Number($(".release-viewer").dataset.imageIndex) +
        (e.key === "ArrowRight" ? 1 : -1),
      true,
    );
  });
  document.addEventListener(
    "error",
    (e) => {
      const image = e.target;
      if (
        !(image instanceof HTMLImageElement) ||
        !image.closest(".release-screenshots,.release-viewer")
      )
        return;
      image.hidden = true;
      const error = image.parentElement.querySelector(".release-image-error");
      if (error) error.hidden = false;
    },
    true,
  );
  document.addEventListener(
    "submit",
    async (e) => {
      const f = e.target;
      if (f.id !== "update-config-form") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const fd = new FormData(f),
        button = f.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        S.updates = await api("update_config", {
          repository: fd.get("repository"),
          automatic: fd.has("automatic"),
          password: fd.get("password"),
        });
        $("#app").innerHTML = updatesPage();
        toast("Источник обновлений сохранён");
      } catch (e) {
        dialog(
          `<h2>Не удалось сохранить</h2><p>${esc(e.message)}</p><button class="btn primary" data-action="close-dialog">Закрыть</button>`,
        );
      } finally {
        button.disabled = false;
      }
    },
    true,
  );
  window.addEventListener("beforeunload", (e) => {
    if (window.updatesInstalling) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  // No outbound requests from participant pages. Automatic checks are host-only.
  setInterval(async () => {
    if (
      document.hidden ||
      $("dialog[open]") ||
      !S.boot?.host ||
      !["library", "settings", "updates", "monitor"].includes(
        location.hash.slice(1),
      ) ||
      window.updatesInstalling ||
      window.updatesChecking
    )
      return;
    try {
      const u = await api("update_status");
      if (
        u.settings.automatic &&
        (!u.check.checked || Date.now() / 1000 - u.check.checked > 3600)
      ) {
        S.updates = u;
        await updatesCheck(false);
      }
    } catch {}
  }, 60000);
}
