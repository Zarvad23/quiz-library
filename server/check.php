<?php
// Standalone CLI check: keep syntax compatible with older PHP to explain upgrades.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
$errors = array();
echo "Переплёт: проверка окружения\nPHP: " . PHP_VERSION . "\n";
if (PHP_VERSION_ID < 80100) $errors[] = 'Нужен PHP 8.1 или новее.';
foreach (array('pdo_sqlite','mbstring','fileinfo') as $extension) {
    if (!extension_loaded($extension)) $errors[] = 'В php.ini не включено расширение: ' . $extension;
}
foreach (array('data','uploads') as $folder) {
    $path = dirname(__DIR__) . '/' . $folder;
    if (!is_dir($path) || !is_writable($path)) $errors[] = 'Нет доступа на запись в папку ' . $folder;
}
if (extension_loaded('pdo_sqlite')) {
    try {
        $db = new PDO('sqlite::memory:');
        echo "SQLite: " . $db->query('SELECT sqlite_version()')->fetchColumn() . "\n";
    } catch (Exception $exception) {
        $errors[] = 'Не удалось открыть SQLite: ' . $exception->getMessage();
    }
}
if ($errors) {
    foreach ($errors as $error) fwrite(STDERR, '[ОШИБКА] ' . $error . "\n");
    echo "Файл настроек PHP: " . (php_ini_loaded_file() ?: 'не найден') . "\n";
    exit(1);
}
echo "Проверка пройдена. Можно задавать пароль ведущего.\n";

foreach (array('curl','zip') as $extension) {
    if (!extension_loaded($extension)) echo '[ОБНОВЛЕНИЯ] Включите extension=' . $extension . ' в php.ini и перезапустите Apache. Викторины могут работать без этого расширения.' . "\n";
}
