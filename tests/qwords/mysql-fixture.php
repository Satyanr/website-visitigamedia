<?php
declare(strict_types=1);
require dirname(__DIR__,2) . '/server/qwords/runtime.php';

$config = [
    'site_url'=>'https://qwords-stage.example.test', 'staging'=>true, 'test_loopback'=>true,
    'app_secret'=>bin2hex(random_bytes(32)), 'export_key'=>bin2hex(random_bytes(32)),
    'data_path'=>$argv[1], 'session_path'=>$argv[1] . '/sessions',
    'media_path'=>$argv[1] . '/media', 'private_media_path'=>$argv[1] . '/documents',
    'db'=>['host'=>'127.0.0.1','port'=>(int) getenv('QWORDS_TEST_MYSQL_PORT'), 'name'=>getenv('QWORDS_TEST_MYSQL_DATABASE'),
        'user'=>getenv('QWORDS_TEST_MYSQL_USER'),'password'=>getenv('QWORDS_TEST_MYSQL_PASSWORD')],
];
if (!preg_match('/(?:test|ci)$/D', $config['db']['name'])) throw new RuntimeException('Use only a dedicated fixture database.');
foreach (['sessions','media','documents'] as $directory) mkdir($argv[1] . '/' . $directory,0700);
file_put_contents($argv[1] . '/config.php', '<?php return ' . var_export($config,true) . ';');
file_put_contents($argv[1] . '/build.json', json_encode(['site_url'=>$config['site_url'],'staging'=>true,'static_routes'=>['/','/about']]));
file_put_contents($argv[1] . '/shell.html','<html lang="en"><head><title>Fixture</title></head><body><div id="root"></div></body></html>');
$db=\Visitiga\Qwords\db($config);
$slides = array_map(static fn ($title) => ['image_url'=>'','content_en'=>['title'=>$title],'content_id'=>['title'=>'Teks tetap']],
    ['ADVERTISING','OUTDOOR LED','INDOOR EXPERIENCE','VIDEOTRON RENTAL','BUY YOUR VIDEOTRON','EVENT IMPACT']);
\Visitiga\Qwords\insert_values($db, 'homepage_content', [
    'id'=>1, 'hero_slides'=>json_encode($slides), 'about_image_url'=>'/test-about.webp', 'updated_at'=>'2026-01-01 00:00:00.000000',
], true);
$patch = file_get_contents(dirname(__DIR__, 2) . '/server/qwords/patches/004_staging_hero_images.sql');
$apply = static function () use ($db, $patch): void {
    foreach (explode(';', $patch) as $statement) {
        if (trim($statement) !== '') $db->query($statement)->closeCursor();
    }
};
$before = $db->query('SELECT * FROM homepage_content WHERE id=1')->fetch();
$apply();
$after = $db->query('SELECT * FROM homepage_content WHERE id=1')->fetch();
$apply();
$idempotent = $after === $db->query('SELECT * FROM homepage_content WHERE id=1')->fetch();
$slides[0]['image_url'] = '/hero-1600.webp';
$heroPatchPassed = $idempotent && $before['hero_slides'] !== $after['hero_slides']
    && json_decode($after['hero_slides'], true) === $slides
    && array_diff_assoc($before, $after) === ['hero_slides'=>$before['hero_slides']];
$admin=\Visitiga\Qwords\uuid();
$password=bin2hex(random_bytes(16));
$email=$admin . '@example.test';
\Visitiga\Qwords\insert_values($db,'admin_users',['id'=>$admin,'email'=>$email,'password_hash'=>password_hash($password,PASSWORD_DEFAULT),'role'=>'admin']);
$disabled = 'disabled-' . $email;
\Visitiga\Qwords\insert_values($db,'admin_users',['id'=>\Visitiga\Qwords\uuid(),'email'=>$disabled,'password_hash'=>password_hash($password,PASSWORD_DEFAULT),'role'=>'disabled']);
echo json_encode(['email'=>$email,'disabledEmail'=>$disabled,'password'=>$password,'exportKey'=>$config['export_key'],'heroPatchPassed'=>$heroPatchPassed]);
