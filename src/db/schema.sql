-- 数据库建表与初始化脚本 schema.sql
CREATE DATABASE IF NOT EXISTS `cut_video_db` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE `cut_video_db`;

-- 1. 目标博主表
CREATE TABLE IF NOT EXISTS `authors` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `sec_user_id` VARCHAR(128) NOT NULL UNIQUE COMMENT '抖音博主 sec_user_id',
  `nickname` VARCHAR(64) NOT NULL COMMENT '博主昵称',
  `avatar_url` VARCHAR(512) DEFAULT NULL COMMENT '头像地址',
  `status` ENUM('active', 'disabled') DEFAULT 'active' COMMENT '状态：active-开启监控, disabled-停用监控',
  `check_interval_minutes` INT DEFAULT 360 COMMENT '巡检周期(分钟)',
  `item_count` INT DEFAULT 10 COMMENT '每次增量检测的作品条数',
  `last_check_date` VARCHAR(10) DEFAULT NULL COMMENT '最近一次成功巡检日期 (YYYY-MM-DD)',
  `last_check_time` DATETIME DEFAULT NULL COMMENT '最近巡检具体时间',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='目标博主配置表';

-- 2. 抓取任务工单表
CREATE TABLE IF NOT EXISTS `download_tasks` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `author_id` INT NOT NULL COMMENT '关联博主 ID',
  `sec_user_id` VARCHAR(128) NOT NULL COMMENT '抖音博主 sec_user_id',
  `task_type` ENUM('full', 'incremental') NOT NULL COMMENT '任务类型：full-全量, incremental-增量',
  `status` ENUM('pending', 'running', 'success', 'failed', 'canceled') DEFAULT 'pending' COMMENT '任务状态',
  `total_items` INT DEFAULT 0 COMMENT '作品总数',
  `downloaded_items` INT DEFAULT 0 COMMENT '已下载作品数',
  `log_output` LONGTEXT DEFAULT NULL COMMENT '任务实时/最终运行日志片段',
  `started_at` DATETIME DEFAULT NULL,
  `finished_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`author_id`) REFERENCES `authors`(`id`) ON DELETE CASCADE,
  INDEX `idx_status` (`status`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='抓取任务工单表';

-- 3. 作品元数据表
CREATE TABLE IF NOT EXISTS `media_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `aweme_id` VARCHAR(64) NOT NULL UNIQUE COMMENT '抖音作品 Aweme ID',
  `author_id` INT NOT NULL COMMENT '关联博主 ID',
  `sec_user_id` VARCHAR(128) NOT NULL,
  `title` VARCHAR(512) DEFAULT NULL COMMENT '作品标题',
  `mix_name` VARCHAR(128) DEFAULT '单视频' COMMENT '所属合集名称',
  `media_type` ENUM('video', 'images') DEFAULT 'video' COMMENT '媒体类型',
  `cover_path` VARCHAR(512) DEFAULT NULL COMMENT '封面相对路径',
  `media_path` VARCHAR(512) DEFAULT NULL COMMENT '主媒体相对路径',
  `duration_ms` INT DEFAULT 0 COMMENT '视频时长(毫秒)',
  `published_at` DATETIME DEFAULT NULL COMMENT '作品发布时间',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`author_id`) REFERENCES `authors`(`id`) ON DELETE CASCADE,
  INDEX `idx_aweme_id` (`aweme_id`),
  INDEX `idx_author_id` (`author_id`),
  INDEX `idx_mix_name` (`mix_name`),
  INDEX `idx_published_at` (`published_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='作品元数据表';

-- 4. 守护进程巡检日志表
CREATE TABLE IF NOT EXISTS `monitor_logs` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `author_id` INT DEFAULT NULL,
  `cycle_index` INT DEFAULT 0 COMMENT '轮巡批次号',
  `log_level` ENUM('INFO', 'WARN', 'ERROR') DEFAULT 'INFO',
  `message` TEXT NOT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='守护进程巡检日志表';
