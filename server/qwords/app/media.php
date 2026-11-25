<?php
declare(strict_types=1);
namespace Visitiga\Qwords;

use PDO;
use RuntimeException;
use Throwable;

const MEDIA_TYPES = ['jpg'=>'image/jpeg','jpeg'=>'image/jpeg','png'=>'image/png','webp'=>'image/webp','gif'=>'image/gif',
    'pdf'=>'application/pdf','mp4'=>'video/mp4','webm'=>'video/webm'];

function media_id(mixed $value, bool $private = false): string
{
    $folder = $private ? 'documents' : 'homepage|news|portfolios|products|catalogues|services|imported';
    if (!is_string($value) || !preg_match("~^(?:$folder)/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\\.([a-z]{3,4})$~D", $value, $parts)
        || !isset(MEDIA_TYPES[$parts[1]])) throw new ApiProblem(404, 'Media tidak ditemukan.');
    return $value;
}

function media_file(array $config, string $id, bool $private): string
{
    $directory = realpath($config[$private ? 'private_media_path' : 'media_path'] ?? '');
    $privateRoot = realpath(__DIR__ . '/..');
    if (!$privateRoot || !$directory || !str_starts_with($directory . DIRECTORY_SEPARATOR, $privateRoot . DIRECTORY_SEPARATOR) || $directory === $privateRoot) {
        // Stable data may instead be a sibling of the code release directories.
        $storage = realpath($config['data_path'] ?? '');
        if (!$storage || !$directory || $directory === $storage || !str_starts_with($directory, $storage . DIRECTORY_SEPARATOR)) throw new RuntimeException('Invalid media storage');
    }
    if (isset($config['_public_root'])) {
        $public = realpath($config['_public_root']);
        if (!$public || $directory === $public || str_starts_with($directory, $public . DIRECTORY_SEPARATOR)) throw new RuntimeException('Public media storage is not permitted');
    }
    return $directory . DIRECTORY_SEPARATOR . hash('sha256', $id);
}

function media_info(string $source, string $id, int $maximum): array
{
    $bytes = filesize($source);
    if (!$bytes || $bytes > $maximum) throw new ApiProblem(413, 'File melewati batas ukuran.');
    $ext = pathinfo($id, PATHINFO_EXTENSION);
    $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($source);
    if (($mime === 'application/mp4' && $ext === 'mp4')) $mime = 'video/mp4';
    if ($mime !== MEDIA_TYPES[$ext]) throw new ApiProblem(415, 'Jenis file tidak diizinkan.');
    if (str_starts_with($mime, 'image/')) {
        $size = @getimagesize($source);
        if (!$size || $size['mime'] !== $mime || $size[0] * $size[1] > 24000000) throw new ApiProblem(422, 'Gambar tidak valid atau terlalu besar.');
        $decoder = match ($mime) {
            'image/jpeg'=>'imagecreatefromjpeg', 'image/png'=>'imagecreatefrompng',
            'image/webp'=>'imagecreatefromwebp', 'image/gif'=>'imagecreatefromgif',
        };
        if ($size[0] * $size[1] <= 6000000 && $bytes <= 8388608 && function_exists($decoder)) {
            $image = @$decoder($source);
            if ($image === false) throw new ApiProblem(422, 'Gambar tidak dapat dibaca.');
            unset($image);
        }
    }
    return ['mime'=>$mime,'bytes'=>$bytes,'sha256'=>hash_file('sha256',$source)];
}

function store_media(PDO $db, array $config, string $id, string $source, array $info, bool $private, bool $uploaded): void
{
    $target = media_file($config, $id, $private);
    $temporary = $target . '.upload-' . bin2hex(random_bytes(8));
    $written = false;
    try {
        transaction($db, static function () use ($db,$config,$id,$source,$info,$private,$uploaded,$target,$temporary,&$written) {
            table_lock($db, 'media');
            $totals = sql($db, 'SELECT COUNT(*) AS files,COALESCE(SUM(bytes),0) AS size FROM site_media')->fetch();
            if ($totals['files'] >= ($config['media_max_files'] ?? 2000) || $totals['size'] + $info['bytes'] > ($config['media_quota_bytes'] ?? 1073741824)) throw new ApiProblem(507, 'Kuota media sudah penuh.');
            if (file_exists($target) || sql($db,'SELECT path FROM site_media WHERE path=?',[$id])->fetchColumn()) throw new ApiProblem(409, 'Media sudah ada.');
            $moved = $uploaded ? move_uploaded_file($source,$temporary) : copy($source,$temporary);
            if (!$moved || !rename($temporary,$target)) throw new RuntimeException('Media storage unavailable');
            $written = true;
            chmod($target,0600);
            insert_values($db,'site_media',['path'=>$id,'visibility'=>$private ? 'private' : 'public'] + $info);
        });
    } catch (Throwable $error) {
        if ($written) @unlink($target);
        throw $error;
    } finally {
        if (is_file($temporary)) @unlink($temporary);
    }
}

function media_referenced(PDO $db, string $id): bool
{
    $needle = basename($id);
    foreach (PUBLIC_EXPORT as $table => $_) {
        $parts = [];
        foreach (schemas()[$table] as $field => $type) {
            if (in_array($type,['text','long','json'],true)) $parts[] = "LOCATE(?, `$field`) > 0";
        }
        if ($parts && sql($db, "SELECT 1 FROM `$table` WHERE " . implode(' OR ',$parts) . ' LIMIT 1', array_fill(0,count($parts),$needle))->fetchColumn()) return true;
    }
    return false;
}

function media_admin(PDO $db, array $config, array $request, array $params): array
{
    if ($request['method'] === 'POST') {
        $private = ($_POST['visibility'] ?? '') === 'private';
        $id = media_id($_POST['path'] ?? null, $private);
        $file = $_FILES['file'] ?? [];
        if (($file['error'] ?? null) !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'] ?? '')) {
            throw new ApiProblem(413, 'Upload tidak diterima. Periksa batas PHP dan ukuran file.');
        }
        $info = media_info($file['tmp_name'], $id, min(31457280,(int) ($config['media_file_bytes'] ?? 2097152)));
        store_media($db, $config, $id, $file['tmp_name'], $info, $private, true);
        return json_result(201, ['path'=>$id]);
    }
    if ($request['method'] === 'GET') {
        $folder = $params['folder'] ?? '';
        if (!is_string($folder) || !preg_match('/^(homepage|news|portfolios|products|catalogues|services|imported|documents)$/D',$folder)) throw new ApiProblem(422, 'Folder tidak valid.');
        $rows = sql($db,'SELECT path,mime,bytes FROM site_media WHERE path LIKE ? ORDER BY path LIMIT ? OFFSET ?',
            [$folder . '/%',max(1,min(100,(int) ($params['limit'] ?? 100))),max(0,min(100000,(int) ($params['offset'] ?? 0)))])->fetchAll();
        return json_result(200,array_map(static fn ($row) => ['name'=>basename($row['path']),'mime'=>$row['mime'],'bytes'=>(int) $row['bytes']],$rows));
    }
    if ($request['method'] !== 'DELETE') throw new ApiProblem(405, 'Metode tidak diizinkan.');
    $paths = json_body($request)['paths'] ?? null;
    if (!is_array($paths) || !array_is_list($paths) || count($paths) > 100) throw new ApiProblem(422, 'Daftar media tidak valid.');
    foreach ($paths as $path) {
        $private = is_string($path) && str_starts_with($path, 'documents/');
        $id = media_id($path, $private);
        $target = media_file($config,$id,$private);
        $trash = $target . '.trash-' . bin2hex(random_bytes(8));
        $moved = false;
        try {
            transaction($db, static function () use ($db,$id,$private,$target,$trash,&$moved) {
                table_lock($db,'media');
                if (!sql($db,'SELECT path FROM site_media WHERE path=?',[$id])->fetchColumn()) return;
                if (!$private && media_referenced($db,$id)) throw new ApiProblem(409, 'Media masih digunakan oleh konten.');
                if (is_file($target)) {
                    if (!rename($target,$trash)) throw new ApiProblem(409, 'File sedang digunakan. Coba lagi.');
                    $moved = true;
                }
                sql($db,'DELETE FROM site_media WHERE path=?',[$id]);
            });
        } catch (Throwable $error) {
            if ($moved) @rename($trash,$target);
            throw $error;
        }
        if ($moved) @unlink($trash);
    }
    return json_result(200, ['ok'=>true]);
}

function cleanup_media_files(PDO $db, array $config): void
{
    transaction($db, static function () use ($db,$config) {
        table_lock($db,'media');
        $known = [];
        foreach (sql($db,'SELECT path,visibility FROM site_media') as $row) {
            $known[$row['visibility']][hash('sha256',$row['path'])] = true;
        }
        foreach (['public','private'] as $visibility) {
            $directory = dirname(media_file($config, 'maintenance', $visibility === 'private'));
            $remaining = 100;
            foreach (new \FilesystemIterator($directory, \FilesystemIterator::SKIP_DOTS) as $file) {
                if (!$remaining) break;
                if (!$file->isFile() || $file->isLink() || $file->getMTime() >= time()-86400
                    || !preg_match('/^([a-f0-9]{64})(?:\.(upload|trash)-[a-f0-9]{16})?$/D',$file->getFilename(),$parts)) continue;
                $recordExists = isset($known[$visibility][$parts[1]]);
                $kind = $parts[2] ?? '';
                if (!$kind && $recordExists) continue;
                $target = $directory . DIRECTORY_SEPARATOR . $parts[1];
                if ($kind === 'trash' && $recordExists && !is_file($target)) @rename($file->getPathname(),$target);
                else @unlink($file->getPathname());
                $remaining--;
            }
        }
    });
}

function media_response(PDO $db, array $config, array $request, string $path, bool $private): array
{
    if (!in_array($request['method'], ['GET','HEAD'], true)) throw new ApiProblem(405, 'Metode tidak diizinkan.');
    if ($private) current_admin($db,$config);
    $id = media_id($path, $private);
    $record = sql($db,'SELECT mime,bytes FROM site_media WHERE path=? AND visibility=?',[$id,$private ? 'private' : 'public'])->fetch();
    $file = media_file($config,$id,$private);
    if (!$record || !is_file($file) || is_link($file)) throw new ApiProblem(404, 'Media tidak ditemukan.');
    $bytes = (int) $record['bytes'];
    $start = 0;
    $end = $bytes - 1;
    $status = 200;
    $headers = ['Accept-Ranges'=>'bytes','Content-Security-Policy'=>'sandbox',
        'Cache-Control'=>$private ? 'no-store' : 'public, max-age=3600'];
    if ($private) $headers['Content-Disposition'] = 'attachment; filename="' . basename($id) . '"';
    if (!empty($request['range'])) {
        if (!preg_match('/^bytes=(\d{0,10})-(\d{0,10})$/D',$request['range'],$match) || ($match[1] === '' && (int) $match[2] < 1)) {
            return result(416, '', 'text/plain', ['Content-Range'=>"bytes */$bytes"]);
        }
        if ($match[1] === '') $start = max(0,$bytes - (int) $match[2]);
        else {
            $start = (int) $match[1];
            if ($match[2] !== '') $end = min($end,(int) $match[2]);
        }
        if ($start > $end) return result(416, '', 'text/plain', ['Content-Range'=>"bytes */$bytes"]);
        $status = 206;
        $headers['Content-Range'] = "bytes $start-$end/$bytes";
    }
    $length = $end - $start + 1;
    $headers['Content-Length'] = (string) $length;
    return result($status,'',$record['mime'],$headers) + ['file'=>[$file,$start,$length]];
}

function send_media(array $media): void
{
    [$file,$offset,$remaining] = $media;
    $source = @fopen($file,'rb');
    if (!$source) return;
    if ($offset) fseek($source,$offset);
    while ($remaining > 0 && !connection_aborted()) {
        $chunk = fread($source,min(65536,$remaining));
        if ($chunk === false || $chunk === '') break;
        echo $chunk;
        $remaining -= strlen($chunk);
    }
    fclose($source);
}
