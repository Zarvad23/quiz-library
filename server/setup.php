<?php
if (PHP_SAPI !== "cli") {
    http_response_code(404);
    exit();
}
require __DIR__ . "/bootstrap.php";
echo "Переплёт: первоначальная настройка / смена пароля\nПароль ведущего (минимум 12 символов, ввод виден только здесь): ";
$password = trim(fgets(STDIN));
if (!valid_password($password)) {
    fwrite(
        STDERR,
        "Пароль: от 12 символов до 72 байт UTF-8, без нулевых байтов.\n",
    );
    exit(1);
}
putcfg("password", password_hash($password, PASSWORD_DEFAULT));
putcfg("auth_version", cfg("auth_version", 0) + 1);
if (!db()->query("SELECT COUNT(*) FROM quizzes")->fetchColumn()) {
    $demo = [
        "title" => "Между строк",
        "description" =>
            "Литературное путешествие: знакомые герои, удивительные факты и немного воображения.",
        "cover" => [
            "background" => "#eee5d3",
            "elements" => [
                [
                    "type" => "text",
                    "text" => "У каждой книги\nесть своя история.",
                    "x" => 7,
                    "y" => 16,
                    "w" => 80,
                    "size" => 44,
                    "color" => "#163c32",
                ],
            ],
        ],
        "questions" => [
            [
                "id" => "q1",
                "type" => "single",
                "text" => "Кто написал «Маленького принца»?",
                "options" => [
                    "Жюль Верн",
                    "Антуан де Сент-Экзюпери",
                    "Виктор Гюго",
                    "Александр Дюма",
                ],
                "correct" => [1],
                "points" => 1,
                "explanation" =>
                    "Антуан де Сент-Экзюпери написал повесть в 1942 году.",
            ],
            [
                "id" => "q2",
                "type" => "multiple",
                "text" => "Выберите произведения Александра Пушкина.",
                "options" => [
                    "Капитанская дочка",
                    "Мцыри",
                    "Евгений Онегин",
                    "Ревизор",
                ],
                "correct" => [0, 2],
                "points" => 2,
            ],
            [
                "id" => "q3",
                "type" => "text",
                "text" =>
                    "Как зовут няню Александра Пушкина? Напишите имя и отчество.",
                "accepted" => ["Арина Родионовна", "Арина Родионовна Яковлева"],
                "points" => 2,
            ],
            [
                "id" => "q4",
                "type" => "number",
                "text" => "Сколько богатырей было в сказке о царе Салтане?",
                "number" => 33,
                "tolerance" => 0,
                "points" => 1,
            ],
        ],
    ];
    $demo = validate_quiz($demo);
    db()
        ->prepare("INSERT INTO quizzes VALUES(?,?,?,?,?)")
        ->execute([
            uid(),
            $demo["title"],
            $demo["description"],
            json_encode($demo, JSON_UNESCAPED_UNICODE),
            time(),
        ]);
}
echo "Готово. Откройте сайт и выберите «Ведущий».\n";
