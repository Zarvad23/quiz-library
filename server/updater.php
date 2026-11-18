<?php
declare(strict_types=1);
// Update protocol 1: code updates with backward-compatible data format 1 only.
const UPDATE_ASSET = "quiz-library-update.zip";
function up_dir(): string
{
    $dir = ROOT . "/data/updater";
    if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
        throw new RuntimeException("Нет прав записи в data/updater.");
    }
    return $dir;
}
function up_json(string $path, array $fallback = []): array
{
    if (!is_file($path)) {
        return $fallback;
    }
    $v = json_decode(file_get_contents($path), true);
    if (!is_array($v)) {
        throw new RuntimeException("Повреждён файл состояния обновления.");
    }
    return $v;
}
function up_atomic(string $path, string $bytes): void
{
    $tmp = $path . ".update-tmp-" . bin2hex(random_bytes(6));
    if (file_put_contents($tmp, $bytes, LOCK_EX) !== strlen($bytes)) {
        @unlink($tmp);
        throw new RuntimeException("Не удалось записать файл обновления.");
    }
    if (!@rename($tmp, $path)) {
        @unlink($tmp);
        throw new RuntimeException(
            "Не удалось заменить файл. Проверьте права записи и антивирус.",
        );
    }
    if (function_exists("opcache_invalidate") && str_ends_with($path, ".php")) {
        @opcache_invalidate($path, true);
    }
}
function up_copy(string $source, string $target): void
{
    $tmp = $target . ".update-tmp-" . bin2hex(random_bytes(6));
    if (!copy($source, $tmp) || !@rename($tmp, $target)) {
        @unlink($tmp);
        throw new RuntimeException(
            "Не удалось восстановить копию базы. Проверьте права записи.",
        );
    }
}
function up_write_json(string $path, array $value): void
{
    up_atomic(
        $path,
        json_encode(
            $value,
            JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR,
        ),
    );
}
function up_version(): array
{
    $v = up_json(ROOT . "/version.json");
    if (
        !preg_match('/^\d+\.\d+\.\d+$/D', $v["version"] ?? "") ||
        ($v["data_format"] ?? null) !== 1
    ) {
        throw new RuntimeException("Неверный файл версии платформы.");
    }
    return $v;
}
function up_repo($value): string
{
    if (!is_string($value)) {
        throw new RuntimeException("Укажите репозиторий GitHub.");
    }
    $value = trim($value);
    $value = preg_replace("~^https://github\.com/~i", "", $value);
    $value = preg_replace("/\.git$/i", "", rtrim($value, "/"));
    if (
        !preg_match(
            '~^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}/[a-zA-Z0-9_.-]{1,100}$~D',
            $value,
        ) ||
        str_ends_with($value, "/.") ||
        str_ends_with($value, "/..")
    ) {
        throw new RuntimeException(
            "Укажите адрес вида github.com/владелец/репозиторий.",
        );
    }
    return $value;
}
function up_settings(): array
{
    return up_json(up_dir() . "/settings.json", [
        "repository" => "Zarvad23/quiz-library",
        "automatic" => true,
    ]);
}
function up_save_settings(array $b): array
{
    if (
        !is_string($b["password"] ?? null) ||
        !password_verify($b["password"], cfg("password", ""))
    ) {
        throw new RuntimeException("Введите текущий пароль ведущего.");
    }
    $value = [
        "repository" => up_repo($b["repository"] ?? ""),
        "automatic" => (bool) ($b["automatic"] ?? false),
    ];
    up_write_json(up_dir() . "/settings.json", $value);
    @unlink(up_dir() . "/check.json");
    return $value;
}
function up_path(string $name): bool
{
    if (
        !preg_match('~^[a-zA-Z0-9_.\-/]+$~D', $name) ||
        str_contains($name, "..") ||
        str_contains($name, "//")
    ) {
        return false;
    }
    if (
        in_array(
            $name,
            [
                ".htaccess",
                "index.php",
                "api.php",
                "version.json",
                "README.md",
                "START-HERE.txt",
                "UPDATE-WINDOWS.txt",
                "setup-windows.cmd",
                "recover-updates.cmd",
            ],
            true,
        )
    ) {
        return true;
    }
    return (bool) preg_match(
        '~^(assets/[a-zA-Z0-9_-]+\.(?:js|css|png|svg|woff2?|jpg|webp)|server/(?:[a-zA-Z0-9_-]+\.php|\.htaccess))$~D',
        $name,
    );
}
function up_target(string $name): string
{
    if (!up_path($name)) {
        throw new RuntimeException("Недопустимый путь в обновлении.");
    }
    $path = ROOT;
    foreach (explode("/", $name) as $part) {
        $path .= "/" . $part;
        if (is_link($path)) {
            throw new RuntimeException(
                "Обновление через символические ссылки запрещено.",
            );
        }
    }
    if (file_exists($path) && !is_file($path)) {
        throw new RuntimeException("Файл обновления совпадает с каталогом.");
    }
    return $path;
}
function up_files(): array
{
    $out = [];
    foreach ([ROOT, ROOT . "/server", ROOT . "/assets"] as $folder) {
        foreach (new DirectoryIterator($folder) as $p) {
            if ($p->isDot()) {
                continue;
            }
            $name = ltrim(substr($p->getPathname(), strlen(ROOT)), "/");
            if (up_path($name)) {
                up_target($name);
                if ($p->isFile()) {
                    $out[] = $name;
                }
            }
        }
    }
    sort($out);
    return $out;
}
function up_runtime(): array
{
    return [
        "ini" => php_ini_loaded_file() ?: "",
        "binary" => PHP_BINARY,
        "bindir" => PHP_BINDIR,
        "root" => realpath(ROOT) ?: ROOT,
        "extension_dir" => (string) ini_get("extension_dir"),
        "sapi" => PHP_SAPI,
        "version" => PHP_MAJOR_VERSION . "." . PHP_MINOR_VERSION,
        "windows" => DIRECTORY_SEPARATOR === "\\",
    ];
}
// Runtime paths, not PATH or compile-time PHP_BINDIR alone. Pure helper for Windows tests.
function up_php_candidates(array $runtime): array
{
    $paths = [];
    $normal = fn(string $path): string => str_replace("\\", "/", $path);
    $add = function (string $dir) use (&$paths, $normal, $runtime): void {
        if ($dir === "" || $dir === ".") {
            return;
        }
        $dir = rtrim($normal($dir), "/");
        $paths[] = $dir . "/php.exe";
        if (!($runtime["windows"] ?? false)) {
            $paths[] = $dir . "/php" . ($runtime["version"] ?? "");
            $paths[] = $dir . "/php";
        }
    };
    $ini = $normal($runtime["ini"] ?? "");
    $binary = $normal($runtime["binary"] ?? "");
    if (($runtime["sapi"] ?? "") === "cli" && $binary !== "") {
        $paths[] = $binary;
    }
    if ($ini !== "") {
        $add(dirname($ini));
    }
    $extension = $normal($runtime["extension_dir"] ?? "");
    if (preg_match("~^(?:[a-zA-Z]:/|/)~", $extension)) {
        $add(dirname($extension));
    }
    if ($binary !== "") {
        $add(dirname($binary));
        // Apache in XAMPP: <xampp>/apache/bin/httpd.exe; PHP: <xampp>/php/php.exe.
        $add(dirname(dirname($binary), 2) . "/php");
        $paths[] = $binary;
    }
    $root = $normal($runtime["root"] ?? "");
    if ($root !== "") {
        for ($dir = $root, $n = 0; $n < 5; $n++) {
            $add($dir . "/php");
            $parent = dirname($dir);
            if ($parent === $dir) {
                break;
            }
            $dir = $parent;
        };
    }
    $add($runtime["bindir"] ?? "");
    if ($runtime["windows"] ?? false) {
        $add("C:/xampp/php");
    }
    return array_values(array_unique($paths));
}
function up_choose_php(array $paths, ?callable $exists = null): string
{
    $exists ??= "is_file";
    foreach ($paths as $path) {
        if (
            preg_match(
                '/^php(?:\d+(?:\.\d+)*)?(?:\.exe)?$/i',
                basename(str_replace("\\", "/", $path)),
            ) &&
            $exists($path)
        ) {
            return $path;
        }
    }
    throw new RuntimeException(
        "Не найден php.exe для проверки обновления. Проверьте, что он есть рядом с загруженным php.ini в папке PHP XAMPP.",
    );
}
function up_php(): string
{
    return up_choose_php(up_php_candidates(up_runtime()));
}
function up_environment(): string
{
    $ini = php_ini_loaded_file() ?: "";
    if ($ini !== "") {
        clearstatcache(true, $ini);
    }
    return hash(
        "sha256",
        json_encode(
            [
                "runtime" => up_runtime(),
                "ini_mtime" => $ini !== "" ? @filemtime($ini) : null,
                "curl" => extension_loaded("curl"),
                "zip" => extension_loaded("zip"),
                "proc_open" => function_exists("proc_open"),
            ],
            JSON_THROW_ON_ERROR,
        ),
    );
}
function up_cached_check(): array
{
    $cache = up_json(up_dir() . "/check.json");
    return ($cache["environment"] ?? "") === up_environment() ? $cache : [];
}
function up_run(array $args): void
{
    if (!function_exists("proc_open")) {
        throw new RuntimeException("Для обновлений включите proc_open в PHP.");
    }
    $log = up_dir() . "/health-" . bin2hex(random_bytes(6)) . ".log";
    $binary = up_php();
    $command = [$binary];
    $ini = php_ini_loaded_file();
    if ($ini !== false && is_file($ini)) {
        array_push($command, "-c", $ini);
    }
    array_push($command, "-d", "opcache.enable_cli=0", ...$args);
    $p = proc_open(
        $command,
        [
            0 => ["pipe", "r"],
            1 => ["file", $log, "w"],
            2 => ["file", $log, "a"],
        ],
        $pipes,
        dirname($binary),
        null,
        ["bypass_shell" => true],
    );
    if (!is_resource($p)) {
        throw new RuntimeException("Не удалось запустить проверку PHP.");
    }
    fclose($pipes[0]);
    $deadline = microtime(true) + 60;
    $exit = -1;
    do {
        $s = proc_get_status($p);
        if (!$s["running"]) {
            $exit = $s["exitcode"];
            break;
        }
        if (microtime(true) > $deadline) {
            proc_terminate($p);
            break;
        }
        usleep(20000);
    } while (true);
    proc_close($p);
    $details = is_file($log) ? file_get_contents($log) : "";
    @unlink($log);
    if ($exit !== 0) {
        error_log("Update health check: " . $details);
        throw new RuntimeException(
            "Проверка новой версии не пройдена. Предыдущая версия будет восстановлена.",
        );
    }
}
function up_requirements(): array
{
    $errors = [];
    foreach (["curl", "zip", "pdo_sqlite", "mbstring", "fileinfo"] as $ext) {
        if (!extension_loaded($ext)) {
            $errors[] = "В php.ini включите extension=" . $ext;
        }
    }
    if (!function_exists("proc_open")) {
        $errors[] = "Включите proc_open в PHP.";
    }
    try {
        up_php();
    } catch (Throwable $e) {
        $errors[] = $e->getMessage();
    }
    foreach (
        [ROOT, ROOT . "/assets", ROOT . "/server", ROOT . "/data"]
        as $path
    ) {
        if (!is_writable($path)) {
            $errors[] = "Нет прав записи: " . basename($path);
        }
    }
    return $errors;
}
function up_url(string $url): void
{
    $p = parse_url($url);
    if (
        !$p ||
        ($p["scheme"] ?? "") !== "https" ||
        isset($p["user"]) ||
        isset($p["pass"]) ||
        (isset($p["port"]) && !in_array($p["port"], [443], true)) ||
        !in_array(
            strtolower($p["host"] ?? ""),
            [
                "api.github.com",
                "github.com",
                "release-assets.githubusercontent.com",
                "objects.githubusercontent.com",
            ],
            true,
        )
    ) {
        throw new RuntimeException("Недопустимый адрес загрузки обновления.");
    }
}
function up_http(string $url, ?string $destination = null): array
{
    if (!extension_loaded("curl")) {
        throw new RuntimeException(
            "Включите extension=curl в php.ini и перезапустите Apache.",
        );
    }
    for ($hop = 0; $hop < 5; $hop++) {
        up_url($url);
        $location = null;
        $body = "";
        $count = 0;
        $limit = $destination ? 33554432 : 2097152;
        $file = $destination ? fopen($destination, "wb") : null;
        if ($destination && !$file) {
            throw new RuntimeException("Нет прав для загрузки пакета.");
        }
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT => $destination ? 120 : 20,
            CURLOPT_USERAGENT => "Pereplet-Updater/1",
            CURLOPT_HTTPHEADER => [
                "Accept: application/vnd.github+json",
                "X-GitHub-Api-Version: 2022-11-28",
            ],
            CURLOPT_HEADERFUNCTION => function ($ch, $line) use (&$location) {
                if (stripos($line, "location:") === 0) {
                    $location = trim(substr($line, 9));
                }
                return strlen($line);
            },
            CURLOPT_WRITEFUNCTION => function ($ch, $chunk) use (
                &$body,
                &$count,
                $limit,
                $file,
            ) {
                $count += strlen($chunk);
                if ($count > $limit) {
                    return 0;
                }
                if ($file) {
                    return fwrite($file, $chunk);
                }
                $body .= $chunk;
                return strlen($chunk);
            },
        ]);
        $ok = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        unset($ch);
        if ($file) {
            fclose($file);
        }
        if ($ok === false) {
            throw new RuntimeException(
                "Не удалось связаться с GitHub. Проверьте интернет, дату ноутбука и сертификаты PHP.",
            );
        }
        if (in_array($code, [301, 302, 303, 307, 308], true) && $location) {
            $url = $location;
            continue;
        }
        return ["status" => $code, "body" => $body];
    }
    throw new RuntimeException("Слишком много перенаправлений GitHub.");
}
function up_release(array $raw, string $repo): array
{
    if (
        !empty($raw["draft"]) ||
        !empty($raw["prerelease"]) ||
        !preg_match('/^v?(\d+\.\d+\.\d+)$/D', $raw["tag_name"] ?? "", $match)
    ) {
        throw new RuntimeException(
            "Релиз не является стабильной версией платформы.",
        );
    }
    foreach ($raw["assets"] ?? [] as $asset) {
        if (($asset["name"] ?? "") === UPDATE_ASSET) {
            if (
                !preg_match(
                    '/^sha256:([0-9a-f]{64})$/D',
                    $asset["digest"] ?? "",
                    $hash,
                )
            ) {
                throw new RuntimeException(
                    "У пакета GitHub нет контрольной суммы SHA-256. Опубликуйте новый пакет релиза.",
                );
            }
            $url = $asset["browser_download_url"] ?? "";
            if (
                !str_starts_with(
                    $url,
                    "https://github.com/" . $repo . "/releases/download/",
                )
            ) {
                throw new RuntimeException(
                    "Пакет относится к другому репозиторию.",
                );
            }
            up_url($url);
            if (($asset["size"] ?? 0) < 1 || $asset["size"] > 33554432) {
                throw new RuntimeException(
                    "Недопустимый размер пакета обновления.",
                );
            }
            return [
                "version" => $match[1],
                "tag" => $raw["tag_name"],
                "id" => (string) $raw["id"],
                "assetId" => (string) $asset["id"],
                "sha256" => $hash[1],
                "size" => $asset["size"],
                "download" => $url,
                "url" =>
                    "https://github.com/" .
                    $repo .
                    "/releases/tag/" .
                    rawurlencode($raw["tag_name"]),
                "notes" => mb_substr((string) ($raw["body"] ?? ""), 0, 6000),
            ];
        }
    }
    throw new RuntimeException("В релизе отсутствует " . UPDATE_ASSET . ".");
}
function up_check(bool $force = false): array
{
    $dir = up_dir();
    $settings = up_settings();
    $cache = up_cached_check();
    $lock = fopen($dir . "/check.lock", "c+");
    if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) {
        return $cache;
    }
    try {
        if (
            !$force &&
            ($cache["repository"] ?? "") === $settings["repository"] &&
            ($cache["checked"] ?? 0) > time() - 3600
        ) {
            return $cache;
        }
        $value = [
            "repository" => $settings["repository"],
            "checked" => time(),
            "environment" => up_environment(),
            "release" => null,
            "error" => null,
        ];
        try {
            $response = up_http(
                "https://api.github.com/repos/" .
                    up_repo($settings["repository"]) .
                    "/releases/latest",
            );
            if ($response["status"] === 404) {
                throw new RuntimeException(
                    "Репозиторий или опубликованный релиз пока не найден.",
                );
            }
            if ($response["status"] === 403 || $response["status"] === 429) {
                throw new RuntimeException(
                    "GitHub временно ограничил запросы. Повторите проверку позже.",
                );
            }
            if ($response["status"] !== 200) {
                throw new RuntimeException(
                    "GitHub не смог вернуть сведения о релизе.",
                );
            }
            $raw = json_decode(
                $response["body"],
                true,
                512,
                JSON_THROW_ON_ERROR,
            );
            $value["release"] = up_release($raw, $settings["repository"]);
        } catch (Throwable $e) {
            $value["error"] = $e->getMessage();
        }
        up_write_json($dir . "/check.json", $value);
        return $value;
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}
function up_status(): array
{
    $state = up_json(up_dir() . "/state.json");
    $cache = up_cached_check();
    $release = $cache["release"] ?? null;
    if ($release) {
        unset($release["download"], $release["sha256"]);
    }
    return [
        "version" => up_version()["version"],
        "settings" => up_settings(),
        "check" => [
            "checked" => $cache["checked"] ?? null,
            "release" => $release,
            "error" => $cache["error"] ?? null,
        ],
        "active" => (bool) active(),
        "requirements" => up_requirements(),
        "history" => array_slice(array_reverse($state["history"] ?? []), 0, 10),
        "rollback" => isset($state["rollback"])
            ? [
                "version" => $state["rollback"]["from"],
                "id" => $state["rollback"]["id"],
            ]
            : null,
    ];
}
function up_unpack(string $zipFile, string $stage, string $version): array
{
    $zip = new ZipArchive();
    if ($zip->open($zipFile) !== true) {
        throw new RuntimeException("Не удалось открыть архив обновления.");
    }
    try {
        if ($zip->numFiles > 400) {
            throw new RuntimeException("Слишком много файлов в пакете.");
        }
        $manifestRaw = $zip->getFromName(
            "quiz-library/update-manifest.json",
            1048576,
        );
        $manifest = json_decode(
            $manifestRaw === false ? "" : $manifestRaw,
            true,
            512,
            JSON_THROW_ON_ERROR,
        );
        if (
            ($manifest["format"] ?? null) !== 1 ||
            ($manifest["updater_protocol"] ?? null) !== 1 ||
            ($manifest["data_format"] ?? null) !== 1 ||
            ($manifest["version"] ?? "") !== $version ||
            version_compare(PHP_VERSION, $manifest["min_php"] ?? "99", "<")
        ) {
            throw new RuntimeException(
                "Эта версия несовместима с текущей платформой или PHP.",
            );
        }
        $files = $manifest["files"] ?? null;
        if (!is_array($files) || count($files) < 10) {
            throw new RuntimeException("Неполный пакет обновления.");
        }
        $seen = [];
        $total = 0;
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $stat = $zip->statIndex($i);
            $name = $stat["name"];
            if (isset($seen[$name])) {
                throw new RuntimeException("Повторный файл в архиве.");
            }
            $seen[$name] = true;
            $zip->getExternalAttributesIndex($i, $opsys, $attr);
            if ((($attr >> 16) & 0170000) === 0120000) {
                throw new RuntimeException(
                    "Символические ссылки в пакете запрещены.",
                );
            }
            if ($name === "quiz-library/update-manifest.json") {
                continue;
            }
            if (!str_starts_with($name, "quiz-library/")) {
                throw new RuntimeException("Неверная структура пакета.");
            }
            $relative = substr($name, 13);
            if (
                !up_path($relative) ||
                !isset($files[$relative]) ||
                !preg_match('/^[0-9a-f]{64}$/D', (string) $files[$relative])
            ) {
                throw new RuntimeException("Пакет содержит запрещённые файлы.");
            }
            $total += $stat["size"];
            if ($total > 67108864 || $stat["size"] > 8388608) {
                throw new RuntimeException(
                    "Распакованный пакет слишком большой.",
                );
            }
            $data = $zip->getFromIndex($i);
            if (
                $data === false ||
                !hash_equals($files[$relative], hash("sha256", $data))
            ) {
                throw new RuntimeException(
                    "Контрольная сумма файла не совпала.",
                );
            }
            $target = $stage . "/" . $relative;
            if (!is_dir(dirname($target))) {
                mkdir(dirname($target), 0700, true);
            }
            up_atomic($target, $data);
        }
        foreach ($files as $name => $hash) {
            if (
                !up_path((string) $name) ||
                !isset($seen["quiz-library/" . $name])
            ) {
                throw new RuntimeException("В пакете отсутствует файл.");
            }
        }
        foreach (
            [
                "index.php",
                "api.php",
                "version.json",
                "server/bootstrap.php",
                "server/updater.php",
                "server/update-gate.php",
                "server/update-health.php",
                "server/recover-update.php",
                "assets/app.js",
                "assets/updates.js",
            ]
            as $required
        ) {
            if (!isset($files[$required])) {
                throw new RuntimeException(
                    "В пакете отсутствует обязательный файл.",
                );
            }
        }
        $v = up_json($stage . "/version.json");
        if (
            ($v["version"] ?? "") !== $version ||
            ($v["data_format"] ?? null) !== 1
        ) {
            throw new RuntimeException("Версия файлов не совпадает с релизом.");
        }
        foreach (array_keys($files) as $name) {
            if (str_ends_with($name, ".php")) {
                up_run(["-l", $stage . "/" . $name]);
            }
        }
        return $manifest;
    } finally {
        $zip->close();
    }
}
function up_lock_exclusive(): void
{
    $lock =
        $GLOBALS["quizRequestLock"] ?? fopen(ROOT . "/data/update.lock", "c+");
    if (!$lock) {
        throw new RuntimeException("Не удалось заблокировать установку.");
    }
    flock($lock, LOCK_UN);
    if (!flock($lock, LOCK_EX | LOCK_NB)) {
        throw new RuntimeException(
            "Сайт занят другим запросом. Повторите установку через несколько секунд.",
        );
    }
    $GLOBALS["quizRequestLock"] = $lock;
    if (is_file(up_dir() . "/pending.json")) {
        throw new RuntimeException(
            "Нужно восстановить предыдущее прерванное обновление.",
        );
    }
    if (active()) {
        throw new RuntimeException(
            "Сначала завершите активную игру. Во время мероприятия установка запрещена.",
        );
    }
}
function up_snapshot(
    string $id,
    array $targetFiles,
    string $to,
    string $operation,
): array {
    $backup = up_dir() . "/backups/" . $id;
    if (!mkdir($backup, 0700, true)) {
        throw new RuntimeException("Не удалось создать резервную копию.");
    }
    $current = up_files();
    $all = array_values(array_unique([...$current, ...$targetFiles]));
    $bytes = 0;
    foreach ($current as $name) {
        $bytes += filesize(up_target($name));
    }
    $dbSize = filesize(ROOT . "/data/library.sqlite");
    $free = disk_free_space(ROOT);
    if ($free !== false && $free < 3 * $bytes + 3 * $dbSize + 52428800) {
        throw new RuntimeException(
            "Недостаточно свободного места для обновления и резервной копии.",
        );
    }
    foreach ($current as $name) {
        $dst = $backup . "/code/" . $name;
        if (!is_dir(dirname($dst))) {
            mkdir(dirname($dst), 0700, true);
        }
        if (!copy(up_target($name), $dst)) {
            throw new RuntimeException(
                "Не удалось сохранить предыдущую версию.",
            );
        }
    }
    db()->exec("VACUUM INTO " . db()->quote($backup . "/library.sqlite"));
    $record = [
        "id" => $id,
        "time" => time(),
        "from" => up_version()["version"],
        "to" => $to,
        "operation" => $operation,
        "files" => $current,
        "allFiles" => $all,
    ];
    up_write_json($backup . "/backup.json", $record);
    return $record;
}
function up_restore_code(array $record): void
{
    $backup = up_dir() . "/backups/" . $record["id"];
    foreach ($record["allFiles"] as $name) {
        $target = up_target($name);
        if (in_array($name, $record["files"], true)) {
            if (!is_file($backup . "/code/" . $name)) {
                throw new RuntimeException("Неполная резервная копия.");
            }
            up_atomic($target, file_get_contents($backup . "/code/" . $name));
        } elseif (is_file($target) && !unlink($target)) {
            throw new RuntimeException(
                "Не удалось удалить файл неудачного обновления.",
            );
        }
    }
}
function up_restore_database(array $record): void
{
    db_disconnect();
    foreach (["-wal", "-shm"] as $suffix) {
        if (
            is_file(ROOT . "/data/library.sqlite" . $suffix) &&
            !unlink(ROOT . "/data/library.sqlite" . $suffix)
        ) {
            throw new RuntimeException(
                "Не удалось закрыть служебные файлы базы.",
            );
        }
    }
    up_copy(
        up_dir() . "/backups/" . $record["id"] . "/library.sqlite",
        ROOT . "/data/library.sqlite",
    );
}
function up_record(array $record, string $status, ?string $error = null): void
{
    $state = up_json(up_dir() . "/state.json");
    $row = array_intersect_key(
        $record,
        array_flip(["id", "time", "from", "to", "operation"]),
    );
    $row["status"] = $status;
    $row["error"] = $error;
    $state["history"][] = $row;
    $state["history"] = array_slice($state["history"], -50);
    if ($status === "success") {
        $state["rollback"] =
            $record["operation"] === "install" ? $record : null;
    }
    up_write_json(up_dir() . "/state.json", $state);
}
function up_remove_tree(string $path): void
{
    if (!is_dir($path)) {
        return;
    }
    foreach (new FilesystemIterator($path) as $entry) {
        if ($entry->isDir() && !$entry->isLink()) {
            up_remove_tree($entry->getPathname());
        } else {
            @unlink($entry->getPathname());
        }
    }
    @rmdir($path);
}
function up_apply(
    string $source,
    array $files,
    string $version,
    string $operation,
    ?string $expectedVersion = null,
): array {
    up_lock_exclusive();
    if (
        $operation === "install" &&
        !version_compare($version, up_version()["version"], ">")
    ) {
        throw new RuntimeException(
            "Эта версия уже установлена. Обновите страницу.",
        );
    }
    if (
        $expectedVersion !== null &&
        up_version()["version"] !== $expectedVersion
    ) {
        throw new RuntimeException(
            "Версия изменилась в другой вкладке. Обновите страницу.",
        );
    }
    $id = gmdate("Ymd-His") . "-" . bin2hex(random_bytes(6));
    $record = up_snapshot($id, array_keys($files), $version, $operation);
    foreach ($record["allFiles"] as $name) {
        up_target($name);
    }
    up_write_json(up_dir() . "/pending.json", $record);
    db_disconnect();
    try {
        foreach ($record["allFiles"] as $name) {
            $target = up_target($name);
            if (isset($files[$name])) {
                up_atomic($target, file_get_contents($source . "/" . $name));
            } elseif (is_file($target) && !unlink($target)) {
                throw new RuntimeException(
                    "Не удалось заменить состав файлов.",
                );
            }
        }
        up_run([ROOT . "/server/update-health.php"]);
        if (up_version()["version"] !== $version) {
            throw new RuntimeException("Не совпала установленная версия.");
        }
        up_record($record, "success");
        if (!unlink(up_dir() . "/pending.json")) {
            throw new RuntimeException("Не удалось завершить обновление.");
        }
        return ["ok" => true, "version" => $version, "backup" => $id];
    } catch (Throwable $e) {
        db_disconnect();
        try {
            up_restore_code($record);
            up_restore_database($record);
            up_run([ROOT . "/server/update-health.php"]);
            up_record($record, "failed", $e->getMessage());
            if (!unlink(up_dir() . "/pending.json")) {
                throw new RuntimeException(
                    "Не удалось снять режим обслуживания.",
                );
            }
        } catch (Throwable $restore) {
            error_log("Update recovery failed: " . $restore);
            throw new RuntimeException(
                "Обновление прервано. Запустите recover-updates.cmd на ноутбуке ведущего.",
            );
        }
        throw new RuntimeException(
            "Обновление не установлено. Предыдущая версия и база восстановлены. " .
                $e->getMessage(),
        );
    }
}
function up_install(array $b): array
{
    if (active()) {
        throw new RuntimeException("Сначала завершите активную игру.");
    }
    $errors = up_requirements();
    if ($errors) {
        throw new RuntimeException(implode(" ", $errors));
    }
    $cache = up_check(true);
    $release = $cache["release"] ?? null;
    if (!$release) {
        throw new RuntimeException(
            $cache["error"] ?? "Новая версия пока не найдена.",
        );
    }
    if (($b["version"] ?? "") !== $release["version"]) {
        throw new RuntimeException(
            "Список версий изменился. Повторите проверку.",
        );
    }
    if (!version_compare($release["version"], up_version()["version"], ">")) {
        throw new RuntimeException(
            "Уже установлена эта или более новая версия.",
        );
    }
    $work = up_dir() . "/work-" . bin2hex(random_bytes(8));
    mkdir($work, 0700, true);
    try {
        $download = up_http($release["download"], $work . "/package.zip");
        if (
            $download["status"] !== 200 ||
            filesize($work . "/package.zip") !== $release["size"] ||
            !hash_equals(
                $release["sha256"],
                hash_file("sha256", $work . "/package.zip"),
            )
        ) {
            throw new RuntimeException(
                "Пакет загружен не полностью или его контрольная сумма не совпала.",
            );
        }
        mkdir($work . "/stage", 0700);
        $manifest = up_unpack(
            $work . "/package.zip",
            $work . "/stage",
            $release["version"],
        );
        return up_apply(
            $work . "/stage",
            $manifest["files"],
            $release["version"],
            "install",
        );
    } finally {
        up_remove_tree($work);
    }
}
function up_rollback(array $b): array
{
    $record = up_json(up_dir() . "/state.json")["rollback"] ?? null;
    if (!$record || ($b["id"] ?? "") !== $record["id"]) {
        throw new RuntimeException("Нет подходящей предыдущей версии.");
    }
    $files = array_fill_keys($record["files"], true);
    $source = up_dir() . "/backups/" . $record["id"] . "/code";
    foreach ($record["files"] as $name) {
        if (!is_file($source . "/" . $name)) {
            throw new RuntimeException("Неполная резервная копия.");
        }
    }
    return up_apply(
        $source,
        $files,
        $record["from"],
        "rollback",
        $record["to"],
    );
}
