-- Cloudflare D1 数据库 schema
-- D1 基于 SQLite，语法与原 server.js 兼容

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  role TEXT DEFAULT 'qc' CHECK(role IN ('admin', 'qc', 'auditor')),
  region TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_active INTEGER DEFAULT 1
);

-- 客人类型表
CREATE TABLE IF NOT EXISTS customer_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  code TEXT,
  is_active INTEGER DEFAULT 1,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 缺陷类型表（多级）
CREATE TABLE IF NOT EXISTS defect_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  parent_id INTEGER,
  code TEXT,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 严重等级表
CREATE TABLE IF NOT EXISTS severity_levels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level INTEGER NOT NULL,
  name TEXT NOT NULL,
  name_en TEXT,
  rules TEXT,
  color TEXT DEFAULT '#EF4444',
  is_active INTEGER DEFAULT 1,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 标准案例库
CREATE TABLE IF NOT EXISTS standard_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  defect_category_id INTEGER,
  defect_subcategory_id INTEGER,
  severity_id INTEGER,
  title TEXT NOT NULL,
  description TEXT,
  rules TEXT,
  boundary TEXT,
  images TEXT,
  image_data TEXT,
  tags TEXT,
  is_active INTEGER DEFAULT 1,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 缺陷记录表
CREATE TABLE IF NOT EXISTS defect_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id TEXT,
  report_po_no TEXT,
  report_style_no TEXT,
  customer_type_id INTEGER,
  defect_category_id INTEGER,
  defect_subcategory_id INTEGER,
  severity_id INTEGER,
  description TEXT,
  location TEXT,
  images TEXT,
  image_data TEXT,
  original_category_id INTEGER,
  original_severity_id INTEGER,
  original_description TEXT,
  is_calibrated INTEGER DEFAULT 0,
  calibrated_by INTEGER,
  calibrated_at DATETIME,
  calibration_reason TEXT,
  calibration_result TEXT,
  matched_case_id INTEGER,
  similarity_score REAL,
  suggestion TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 校准记录表
CREATE TABLE IF NOT EXISTS calibration_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  defect_id INTEGER NOT NULL,
  original_category_id INTEGER,
  original_severity_id INTEGER,
  new_category_id INTEGER,
  new_severity_id INTEGER,
  reason TEXT,
  calibrated_by INTEGER,
  calibrated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 上传的图片（D1 存储，base64 编码）
-- 单条记录最大 1MB（D1 限制），建议图片 < 800KB
CREATE TABLE IF NOT EXISTS uploaded_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('cases', 'defects')),
  filename TEXT,
  content_type TEXT NOT NULL,
  data_uri TEXT NOT NULL,
  size_bytes INTEGER,
  uploaded_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 索引（提升查询性能）
CREATE INDEX IF NOT EXISTS idx_defect_records_calibrated ON defect_records(is_calibrated);
CREATE INDEX IF NOT EXISTS idx_defect_records_created_at ON defect_records(created_at);
CREATE INDEX IF NOT EXISTS idx_standard_cases_active ON standard_cases(is_active);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_uploaded_images_type ON uploaded_images(type);
