<?php
// Shared by every dynamic request. Do not open the database before this lock.
function quiz_update_gate(): void
{
    $path = __DIR__ . "/../data";
    if (!is_dir($path)) {
        return;
    }
    $GLOBALS["quizRequestLock"] = fopen($path . "/update.lock", "c+");
    if (
        !$GLOBALS["quizRequestLock"] ||
        !flock($GLOBALS["quizRequestLock"], LOCK_SH)
    ) {
        http_response_code(503);
        exit("Сайт временно недоступен. Повторите позже.");
    }
    if (is_file($path . "/updater/pending.json")) {
        http_response_code(503);
        header("Retry-After: 60");
        exit(
            "Обновление было прервано. На ноутбуке ведущего запустите recover-updates.cmd, затем обновите страницу."
        );
    }
}
