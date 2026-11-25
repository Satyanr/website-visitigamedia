<?php
declare(strict_types=1);
namespace Visitiga\Qwords;

function schemas(): array
{
    static $fields;
    return $fields ??= json_decode(file_get_contents(__DIR__ . '/schema.json'), true, 16, JSON_THROW_ON_ERROR);
}
