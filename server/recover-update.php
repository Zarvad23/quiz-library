<?php
// CLI-only emergency recovery. It does not load potentially broken application code.
if (PHP_SAPI !== "cli") {
    http_response_code(404);
    exit();
}
$root = dirname(__DIR__);
$dir = $root . "/data/updater";
$pending = $dir . "/pending.json";
if (!is_file($pending)) {
    echo "Нет прерванных обновлений.\n";
    exit();
}
$lock = fopen($root . "/data/update.lock", "c+");
if (!$lock || !flock($lock, LOCK_EX)) {
    fwrite(STDERR, "Не удалось заблокировать сайт.\n");
    exit(1);
}
try {
    $record = json_decode(
        file_get_contents($pending),
        true,
        512,
        JSON_THROW_ON_ERROR,
    );
    if (!preg_match('/^\d{8}-\d{6}-[a-f0-9]{12}$/D', $record["id"] ?? "")) {
        throw new RuntimeException("Неверный ID копии.");
    }
    $backup = $dir . "/backups/" . $record["id"];
    $restore = function ($source, $target) {
        $tmp = $target . ".recovery-tmp";
        if (!copy($source, $tmp) || !rename($tmp, $target)) {
            throw new RuntimeException(
                "Не удалось восстановить файл. Проверьте права и антивирус.",
            );
        }
        if (function_exists("opcache_invalidate")) {
            @opcache_invalidate($target, true);
        }
    };
    foreach ($record["allFiles"] as $name) {
        if (
            !preg_match(
                '~^(?:[a-zA-Z0-9_.-]+|(?:server|assets)/[a-zA-Z0-9_.-]+)$~D',
                $name,
            ) ||
            str_contains($name, "..") ||
            str_starts_with($name, ".git") ||
            in_array(explode("/", $name)[0], ["data", "uploads"], true)
        ) {
            throw new RuntimeException("Недопустимый путь восстановления.");
        }
        $path = $root;
        foreach (explode("/", $name) as $part) {
            $path .= "/" . $part;
            if (is_link($path)) {
                throw new RuntimeException(
                    "Символическая ссылка в пути восстановления.",
                );
            }
        }
        if (in_array($name, $record["files"], true)) {
            $restore($backup . "/code/" . $name, $path);
        } elseif (is_file($path) && !unlink($path)) {
            throw new RuntimeException("Не удалось убрать файл обновления.");
        }
    }
    foreach (["-wal", "-shm"] as $suffix) {
        if (
            is_file($root . "/data/library.sqlite" . $suffix) &&
            !unlink($root . "/data/library.sqlite" . $suffix)
        ) {
            throw new RuntimeException(
                "Закройте другие процессы платформы и повторите восстановление.",
            );
        }
    }
    $restore($backup . "/library.sqlite", $root . "/data/library.sqlite");
    if (!unlink($pending)) {
        throw new RuntimeException("Не удалось снять режим обслуживания.");
    }
    echo "Предыдущая версия и база восстановлены. Перезапустите Apache в XAMPP и обновите браузер через Ctrl+F5.\n";
} catch (Throwable $e) {
    fwrite(STDERR, $e->getMessage() . "\n");
    exit(1);
}
