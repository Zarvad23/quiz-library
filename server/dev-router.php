<?php
// Only for PHP's development server: Apache uses .htaccess instead.
$path = rawurldecode(parse_url($_SERVER["REQUEST_URI"], PHP_URL_PATH));
if (
    preg_match(
        '~^/(data|server|tests|tools)(/|$)|/\.|\.(md|py|sqlite|sqlite3|db|log|zip)$~i',
        $path,
    )
) {
    http_response_code(404);
    exit();
}
return false;
