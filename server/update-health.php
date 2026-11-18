<?php
if (PHP_SAPI !== "cli") {
    http_response_code(404);
    exit();
}
require __DIR__ . "/bootstrap.php";
try {
    foreach (["pdo_sqlite", "mbstring", "fileinfo"] as $ext) {
        if (!extension_loaded($ext)) {
            throw new RuntimeException("Missing " . $ext);
        }
    }
    if (db()->query("PRAGMA quick_check")->fetchColumn() !== "ok") {
        throw new RuntimeException("Database integrity check failed");
    }
    if (db()->query("PRAGMA foreign_key_check")->fetch()) {
        throw new RuntimeException("Database foreign keys failed");
    }
    echo "OK\n";
} catch (Throwable $e) {
    fwrite(STDERR, $e->getMessage());
    exit(1);
}
