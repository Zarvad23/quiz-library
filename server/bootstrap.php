<?php
declare(strict_types=1);
const ROOT = __DIR__ . "/..";
function &database_handle(): ?PDO
{
    static $connection = null;
    return $connection;
}
function db_disconnect(): void
{
    $connection = &database_handle();
    $connection = null;
}
function db(): PDO
{
    $db = &database_handle();
    if ($db) {
        return $db;
    }
    if (!extension_loaded("pdo_sqlite") || !extension_loaded("mbstring")) {
        throw new RuntimeException(
            "Включите расширения pdo_sqlite и mbstring в php.ini.",
        );
    }
    $db = new PDO("sqlite:" . ROOT . "/data/library.sqlite", null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $db->exec(
        "PRAGMA busy_timeout=8000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;",
    );
    $db->exec('CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS quizzes (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, content TEXT NOT NULL, updated INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, quiz_id TEXT NOT NULL, snapshot TEXT NOT NULL, started INTEGER NOT NULL, ended INTEGER);
    CREATE TABLE IF NOT EXISTS teams (id TEXT PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS entries (run_id TEXT NOT NULL REFERENCES runs(id), team_id TEXT NOT NULL REFERENCES teams(id), started INTEGER NOT NULL, seen INTEGER NOT NULL, PRIMARY KEY(run_id,team_id));
    CREATE TABLE IF NOT EXISTS answers (run_id TEXT NOT NULL, team_id TEXT NOT NULL, question_id TEXT NOT NULL, value TEXT NOT NULL, final INTEGER NOT NULL DEFAULT 0, correct INTEGER NOT NULL, similarity REAL NOT NULL, score REAL NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY(run_id,team_id,question_id), FOREIGN KEY(run_id,team_id) REFERENCES entries(run_id,team_id));
    CREATE TABLE IF NOT EXISTS answer_parts (run_id TEXT NOT NULL, team_id TEXT NOT NULL, question_id TEXT NOT NULL, field_id TEXT NOT NULL, correct INTEGER NOT NULL, similarity REAL NOT NULL, score REAL NOT NULL, PRIMARY KEY(run_id,team_id,question_id,field_id), FOREIGN KEY(run_id,team_id,question_id) REFERENCES answers(run_id,team_id,question_id));
    CREATE TABLE IF NOT EXISTS run_control (run_id TEXT PRIMARY KEY REFERENCES runs(id), released INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS logins (ip TEXT NOT NULL, time INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS login_time ON logins(time);');
    return $db;
}
function cfg(string $key, $default = null)
{
    $s = db()->prepare("SELECT value FROM config WHERE key=?");
    $s->execute([$key]);
    $v = $s->fetchColumn();
    return $v === false ? $default : json_decode($v, true);
}
function putcfg(string $k, $v): void
{
    db()
        ->prepare(
            "INSERT INTO config(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        )
        ->execute([$k, json_encode($v, JSON_UNESCAPED_UNICODE)]);
}
function valid_password(string $s): bool
{
    return mb_strlen($s) >= 12 && strlen($s) <= 72 && !str_contains($s, "\0");
}
function uid(): string
{
    return bin2hex(random_bytes(12));
}
function fail(string $msg, int $status = 400, array $details = []): never
{
    http_response_code($status);
    echo json_encode(["error" => $msg] + $details, JSON_UNESCAPED_UNICODE);
    exit();
}
function out($data): never
{
    echo json_encode(
        $data,
        JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE,
    );
    exit();
}
function session_open(): void
{
    $dir = ROOT . "/data/sessions";
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
        throw new RuntimeException(
            "Нет прав для создания каталога PHP-сессий.",
        );
    }
    session_save_path($dir);
    ini_set("session.gc_maxlifetime", "28800");
    ini_set("session.use_strict_mode", "1");
    session_name("pereplet_host");
    session_set_cookie_params([
        "httponly" => true,
        "samesite" => "Strict",
        "secure" => !empty($_SERVER["HTTPS"]) && $_SERVER["HTTPS"] !== "off",
        "path" =>
            rtrim(
                str_replace("\\", "/", dirname($_SERVER["SCRIPT_NAME"])),
                "/",
            ) . "/",
    ]);
    session_start();
}
function ishost(): bool
{
    return !empty($_SESSION["host"]) &&
        ($_SESSION["expires"] ?? 0) > time() &&
        ($_SESSION["version"] ?? null) === cfg("auth_version", 1);
}
function host(): void
{
    if (!ishost()) {
        fail("Войдите как ведущий.", 401);
    }
}
function active(): ?array
{
    $id = cfg("active_run");
    if (!$id) {
        return null;
    }
    $s = db()->prepare("SELECT * FROM runs WHERE id=? AND ended IS NULL");
    $s->execute([$id]);
    $r = $s->fetch();
    return $r ?: null;
}
function team(): array
{
    $token = $_SERVER["HTTP_X_TEAM_TOKEN"] ?? "";
    $s = db()->prepare("SELECT id,name FROM teams WHERE token_hash=?");
    $s->execute([hash("sha256", $token)]);
    $t = $s->fetch();
    if (!$t) {
        fail("Создайте команду или введите код восстановления.", 401);
    }
    return $t;
}
function cleantext($v, int $max = 1000): string
{
    if (!is_string($v)) {
        fail("Ожидается текст.");
    }
    $v = trim($v);
    if (mb_strlen($v) > $max) {
        fail("Слишком длинный текст.");
    }
    return $v;
}
function norm(string $s): string
{
    $s = mb_strtolower(trim($s), "UTF-8");
    $s = str_replace("ё", "е", $s);
    return preg_replace("/[\p{Z}\s\p{P}]+/u", "", $s);
}
function similarity(string $a, string $b): float
{
    $a = preg_split("//u", norm($a), -1, PREG_SPLIT_NO_EMPTY);
    $b = preg_split("//u", norm($b), -1, PREG_SPLIT_NO_EMPTY);
    $n = count($a);
    $m = count($b);
    if (max($n, $m) === 0) {
        return 100;
    }
    $prev = range(0, $m);
    for ($i = 1; $i <= $n; $i++) {
        $row = [$i];
        for ($j = 1; $j <= $m; $j++) {
            $row[$j] = min(
                $row[$j - 1] + 1,
                $prev[$j] + 1,
                $prev[$j - 1] + ($a[$i - 1] === $b[$j - 1] ? 0 : 1),
            );
        }
        $prev = $row;
    }
    return round(100 * (1 - $prev[$m] / max($n, $m)), 1);
}
function grade(array $q, $v): array
{
    if ($q["type"] === "fields") {
        return grade_fields($q, $v);
    }
    $correct = false;
    $similar = 0;
    if (in_array($q["type"], ["single", "multiple"], true)) {
        $a = is_array($v) ? array_values(array_unique($v)) : [];
        $b = $q["correct"];
        sort($a);
        sort($b);
        $correct = $a === $b;
        $similar = $correct ? 100 : 0;
    } elseif ($q["type"] === "text") {
        foreach ($q["accepted"] as $a) {
            if (norm((string) $v) === norm($a)) {
                $similar = 100;
                break;
            }
            $similar = max($similar, similarity((string) $v, $a));
        }
        $correct = $similar === 100.0 || $similar === 100;
    } elseif ($q["type"] === "number") {
        $correct =
            is_numeric(str_replace(",", ".", (string) $v)) &&
            abs(
                (float) str_replace(",", ".", (string) $v) -
                    (float) $q["number"],
            ) <= (float) $q["tolerance"];
        $similar = $correct ? 100 : 0;
    }
    return [
        "correct" => $correct,
        "similarity" => $similar,
        "score" => $correct ? $q["points"] : 0,
    ];
}
function mediaurl($value): string
{
    $v = cleantext($value, 2048);
    if (
        $v === "" ||
        preg_match(
            '~^uploads/[a-f0-9]+\.(jpg|png|gif|webp|mp4|webm|mp3|ogg|wav)$~D',
            $v,
        )
    ) {
        return $v;
    }
    if (
        filter_var($v, FILTER_VALIDATE_URL) &&
        strtolower((string) parse_url($v, PHP_URL_SCHEME)) === "https" &&
        !parse_url($v, PHP_URL_USER)
    ) {
        return $v;
    }
    fail("Медиа: загрузите файл или укажите HTTPS-ссылку.");
}
function layout($raw): array
{
    if (!is_array($raw)) {
        return ["background" => "#f5f0e6", "elements" => []];
    }
    if (!is_array($raw["elements"] ?? [])) {
        fail("Неверный формат элементов оформления.");
    }
    if (count($raw["elements"] ?? []) > 40) {
        fail("На холсте может быть максимум 40 элементов.");
    }
    $els = [];
    foreach (array_slice($raw["elements"] ?? [], 0, 40) as $e) {
        $type = $e["type"] ?? "text";
        if (!in_array($type, ["text", "image"], true)) {
            continue;
        }
        $els[] = [
            "id" =>
                is_string($e["id"] ?? null) &&
                preg_match("/^[a-zA-Z0-9_-]{1,80}$/D", $e["id"])
                    ? $e["id"]
                    : uid(),
            "type" => $type,
            "font" => in_array($e["font"] ?? "sans", ["sans", "serif"], true)
                ? $e["font"] ?? "sans"
                : "sans",
            "align" => in_array(
                $e["align"] ?? "left",
                ["left", "center", "right"],
                true,
            )
                ? $e["align"] ?? "left"
                : "left",
            "bold" => (bool) ($e["bold"] ?? false),
            "text" => cleantext($e["text"] ?? "", 2000),
            "url" => mediaurl($e["url"] ?? ""),
            "x" => max(0, min(98, (float) ($e["x"] ?? 5))),
            "y" => max(0, min(98, (float) ($e["y"] ?? 5))),
            "w" => max(5, min(100, (float) ($e["w"] ?? 40))),
            "size" => max(12, min(100, (int) ($e["size"] ?? 26))),
            "color" => preg_match('/^#[0-9a-f]{6}$/i', $e["color"] ?? "")
                ? $e["color"]
                : "#163c32",
        ];
    }
    $regions = [];
    foreach (
        array_slice(
            is_array($raw["regions"] ?? null) ? $raw["regions"] : [],
            0,
            16,
            true,
        )
        as $key => $r
    ) {
        if (
            !in_array(
                $key,
                [
                    "brand",
                    "venue",
                    "content",
                    "title",
                    "description",
                    "choices",
                    "participant",
                    "host",
                    "progress",
                    "results",
                ],
                true,
            ) ||
            !is_array($r)
        ) {
            continue;
        }
        $region = [
            "dx" => max(-95, min(95, (float) ($r["dx"] ?? 0))),
            "dy" => max(-95, min(95, (float) ($r["dy"] ?? 0))),
        ];
        if (isset($r["w"])) {
            $region["w"] = max(20, min(100, (float) $r["w"]));
        }
        if (isset($r["size"])) {
            $region["size"] = max(12, min(100, (int) $r["size"]));
        }
        if (
            isset($r["color"]) &&
            preg_match('/^#[0-9a-f]{6}$/i', $r["color"])
        ) {
            $region["color"] = $r["color"];
        }
        if (isset($r["text"])) {
            $region["text"] = cleantext($r["text"], 2000);
        }
        if (in_array($r["font"] ?? null, ["sans", "serif"], true)) {
            $region["font"] = $r["font"];
        }
        if (in_array($r["align"] ?? null, ["left", "center", "right"], true)) {
            $region["align"] = $r["align"];
        }
        if (isset($r["bold"])) {
            $region["bold"] = (bool) $r["bold"];
        }
        $regions[$key] = $region;
    }
    return [
        "inherit" => ($raw["inherit"] ?? true) !== false,
        "mode" => ($raw["mode"] ?? "") === "page" ? "page" : "slide",
        "backgroundImage" => mediaurl($raw["backgroundImage"] ?? ""),
        "fontSize" => max(16, min(28, (int) ($raw["fontSize"] ?? 18))),
        "textColor" => preg_match('/^#[0-9a-f]{6}$/i', $raw["textColor"] ?? "")
            ? $raw["textColor"]
            : "#193c32",
        "font" => ($raw["font"] ?? "sans") === "serif" ? "serif" : "sans",
        "regions" => $regions,
        "background" => preg_match(
            '/^#[0-9a-f]{6}$/i',
            $raw["background"] ?? "",
        )
            ? $raw["background"]
            : "#f5f0e6",
        "elements" => $els,
    ];
}
function validate_quiz(array $v): array
{
    $issues = quiz_issues($v);
    if ($issues) {
        fail("Исправьте отмеченные поля. Викторина не сохранена.", 400, [
            "issues" => $issues,
        ]);
    }
    if (!is_array($v["questions"] ?? [])) {
        fail("Неверный формат вопросов.");
    }
    if (count($v["questions"] ?? []) > 150) {
        fail("Максимум 150 вопросов в викторине.");
    }
    $title = cleantext($v["title"] ?? "", 120);
    if ($title === "") {
        fail("Укажите название викторины.");
    }
    $qs = [];
    $ids = [];
    foreach (array_slice($v["questions"] ?? [], 0, 150) as $q) {
        $type = $q["type"] ?? "single";
        if (
            !in_array(
                $type,
                [
                    "single",
                    "multiple",
                    "text",
                    "number",
                    "info",
                    "fields",
                    "link",
                ],
                true,
            )
        ) {
            fail("Неизвестный тип вопроса.");
        }
        $id = $q["id"] ?? uid();
        if (
            !is_string($id) ||
            !preg_match('/^[a-zA-Z0-9_-]{1,80}$/D', $id) ||
            isset($ids[$id])
        ) {
            fail("Повторный или неверный ID вопроса.");
        }
        $ids[$id] = true;
        $text = cleantext($q["text"] ?? "", 2000);
        if (
            $text === "" &&
            !in_array($type, ["info", "link", "fields"], true)
        ) {
            fail("Заполните текст каждого вопроса.");
        }
        $options = [];
        foreach (array_slice($q["options"] ?? [], 0, 12) as $o) {
            $options[] = cleantext($o, 300);
        }
        $correct = array_values(
            array_unique(array_map("intval", $q["correct"] ?? [])),
        );
        if (in_array($type, ["single", "multiple"], true)) {
            if (
                count($options) < 2 ||
                in_array("", $options, true) ||
                !count($correct)
            ) {
                fail("Нужны минимум два варианта и правильный ответ.");
            }
            foreach ($correct as $c) {
                if ($c < 0 || $c >= count($options)) {
                    fail("Неверный номер ответа.");
                }
            }
            if ($type === "single" && count($correct) !== 1) {
                fail("Выберите один правильный ответ.");
            }
        }
        $accepted = [];
        foreach (array_slice($q["accepted"] ?? [], 0, 20) as $a) {
            $a = cleantext($a, 300);
            if ($a !== "") {
                $accepted[] = $a;
            }
        }
        if ($type === "text" && !$accepted) {
            fail("Укажите допустимые текстовые ответы.");
        }
        if (
            $type === "number" &&
            (!is_numeric($q["number"] ?? null) ||
                !is_numeric($q["tolerance"] ?? null))
        ) {
            fail("Укажите число и допустимую погрешность.");
        }
        $mt = $q["mediaType"] ?? "image";
        if (!in_array($mt, ["image", "video", "audio"], true)) {
            $mt = "image";
        }
        $fields = $type === "fields" ? normalize_fields($q["fields"]) : [];
        $qs[] = [
            "fields" => $fields,
            "resourceUrl" => resource_url($q["resourceUrl"] ?? ""),
            "resourceLabel" => cleantext(
                $q["resourceLabel"] ?? "Открыть материал",
                100,
            ),
            "id" => $id,
            "type" => $type,
            "text" => $text,
            "options" => $options,
            "correct" => $correct,
            "accepted" => $accepted,
            "number" => (float) ($q["number"] ?? 0),
            "tolerance" => max(0, (float) ($q["tolerance"] ?? 0)),
            "points" => in_array($type, ["info", "link"], true)
                ? 0
                : ($type === "fields"
                    ? array_sum(array_column($fields, "points"))
                    : max(1, min(100, (int) ($q["points"] ?? 1)))),
            "mediaType" => $mt,
            "media" => mediaurl($q["media"] ?? ""),
            "explanation" => cleantext($q["explanation"] ?? "", 1500),
            "layout" => layout($q["layout"] ?? []),
        ];
    }
    return [
        "title" => $title,
        "resultsMode" => in_array(
            $v["resultsMode"] ?? "inherit",
            ["inherit", "show", "hide"],
            true,
        )
            ? $v["resultsMode"] ?? "inherit"
            : "inherit",
        "paced" => (bool) ($v["paced"] ?? false),
        "description" => cleantext($v["description"] ?? "", 1000),
        "questions" => $qs,
        "cover" => layout($v["cover"] ?? []),
        "finishLayout" => layout($v["finishLayout"] ?? []),
        "completionLayout" => layout(
            $v["completionLayout"] ?? ($v["finishLayout"] ?? []),
        ),
    ];
}
function publicquiz(array $q): array
{
    foreach ($q["questions"] as &$question) {
        foreach ($question["fields"] ?? [] as $i => $field) {
            unset($question["fields"][$i]["accepted"]);
        }
        unset(
            $question["correct"],
            $question["accepted"],
            $question["number"],
            $question["tolerance"],
            $question["explanation"],
        );
    }
    return $q;
}

function quiz_issues(array $v): array
{
    $issues = [];
    $add = function ($index, $id, $field, $message) use (&$issues) {
        $issues[] = [
            "index" => $index,
            "questionId" => $id,
            "field" => $field,
            "message" => $message,
        ];
    };
    if (!is_string($v["title"] ?? null) || trim($v["title"]) === "") {
        $add(null, null, "title", "Укажите название викторины.");
    }
    foreach (
        is_array($v["questions"] ?? null) ? $v["questions"] : []
        as $i => $q
    ) {
        if (!is_array($q)) {
            $add($i, null, "type", "Неверный формат слайда.");
            continue;
        }
        $id = $q["id"] ?? null;
        $type = $q["type"] ?? "single";
        if ($type === "fields") {
            foreach (field_issues($q["fields"] ?? null) as $issue) {
                $add($i, $id, $issue["field"], $issue["message"]);
            }
        }
        $url = $q["resourceUrl"] ?? "";
        if (
            ($type === "link" && (!is_string($url) || trim($url) === "")) ||
            ($url !== "" && !valid_resource_url($url))
        ) {
            $add(
                $i,
                $id,
                "resourceUrl",
                "Укажите ссылку, начинающуюся с https:// или http://.",
            );
        }
        $media = $q["media"] ?? "";
        if (
            is_string($media) &&
            $media !== "" &&
            !preg_match(
                '~^uploads/[a-f0-9]+\.(jpg|png|gif|webp|mp4|webm|mp3|ogg|wav)$~D',
                $media,
            ) &&
            !(
                filter_var($media, FILTER_VALIDATE_URL) &&
                strtolower((string) parse_url($media, PHP_URL_SCHEME)) ===
                    "https" &&
                !parse_url($media, PHP_URL_USER)
            )
        ) {
            $add(
                $i,
                $id,
                "media",
                "Загрузите файл или укажите HTTPS-ссылку на медиа.",
            );
        }
        if (
            !in_array($type, ["info", "link", "fields"], true) &&
            (!is_string($q["text"] ?? null) || trim($q["text"]) === "")
        ) {
            $add($i, $id, "text", "Заполните текст вопроса.");
        }
        if (in_array($type, ["single", "multiple"], true)) {
            $opts = $q["options"] ?? [];
            $keys = $q["correct"] ?? [];
            if (!is_array($opts) || count($opts) < 2) {
                $add(
                    $i,
                    $id,
                    "options",
                    "Добавьте минимум два варианта ответа.",
                );
            } elseif (
                count(
                    array_filter(
                        $opts,
                        fn($x) => !is_string($x) || trim($x) === "",
                    ),
                )
            ) {
                $add(
                    $i,
                    $id,
                    "options",
                    "Заполните все варианты ответа или удалите пустые.",
                );
            }
            if (!is_array($keys) || !count($keys)) {
                $add($i, $id, "correct", "Отметьте правильный ответ.");
            } elseif ($type === "single" && count($keys) !== 1) {
                $add($i, $id, "correct", "Должен быть один правильный ответ.");
            } elseif (is_array($opts)) {
                foreach ($keys as $key) {
                    if (
                        !is_numeric($key) ||
                        (int) $key < 0 ||
                        (int) $key >= count($opts)
                    ) {
                        $add(
                            $i,
                            $id,
                            "correct",
                            "Выберите правильный ответ из существующих вариантов.",
                        );
                        break;
                    }
                }
            }
        }
        if (
            $type === "text" &&
            (!is_array($q["accepted"] ?? null) ||
                !count(
                    array_filter(
                        $q["accepted"],
                        fn($x) => is_string($x) && trim($x) !== "",
                    ),
                ))
        ) {
            $add($i, $id, "accepted", "Укажите хотя бы один допустимый ответ.");
        }
        if ($type === "number") {
            foreach (
                [
                    "number" => "Укажите правильное число.",
                    "tolerance" => "Укажите допустимую погрешность (можно 0).",
                ]
                as $field => $message
            ) {
                if (!is_numeric($q[$field] ?? null)) {
                    $add($i, $id, $field, $message);
                }
            }
        }
    }
    return $issues;
}
function quiz_feedback(array $q): bool
{
    return ($q["resultsMode"] ?? "inherit") === "hide"
        ? false
        : (($q["resultsMode"] ?? "inherit") === "show"
            ? true
            : (bool) cfg("feedback", true));
}
function released_count(array $run, array $q): int
{
    $total = count($q["questions"]);
    if (empty($q["paced"])) {
        return $total;
    }
    $s = db()->prepare("SELECT released FROM run_control WHERE run_id=?");
    $s->execute([$run["id"]]);
    $n = $s->fetchColumn();
    $s->closeCursor();
    return max(0, min($total, $n === false ? 0 : (int) $n));
}

function is_material_slide(array $q): bool
{
    return in_array($q["type"], ["info", "link"], true);
}
function valid_resource_url($url): bool
{
    return is_string($url) &&
        strlen($url) <= 2048 &&
        filter_var($url, FILTER_VALIDATE_URL) &&
        in_array(
            strtolower((string) parse_url($url, PHP_URL_SCHEME)),
            ["http", "https"],
            true,
        ) &&
        parse_url($url, PHP_URL_USER) === null &&
        parse_url($url, PHP_URL_PASS) === null;
}
function resource_url($url): string
{
    $v = cleantext($url, 2048);
    if ($v !== "" && !valid_resource_url($v)) {
        fail("Нужна HTTP- или HTTPS-ссылка.");
    }
    return $v;
}
function field_issues($fields): array
{
    if (!is_array($fields) || count($fields) < 2 || count($fields) > 12) {
        return [
            [
                "field" => "fields",
                "message" => "На слайде должно быть от 2 до 12 полей ответа.",
            ],
        ];
    }
    $issues = [];
    $ids = [];
    foreach (array_values($fields) as $i => $f) {
        if (!is_array($f)) {
            $issues[] = [
                "field" => "fields",
                "message" => "Неверный формат полей ответа.",
            ];
            continue;
        }
        $id = $f["id"] ?? null;
        if (
            $id !== null &&
            (!is_string($id) ||
                !preg_match('/^[a-zA-Z0-9_-]{1,80}$/D', $id) ||
                isset($ids[$id]))
        ) {
            $issues[] = [
                "field" => "fields",
                "message" =>
                    "Поля ответа должны иметь разные корректные идентификаторы.",
            ];
        }
        if (is_string($id)) {
            $ids[$id] = true;
        }
        if (!is_string($f["label"] ?? null) || trim($f["label"]) === "") {
            $issues[] = [
                "field" => "fields.$i.label",
                "message" =>
                    "Поле " . ($i + 1) . ": введите вопрос или подпись.",
            ];
        }
        if (
            !is_array($f["accepted"] ?? null) ||
            !count(
                array_filter(
                    $f["accepted"],
                    fn($v) => is_string($v) && trim($v) !== "",
                ),
            )
        ) {
            $issues[] = [
                "field" => "fields.$i.accepted",
                "message" => "Поле " . ($i + 1) . ": укажите допустимый ответ.",
            ];
        }
        if (
            !is_numeric($f["points"] ?? null) ||
            (float) $f["points"] !== (float) (int) $f["points"] ||
            (int) $f["points"] < 1 ||
            (int) $f["points"] > 100
        ) {
            $issues[] = [
                "field" => "fields.$i.points",
                "message" =>
                    "Поле " .
                    ($i + 1) .
                    ": баллы должны быть целым числом от 1 до 100.",
            ];
        }
    }
    return $issues;
}
function normalize_fields(array $fields): array
{
    $out = [];
    foreach (array_values($fields) as $f) {
        $accepted = [];
        foreach (array_slice($f["accepted"], 0, 20) as $a) {
            $a = cleantext($a, 300);
            if ($a !== "") {
                $accepted[] = $a;
            }
        }
        $out[] = [
            "id" => $f["id"] ?? uid(),
            "label" => cleantext($f["label"], 300),
            "accepted" => $accepted,
            "points" => (int) $f["points"],
        ];
    }
    return $out;
}
function grade_fields(array $q, array $values): array
{
    $parts = [];
    $score = 0;
    $similarity = 0;
    $correct = true;
    foreach ($q["fields"] as $f) {
        $v = $values[$f["id"]] ?? "";
        $g =
            trim($v) === ""
                ? ["correct" => false, "similarity" => 0, "score" => 0]
                : grade(
                    [
                        "type" => "text",
                        "accepted" => $f["accepted"],
                        "points" => $f["points"],
                    ],
                    $v,
                );
        $parts[] = ["field_id" => $f["id"]] + $g;
        $score += $g["score"];
        $similarity += $g["similarity"];
        $correct = $correct && $g["correct"];
    }
    return [
        "correct" => $correct,
        "similarity" => round($similarity / count($parts), 1),
        "score" => $score,
        "parts" => $parts,
    ];
}
function read_answer_parts(string $run, ?string $team = null): array
{
    $s = db()->prepare(
        "SELECT * FROM answer_parts WHERE run_id=?" .
            ($team !== null ? " AND team_id=?" : ""),
    );
    $s->execute($team !== null ? [$run, $team] : [$run]);
    $parts = [];
    foreach ($s->fetchAll() as $p) {
        $parts[$p["team_id"]][$p["question_id"]][] = [
            "field_id" => $p["field_id"],
            "correct" => (bool) $p["correct"],
            "similarity" => (float) $p["similarity"],
            "score" => (float) $p["score"],
        ];
    }
    return $parts;
}
