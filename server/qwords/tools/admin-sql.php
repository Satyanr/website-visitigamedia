<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$email = strtolower(trim($argv[1] ?? ''));
$password = rtrim((string) fgets(STDIN, 256), "\r\n");
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254 || strlen($password) < 14 || strlen($password) > 72) {
    fwrite(STDERR, "Use a valid email and provide a 14–72 byte password on stdin.\n");
    exit(1);
}
$emailSql = "CONVERT(0x" . bin2hex($email) . " USING utf8mb4)";
$hashSql = "CONVERT(0x" . bin2hex(password_hash($password, PASSWORD_DEFAULT)) . " USING utf8mb4)";
if (($argv[2] ?? '') === '--recover') {
    echo "UPDATE admin_users SET password_hash=$hashSql,role='admin',session_version=session_version+1 WHERE email=$emailSql;\n";
} else {
    echo "INSERT INTO admin_users (id,email,password_hash,role) VALUES (UUID(),$emailSql,$hashSql,'admin');\n";
}
