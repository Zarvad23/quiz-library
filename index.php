<?php
require_once __DIR__ . "/server/update-gate.php";
quiz_update_gate();
header(
    "Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; media-src 'self' https:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'",
);
header("X-Content-Type-Options: nosniff");
header("Cache-Control: no-store");
?><!doctype html>
<html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#163c32"><title>Переплёт — библиотека викторин</title><link rel="stylesheet" href="assets/style.css?v=<?= hash_file(
    "sha256",
    __DIR__ . "/assets/style.css",
) ?>"><link rel="stylesheet" href="assets/designer.css?v=<?= hash_file(
    "sha256",
    __DIR__ . "/assets/designer.css",
) ?>"></head><body><div id="app"><div class="loading">Загрузка…</div></div><div id="toast" role="status" aria-live="polite"></div><script src="assets/designer.js?v=<?= hash_file(
    "sha256",
    __DIR__ . "/assets/designer.js",
) ?>" defer></script><script src="assets/host-tools.js?v=<?= hash_file(
    "sha256",
    __DIR__ . "/assets/host-tools.js",
) ?>" defer></script><script src="assets/question-types.js?v=<?= hash_file(
    "sha256",
    __DIR__ . "/assets/question-types.js",
) ?>" defer></script>
<script src="assets/updates.js?v=<?= hash_file(
    "sha256",
    __DIR__ . "/assets/updates.js",
) ?>" defer></script>
<script src="assets/app.js?v=<?= hash_file(
    "sha256",
    __DIR__ . "/assets/app.js",
) ?>" defer></script></body></html>
