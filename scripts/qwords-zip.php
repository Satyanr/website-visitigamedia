<?php
declare(strict_types=1);

function verify_zip(ZipArchive $zip): void
{
    $json = $zip->getFromName('manifest.json');
    if ($json === false) throw new RuntimeException('Manifest missing');
    $manifest = json_decode($json, true, 32, JSON_THROW_ON_ERROR);
    $expected = [];
    $directories = [];
    foreach ($manifest['files'] as $file) {
        $path = $file['path'];
        if (!preg_match('~^(?:public_html|qwords-private)/[^\\\\\x00-\x1f:]+$~D', $path)
            || preg_match('~(?:^|/)\.{1,2}(?:/|$)|//~', $path)
            || isset($expected[$path])) throw new RuntimeException('Invalid manifest path');
        $expected[$path] = $file;
        for ($folder = dirname($path); $folder !== '.'; $folder = dirname($folder)) $directories[$folder . '/'] = true;
    }
    foreach (['public_html/.htaccess', 'public_html/_qwords.php', 'public_html/index.html', 'qwords-private/runtime.php',
        'qwords-private/config.example.php', 'qwords-private/shell.html', 'qwords-private/build.json'] as $required) {
        if (!isset($expected[$required])) throw new RuntimeException('Required archive file missing');
    }
    $seen = [];
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $path = $zip->getNameIndex($i);
        if ($path === false || isset($seen[$path])) throw new RuntimeException('Invalid ZIP entry');
        $seen[$path] = true;
        if (!$zip->getExternalAttributesIndex($i, $os, $attributes)
            || ($os === ZipArchive::OPSYS_UNIX && (($attributes >> 16) & 0170000) === 0120000)) throw new RuntimeException('Invalid ZIP entry type');
        if (isset($directories[$path]) || $path === 'manifest.json') continue;
        $entry = $expected[$path] ?? null;
        if (!$entry || $zip->statIndex($i)['size'] !== $entry['bytes']) throw new RuntimeException('Unexpected ZIP entry or size mismatch');
        $stream = $zip->getStream($path);
        if (!$stream) throw new RuntimeException('Unreadable ZIP member');
        $hash = hash_init('sha256');
        hash_update_stream($hash, $stream);
        fclose($stream);
        if (!hash_equals($entry['sha256'], hash_final($hash))) throw new RuntimeException('ZIP member hash mismatch');
    }
    if (array_diff_key($expected, $seen)) throw new RuntimeException('ZIP file missing');
    if (json_decode($zip->getFromName('qwords-private/build.json'), true, 32, JSON_THROW_ON_ERROR) !== $manifest['build']) {
        throw new RuntimeException('Build metadata mismatch');
    }
}

try {
    [$script, $mode, $archive] = array_pad($argv, 3, '');
    if (PHP_SAPI !== 'cli' || !in_array($mode, ['create', 'verify'], true) || !$archive) throw new RuntimeException('Usage: qwords-zip.php create|verify archive.zip [release directory]');
    $zip = new ZipArchive();
    if ($mode === 'create') {
        $root = $argv[3];
        $manifest = json_decode(file_get_contents($root . '/manifest.json'), true, 32, JSON_THROW_ON_ERROR);
        if ($zip->open($archive, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) throw new RuntimeException('Cannot create ZIP');
        foreach (array_column($manifest['files'], 'path') as $path) {
            if (!$zip->addFile($root . '/' . $path, $path)) throw new RuntimeException('Cannot add ZIP member');
        }
        if (!$zip->addFile($root . '/manifest.json', 'manifest.json') || !$zip->close()) throw new RuntimeException('Cannot finalize ZIP');
    }
    if ($zip->open($archive, ZipArchive::CHECKCONS) !== true) throw new RuntimeException('Cannot read ZIP');
    verify_zip($zip);
    $zip->close();
    echo "PASS: ZIP structure, .htaccess, build metadata and SHA-256 file integrity.\n";
} catch (Throwable $error) {
    fwrite(STDERR, 'FAIL: ' . $error->getMessage() . PHP_EOL);
    exit(1);
}
