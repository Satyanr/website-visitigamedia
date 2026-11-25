-- Apply to a newly created, dedicated database using an authorized installer.
SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE portfolios (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `slug` VARCHAR(120) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `title` TEXT NOT NULL,
  `image_url` TEXT NOT NULL,
  `client` TEXT NOT NULL,
  `project_date` VARCHAR(10) NULL,
  `category` TEXT NOT NULL,
  `description` MEDIUMTEXT NOT NULL,
  `overview` MEDIUMTEXT NOT NULL,
  `seo_title` TEXT NOT NULL,
  `seo_description` TEXT NOT NULL,
  `content_id` JSON NULL,
  `content_en` JSON NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_portfolio_slug (slug),
  KEY ix_portfolio_date (created_at,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE news (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `slug` VARCHAR(120) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `title` TEXT NOT NULL,
  `cover_image` TEXT NOT NULL,
  `content` MEDIUMTEXT NOT NULL,
  `author` TEXT NOT NULL,
  `category` TEXT NOT NULL,
  `excerpt` MEDIUMTEXT NOT NULL,
  `seo_title` TEXT NOT NULL,
  `seo_description` TEXT NOT NULL,
  `cover_alt` TEXT NOT NULL,
  `target_keyword` TEXT NOT NULL,
  `published_at` DATETIME(6) NULL,
  `content_id` JSON NULL,
  `content_en` JSON NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_news_slug (slug),
  KEY ix_news_public (published_at,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE products (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` TEXT NOT NULL,
  `image_url` TEXT NOT NULL,
  `category` TEXT NOT NULL,
  `description` MEDIUMTEXT NOT NULL,
  `label` TEXT NOT NULL,
  `color` TEXT NOT NULL,
  `accent` TEXT NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `content_id` JSON NULL,
  `content_en` JSON NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY ix_product_order (sort_order,created_at,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_catalogue (
  `id` TINYINT UNSIGNED NOT NULL,
  `title` TEXT NOT NULL,
  `title_id` TEXT NOT NULL,
  `title_en` TEXT NOT NULL,
  `file_url` TEXT NOT NULL,
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE homepage_content (
  `id` TINYINT UNSIGNED NOT NULL,
  `hero_slides` JSON NULL,
  `about_image_url` TEXT NOT NULL,
  `content_id` JSON NULL,
  `content_en` JSON NULL,
  `featured_portfolio_ids` JSON NULL,
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE about_content (
  `id` TINYINT UNSIGNED NOT NULL,
  `content_id` JSON NULL,
  `content_en` JSON NULL,
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE service_content (
  `id` TINYINT UNSIGNED NOT NULL,
  `eyebrow` TEXT NOT NULL,
  `heading` TEXT NOT NULL,
  `heading_accent` TEXT NOT NULL,
  `cards` JSON NULL,
  `showreel_eyebrow` TEXT NOT NULL,
  `showreel_heading` TEXT NOT NULL,
  `showreel_accent` TEXT NOT NULL,
  `showreel_description` MEDIUMTEXT NOT NULL,
  `primary_button_text` TEXT NOT NULL,
  `primary_button_url` TEXT NOT NULL,
  `secondary_button_text` TEXT NOT NULL,
  `secondary_button_url` TEXT NOT NULL,
  `video_webm_url` TEXT NOT NULL,
  `video_mp4_url` TEXT NOT NULL,
  `video_poster_url` TEXT NOT NULL,
  `content_id` JSON NULL,
  `content_en` JSON NULL,
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE service_landings (
  `slug` VARCHAR(120) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `hero_image_url` TEXT NOT NULL,
  `content_id` JSON NULL,
  `content_en` JSON NULL,
  `seo_title_id` TEXT NOT NULL,
  `seo_description_id` TEXT NOT NULL,
  `seo_title_en` TEXT NOT NULL,
  `seo_description_en` TEXT NOT NULL,
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE service_landing_portfolios (
  `service_slug` VARCHAR(120) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `portfolio_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `position` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (service_slug,portfolio_id),
  UNIQUE KEY uq_landing_position (service_slug,position),
  FOREIGN KEY (service_slug) REFERENCES service_landings(slug) ON DELETE CASCADE,
  FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE portfolio_slug_aliases (
  `old_slug` VARCHAR(120) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `portfolio_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (old_slug),
  FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE contact_settings (
  `id` TINYINT UNSIGNED NOT NULL,
  `marketing_phone` TEXT NOT NULL,
  `marketing_email` TEXT NOT NULL,
  `procurement_phone` TEXT NOT NULL,
  `procurement_email` TEXT NOT NULL,
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE careers_page_content (
  `id` TINYINT UNSIGNED NOT NULL,
  `careers_email` TEXT NOT NULL,
  `content_id` JSON NULL,
  `content_en` JSON NULL,
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE careers_jobs (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `title` TEXT NOT NULL,
  `department` TEXT NOT NULL,
  `location` TEXT NOT NULL,
  `employment_type` TEXT NOT NULL,
  `description` MEDIUMTEXT NOT NULL,
  `qualifications` JSON NULL,
  `responsibilities` JSON NULL,
  `deadline` DATE NULL,
  `status` ENUM('draft','published','closed') NOT NULL DEFAULT 'draft',
  `sort_order` INT NOT NULL DEFAULT 0,
  `content_id` JSON NULL,
  `content_en` JSON NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY ix_job_public (status,sort_order,created_at,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE contact_messages (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` TEXT NOT NULL,
  `email` TEXT NOT NULL,
  `phone` TEXT NULL,
  `message` MEDIUMTEXT NOT NULL,
  `status` ENUM('new','contacted','completed','spam') NOT NULL DEFAULT 'new',
  `notes` MEDIUMTEXT NOT NULL,
  `read_at` DATETIME(6) NULL,
  `submission_key` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY ix_contacts_date (created_at,id),
  KEY ix_contacts_unread (read_at,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE careers_submissions (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` TEXT NOT NULL,
  `email` TEXT NOT NULL,
  `phone` TEXT NULL,
  `submission_type` ENUM('partnership','job_application') NOT NULL,
  `job_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `message` MEDIUMTEXT NOT NULL,
  `status` ENUM('new','contacted','completed','spam') NOT NULL DEFAULT 'new',
  `notes` MEDIUMTEXT NOT NULL,
  `read_at` DATETIME(6) NULL,
  `submission_key` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY ix_careers_date (created_at,id),
  KEY ix_careers_unread (read_at,submission_type),
  FOREIGN KEY (job_id) REFERENCES careers_jobs(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE news_comments (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `news_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` TEXT NOT NULL,
  `body` MEDIUMTEXT NOT NULL,
  `submission_key` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY ix_comment_page (news_id,created_at,id),
  FOREIGN KEY (news_id) REFERENCES news(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE website_events (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `visitor_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `path` TEXT NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY ix_event_date (created_at,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE website_observations (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `kind` ENUM('web_vital','client_error','csp_violation') NOT NULL,
  `name` TEXT NOT NULL,
  `value` DOUBLE NULL,
  `rating` ENUM('good','needs-improvement','poor') NULL,
  `path` TEXT NOT NULL,
  `fingerprint` TEXT NOT NULL,
  `release` TEXT NOT NULL,
  `details` JSON NULL,
  `submission_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY ix_observation_date (created_at,id),
  KEY ix_observation_dedupe (submission_hash,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE admin_users (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','disabled') NOT NULL,
  session_version INT UNSIGNED NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE request_limits (
  scope_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  expires_at DATETIME NOT NULL,
  hits INT UNSIGNED NOT NULL,
  KEY ix_limits_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE site_media (
  path VARCHAR(220) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  mime VARCHAR(80) NOT NULL,
  bytes INT UNSIGNED NOT NULL,
  sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  visibility ENUM('public','private') NOT NULL DEFAULT 'public',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE app_locks (
  name VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO app_locks (name) VALUES ('media'), ('portfolio');

CREATE TABLE schema_versions (
  version INT UNSIGNED NOT NULL PRIMARY KEY,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_versions (version) VALUES (1);
