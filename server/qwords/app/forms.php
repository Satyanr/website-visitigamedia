<?php
declare(strict_types=1);
namespace Visitiga\Qwords;

use PDO;

function clean_form_text(mixed $value, int $max, int $min): string
{
    $text = trim(strip_tags(bounded_text($value, $max)));
    return bounded_text($text, $max, $min);
}

function public_action(PDO $db, array $config, array $request, string $action, array $input): bool
{
    $ip = $request['ip'] ?? '';
    if ($action === 'record_website_event') {
        $path = bounded_text($input['path'] ?? null, 500, 1);
        if (!preg_match('~^/(?!admin|/)[^?#\x00-\x20]*$~D', $path)) throw new ApiProblem(422, 'Path tidak valid.');
        rate_limit($db, $config, 'events-ip', $ip, 240, 60);
        insert_values($db, 'website_events', ['visitor_id'=>field_value('visitor_id','uuid',$input['visitor_id'] ?? null), 'path'=>$path]);
        return true;
    }
    if ($action === 'submit_website_observation') {
        record_observation($db, $config, $input, $ip);
        return true;
    }
    if (!in_array($action, ['submit_contact_message','submit_careers_submission','submit_news_comment'], true)) return false;
    if (trim(bounded_text($input['p_honeypot'] ?? '', 200)) !== '') return true;
    $key = field_value('submission_key','uuid',$input['p_submission_key'] ?? null);
    rate_limit($db, $config, $action . ':ip', $ip, 30, 900);
    rate_limit($db, $config, $action . ':visitor', $key, 3, 900);
    $name = clean_form_text($input['p_name'] ?? null, $action === 'submit_news_comment' ? 80 : 120, 2);
    if ($action === 'submit_news_comment') {
        $news = field_value('news_id','uuid',$input['p_news_id'] ?? null);
        $message = clean_form_text($input['p_body'] ?? null, 1000, 3);
        transaction($db, static function () use ($db, $news, $message, $key, $name) {
            if (!sql($db, 'SELECT id FROM news WHERE id=? AND published_at IS NOT NULL FOR UPDATE', [$news])->fetchColumn()) {
                throw new ApiProblem(404, 'Article unavailable.');
            }
            insert_values($db, 'news_comments', ['id'=>uuid(), 'news_id'=>$news, 'name'=>$name, 'body'=>$message, 'submission_key'=>$key]);
        });
        return true;
    }
    $email = strtolower(trim(bounded_text($input['p_email'] ?? null, 254, 5)));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) throw new ApiProblem(422, 'Email tidak valid.');
    $phone = $input['p_phone'] ?? null;
    if ($phone !== null && (!is_string($phone) || !preg_match('/^\+?[\d ().-]{7,30}$/D', trim($phone)))) throw new ApiProblem(422, 'Nomor telepon tidak valid.');
    $message = clean_form_text($input['p_message'] ?? null, 5000, 10);
    rate_limit($db, $config, $action . ':email', $email, 3, 900);
    $row = ['name'=>$name, 'email'=>$email, 'phone'=>$phone, 'message'=>$message, 'submission_key'=>$key, 'notes'=>''];
    if ($action === 'submit_contact_message') {
        insert_values($db, 'contact_messages', $row);
        return true;
    }
    $type = field_value('submission_type','submissionType',$input['p_submission_type'] ?? null);
    $job = $type === 'job_application' ? field_value('job_id','uuid',$input['p_job_id'] ?? null) : null;
    transaction($db, static function () use ($db, $row, $type, $job) {
        if ($job && !sql($db, "SELECT id FROM careers_jobs WHERE id=? AND status='published' FOR UPDATE", [$job])->fetchColumn()) {
            throw new ApiProblem(422, 'Lowongan tidak tersedia.');
        }
        insert_values($db, 'careers_submissions', $row + ['submission_type'=>$type, 'job_id'=>$job]);
    });
    return true;
}

function record_observation(PDO $db, array $config, array $input, string $ip): void
{
    $key = field_value('submission_key','uuid',$input['p_submission_key'] ?? null);
    $hash = hash('sha256', $key);
    $path = bounded_text($input['p_path'] ?? null, 500, 1);
    if (!preg_match('~^/(?!/)[^?#\x00-\x20]*$~D', $path)) throw new ApiProblem(422, 'Path tidak valid.');
    $fingerprint = bounded_text($input['p_fingerprint'] ?? null, 128, 8);
    $release = bounded_text($input['p_release'] ?? null, 80, 1);
    $details = $input['p_details'] ?? [];
    if (!is_array($details) || strlen(json_encode_safe($details)) > 4096) throw new ApiProblem(422, 'Detail observasi tidak valid.');
    $safeDetails = [];
    foreach (['source','navigationType','blockedOrigin','disposition'] as $field) {
        if (isset($details[$field])) $safeDetails[$field] = preg_replace('/[?#].*$/', '', clean_form_text($details[$field], 300, 0));
    }
    $row = ['name'=>clean_form_text($input['p_name'] ?? null,80,1), 'path'=>$path, 'fingerprint'=>$fingerprint,
        'release'=>$release, 'submission_hash'=>$hash, 'details'=>json_encode_safe($safeDetails),
        'kind'=>field_value('kind','kind',$input['p_kind'] ?? null), 'rating'=>field_value('rating','rating',$input['p_rating'] ?? null),
        'value'=>field_value('value','number',$input['p_value'] ?? null)];
    rate_limit($db, $config, 'observations-ip', $ip, 240, 900);
    rate_limit($db, $config, 'observations-visitor', $key, 60, 900);
    transaction($db, static function () use ($db, $row, $hash, $fingerprint, $release) {
        // Lock the visitor's rate-limit row before deduping concurrent reports.
        // This is a pre-existing row from the rate limiter.
        $lock = 'observation-' . substr($hash, 0, 16);
        sql($db, 'INSERT IGNORE INTO request_limits(scope_hash,expires_at,hits) VALUES(?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 HOUR),0)', [hash('sha256',$lock)]);
        sql($db, 'SELECT hits FROM request_limits WHERE scope_hash=? FOR UPDATE', [hash('sha256',$lock)])->fetchColumn();
        if (!sql($db, 'SELECT id FROM website_observations WHERE submission_hash=? AND fingerprint=? AND `release`=? AND created_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 HOUR) LIMIT 1',
            [$hash,$fingerprint,$release])->fetchColumn()) insert_values($db, 'website_observations', $row);
    });
}

function purge_old_records(PDO $db, int $batch = 1000): void
{
    $batch = max(1,min(10000,$batch));
    sql($db, 'DELETE FROM request_limits WHERE expires_at<UTC_TIMESTAMP() ORDER BY expires_at LIMIT ?', [$batch]);
    sql($db, 'DELETE FROM website_events WHERE created_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 730 DAY) ORDER BY created_at LIMIT ?', [$batch]);
    sql($db, 'DELETE FROM website_observations WHERE created_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 DAY) ORDER BY created_at LIMIT ?', [$batch]);
}

function dashboard_summary(PDO $db, array $input): array
{
    $previous = iso_db_date($input['previous'] ?? null);
    $start = iso_db_date($input['start'] ?? null);
    $end = iso_db_date($input['end'] ?? null);
    if ($previous >= $start || $start >= $end || strtotime($end)-strtotime($previous) > 733 * 86400) {
        throw new ApiProblem(422, 'Pilih rentang maksimal satu tahun.');
    }
    $bounds = $input['bounds'] ?? [];
    if (!is_array($bounds) || !array_is_list($bounds) || !$bounds || count($bounds) > 92) throw new ApiProblem(422, 'Rentang grafik tidak valid.');
    $bounds = array_map(__NAMESPACE__ . '\\iso_db_date',$bounds);
    $last = $start;
    foreach ($bounds as $bound) {
        if ($bound <= $last || $bound > $end) throw new ApiProblem(422, 'Rentang grafik tidak valid.');
        $last = $bound;
    }
    if ($last !== $end) throw new ApiProblem(422, 'Rentang grafik tidak lengkap.');
    $events = sql($db,'SELECT COUNT(DISTINCT CASE WHEN created_at>=? THEN visitor_id END) visitors,
        COUNT(DISTINCT CASE WHEN created_at<? THEN visitor_id END) previousVisitors,
        COALESCE(SUM(created_at>=?),0) views, COALESCE(SUM(created_at<?),0) previousViews
        FROM website_events WHERE created_at>=? AND created_at<?',[$start,$start,$start,$start,$previous,$end])->fetch();
    $leads = sql($db,'SELECT COALESCE(SUM(created_at>=?),0) leads, COALESCE(SUM(created_at<?),0) previousLeads
        FROM contact_messages WHERE created_at>=? AND created_at<?',[$start,$start,$previous,$end])->fetch();
    $clauses = [];
    foreach ($bounds as $index => $bound) $clauses[] = 'WHEN created_at<? THEN ' . $index;
    $counts = array_fill(0,count($bounds),0);
    foreach (sql($db,'SELECT CASE ' . implode(' ',$clauses) . ' END bucket, COUNT(*) total
        FROM website_events WHERE created_at>=? AND created_at<? GROUP BY bucket',[...$bounds,$start,$end]) as $row) {
        $counts[(int) $row['bucket']] = (int) $row['total'];
    }
    return array_map('intval',$events+$leads) + ['buckets'=>$counts];
}
