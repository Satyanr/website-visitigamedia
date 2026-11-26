-- Manual incremental staging patch. Back up row id=1 before running.
-- The historical homepage migrations verify the ADVERTISING background.
-- The other five original campaign images are unavailable for verification.
START TRANSACTION;
UPDATE homepage_content
SET hero_slides = JSON_SET(hero_slides, '$[0].image_url', '/hero-1600.webp'),
    updated_at = updated_at
WHERE id = 1
  AND JSON_TYPE(hero_slides) = 'ARRAY'
  AND JSON_LENGTH(hero_slides) = 6
  AND BINARY JSON_UNQUOTE(JSON_EXTRACT(hero_slides, '$[0].content_en.title')) = 'ADVERTISING'
  AND NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(hero_slides, '$[0].image_url'))), '') IS NULL;
SELECT ROW_COUNT() AS patched_rows;
COMMIT;
