<?php
declare(strict_types=1);
namespace Visitiga\Qwords;

use RuntimeException;
use Throwable;

require __DIR__ . '/private-cli.php';

function rewrite_import_media(mixed $value, array $map): mixed
{
    if (is_array($value)) return array_map(static fn ($item) => rewrite_import_media($item, $map), $value);
    if (!is_string($value)) return $value;
    $value = strtr($value, $map);
    if (preg_match('~https?://[^\s"<>]+/storage/v1/(?:object|render/image)/~i', $value)) {
        throw new RuntimeException('Unmapped legacy storage URL.');
    }
    return $value;
}

function import_document(string $file): array
{
    $size = filesize($file);
    if (!$size || $size > 32 * 1024 * 1024) throw new RuntimeException('Missing or oversized input.');
    $content = file_get_contents($file);
    if ($content === false) throw new RuntimeException('Unreadable input.');
    if (str_starts_with($content, "\xEF\xBB\xBF")) $content = substr($content, 3);
    $data = json_decode($content, true, 32, JSON_THROW_ON_ERROR);
    if (($data['version'] ?? null) !== 1 || !is_array($data['tables'] ?? null) || !is_array($data['media'] ?? [])) {
        throw new RuntimeException('Expected a version 1 export.');
    }
    return $data;
}

function validate_import_media(array $entries, array $config, \PDO $db, string $base): array
{
    if (count($entries) > 4000) throw new RuntimeException('Too many media entries.');
    $map = $files = [];
    foreach ($entries as $index => $entry) {
        try {
            $old = $entry['source'];
            $private = ($entry['visibility'] ?? 'public') === 'private';
            if (!is_string($old) || !str_starts_with($old,'https://') || !filter_var($old,FILTER_VALIDATE_URL) || isset($map[$old])) throw new RuntimeException();
            $id = media_id($entry['target'], $private);
            if (isset($files[$id])) throw new RuntimeException();
            $source = $entry['file'] ?? '';
            if (!is_string($source) || !preg_match('~^[A-Za-z0-9_./ -]{1,240}$~D',$source) || str_starts_with($source,'/')
                || preg_match('~(?:^|/)\.\.(?:/|$)~',$source)) throw new RuntimeException();
            $real = realpath($base . DIRECTORY_SEPARATOR . $source);
            if (!$real || !str_starts_with($real,$base . DIRECTORY_SEPARATOR) || !is_file($real)) throw new RuntimeException();
            $info = media_info($real,$id,min(31457280,(int) ($config['media_file_bytes'] ?? 2097152)));
            if (!is_string($entry['sha256'] ?? null) || !hash_equals($info['sha256'],$entry['sha256'])) throw new RuntimeException();
            $previous = sql($db,'SELECT sha256,visibility FROM site_media WHERE path=?',[$id])->fetch();
            if ($previous && ($previous['sha256'] !== $info['sha256'] || $previous['visibility'] !== ($private ? 'private' : 'public')
                || !hash_equals($info['sha256'], (string) @hash_file('sha256',media_file($config,$id,$private))))) throw new RuntimeException();
            $files[$id] = [$real,$info,$private,(bool) $previous];
            $map[$old] = ($private ? '/api/admin/files/' : '/media/') . $id;
        } catch (Throwable) { throw new RuntimeException('Invalid or conflicting media entry ' . ($index + 1)); }
    }
    return [$map,$files];
}

function equal_import_value(mixed $previous, mixed $incoming, string $type): bool
{
    if ($previous === null || $incoming === null) return $previous === $incoming;
    if ($type === 'json') return json_decode($previous,false,32,JSON_THROW_ON_ERROR) == json_decode($incoming,false,32,JSON_THROW_ON_ERROR);
    if ($type === 'number') return (float) $previous === (float) $incoming;
    return (string) $previous === (string) $incoming;
}

function import_rows(\PDO $db, array $tables, array $media, bool $apply): array
{
    $schema = schemas();
    if (array_diff_key($tables,$schema)) throw new RuntimeException('Unsupported table in input.');
    $summary = [];
    $db->beginTransaction();
    try {
        table_lock($db,'media');
        table_lock($db,'portfolio');
        foreach ($schema as $table => $fields) {
            if (!array_key_exists($table,$tables)) continue;
            $rows = $tables[$table];
            if (!is_array($rows) || !array_is_list($rows) || count($rows) > 50000) throw new RuntimeException("Invalid rows for $table.");
            $summary[$table] = ['inserted'=>0,'identical'=>0];
            $idFields = $table === 'service_landing_portfolios' ? ['service_slug','portfolio_id'] : [array_key_first($fields)];
            $seen = [];
            foreach ($rows as $index => $candidate) {
                try {
                    if (!is_array($candidate) || array_diff_key($candidate,$fields)) throw new RuntimeException();
                    $candidate = rewrite_import_media($candidate,$media);
                    $row = validated_record($candidate,$fields);
                    $identity = array_intersect_key($row,array_flip($idFields));
                    $signature = json_encode_safe($identity);
                    if (count($identity) !== count($idFields) || in_array(null,$identity,true) || isset($seen[$signature])) throw new RuntimeException();
                    $seen[$signature] = true;
                    $where = implode(' AND ',array_map(static fn ($field) => "`$field`=?",array_keys($identity)));
                    $stored = sql($db,"SELECT * FROM `$table` WHERE $where",$identity)->fetch();
                    if ($stored) {
                        foreach ($row as $key => $value) if (!equal_import_value($stored[$key],$value,$fields[$key])) throw new RuntimeException();
                        $summary[$table]['identical']++;
                    } else {
                        if ($table === 'portfolios') check_portfolio_slug($db,$row['slug'],$row['id'],null);
                        if ($table === 'portfolio_slug_aliases' && sql($db,'SELECT id FROM portfolios WHERE slug=?',[$row['old_slug']])->fetchColumn()) throw new RuntimeException();
                        insert_values($db,$table,$row);
                        $summary[$table]['inserted']++;
                    }
                } catch (Throwable) {
                    throw new RuntimeException("$table row " . ($index + 1) . ': invalid, conflicting, or missing a relationship.');
                }
            }
        }
        if ($apply) $db->commit();
        else $db->rollBack();
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
    return $summary;
}

try {
    $mode = $argv[1] ?? '';
    if (!in_array($mode,['--dry-run','--apply'],true) || !isset($argv[2])) throw new RuntimeException('Usage: import.php --dry-run|--apply file.json [private-config.php]');
    $input = realpath($argv[2]);
    if (!$input) throw new RuntimeException('Input file unavailable.');
    $config = \private_cli_config($argv[3] ?? dirname(__DIR__) . '/config.php');
    $db = db($config);
    $document = import_document($input);
    [$map,$files] = validate_import_media($document['media'] ?? [],$config,$db,dirname($input));
    $summary = import_rows($db,$document['tables'],$map,false);
    if ($mode === '--apply') {
        foreach ($files as $id => [$source,$info,$private,$existing]) if (!$existing) store_media($db,$config,$id,$source,$info,$private,false);
        $summary = import_rows($db,$document['tables'],$map,true);
    }
    echo json_encode_safe(['mode'=>$mode,'tables'=>$summary,'verified_media'=>count($files)]) . PHP_EOL;
} catch (RuntimeException $error) {
    $message = $error instanceof \PDOException ? 'Database operation failed.' : $error->getMessage();
    fwrite(STDERR,'Import rejected: ' . $message . PHP_EOL);
    exit(1);
} catch (Throwable) {
    fwrite(STDERR,"Import rejected: invalid input or database unavailable.\n");
    exit(1);
}
