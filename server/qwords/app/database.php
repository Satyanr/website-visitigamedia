<?php
declare(strict_types=1);
namespace Visitiga\Qwords;

use DateTimeImmutable;
use DateTimeZone;
use PDO;
use RuntimeException;
use Throwable;

require_once __DIR__ . '/schema.php';

final class ApiProblem extends RuntimeException
{
    public function __construct(public readonly int $status, string $message, public readonly string $apiCode = 'invalid_request')
    {
        parent::__construct($message);
    }
}

function db(array $config): PDO
{
    $db = $config['db'] ?? [];
    foreach (['host', 'name', 'user'] as $field) {
        if (!is_string($db[$field] ?? null) || !preg_match('/^[a-zA-Z0-9_.-]+$/D', $db[$field])) throw new RuntimeException('Invalid database configuration');
    }
    $pdo = new PDO('mysql:host=' . $db['host'] . ';port=' . (int) ($db['port'] ?? 3306) . ';dbname=' . $db['name'] . ';charset=utf8mb4',
        $db['user'], $db['password'] ?? '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_TIMEOUT => 3]);
    $pdo->exec("SET SESSION time_zone = '+00:00', innodb_lock_wait_timeout = 4");
    if (str_contains((string) $pdo->getAttribute(PDO::ATTR_SERVER_VERSION), 'MariaDB')) $pdo->exec('SET SESSION max_statement_time = 8');
    else $pdo->exec('SET SESSION max_execution_time = 8000');
    return $pdo;
}

function sql(PDO $db, string $statement, array $params = []): \PDOStatement
{
    $query = $db->prepare($statement);
    foreach (array_values($params) as $index => $value) {
        $type = match (true) { is_int($value) => PDO::PARAM_INT, $value === null => PDO::PARAM_NULL, default => PDO::PARAM_STR };
        $query->bindValue($index + 1, $value, $type);
    }
    $query->execute();
    return $query;
}

function transaction(PDO $db, callable $operation): mixed
{
    $db->beginTransaction();
    try {
        $result = $operation();
        $db->commit();
        return $result;
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
}

function uuid(): string
{
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 15) | 64);
    $bytes[8] = chr((ord($bytes[8]) & 63) | 128);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($bytes), 4));
}

function iso_db_date(mixed $value): string
{
    if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}(?::?\d{2})?)?$/D', $value)) throw new ApiProblem(422, 'Tanggal tidak valid.');
    $parts = array_map('intval', explode('-', substr($value, 0, 10)));
    if (!checkdate($parts[1], $parts[2], $parts[0])) throw new ApiProblem(422, 'Tanggal tidak valid.');
    return (new DateTimeImmutable($value, new DateTimeZone('UTC')))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s.u');
}

function bounded_text(mixed $value, int $max, int $min = 0): string
{
    if (!is_string($value) || !mb_check_encoding($value, 'UTF-8') || str_contains($value, "\0") || mb_strlen($value) > $max || mb_strlen(trim($value)) < $min) {
        throw new ApiProblem(422, 'Teks tidak valid atau melewati batas.');
    }
    return $value;
}

function safe_content_url(string $value, bool $link = false): bool
{
    if ($value === '') return true;
    if (strlen($value) > 2048 || preg_match('/[\x00-\x1f\x7f\\\\]/', $value)) return false;
    return (str_starts_with($value, '/') && !str_starts_with($value, '//'))
        || (str_starts_with($value, 'https://') && filter_var($value, FILTER_VALIDATE_URL) !== false)
        || ($link && preg_match('~^(?:mailto|tel):[^/]+$~D', $value));
}

function check_content_urls(array $tree): void
{
    foreach ($tree as $name => $value) {
        if (is_array($value)) check_content_urls($value);
        elseif (is_string($value) && is_string($name) && preg_match('/(?:^url$|_url$|Url$)/', $name)
            && !safe_content_url($value, str_contains(strtolower($name), 'button'))) throw new ApiProblem(422, 'URL konten tidak valid.');
    }
}

function field_value(string $field, string $type, mixed $value): mixed
{
    if ($value === null && (str_starts_with($type, 'nullable') || in_array($type, ['json', 'number', 'rating', 'date', 'partial'], true))) return null;
    $choices = ['leadStatus' => ['new','contacted','completed','spam'], 'jobStatus' => ['draft','published','closed'],
        'submissionType' => ['partnership','job_application'], 'kind' => ['web_vital','client_error','csp_violation'],
        'rating' => ['good','needs-improvement','poor']];
    if (isset($choices[$type]) && in_array($value, $choices[$type], true)) return $value;
    if (in_array($type, ['uuid', 'nullableUuid'], true) && is_string($value) && preg_match('/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iD', $value)) return strtolower($value);
    if ($type === 'slug' && is_string($value) && slug_valid($value)) return $value;
    if (in_array($type, ['serial','single','int'], true) && (is_int($value) || (is_string($value) && preg_match('/^-?\d{1,15}$/D', $value)))) {
        $number = (int) $value;
        if (($type === 'single' && $number === 1) || ($type === 'serial' && $number >= 1) || ($type === 'int' && abs($number) <= 2147483647)) return $number;
    }
    if (in_array($type, ['created', 'updated', 'nullableTime'], true)) return iso_db_date($value);
    if (in_array($type, ['date','partial'], true) && is_string($value) && preg_match('/^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/D', $value)
        && ($type === 'partial' || strlen($value) === 10) && (strlen($value) < 10 || checkdate((int) substr($value,5,2), (int) substr($value,8,2), (int) $value))) return $value;
    if (in_array($type, ['text','nullableText','long'], true)) {
        $max = match ($field) { 'seo_title' => 70, 'seo_description','cover_alt' => 180, 'target_keyword' => 100, default => $type === 'long' ? 120000 : 4096 };
        $text = bounded_text($value, $max);
        check_content_urls([$field => $text]);
        return $text;
    }
    if ($type === 'json' && is_array($value)) {
        check_content_urls($value);
        if (strlen($encoded = json_encode_safe($value)) <= 300000) return $encoded;
    }
    if ($type === 'number' && is_numeric($value) && is_finite((float) $value) && $value >= 0 && $value <= 600000) return (float) $value;
    if ($type === 'hash' && is_string($value) && preg_match('/^[0-9a-f]{64}$/D', $value)) return $value;
    throw new ApiProblem(422, 'Nilai data tidak valid.');
}

function decoded_row(array $row, array $fields): array
{
    foreach ($row as $name => &$value) {
        if ($value === null) continue;
        $kind = $fields[$name] ?? '';
        if ($kind === 'json') $value = json_decode($value, true, 32, JSON_THROW_ON_ERROR);
        elseif (in_array($kind, ['created','updated','nullableTime'], true)) $value = str_replace(' ', 'T', $value) . 'Z';
        elseif (in_array($kind, ['single','serial','int'], true)) $value = (int) $value;
    }
    return $row;
}

function resource_fields(string $table, bool $admin): array
{
    $private = ['contact_messages','careers_submissions','website_events','website_observations','service_landing_portfolios'];
    $fields = schemas()[$table] ?? null;
    if (!$fields || (!$admin && in_array($table, $private, true))) throw new ApiProblem(404, 'Data tidak ditemukan.');
    unset($fields['submission_key'], $fields['submission_hash']);
    return $fields;
}

function predicate(array $fields, array $filters, array &$params): array
{
    if (count($filters) > 8) throw new ApiProblem(422, 'Filter tidak valid.');
    $where = [];
    foreach ($filters as $filter) {
        if (!is_array($filter) || count($filter) !== 3 || !is_string($filter[0] ?? null)) throw new ApiProblem(422, 'Filter tidak valid.');
        [$field, $operator, $value] = $filter;
        $type = $fields[$field] ?? '';
        if (!in_array($field, ['id','slug','old_slug','news_id','read_at','created_at','published_at','status','submission_type'], true) || !$type) throw new ApiProblem(422, 'Filter tidak diizinkan.');
        if ($operator === 'null' || $operator === 'not-null') $where[] = "`$field` IS " . ($operator === 'null' ? '' : 'NOT ') . 'NULL';
        else {
            $compare = match ($operator) { 'eq' => '=', 'gte' => '>=', 'lt' => '<', default => throw new ApiProblem(422, 'Filter tidak valid.') };
            $where[] = "`$field` $compare ?";
            $params[] = field_value($field, $type, $value);
        }
    }
    return $where;
}

function collection(PDO $db, string $table, bool $admin, array $options = []): array
{
    $fields = resource_fields($table, $admin);
    $params = [];
    $where = predicate($fields, $options['filters'] ?? [], $params);
    if (!$admin) {
        if ($table === 'news') $where[] = 'published_at IS NOT NULL';
        if ($table === 'careers_jobs') $where[] = "status = 'published'";
        if ($table === 'news_comments') $where[] = 'EXISTS (SELECT 1 FROM news WHERE news.id = news_comments.news_id AND published_at IS NOT NULL)';
    }
    if (isset($options['before'])) {
        if ($table !== 'news_comments') throw new ApiProblem(422, 'Cursor tidak valid.');
        $date = iso_db_date($options['before']['created_at'] ?? null);
        $where[] = '(created_at < ? OR (created_at = ? AND id < ?))';
        array_push($params, $date, $date, field_value('id', 'uuid', $options['before']['id'] ?? null));
    }
    $whereSql = $where ? ' WHERE ' . implode(' AND ', $where) : '';
    if (!empty($options['count'])) return ['rows' => [], 'count' => (int) sql($db, "SELECT COUNT(*) FROM `$table`" . $whereSql, $params)->fetchColumn()];
    $projection = $options['fields'] ?? '*';
    $relation = match ($projection) { '*,service_landing_portfolios(portfolio_id,position)' => 'service_landings', '*,job:careers_jobs(title)' => 'careers_submissions', default => '' };
    if ($relation && $relation !== $table) throw new ApiProblem(422, 'Relasi tidak diizinkan.');
    $selected = ($projection === '*' || $relation) ? array_keys($fields) : array_map('trim', explode(',', $projection));
    if (array_diff($selected, array_keys($fields))) throw new ApiProblem(422, 'Kolom tidak diizinkan.');
    $order = [];
    if (count($options['sort'] ?? []) > 4) throw new ApiProblem(422, 'Urutan tidak valid.');
    foreach ($options['sort'] ?? [] as $sort) {
        $field = $sort[0] ?? '';
        if (!is_string($field) || !isset($fields[$field]) || !in_array($field, ['created_at','published_at','sort_order','slug','id'], true) || !is_bool($sort[1] ?? null)) throw new ApiProblem(422, 'Urutan tidak valid.');
        $order[$field] = $sort[1] ? 'ASC' : 'DESC';
    }
    $order += [array_key_first($fields) => 'ASC'];
    if ($table === 'service_landing_portfolios') $order += ['portfolio_id' => 'ASC'];
    $orderSql = implode(',', array_map(static fn ($key, $dir) => "`$key` $dir", array_keys($order), $order));
    $limit = max(1, min(1000, (int) ($options['limit'] ?? 200)));
    $offset = max(0, min(100000, (int) ($options['offset'] ?? 0)));
    $cols = implode(',', array_map(static fn ($name) => "`$name`", $selected));
    $rows = sql($db, "SELECT $cols FROM `$table`$whereSql ORDER BY $orderSql LIMIT ? OFFSET ?", [...$params, $limit, $offset])->fetchAll();
    if ($rows && $relation) attach_relation($db, $relation, $rows);
    return ['rows' => array_map(static fn ($row) => decoded_row($row, $fields), $rows)];
}

function attach_relation(PDO $db, string $relation, array &$rows): void
{
    $source = $relation === 'service_landings' ? 'slug' : 'job_id';
    $keys = array_values(array_unique(array_filter(array_column($rows, $source))));
    $grouped = [];
    if ($keys) {
        $binds = implode(',', array_fill(0, count($keys), '?'));
        if ($relation === 'service_landings') {
            foreach (sql($db, "SELECT service_slug,portfolio_id,position FROM service_landing_portfolios WHERE service_slug IN ($binds) ORDER BY position", $keys) as $row) {
                $grouped[$row['service_slug']][] = ['portfolio_id' => $row['portfolio_id'], 'position' => (int) $row['position']];
            }
        } else {
            foreach (sql($db, "SELECT id,title FROM careers_jobs WHERE id IN ($binds)", $keys) as $row) $grouped[$row['id']] = ['title' => $row['title']];
        }
    }
    foreach ($rows as &$row) {
        if ($relation === 'service_landings') $row['service_landing_portfolios'] = $grouped[$row[$source]] ?? [];
        else $row['job'] = $grouped[$row[$source]] ?? null;
    }
}

function insert_values(PDO $db, string $table, array $row, bool $upsert = false): void
{
    $columns = array_map(static fn ($name) => "`$name`", array_keys($row));
    $binds = implode(',', array_fill(0, count($columns), '?'));
    $updates = $upsert ? ' ON DUPLICATE KEY UPDATE ' . implode(',', array_map(static fn ($col) => "$col=VALUES($col)", $columns)) : '';
    sql($db, "INSERT INTO `$table` (" . implode(',', $columns) . ") VALUES ($binds)$updates", $row);
}
