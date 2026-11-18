<?php
declare(strict_types=1);
require_once __DIR__ . "/server/update-gate.php";
quiz_update_gate();
require __DIR__ . "/server/bootstrap.php";
header("Content-Type: application/json; charset=utf-8");
header("Cache-Control: no-store");
header("X-Content-Type-Options: nosniff");
try {
    session_open();
    if (empty($_SESSION["csrf"])) {
        $_SESSION["csrf"] = bin2hex(random_bytes(24));
    }
    $action = $_GET["action"] ?? "bootstrap";
    $writes = [
        "login",
        "logout",
        "save_quiz",
        "save_design",
        "release_next",
        "delete_quiz",
        "activate",
        "stop",
        "join",
        "answer",
        "settings",
        "upload",
        "grade",
        "update_config",
        "update_check",
        "update_install",
        "update_rollback",
    ];
    if (in_array($action, $writes, true)) {
        if ($_SERVER["REQUEST_METHOD"] !== "POST") {
            fail("Требуется POST.", 405);
        }
        if (
            !hash_equals($_SESSION["csrf"], $_SERVER["HTTP_X_CSRF_TOKEN"] ?? "")
        ) {
            fail("Обновите страницу: защитный токен устарел.", 403);
        }
    }
    $hostActions = [
        "update_status",
        "quizzes",
        "save_quiz",
        "save_design",
        "release_next",
        "delete_quiz",
        "activate",
        "stop",
        "monitor",
        "settings",
        "upload",
        "export",
        "grade",
        "update_config",
        "update_check",
        "update_install",
        "update_rollback",
    ];
    if (in_array($action, $hostActions, true)) {
        host();
    }
    $b = [];
    if ($_SERVER["REQUEST_METHOD"] === "POST" && $action !== "upload") {
        $raw = file_get_contents("php://input");
        if (strlen($raw) > 2000000) {
            fail("Слишком большой запрос.", 413);
        }
        $b = json_decode($raw, true);
        if (!is_array($b)) {
            fail("Неверный JSON.");
        }
    }
    // Release the session lock before database work; polling tabs must not block each other.
    $csrf = $_SESSION["csrf"];
    $hostState = ishost();
    session_write_close();
    if (str_starts_with($action, "update_")) {
        require_once __DIR__ . "/server/updater.php";
        try {
            if (
                in_array($action, ["update_install", "update_rollback"], true)
            ) {
                ignore_user_abort(true);
                set_time_limit(300);
            }
            switch ($action) {
                case "update_status":
                    out(up_status());
                case "update_config":
                    up_save_settings($b);
                    out(up_status());
                case "update_check":
                    up_check(!empty($b["force"]));
                    out(up_status());
                case "update_install":
                    out(up_install($b));
                case "update_rollback":
                    out(up_rollback($b));
            }
        } catch (Throwable $e) {
            fail($e->getMessage(), 400);
        }
    }
    switch ($action) {
        case "bootstrap":
            $r = active();
            out([
                "csrf" => $csrf,
                "host" => $hostState,
                "setup" => cfg("password") !== null,
                "appearance" => cfg("appearance", []),
                "settings" => [
                    "venue" => cfg("venue", "Библиотека открытий"),
                    "registration" => cfg("registration", true),
                ],
                "active" => $r
                    ? [
                        "title" => json_decode($r["snapshot"], true)["title"],
                    ]
                    : null,
            ]);
        case "login":
            if (!cfg("password")) {
                fail(
                    "Сначала выполните первоначальную настройку на ноутбуке ведущего.",
                    409,
                );
            }
            $ip = $_SERVER["REMOTE_ADDR"] ?? "local";
            db()
                ->prepare("DELETE FROM logins WHERE time<?")
                ->execute([time() - 900]);
            $s = db()->prepare("SELECT COUNT(*) FROM logins WHERE ip=?");
            $s->execute([$ip]);
            $attempts = (int) $s->fetchColumn();
            $s->closeCursor();
            if ($attempts >= 8) {
                fail("Слишком много попыток. Повторите через 15 минут.", 429);
            }
            db()
                ->prepare("INSERT INTO logins(ip,time) VALUES(?,?)")
                ->execute([$ip, time()]);
            if (
                !valid_password((string) ($b["password"] ?? "")) ||
                !password_verify(
                    (string) ($b["password"] ?? ""),
                    cfg("password"),
                )
            ) {
                fail("Неверный пароль.", 401);
            }
            db()
                ->prepare("DELETE FROM logins WHERE ip=?")
                ->execute([$ip]);
            session_open();
            session_regenerate_id(true);
            $_SESSION["host"] = true;
            $_SESSION["expires"] = time() + 28800;
            $_SESSION["version"] = cfg("auth_version", 1);
            session_write_close();
            out(["ok" => true]);
        case "logout":
            session_open();
            $_SESSION = ["csrf" => bin2hex(random_bytes(24))];
            session_regenerate_id(true);
            session_write_close();
            out(["ok" => true]);
        case "quizzes":
            $items = db()
                ->query("SELECT * FROM quizzes ORDER BY updated DESC")
                ->fetchAll();
            foreach ($items as &$q) {
                $q["content"] = json_decode($q["content"], true);
            }
            out([
                "quizzes" => $items,
                "appearance" => cfg("appearance", []),
                "active" => active(),
                "settings" => [
                    "venue" => cfg("venue", "Библиотека открытий"),
                    "registration" => cfg("registration", true),
                    "feedback" => cfg("feedback", true),
                    "maxTeams" => cfg("maxTeams", 100),
                ],
            ]);
        case "save_quiz":
            $q = validate_quiz($b["content"] ?? []);
            $id = $b["id"] ?? uid();
            if (!is_string($id) || !preg_match('/^[a-f0-9]{24}$/D', $id)) {
                fail("Неверный ID.");
            }
            db()
                ->prepare(
                    "INSERT INTO quizzes VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,content=excluded.content,updated=excluded.updated",
                )
                ->execute([
                    $id,
                    $q["title"],
                    $q["description"],
                    json_encode($q, JSON_UNESCAPED_UNICODE),
                    time(),
                ]);
            out(["id" => $id]);
        case "delete_quiz":
            $r = active();
            if ($r && $r["quiz_id"] === ($b["id"] ?? "")) {
                fail("Сначала завершите активную игру.");
            }
            db()
                ->prepare("DELETE FROM quizzes WHERE id=?")
                ->execute([$b["id"] ?? ""]);
            out(["ok" => true]);
        case "activate":
            db()->exec("BEGIN IMMEDIATE");
            $s = db()->prepare("SELECT content FROM quizzes WHERE id=?");
            $s->execute([$b["id"] ?? ""]);
            $content = $s->fetchColumn();
            if (!$content) {
                fail("Викторина не найдена.", 404);
            }
            $q = json_decode($content, true);
            if (!count($q["questions"])) {
                fail("Добавьте хотя бы один вопрос.");
            }
            db()->exec(
                "UPDATE runs SET ended=" . time() . " WHERE ended IS NULL",
            );
            $id = uid();
            db()
                ->prepare(
                    "INSERT INTO runs(id,quiz_id,snapshot,started) VALUES(?,?,?,?)",
                )
                ->execute([$id, $b["id"], $content, time()]);
            if (!empty($q["paced"])) {
                db()
                    ->prepare(
                        "INSERT INTO run_control(run_id,released) VALUES(?,0)",
                    )
                    ->execute([$id]);
            }
            putcfg("active_run", $id);
            db()->exec("COMMIT");
            out(["id" => $id]);
        case "release_next":
            db()->exec("BEGIN IMMEDIATE");
            $r = active();
            if (!$r || $r["id"] !== ($b["run"] ?? "")) {
                fail("Этот сеанс уже завершён. Обновите монитор.", 409);
            }
            $q = json_decode($r["snapshot"], true);
            if (empty($q["paced"])) {
                fail("В этой викторине включён самостоятельный переход.", 409);
            }
            $n = released_count($r, $q);
            if (
                !isset($b["expected"]) ||
                !is_int($b["expected"]) ||
                $b["expected"] > $n
            ) {
                fail("Состояние игры изменилось. Обновите монитор.", 409);
            }
            if ($b["expected"] < $n || $n >= count($q["questions"])) {
                db()->exec("COMMIT");
                out(["released" => $n]);
            }
            $n++;
            db()
                ->prepare(
                    "INSERT INTO run_control(run_id,released) VALUES(?,?) ON CONFLICT(run_id) DO UPDATE SET released=excluded.released",
                )
                ->execute([$r["id"], $n]);
            db()->exec("COMMIT");
            out(["released" => $n]);
        case "stop":
            db()->exec("BEGIN IMMEDIATE");
            db()->exec(
                "UPDATE runs SET ended=" . time() . " WHERE ended IS NULL",
            );
            putcfg("active_run", null);
            db()->exec("COMMIT");
            out(["ok" => true]);
        case "join":
            $name = cleantext($b["name"] ?? "", 60);
            if (mb_strlen($name) < 2) {
                fail("Название команды: от 2 до 60 символов.");
            }
            db()->exec("BEGIN IMMEDIATE");
            if (!cfg("registration", true)) {
                fail("Ведущий временно закрыл регистрацию.");
            }
            $r = active();
            if (!$r) {
                fail("Ведущий ещё не запустил викторину.");
            }
            $s = db()->prepare("SELECT COUNT(*) FROM entries WHERE run_id=?");
            $s->execute([$r["id"]]);
            if ($s->fetchColumn() >= cfg("maxTeams", 100)) {
                fail("Достигнут лимит команд.");
            }
            $s = db()->prepare(
                "SELECT t.name FROM teams t JOIN entries e ON t.id=e.team_id WHERE e.run_id=?",
            );
            $s->execute([$r["id"]]);
            foreach ($s->fetchAll(PDO::FETCH_COLUMN) as $existing) {
                if (mb_strtolower($existing) === mb_strtolower($name)) {
                    fail("Это название уже занято. Добавьте номер команды.");
                }
            }
            $token = bin2hex(random_bytes(24));
            $id = uid();
            db()
                ->prepare("INSERT INTO teams VALUES(?,?,?,?)")
                ->execute([$id, $name, hash("sha256", $token), time()]);
            db()
                ->prepare("INSERT INTO entries VALUES(?,?,?,?)")
                ->execute([$r["id"], $id, time(), time()]);
            db()->exec("COMMIT");
            out(["token" => $token, "name" => $name]);
        case "play":
            $t = team();
            $r = active();
            if (!$r) {
                out(["team" => $t, "waiting" => true]);
            }
            $q = json_decode($r["snapshot"], true);
            $s = db()->prepare(
                "SELECT 1 FROM entries WHERE run_id=? AND team_id=?",
            );
            $s->execute([$r["id"], $t["id"]]);
            $enrolled = $s->fetchColumn();
            $s->closeCursor();
            if (!$enrolled) {
                out([
                    "team" => $t,
                    "waiting" => true,
                    "newGame" => true,
                    "title" => $q["title"],
                ]);
            }
            db()
                ->prepare(
                    "UPDATE entries SET seen=? WHERE run_id=? AND team_id=?",
                )
                ->execute([time(), $r["id"], $t["id"]]);
            $s = db()->prepare(
                "SELECT * FROM answers WHERE run_id=? AND team_id=?",
            );
            $s->execute([$r["id"], $t["id"]]);
            $answers = $s->fetchAll();
            $finals = array_filter($answers, fn($a) => (bool) $a["final"]);
            $done = count($finals) === count($q["questions"]);
            $feedback = quiz_feedback($q);
            $released = released_count($r, $q);
            $parts =
                $done && $feedback ? read_answer_parts($r["id"], $t["id"]) : [];
            $safe = [];
            foreach ($answers as $a) {
                $item = [
                    "question_id" => $a["question_id"],
                    "value" => json_decode($a["value"], true),
                    "final" => (bool) $a["final"],
                ];
                if ($done && $feedback) {
                    $item += [
                        "correct" => (bool) $a["correct"],
                        "score" => (float) $a["score"],
                        "similarity" => (float) $a["similarity"],
                    ];
                    if (isset($parts[$t["id"]][$a["question_id"]])) {
                        $item["parts"] = $parts[$t["id"]][$a["question_id"]];
                    }
                }
                $safe[] = $item;
            }
            $visible = publicquiz($q);
            if ($done && $feedback) {
                $visible = $q;
            }
            $visible["questions"] = array_slice(
                $visible["questions"],
                0,
                $released,
            );
            out([
                "totalQuestions" => count($q["questions"]),
                "totalPoints" => array_sum(
                    array_column($q["questions"], "points"),
                ),
                "released" => $released,
                "waitingForHost" => !$done && count($finals) >= $released,
                "team" => $t,
                "run" => $r["id"],
                "quiz" => $visible,
                "answers" => $safe,
                "done" => $done,
                "feedback" => $feedback,
            ]);
        case "answer":
            $t = team();
            db()->exec("BEGIN IMMEDIATE");
            $r = active();
            if (!$r || $r["id"] !== ($b["run"] ?? "")) {
                fail(
                    "Игра завершена или ведущий запустил другую викторину.",
                    409,
                );
            }
            $s = db()->prepare(
                "SELECT 1 FROM entries WHERE run_id=? AND team_id=?",
            );
            $s->execute([$r["id"], $t["id"]]);
            if (!$s->fetchColumn()) {
                fail("Команда не зарегистрирована в этой игре.", 403);
            }
            $q = json_decode($r["snapshot"], true);
            $s = db()->prepare(
                "SELECT question_id FROM answers WHERE run_id=? AND team_id=? AND final=1",
            );
            $s->execute([$r["id"], $t["id"]]);
            $done = $s->fetchAll(PDO::FETCH_COLUMN);
            $current = null;
            $currentIndex = 0;
            foreach ($q["questions"] as $questionIndex => $question) {
                if (!in_array($question["id"], $done, true)) {
                    $current = $question;
                    $currentIndex = $questionIndex;
                    break;
                }
            }
            // Idempotent retries after a lost response.
            if (in_array($b["question"] ?? "", $done, true)) {
                db()->exec("COMMIT");
                out(["ok" => true]);
            }
            if (!$current || $current["id"] !== ($b["question"] ?? "")) {
                fail("Сначала ответьте на текущий вопрос.", 409);
            }
            if ($currentIndex >= released_count($r, $q)) {
                fail("Ведущий ещё не открыл этот слайд.", 403);
            }
            $v = $b["value"] ?? "";
            $final = !empty($b["final"]);
            if (in_array($current["type"], ["single", "multiple"], true)) {
                if (!is_array($v) || count($v) > 12) {
                    fail("Неверный формат ответа.");
                }
                $v = array_values(array_unique(array_map("intval", $v)));
                foreach ($v as $n) {
                    if ($n < 0 || $n >= count($current["options"])) {
                        fail("Такого варианта нет.");
                    }
                }
                if ($current["type"] === "single" && count($v) > 1) {
                    fail("Выберите один ответ.");
                }
                if ($final && !count($v)) {
                    fail("Выберите ответ.");
                }
            } elseif ($current["type"] === "fields") {
                if (
                    !is_array($v) ||
                    count($v) > 12 ||
                    array_diff(
                        array_keys($v),
                        array_column($current["fields"], "id"),
                    )
                ) {
                    fail("Неверный набор полей ответа.");
                }
                $values = [];
                foreach ($current["fields"] as $field) {
                    $values[$field["id"]] = cleantext(
                        $v[$field["id"]] ?? "",
                        300,
                    );
                }
                if (
                    $final &&
                    !count(array_filter($values, fn($value) => $value !== ""))
                ) {
                    fail("Введите хотя бы один ответ.");
                }
                $v = $values;
            } else {
                $v = cleantext($v, 300);
                if ($final && $v === "" && !is_material_slide($current)) {
                    fail("Введите ответ.");
                }
                if (
                    $final &&
                    $current["type"] === "number" &&
                    !is_numeric(str_replace(",", ".", $v))
                ) {
                    fail("Введите число.");
                }
            }
            $g = grade($current, $v);
            db()
                ->prepare(
                    "INSERT INTO answers VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(run_id,team_id,question_id) DO UPDATE SET value=excluded.value,final=excluded.final,correct=excluded.correct,similarity=excluded.similarity,score=excluded.score,updated=excluded.updated WHERE answers.final=0",
                )
                ->execute([
                    $r["id"],
                    $t["id"],
                    $current["id"],
                    json_encode($v, JSON_UNESCAPED_UNICODE),
                    (int) $final,
                    (int) $g["correct"],
                    $g["similarity"],
                    $g["score"],
                    time(),
                ]);
            foreach ($g["parts"] ?? [] as $part) {
                db()
                    ->prepare(
                        "INSERT INTO answer_parts VALUES(?,?,?,?,?,?,?) ON CONFLICT(run_id,team_id,question_id,field_id) DO UPDATE SET correct=excluded.correct,similarity=excluded.similarity,score=excluded.score",
                    )
                    ->execute([
                        $r["id"],
                        $t["id"],
                        $current["id"],
                        $part["field_id"],
                        (int) $part["correct"],
                        $part["similarity"],
                        $part["score"],
                    ]);
            }
            db()
                ->prepare(
                    "UPDATE entries SET seen=? WHERE run_id=? AND team_id=?",
                )
                ->execute([time(), $r["id"], $t["id"]]);
            db()->exec("COMMIT");
            out(["ok" => true]);
        case "monitor":
        case "export":
            $rid = $_GET["run"] ?? cfg("active_run");
            $s = db()->prepare("SELECT * FROM runs WHERE id=?");
            $s->execute([$rid]);
            $r = $s->fetch();
            $history = db()
                ->query(
                    "SELECT id,started,ended,snapshot FROM runs ORDER BY started DESC LIMIT 50",
                )
                ->fetchAll();
            $history = array_map(
                fn($h) => [
                    "id" => $h["id"],
                    "started" => $h["started"],
                    "ended" => $h["ended"],
                    "title" => json_decode($h["snapshot"], true)["title"],
                ],
                $history,
            );
            if (!$r) {
                out(["run" => null, "history" => $history, "teams" => []]);
            }
            $s = db()->prepare(
                "SELECT t.id,t.name,e.started,e.seen FROM entries e JOIN teams t ON t.id=e.team_id WHERE run_id=? ORDER BY e.started,t.name",
            );
            $s->execute([$r["id"]]);
            $teams = $s->fetchAll();
            $s = db()->prepare("SELECT * FROM answers WHERE run_id=?");
            $s->execute([$r["id"]]);
            $answers = $s->fetchAll();
            $parts = read_answer_parts($r["id"]);
            foreach ($teams as &$tm) {
                $tm["answers"] = [];
                $tm["score"] = 0;
                foreach ($answers as $a) {
                    if ($a["team_id"] === $tm["id"]) {
                        $a["value"] = json_decode($a["value"], true);
                        if (isset($parts[$tm["id"]][$a["question_id"]])) {
                            $a["parts"] = $parts[$tm["id"]][$a["question_id"]];
                        }
                        $tm["answers"][] = $a;
                        if ($a["final"]) {
                            $tm["score"] += $a["score"];
                        }
                    }
                }
            }
            unset($tm);
            $q = json_decode($r["snapshot"], true);
            if ($action === "export") {
                header("Content-Type: text/csv; charset=utf-8");
                header(
                    'Content-Disposition: attachment; filename="quiz-results.csv"',
                );
                $f = fopen("php://output", "w");
                fwrite($f, "\xEF\xBB\xBF");
                fputcsv(
                    $f,
                    [
                        "Команда",
                        "Баллы",
                        "Вопрос",
                        "Ответ",
                        "Отправлен",
                        "Верно",
                        "Совпадение %",
                        "Баллы за ответ",
                        "Максимум за ответ",
                    ],
                    ";",
                    '"',
                    "",
                );
                foreach ($teams as $tm) {
                    foreach ($tm["answers"] as $a) {
                        $question = current(
                            array_filter(
                                $q["questions"],
                                fn($x) => $x["id"] === $a["question_id"],
                            ),
                        );
                        if (!$question || is_material_slide($question)) {
                            continue;
                        }
                        $export = [];
                        if ($question["type"] === "fields") {
                            foreach ($question["fields"] as $field) {
                                $part = current(
                                    array_filter(
                                        $a["parts"] ?? [],
                                        fn($p) => $p["field_id"] ===
                                            $field["id"],
                                    ),
                                );
                                $export[] = [
                                    $question["text"] . " — " . $field["label"],
                                    $a["value"][$field["id"]] ?? "",
                                    $part["correct"] ?? false,
                                    $part["similarity"] ?? 0,
                                    $part["score"] ?? 0,
                                    $field["points"],
                                ];
                            }
                        } else {
                            $value = is_array($a["value"])
                                ? implode(
                                    ", ",
                                    array_map(
                                        fn($i) => $question["options"][$i] ??
                                            "",
                                        $a["value"],
                                    ),
                                )
                                : (string) $a["value"];
                            $export[] = [
                                $question["text"],
                                $value,
                                (bool) $a["correct"],
                                $a["similarity"],
                                $a["score"],
                                $question["points"],
                            ];
                        }
                        foreach (
                            $export
                            as [
                                $text,
                                $value,
                                $correct,
                                $similarity,
                                $score,
                                $maximum,
                            ]
                        ) {
                            $row = [
                                $tm["name"],
                                $tm["score"],
                                $text,
                                $value,
                                $a["final"] ? "Да" : "Черновик",
                                $correct ? "Да" : "Нет",
                                $similarity,
                                $a["final"] ? $score : 0,
                                $maximum,
                            ];
                            $row = array_map(
                                fn($v) => preg_match(
                                    '/^[=+@\-\t\r]/u',
                                    (string) $v,
                                )
                                    ? "'" . $v
                                    : $v,
                                $row,
                            );
                            fputcsv($f, $row, ";", '"', "");
                        }
                    }
                }
                exit();
            }
            out([
                "run" => [
                    "id" => $r["id"],
                    "ended" => $r["ended"],
                    "started" => $r["started"],
                    "paced" => (bool) ($q["paced"] ?? false),
                    "released" => released_count($r, $q),
                ],
                "quiz" => $q,
                "teams" => $teams,
                "history" => $history,
                "now" => time(),
            ]);
        case "grade":
            $s = db()->prepare("SELECT snapshot FROM runs WHERE id=?");
            $s->execute([$b["run"] ?? ""]);
            $snap = $s->fetchColumn();
            $s->closeCursor();
            if (!$snap) {
                fail("Игра не найдена.");
            }
            $q = json_decode($snap, true);
            $question = current(
                array_filter(
                    $q["questions"],
                    fn($q) => $q["id"] === ($b["question"] ?? ""),
                ),
            );
            if (!$question) {
                fail("Вопрос не найден.");
            }
            if ($question["type"] === "fields") {
                $field = current(
                    array_filter(
                        $question["fields"],
                        fn($f) => $f["id"] === ($b["field"] ?? ""),
                    ),
                );
                if (!$field) {
                    fail("Выберите поле, оценку которого нужно изменить.");
                }
                if (!is_numeric($b["score"] ?? null)) {
                    fail("Введите число баллов.");
                }
                $score = max(0, min($field["points"], (float) $b["score"]));
                db()->exec("BEGIN IMMEDIATE");
                $s = db()->prepare(
                    "SELECT final FROM answers WHERE run_id=? AND team_id=? AND question_id=?",
                );
                $s->execute([$b["run"], $b["team"], $b["question"]]);
                $final = $s->fetchColumn();
                $s->closeCursor();
                if (!$final) {
                    fail("Можно оценивать только отправленные ответы.");
                }
                $s = db()->prepare(
                    "UPDATE answer_parts SET score=?,correct=? WHERE run_id=? AND team_id=? AND question_id=? AND field_id=?",
                );
                $s->execute([
                    $score,
                    (int) ($score == $field["points"]),
                    $b["run"],
                    $b["team"],
                    $b["question"],
                    $field["id"],
                ]);
                if (!$s->rowCount()) {
                    fail("Ответ поля не найден.", 404);
                }
                $s = db()->prepare(
                    "SELECT SUM(score) AS total,MIN(correct) AS correct FROM answer_parts WHERE run_id=? AND team_id=? AND question_id=?",
                );
                $s->execute([$b["run"], $b["team"], $b["question"]]);
                $aggregate = $s->fetch();
                $s->closeCursor();
                db()
                    ->prepare(
                        "UPDATE answers SET score=?,correct=? WHERE run_id=? AND team_id=? AND question_id=?",
                    )
                    ->execute([
                        $aggregate["total"],
                        $aggregate["correct"],
                        $b["run"],
                        $b["team"],
                        $b["question"],
                    ]);
                db()->exec("COMMIT");
                out(["ok" => true]);
            }
            $score = max(
                0,
                min($question["points"], (float) ($b["score"] ?? 0)),
            );
            db()
                ->prepare(
                    "UPDATE answers SET score=?,correct=? WHERE run_id=? AND team_id=? AND question_id=? AND final=1",
                )
                ->execute([
                    $score,
                    (int) ($score == $question["points"]),
                    $b["run"],
                    $b["team"],
                    $b["question"],
                ]);
            out(["ok" => true]);
        case "save_design":
            $pages = [];
            foreach (
                [
                    "home",
                    "login",
                    "join",
                    "restore",
                    "waiting",
                    "waiting-slide",
                    "new-game",
                    "completed",
                    "start",
                    "question",
                    "finish",
                ]
                as $key
            ) {
                if (isset($b["pages"][$key])) {
                    $pages[$key] = layout($b["pages"][$key]);
                }
            }
            $drafts = $b["quizzes"] ?? [];
            if (!is_array($drafts) || count($drafts) > 50) {
                fail("Слишком много викторин в одном сохранении.");
            }
            // Validate every layout before starting a transaction.
            $validated = [];
            foreach ($drafts as $draft) {
                $id = cleantext($draft["id"] ?? "", 80);
                $layouts = $draft["layouts"] ?? [];
                $item = [];
                foreach ($layouts as $key => $value) {
                    if (
                        !preg_match('/^[a-zA-Z0-9_-]{1,80}$/D', (string) $key)
                    ) {
                        fail("Неверная страница.");
                    }
                    $item[$key] = layout($value);
                }
                $validated[$id] = $item;
            }
            db()->exec("BEGIN IMMEDIATE");
            putcfg("appearance", $pages);
            foreach ($validated as $id => $layouts) {
                $st = db()->prepare("SELECT content FROM quizzes WHERE id=?");
                $st->execute([$id]);
                $raw = $st->fetchColumn();
                $st->closeCursor();
                if (!$raw) {
                    fail("Викторина была удалена. Обновите редактор.", 409);
                }
                $content = json_decode($raw, true);
                foreach (
                    ["cover", "finishLayout", "completionLayout"]
                    as $key
                ) {
                    if (isset($layouts[$key])) {
                        $content[$key] = $layouts[$key];
                    }
                }
                foreach ($content["questions"] as &$question) {
                    if (isset($layouts[$question["id"]])) {
                        $question["layout"] = $layouts[$question["id"]];
                    }
                }
                unset($question);
                db()
                    ->prepare(
                        "UPDATE quizzes SET content=?,updated=? WHERE id=?",
                    )
                    ->execute([
                        json_encode($content, JSON_UNESCAPED_UNICODE),
                        time(),
                        $id,
                    ]);
                // Only appearance changes in the active snapshot; questions, keys and answers stay fixed.
                $st = db()->prepare(
                    "SELECT id,snapshot FROM runs WHERE quiz_id=? AND ended IS NULL",
                );
                $st->execute([$id]);
                foreach ($st->fetchAll() as $run) {
                    $snapshot = json_decode($run["snapshot"], true);
                    foreach (
                        ["cover", "finishLayout", "completionLayout"]
                        as $key
                    ) {
                        if (isset($layouts[$key])) {
                            $snapshot[$key] = $layouts[$key];
                        }
                    }
                    foreach ($snapshot["questions"] as &$question) {
                        if (isset($layouts[$question["id"]])) {
                            $question["layout"] = $layouts[$question["id"]];
                        }
                    }
                    unset($question);
                    db()
                        ->prepare("UPDATE runs SET snapshot=? WHERE id=?")
                        ->execute([
                            json_encode($snapshot, JSON_UNESCAPED_UNICODE),
                            $run["id"],
                        ]);
                }
            }
            db()->exec("COMMIT");
            out(["ok" => true, "appearance" => $pages]);
        case "settings":
            if (isset($b["password"]) && $b["password"] !== "") {
                if (
                    !password_verify(
                        (string) ($b["oldPassword"] ?? ""),
                        cfg("password"),
                    )
                ) {
                    fail("Текущий пароль неверен.", 403);
                }
                if (!valid_password((string) $b["password"])) {
                    fail(
                        "Пароль: минимум 12 символов, максимум 72 байта UTF-8, без нулевых байтов.",
                    );
                }
                putcfg(
                    "password",
                    password_hash($b["password"], PASSWORD_DEFAULT),
                );
                $version = cfg("auth_version", 1) + 1;
                putcfg("auth_version", $version);
                session_open();
                $_SESSION["version"] = $version;
                session_write_close();
            }
            putcfg(
                "venue",
                cleantext($b["venue"] ?? "Библиотека открытий", 120),
            );
            putcfg("registration", (bool) ($b["registration"] ?? true));
            putcfg("feedback", (bool) ($b["feedback"] ?? true));
            putcfg("maxTeams", max(1, min(500, (int) ($b["maxTeams"] ?? 100))));
            out(["ok" => true]);
        case "upload":
            $f = $_FILES["file"] ?? null;
            if (!$f || $f["error"] !== UPLOAD_ERR_OK) {
                fail(
                    "Не удалось загрузить файл. Проверьте ограничения upload_max_filesize и post_max_size в PHP.",
                );
            }
            if ($f["size"] > 64 * 1024 * 1024) {
                fail("Максимальный размер — 64 МБ.");
            }
            $mime = (new finfo(FILEINFO_MIME_TYPE))->file($f["tmp_name"]);
            $allowed = [
                "image/jpeg" => "jpg",
                "image/png" => "png",
                "image/gif" => "gif",
                "image/webp" => "webp",
                "video/mp4" => "mp4",
                "video/webm" => "webm",
                "audio/mpeg" => "mp3",
                "audio/ogg" => "ogg",
                "audio/x-wav" => "wav",
                "audio/wav" => "wav",
            ];
            if (!isset($allowed[$mime])) {
                fail(
                    "Разрешены JPG, PNG, GIF, WebP, MP4, WebM, MP3, OGG, WAV.",
                );
            }
            $url = "uploads/" . uid() . "." . $allowed[$mime];
            if (!move_uploaded_file($f["tmp_name"], __DIR__ . "/" . $url)) {
                fail("Нет прав записи в uploads.", 500);
            }
            out(["url" => $url, "type" => explode("/", $mime)[0]]);
        default:
            fail("Действие не найдено.", 404);
    }
} catch (Throwable $e) {
    error_log((string) $e);
    http_response_code(500);
    echo json_encode(
        [
            "error" =>
                "Ошибка сервера. Проверьте журнал PHP, права записи в data/uploads и расширения pdo_sqlite, mbstring.",
        ],
        JSON_UNESCAPED_UNICODE,
    );
}
