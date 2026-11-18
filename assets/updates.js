"use strict";
function newerVersion(a, b) {
  const x = a.split(".").map(Number),
    y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return x[i] > y[i];
  }
  return false;
}
function updatesPage() {
  const u = S.updates,
    c = u.check,
    r = c.release,
    newer = r && newerVersion(r.version, u.version),
    blocked = u.active || u.requirements.length;
  return shell(
    `${title("", "Обновления", "", '<button class="btn light" data-update-action="check">Проверить обновления</button>')}<section class="panel update-card"><div class="section-title"><h2>Установлена версия ${esc(u.version)}</h2><span class="badge">${newer ? "Доступно обновление" : "Текущая установка"}</span></div>${u.active ? '<p class="update-message">Сейчас идёт игра. Установка и откат доступны после её завершения.</p>' : ""}${u.requirements.length ? `<div class="update-message bad" role="alert"><b>Для установки нужно настроить PHP</b><ul>${u.requirements.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}${c.error ? `<p class="update-message" role="status">${esc(c.error)}</p>` : ""}${r ? `<h3>Версия ${esc(r.version)}</h3><p class="muted">${newer ? "Готова к установке" : r.version === u.version ? "У вас установлена последняя опубликованная версия" : "У вас установлена более новая версия"}</p>${r.notes ? `<pre class="release-notes">${esc(r.notes)}</pre>` : ""}<a class="text-link" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">Открыть релиз на GitHub ↗</a>${newer ? `<div class="update-actions"><button class="btn primary" data-update-action="install-dialog" ${blocked ? "disabled" : ""}>Установить ${esc(r.version)}</button></div>` : ""}` : !c.checked ? "<p>Проверка обновлений ещё не выполнялась.</p>" : ""}<p class="muted update-check-time">${c.checked ? "Последняя проверка: " + new Date(c.checked * 1000).toLocaleString("ru-RU") : ""}</p><div id="update-progress" class="update-message" role="status" hidden></div></section><section class="panel update-card"><h2>Источник обновлений</h2><form id="update-config-form"><label>Публичный репозиторий GitHub<input name="repository" value="${esc(u.settings.repository)}" placeholder="владелец/репозиторий" required maxlength="200"></label><label class="toggle"><input name="automatic" type="checkbox" ${u.settings.automatic ? "checked" : ""}><span>Автоматически проверять новые версии ${help("Проверка выполняется при работе ведущего с панелью, не чаще раза в час. Установка всегда запускается вручную.")}</span></label><label>Пароль ведущего для изменения источника<input name="password" type="password" autocomplete="current-password" required></label><button class="btn light" type="submit">Сохранить источник</button></form></section><section class="panel update-card"><h2>Предыдущая версия</h2>${u.rollback ? `<p>Можно вернуться к версии ${esc(u.rollback.version)}. Викторины, загруженные материалы и ответы сохранятся.</p><button class="btn light" data-update-action="rollback-dialog" ${blocked ? "disabled" : ""}>Вернуть предыдущую версию</button>` : '<p class="muted">После первого успешного обновления здесь появится возможность отката.</p>'}${u.history.length ? `<h3>История</h3><div class="update-history">${u.history.map((x) => `<div><b>${esc(x.from)} → ${esc(x.to)}</b><span>${x.operation === "rollback" ? "Откат" : "Обновление"} · ${x.status === "success" ? "Выполнено" : "Не установлено"}</span><small>${new Date(x.time * 1000).toLocaleString("ru-RU")}</small>${x.error ? `<p>${esc(x.error)}</p>` : ""}</div>`).join("")}</div>` : ""}</section>`,
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
