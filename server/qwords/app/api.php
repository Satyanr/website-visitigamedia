<?php
declare(strict_types=1);
namespace Visitiga\Qwords;

function query_options(array $params): array
{
    $options = [];
    foreach (['filters','sort','before'] as $name) {
        if (!isset($params[$name])) continue;
        if (!is_string($params[$name]) || strlen($params[$name]) > 3000) throw new ApiProblem(422, 'Parameter tidak valid.');
        try { $value = json_decode($params[$name], true, 8, JSON_THROW_ON_ERROR); }
        catch (\JsonException) { throw new ApiProblem(422, 'Parameter tidak valid.'); }
        if (!is_array($value) || ($name !== 'before' && !array_is_list($value))) throw new ApiProblem(422, 'Parameter tidak valid.');
        $options[$name] = $value;
    }
    foreach (['limit','offset'] as $name) {
        if (!isset($params[$name])) continue;
        if (!is_string($params[$name]) || !preg_match('/^\d{1,6}$/D', $params[$name])) throw new ApiProblem(422, 'Paginasi tidak valid.');
        $options[$name] = (int) $params[$name];
    }
    $options['count'] = ($params['count'] ?? '') === 'true';
    $options['fields'] = $params['fields'] ?? '*';
    if (!is_string($options['fields']) || strlen($options['fields']) > 300) throw new ApiProblem(422, 'Kolom tidak valid.');
    return $options;
}

function api_endpoint(array $request, array $config, string $path, string $query, callable $http): array
{
    $method = $request['method'];
    $connection = $config['_connection'] ?? static fn () => db($config);
    parse_str($query, $params);
    if ($path === '/api/session') return session_endpoint($connection(), $request, $config);
    if (str_starts_with($path, '/media/')) return media_response($connection(), $config, $request, substr($path,7), false);
    if ($path === '/api/content-export' && $method === 'GET') {
        $key = $config['export_key'] ?? '';
        if (!is_string($key) || strlen($key) < 32 || !hash_equals($key, $request['export_key'] ?? '')) throw new ApiProblem(404, 'Data tidak ditemukan.');
        return json_result(200, export_content($connection()));
    }
    if (preg_match('~^/api/content/([a-z_]+)$~D', $path, $match)) {
        if ($method !== 'GET' && $method !== 'HEAD') throw new ApiProblem(405, 'Metode tidak diizinkan.');
        resource_fields($match[1], false);
        return json_result(200, collection($connection(), $match[1], false, query_options($params)));
    }
    if (preg_match('~^/api/actions/([a-z_]+)$~D', $path, $match)) {
        if ($method !== 'POST') throw new ApiProblem(405, 'Metode tidak diizinkan.');
        same_origin($request, $config);
        $data = json_body($request);
        if (in_array($match[1], ['save_service_landing','mark_contact_messages_read','mark_careers_submissions_read','purge_old_website_observations','admin_dashboard_summary'], true)) {
            $db = $connection();
            csrf_check($request, current_admin($db, $config));
            if ($match[1] === 'admin_dashboard_summary') return json_result(200, dashboard_summary($db,$data));
            match ($match[1]) {
                'save_service_landing' => save_service_landing($db, $data),
                'mark_contact_messages_read' => sql($db, 'UPDATE contact_messages SET read_at=UTC_TIMESTAMP(6) WHERE read_at IS NULL'),
                'mark_careers_submissions_read' => sql($db, 'UPDATE careers_submissions SET read_at=UTC_TIMESTAMP(6) WHERE read_at IS NULL'),
                default => purge_old_records($db),
            };
            return json_result(200, ['ok'=>true]);
        }
        if (!public_action($connection(), $config, $request, $match[1], $data)) throw new ApiProblem(404, 'Data tidak ditemukan.');
        return json_result(200, ['ok'=>true]);
    }
    if ($path === '/api/translate-content' || str_starts_with($path, '/api/admin/')) {
        if ($method !== 'GET' && $method !== 'HEAD') same_origin($request, $config);
        if (!isset($_COOKIE['__Host-visitiga_admin'])) throw new ApiProblem(401, 'Sesi admin tidak ditemukan.');
        $db = $connection();
        $admin = current_admin($db, $config);
        if ($method !== 'GET' && $method !== 'HEAD') csrf_check($request, $admin);
        if ($path === '/api/translate-content') return translate($request,$config,$http);
        if ($path === '/api/admin/media') return media_admin($db,$config,$request,$params);
        if (str_starts_with($path, '/api/admin/files/')) return media_response($db,$config,$request,substr($path,17),true);
        if (preg_match('~^/api/admin/([a-z_]+)$~D', $path,$match)) {
            $options = query_options($params);
            if ($method === 'GET' || $method === 'HEAD') return json_result(200, collection($db,$match[1],true,$options));
            $input = $method === 'DELETE' ? [] : json_body($request);
            return json_result(200, content_write($db,$match[1],$method,$input,$options));
        }
    }
    throw new ApiProblem(404, 'Data tidak ditemukan.');
}
