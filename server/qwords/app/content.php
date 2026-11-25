<?php
declare(strict_types=1);
namespace Visitiga\Qwords;

use PDO;

const PUBLIC_EXPORT = [
    'news' => 'published_at', 'portfolios' => 'created_at', 'products' => 'sort_order',
    'service_content' => '', 'service_landings' => 'slug', 'product_catalogue' => '',
    'homepage_content' => '', 'about_content' => '', 'contact_settings' => '',
    'careers_jobs' => 'sort_order', 'careers_page_content' => '',
];

function table_lock(PDO $db, string $name): void
{
    sql($db, 'SELECT name FROM app_locks WHERE name=? FOR UPDATE', [$name])->fetchColumn();
}

function content_rows(PDO $db, string $table, string $select, array $filters): array
{
    $options = ['fields' => $select, 'filters' => []];
    foreach ($filters as $key => $value) {
        if ($key === 'order') $options['sort'] = [[$value === 'slug.asc' ? 'slug' : $value, true]];
        elseif ($key === 'limit' || $key === 'offset') $options[$key] = (int) $value;
        elseif ($value === 'not.is.null') $options['filters'][] = [$key, 'not-null', null];
        elseif (str_starts_with($value, 'eq.')) $options['filters'][] = [$key, 'eq', substr($value, 3)];
    }
    return collection($db, $table, false, $options)['rows'];
}

function content_write(PDO $db, string $table, string $method, array $record, array $options): array
{
    $methods = [
        'portfolios' => ['POST','PATCH','DELETE'], 'news' => ['POST','PATCH','DELETE'], 'products' => ['POST','PATCH','DELETE'],
        'careers_jobs' => ['POST','PATCH','DELETE'], 'homepage_content' => ['PUT'], 'about_content' => ['PUT'],
        'service_content' => ['PUT'], 'product_catalogue' => ['PUT'], 'contact_settings' => ['PUT'],
        'careers_page_content' => ['PUT'], 'contact_messages' => ['PATCH','DELETE'],
        'careers_submissions' => ['PATCH','DELETE'], 'news_comments' => ['DELETE'],
    ];
    if (!in_array($method, $methods[$table] ?? [], true)) throw new ApiProblem(405, 'Perubahan tidak diizinkan.');
    $fields = resource_fields($table, true);
    $writable = array_diff_key($fields, array_flip(['id','created_at','updated_at']));
    if (in_array($table, ['contact_messages','careers_submissions'], true)) $writable = array_intersect_key($writable, ['status'=>true,'notes'=>true]);
    $filters = $options['filters'] ?? [];
    $id = null;
    if ($method === 'PATCH' || $method === 'DELETE') {
        if (count($filters) !== 1 || ($filters[0][0] ?? '') !== 'id' || ($filters[0][1] ?? '') !== 'eq') throw new ApiProblem(422, 'ID wajib disertakan.');
        $id = field_value('id', $fields['id'], $filters[0][2] ?? null);
    }
    if ($method === 'PUT') {
        $id = field_value('id', 'single', $record['id'] ?? null);
        unset($record['id']);
    }
    if ($method !== 'DELETE' && (!$record || array_diff_key($record, $writable))) throw new ApiProblem(422, 'Kolom perubahan tidak diizinkan.');
    $record = validated_record($record, $writable);
    return transaction($db, static function () use ($db, $table, $method, $record, $id) {
        if (array_key_exists($table, PUBLIC_EXPORT)) table_lock($db, 'media');
        if ($table === 'portfolios') table_lock($db, 'portfolio');
        $old = $id ? sql($db, "SELECT * FROM `$table` WHERE id=? FOR UPDATE", [$id])->fetch() : null;
        if (!$old && in_array($method, ['DELETE','PATCH'], true)) throw new ApiProblem(404, 'Data tidak ditemukan.');
        if ($method === 'DELETE') {
            sql($db, "DELETE FROM `$table` WHERE id=?", [$id]);
            return ['rows' => [['id' => $id]]];
        }
        if ($table === 'portfolios' && isset($record['slug'])) check_portfolio_slug($db, $record['slug'], $id, $old['slug'] ?? null);
        $newId = $id ?? uuid();
        if ($method === 'PATCH') {
            $assignments = implode(',', array_map(static fn ($key) => "`$key`=?", array_keys($record)));
            sql($db, "UPDATE `$table` SET $assignments WHERE id=?", [...array_values($record),$id]);
        } else insert_values($db, $table, ['id' => $newId] + $record, $method === 'PUT');
        return collection($db, $table, true, ['filters' => [['id','eq',$newId]], 'limit' => 1]);
    });
}

function validated_record(array $input, array $fields): array
{
    $validated = [];
    foreach ($input as $name => $value) {
        if (!isset($fields[$name])) throw new ApiProblem(422, 'Kolom tidak valid.');
        if ($name === 'cover_image' && (!is_string($value) || !safe_content_url($value))) throw new ApiProblem(422, 'URL cover tidak valid.');
        if (in_array($name, ['marketing_email','procurement_email','careers_email'], true) && (!is_string($value) || !filter_var($value, FILTER_VALIDATE_EMAIL))) throw new ApiProblem(422, 'Email tidak valid.');
        if (in_array($name, ['marketing_phone','procurement_phone'], true) && (!is_string($value) || !preg_match('/^\+?[\d ().-]{7,30}$/D', $value))) throw new ApiProblem(422, 'Nomor telepon tidak valid.');
        if ($name === 'hero_slides' && (!is_array($value) || !array_is_list($value) || count($value) < 1 || count($value) > 12)) throw new ApiProblem(422, 'Jumlah slide tidak valid.');
        if ($name === 'cards' && (!is_array($value) || !array_is_list($value) || count($value) !== 6)) throw new ApiProblem(422, 'Enam kartu layanan diperlukan.');
        if ($name === 'featured_portfolio_ids' && (!is_array($value) || count($value) > 3)) throw new ApiProblem(422, 'Maksimal tiga portfolio unggulan.');
        if ($name === 'content' && is_string($value)) $value = sanitize_article($value);
        if (in_array($name, ['content_id','content_en'], true) && is_array($value) && is_string($value['content'] ?? null)) $value['content'] = sanitize_article($value['content']);
        $validated[$name] = field_value($name, $fields[$name], $value);
    }
    return $validated;
}

function sanitize_article(string $html): string
{
    if (!str_contains($html, '<')) return $html;
    $document = new \DOMDocument();
    $document->loadHTML('<html><head><meta charset="UTF-8"></head><body>' . $html . '</body></html>',
        LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING);
    $body = $document->getElementsByTagName('body')->item(0);
    if (!$body) return '';
    $nodes = iterator_to_array($body->getElementsByTagName('*'));
    $allowed = ['p','br','span','div','strong','em','u','b','i','s','strike','sub','sup','h1','h2','h3','h4','h5','h6',
        'blockquote','ol','ul','li','a','img','hr','pre','code','table','tbody','thead','tfoot','tr','td','th','figure','figcaption'];
    foreach ($nodes as $node) {
        if (!in_array($node->tagName,$allowed,true)) {
            if (!in_array($node->tagName,['script','style','template','iframe','object','svg','math'],true)) {
                while ($node->firstChild) $node->parentNode?->insertBefore($node->firstChild,$node);
            }
            $node->parentNode?->removeChild($node);
            continue;
        }
        foreach (iterator_to_array($node->attributes) as $attribute) {
            $name = $attribute->name;
            $value = $attribute->value;
            $keep = in_array($name,['alt','title'],true)
                || (in_array($name,['width','height','colspan','rowspan'],true) && preg_match('/^\d{1,4}$/D',$value))
                || ($node->tagName === 'a' && $name === 'href' && safe_content_url($value,true))
                || ($node->tagName === 'img' && $name === 'src' && safe_content_url($value));
            if ($name === 'style') {
                $styles = array_filter(array_map('trim', explode(';',$value)), static fn ($rule) =>
                    preg_match('/^(?:(?:text-align|font-weight|font-style):\s*[a-z0-9-]+|(?:font-size|width|max-width|height):\s*[.0-9]+(?:px|%|em|rem)|(?:color|background-color):\s*(?:#[0-9a-f]{3,8}|[a-z]+|rgba?\([0-9.,% ]+\)))$/iD',$rule));
                if ($styles) { $node->setAttribute('style',implode(';',$styles)); continue; }
            }
            if (!$keep) $node->removeAttributeNode($attribute);
        }
    }
    $result = '';
    foreach ($body->childNodes as $node) $result .= $document->saveHTML($node);
    return $result;
}

function check_portfolio_slug(PDO $db, string $slug, ?string $id, ?string $previous): void
{
    if ($slug === $previous) return;
    $alias = sql($db, 'SELECT portfolio_id FROM portfolio_slug_aliases WHERE old_slug=?', [$slug])->fetchColumn();
    if ($alias && $alias !== $id) throw new ApiProblem(409, 'Slug sudah digunakan.', '23505');
    if ($alias) sql($db, 'DELETE FROM portfolio_slug_aliases WHERE old_slug=?', [$slug]);
    if ($id && $previous) insert_values($db, 'portfolio_slug_aliases', ['old_slug'=>$previous,'portfolio_id'=>$id]);
}

function save_service_landing(PDO $db, array $input): void
{
    $record = [];
    foreach (resource_fields('service_landings', false) as $key => $type) {
        if ($key !== 'updated_at') $record[$key] = $input['p_' . $key] ?? null;
    }
    if (!in_array($record['slug'], ['led-indoor','videotron-outdoor','rental-led','media-konvensional','digital-signage','event-production'], true)) throw new ApiProblem(422, 'Layanan tidak valid.');
    $row = validated_record($record, resource_fields('service_landings', false));
    $ids = $input['p_portfolio_ids'] ?? [];
    if (!is_array($ids) || !array_is_list($ids) || count($ids) > 3) throw new ApiProblem(422, 'Maksimal tiga portfolio terkait.');
    $ids = array_map(static fn ($id) => field_value('portfolio_id','uuid',$id), $ids);
    if (count(array_unique($ids)) !== count($ids)) throw new ApiProblem(422, 'Portfolio terkait duplikat.');
    transaction($db, static function () use ($db, $row, $ids) {
        table_lock($db, 'media');
        insert_values($db, 'service_landings', $row, true);
        sql($db, 'DELETE FROM service_landing_portfolios WHERE service_slug=?', [$row['slug']]);
        foreach ($ids as $index => $id) insert_values($db, 'service_landing_portfolios', ['service_slug'=>$row['slug'], 'portfolio_id'=>$id, 'position'=>$index+1]);
    });
}

function export_content(PDO $db): array
{
    return transaction($db, static function () use ($db) {
        $tables = [];
        foreach (PUBLIC_EXPORT as $table => $sort) {
            $options = ['fields' => $table === 'service_landings' ? '*,service_landing_portfolios(portfolio_id,position)' : '*',
                'sort' => $sort ? [[$sort, $table !== 'news' && $table !== 'portfolios']] : [], 'limit' => 200];
            $tables[$table] = [];
            for ($offset = 0; $offset < 10000; $offset += 200) {
                $rows = collection($db, $table, false, $options + ['offset'=>$offset])['rows'];
                array_push($tables[$table], ...$rows);
                if (count($rows) < 200) break;
                if ($offset === 9800) throw new ApiProblem(503, 'Konten melebihi batas ekspor.');
            }
        }
        return ['version'=>1, 'tables'=>$tables];
    });
}
