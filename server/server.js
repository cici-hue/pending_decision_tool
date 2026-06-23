/**
 * 缺陷判定校准系统 - 后端服务 (简化版)
 * Node.js + Express + SQLite3 (异步版本)
 */

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
// 动态导入可选依赖
try {
  var XLSX = require('xlsx');
} catch (e) {
  console.warn('xlsx 模块未安装，Excel导入导出功能不可用');
  var XLSX = null;
}

try {
  var { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
} catch (e) {
  console.warn('pdf-lib 模块未安装，PDF导出功能不可用');
  var PDFDocument = null, rgb = null, StandardFonts = null;
}
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 使用系统临时目录作为上传目录
const uploadsDir = path.join(require('os').tmpdir(), 'defect-calibration-uploads');
const casesDir = path.join(uploadsDir, 'cases');
const defectsDir = path.join(uploadsDir, 'defects');
const exportsDir = path.join(uploadsDir, 'exports');

[casesDir, defectsDir, exportsDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {
      console.warn('无法创建目录:', dir, e.message);
    }
  }
});

// 静态文件服务
app.use('/uploads', express.static(uploadsDir));

// 数据库连接 - 使用内存数据库
const db = new sqlite3.Database(':memory:', (err) => {
  if (err) {
    console.error('数据库连接失败:', err);
    process.exit(1);
  } else {
    console.log('数据库连接成功: 内存数据库');
    initDatabase();
  }
});

// 启用外键
 db.run('PRAGMA foreign_keys = ON');

// 初始化数据库表
function initDatabase() {
  db.serialize(() => {
    // 用户表
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      role TEXT DEFAULT 'qc' CHECK(role IN ('admin', 'qc', 'auditor')),
      region TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_active INTEGER DEFAULT 1
    )`);

    // 客人类型表
    db.run(`CREATE TABLE IF NOT EXISTS customer_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      code TEXT,
      is_active INTEGER DEFAULT 1,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 缺陷类型表（多级）
    db.run(`CREATE TABLE IF NOT EXISTS defect_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      parent_id INTEGER,
      code TEXT,
      description TEXT,
      is_active INTEGER DEFAULT 1,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 严重等级表
    db.run(`CREATE TABLE IF NOT EXISTS severity_levels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level INTEGER NOT NULL,
      name TEXT NOT NULL,
      name_en TEXT,
      rules TEXT,
      color TEXT DEFAULT '#EF4444',
      is_active INTEGER DEFAULT 1,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 标准案例库
    db.run(`CREATE TABLE IF NOT EXISTS standard_cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      defect_category_id INTEGER,
      defect_subcategory_id INTEGER,
      severity_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      rules TEXT,
      boundary TEXT,
      images TEXT,
      tags TEXT,
      is_active INTEGER DEFAULT 1,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 缺陷记录表
    db.run(`CREATE TABLE IF NOT EXISTS defect_records (
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
    )`);

    // 校准记录表
    db.run(`CREATE TABLE IF NOT EXISTS calibration_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      defect_id INTEGER NOT NULL,
      original_category_id INTEGER,
      original_severity_id INTEGER,
      new_category_id INTEGER,
      new_severity_id INTEGER,
      reason TEXT,
      calibrated_by INTEGER,
      calibrated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    console.log('数据库表初始化完成');
    
    // 创建默认管理员账户
    createDefaultAdmin();
  });
}

// 创建默认管理员
function createDefaultAdmin() {
  db.get('SELECT id FROM users WHERE username = ?', ['admin'], async (err, row) => {
    if (err) {
      console.error('检查管理员失败:', err);
      return;
    }
    
    if (!row) {
      try {
        const hashedPassword = await bcrypt.hash('admin123', 10);
        db.run(
          'INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)',
          ['admin', hashedPassword, '系统管理员', 'admin'],
          (err) => {
            if (err) console.error('创建管理员失败:', err);
            else console.log('默认管理员账户创建成功 (admin/admin123)');
          }
        );
      } catch (error) {
        console.error('创建管理员错误:', error);
      }
    }
  });
}

// JWT 验证中间件
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '未提供认证令牌' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: '令牌无效或已过期' });
    }
    req.user = user;
    next();
  });
};

// 权限检查中间件
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: '权限不足' });
    }
    next();
  };
};

// ==================== 认证接口 ====================

// 登录
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: '请提供用户名和密码' });
    }

    db.get('SELECT * FROM users WHERE username = ? AND is_active = 1', [username], async (err, user) => {
      if (err) {
        return res.status(500).json({ error: '服务器错误' });
      }
      
      if (!user) {
        return res.status(401).json({ error: '用户名或密码错误' });
      }

      const validPassword = await bcrypt.compare(password, user.password_hash);
      if (!validPassword) {
        return res.status(401).json({ error: '用户名或密码错误' });
      }

      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.display_name,
          role: user.role
        }
      });
    });
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 获取当前用户
app.get('/api/auth/me', authenticateToken, (req, res) => {
  db.get('SELECT id, username, display_name, role, region FROM users WHERE id = ?', 
    [req.user.id], 
    (err, user) => {
      if (err || !user) {
        return res.status(404).json({ error: '用户不存在' });
      }
      res.json({
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        role: user.role,
        region: user.region
      });
    }
  );
});

// ==================== 用户管理接口（管理员） ====================

// 创建用户
app.post('/api/users', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { username, password, displayName, role, region } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: '请提供用户名和密码' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    db.run(
      'INSERT INTO users (username, password_hash, display_name, role, region) VALUES (?, ?, ?, ?, ?)',
      [username, hashedPassword, displayName, role || 'qc', region],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(409).json({ error: '用户名已存在' });
          }
          return res.status(500).json({ error: '创建用户失败' });
        }
        res.status(201).json({ id: this.lastID, username, displayName, role });
      }
    );
  } catch (error) {
    console.error('创建用户错误:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 获取用户列表
app.get('/api/users', authenticateToken, requireRole('admin'), (req, res) => {
  db.all('SELECT id, username, display_name, role, region, created_at, is_active FROM users', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: '获取用户列表失败' });
    }
    res.json(rows);
  });
});

// ==================== 客人类型接口 ====================

// 获取客人类型列表
app.get('/api/customer-types', authenticateToken, (req, res) => {
  db.all('SELECT * FROM customer_types WHERE is_active = 1 ORDER BY name', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: '获取客人类型失败' });
    }
    res.json(rows);
  });
});

// 创建客人类型（管理员）
app.post('/api/customer-types', authenticateToken, requireRole('admin'), (req, res) => {
  const { name, code } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: '名称不能为空' });
  }

  db.run(
    'INSERT INTO customer_types (name, code, created_by) VALUES (?, ?, ?)',
    [name, code, req.user.id],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(409).json({ error: '客人类型已存在' });
        }
        return res.status(500).json({ error: '创建失败' });
      }
      res.status(201).json({ id: this.lastID, name, code });
    }
  );
});

// ==================== 缺陷类型接口 ====================

// 获取缺陷类型（树形结构）
app.get('/api/defect-categories', authenticateToken, (req, res) => {
  db.all('SELECT * FROM defect_categories WHERE is_active = 1 ORDER BY parent_id, name', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: '获取缺陷类型失败' });
    }
    
    // 构建树形结构
    const categories = [];
    const subCategories = {};
    
    rows.forEach(row => {
      if (row.parent_id === null) {
        categories.push({ ...row, children: [] });
      } else {
        if (!subCategories[row.parent_id]) {
          subCategories[row.parent_id] = [];
        }
        subCategories[row.parent_id].push(row);
      }
    });
    
    categories.forEach(cat => {
      if (subCategories[cat.id]) {
        cat.children = subCategories[cat.id];
      }
    });
    
    res.json(categories);
  });
});

// 创建缺陷类型（管理员）
app.post('/api/defect-categories', authenticateToken, requireRole('admin'), (req, res) => {
  const { name, parentId, code, description } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: '名称不能为空' });
  }

  db.run(
    'INSERT INTO defect_categories (name, parent_id, code, description, created_by) VALUES (?, ?, ?, ?, ?)',
    [name, parentId || null, code, description, req.user.id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: '创建失败' });
      }
      res.status(201).json({ id: this.lastID, name, parentId, code });
    }
  );
});

// ==================== 严重等级接口 ====================

// 获取严重等级列表
app.get('/api/severity-levels', authenticateToken, (req, res) => {
  db.all('SELECT * FROM severity_levels WHERE is_active = 1 ORDER BY level', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: '获取严重等级失败' });
    }
    res.json(rows);
  });
});

// 创建严重等级（管理员）
app.post('/api/severity-levels', authenticateToken, requireRole('admin'), (req, res) => {
  const { level, name, nameEn, rules, color } = req.body;
  
  if (!level || !name) {
    return res.status(400).json({ error: '等级和名称不能为空' });
  }

  db.run(
    'INSERT INTO severity_levels (level, name, name_en, rules, color, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    [level, name, nameEn, rules, color, req.user.id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: '创建失败' });
      }
      res.status(201).json({ id: this.lastID, level, name });
    }
  );
});

// ==================== 文件上传配置 ====================

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const type = req.params.type || 'cases';
    const dir = path.join(uploadsDir, type);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('只允许上传图片和PDF文件'));
  }
});

// 上传图片（原图+缩略图）
app.post('/api/upload/:type', authenticateToken, upload.array('files', 10), async (req, res) => {
  try {
    const files = req.files;
    const type = req.params.type;
    const results = [];

    for (const file of files) {
      const filePath = file.path;
      const fileName = path.basename(filePath);
      
      // 返回原图路径（缩略图由前端生成或后续处理）
      results.push({
        original: `/uploads/${type}/${fileName}`,
        thumbnail: `/uploads/${type}/${fileName}`,
        filename: fileName
      });
    }

    res.json({ success: true, files: results });
  } catch (error) {
    console.error('上传错误:', error);
    res.status(500).json({ error: '上传失败' });
  }
});

// ==================== 标准案例库接口 ====================

// 获取案例列表
app.get('/api/cases', authenticateToken, (req, res) => {
  const { categoryId, severityId, search, page = 1, limit = 20 } = req.query;
  let sql = `
    SELECT sc.*, 
      dc.name as category_name,
      dsc.name as subcategory_name,
      sl.name as severity_name,
      sl.color as severity_color,
      u.display_name as created_by_name
    FROM standard_cases sc
    LEFT JOIN defect_categories dc ON sc.defect_category_id = dc.id
    LEFT JOIN defect_categories dsc ON sc.defect_subcategory_id = dsc.id
    LEFT JOIN severity_levels sl ON sc.severity_id = sl.id
    LEFT JOIN users u ON sc.created_by = u.id
    WHERE sc.is_active = 1
  `;
  const params = [];

  if (categoryId) {
    sql += ' AND (sc.defect_category_id = ? OR sc.defect_subcategory_id = ?)';
    params.push(categoryId, categoryId);
  }
  if (severityId) {
    sql += ' AND sc.severity_id = ?';
    params.push(severityId);
  }
  if (search) {
    sql += ' AND (sc.title LIKE ? OR sc.description LIKE ? OR sc.tags LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  sql += ' ORDER BY sc.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

  db.all(sql, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: '获取案例失败' });
    }
    
    // 解析图片JSON
    rows.forEach(row => {
      if (row.images) {
        try { row.images = JSON.parse(row.images); } catch(e) { row.images = []; }
      }
      if (row.tags) {
        try { row.tags = JSON.parse(row.tags); } catch(e) { row.tags = []; }
      }
    });
    
    res.json(rows);
  });
});

// 获取案例详情
app.get('/api/cases/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.get(`
    SELECT sc.*, 
      dc.name as category_name,
      dsc.name as subcategory_name,
      sl.name as severity_name,
      sl.color as severity_color,
      u.display_name as created_by_name
    FROM standard_cases sc
    LEFT JOIN defect_categories dc ON sc.defect_category_id = dc.id
    LEFT JOIN defect_categories dsc ON sc.defect_subcategory_id = dsc.id
    LEFT JOIN severity_levels sl ON sc.severity_id = sl.id
    LEFT JOIN users u ON sc.created_by = u.id
    WHERE sc.id = ? AND sc.is_active = 1
  `, [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: '获取案例失败' });
    }
    if (!row) {
      return res.status(404).json({ error: '案例不存在' });
    }
    
    if (row.images) {
      try { row.images = JSON.parse(row.images); } catch(e) { row.images = []; }
    }
    if (row.tags) {
      try { row.tags = JSON.parse(row.tags); } catch(e) { row.tags = []; }
    }
    
    res.json(row);
  });
});

// 创建案例（管理员）
app.post('/api/cases', authenticateToken, requireRole('admin'), (req, res) => {
  const { 
    defectCategoryId, defectSubcategoryId, severityId,
    title, description, rules, boundary, images, tags 
  } = req.body;
  
  if (!title) {
    return res.status(400).json({ error: '标题不能为空' });
  }

  db.run(
    `INSERT INTO standard_cases 
    (defect_category_id, defect_subcategory_id, severity_id, title, description, rules, boundary, images, tags, created_by) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      defectCategoryId, defectSubcategoryId, severityId,
      title, description, rules, boundary,
      JSON.stringify(images || []), JSON.stringify(tags || []),
      req.user.id
    ],
    function(err) {
      if (err) {
        return res.status(500).json({ error: '创建案例失败' });
      }
      res.status(201).json({ id: this.lastID, title });
    }
  );
});

// 更新案例（管理员）
app.put('/api/cases/:id', authenticateToken, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  const { 
    defectCategoryId, defectSubcategoryId, severityId,
    title, description, rules, boundary, images, tags 
  } = req.body;

  db.run(
    `UPDATE standard_cases SET 
      defect_category_id = ?, defect_subcategory_id = ?, severity_id = ?,
      title = ?, description = ?, rules = ?, boundary = ?,
      images = ?, tags = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`,
    [
      defectCategoryId, defectSubcategoryId, severityId,
      title, description, rules, boundary,
      JSON.stringify(images || []), JSON.stringify(tags || []),
      id
    ],
    function(err) {
      if (err) {
        return res.status(500).json({ error: '更新案例失败' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: '案例不存在' });
      }
      res.json({ id, title });
    }
  );
});

// 删除案例（管理员）
app.delete('/api/cases/:id', authenticateToken, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  
  db.run('UPDATE standard_cases SET is_active = 0 WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: '删除案例失败' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: '案例不存在' });
    }
    res.json({ message: '案例已删除' });
  });
});

// ==================== 缺陷记录接口 ====================

// 获取缺陷列表
app.get('/api/defects', authenticateToken, (req, res) => {
  const { 
    customerTypeId, categoryId, severityId, 
    isCalibrated, search, page = 1, limit = 20 
  } = req.query;
  
  let sql = `
    SELECT dr.*, 
      ct.name as customer_type_name,
      dc.name as category_name,
      dsc.name as subcategory_name,
      sl.name as severity_name,
      sl.color as severity_color,
      u.display_name as created_by_name,
      cu.display_name as calibrated_by_name
    FROM defect_records dr
    LEFT JOIN customer_types ct ON dr.customer_type_id = ct.id
    LEFT JOIN defect_categories dc ON dr.defect_category_id = dc.id
    LEFT JOIN defect_categories dsc ON dr.defect_subcategory_id = dsc.id
    LEFT JOIN severity_levels sl ON dr.severity_id = sl.id
    LEFT JOIN users u ON dr.created_by = u.id
    LEFT JOIN users cu ON dr.calibrated_by = cu.id
    WHERE 1=1
  `;
  const params = [];

  if (customerTypeId) {
    sql += ' AND dr.customer_type_id = ?';
    params.push(customerTypeId);
  }
  if (categoryId) {
    sql += ' AND (dr.defect_category_id = ? OR dr.defect_subcategory_id = ?)';
    params.push(categoryId, categoryId);
  }
  if (severityId) {
    sql += ' AND dr.severity_id = ?';
    params.push(severityId);
  }
  if (isCalibrated !== undefined) {
    sql += ' AND dr.is_calibrated = ?';
    params.push(isCalibrated);
  }
  if (search) {
    sql += ' AND (dr.description LIKE ? OR dr.location LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  sql += ' ORDER BY dr.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

  db.all(sql, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: '获取缺陷记录失败' });
    }
    
    rows.forEach(row => {
      if (row.images) {
        try { row.images = JSON.parse(row.images); } catch(e) { row.images = []; }
      }
    });
    
    res.json(rows);
  });
});

// 创建缺陷记录
app.post('/api/defects', authenticateToken, (req, res) => {
  const {
    reportId, reportPoNo, reportStyleNo,
    customerTypeId, defectCategoryId, defectSubcategoryId, severityId,
    description, location, images
  } = req.body;

  db.run(
    `INSERT INTO defect_records 
    (report_id, report_po_no, report_style_no, customer_type_id, 
     defect_category_id, defect_subcategory_id, severity_id,
     description, location, images, original_category_id, original_severity_id, original_description, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      reportId, reportPoNo, reportStyleNo, customerTypeId,
      defectCategoryId, defectSubcategoryId, severityId,
      description, location, JSON.stringify(images || []),
      defectCategoryId, severityId, description,
      req.user.id
    ],
    function(err) {
      if (err) {
        return res.status(500).json({ error: '创建缺陷记录失败' });
      }
      res.status(201).json({ id: this.lastID });
    }
  );
});

// 校准缺陷
app.post('/api/defects/:id/calibrate', authenticateToken, requireRole('admin', 'auditor'), (req, res) => {
  const { id } = req.params;
  const { categoryId, severityId, reason, result } = req.body;

  db.get('SELECT * FROM defect_records WHERE id = ?', [id], (err, defect) => {
    if (err || !defect) {
      return res.status(404).json({ error: '缺陷记录不存在' });
    }

    db.serialize(() => {
      // 记录校准日志
      db.run(
        `INSERT INTO calibration_logs 
        (defect_id, original_category_id, original_severity_id, new_category_id, new_severity_id, reason, calibrated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, defect.defect_category_id, defect.severity_id, categoryId, severityId, reason, req.user.id]
      );

      // 更新缺陷记录
      db.run(
        `UPDATE defect_records SET 
          defect_category_id = ?, defect_subcategory_id = ?, severity_id = ?,
          is_calibrated = 1, calibrated_by = ?, calibrated_at = CURRENT_TIMESTAMP,
          calibration_reason = ?, calibration_result = ?
        WHERE id = ?`,
        [categoryId, categoryId, severityId, req.user.id, reason, result, id],
        function(err) {
          if (err) {
            return res.status(500).json({ error: '校准失败' });
          }
          res.json({ message: '校准成功' });
        }
      );
    });
  });
});

// ==================== 统计接口 ====================

// 获取概览统计
app.get('/api/stats/overview', authenticateToken, (req, res) => {
  const stats = {};
  
  db.get('SELECT COUNT(*) as total FROM defect_records', [], (err, row) => {
    stats.totalDefects = row ? row.total : 0;
    
    db.get('SELECT COUNT(*) as total FROM defect_records WHERE is_calibrated = 1', [], (err, row) => {
      stats.calibratedDefects = row ? row.total : 0;
      
      db.get('SELECT COUNT(*) as total FROM standard_cases WHERE is_active = 1', [], (err, row) => {
        stats.totalCases = row ? row.total : 0;
        
        res.json(stats);
      });
    });
  });
});

// 偏差统计
app.get('/api/stats/deviation', authenticateToken, (req, res) => {
  db.all(`
    SELECT 
      dc.name as category_name,
      COUNT(*) as deviation_count,
      ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM calibration_logs), 2) as percentage
    FROM calibration_logs cl
    JOIN defect_categories dc ON cl.original_category_id = dc.id
    GROUP BY cl.original_category_id
    ORDER BY deviation_count DESC
    LIMIT 10
  `, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: '获取偏差统计失败' });
    }
    res.json(rows);
  });
});

// ==================== 初始化示例数据 ====================

app.post('/api/init-sample-data', authenticateToken, requireRole('admin'), (req, res) => {
  const sampleData = {
    customerTypes: [
      { name: 'BON PRIX', code: 'BP' },
      { name: 'OTTO', code: 'OT' },
      { name: 'WITT', code: 'WT' },
      { name: 'C&A', code: 'CA' }
    ],
    defectCategories: [
      { name: '外观缺陷', children: ['污渍', '破损', '色差', '变形'] },
      { name: '尺寸缺陷', children: ['偏大', '偏小', '不对称'] },
      { name: '工艺缺陷', children: ['缝线不良', '纽扣问题', '拉链问题', '熨烫不良'] },
      { name: '材料缺陷', children: ['面料瑕疵', '辅料问题'] }
    ],
    severityLevels: [
      { level: 1, name: '致命', nameEn: 'Fatal', rules: '影响产品安全或导致产品无法使用', color: '#DC2626' },
      { level: 2, name: '严重', nameEn: 'Serious', rules: '严重影响产品外观或功能', color: '#EA580C' },
      { level: 3, name: '一般', nameEn: 'General', rules: '轻微影响产品外观，不影响功能', color: '#CA8A04' },
      { level: 4, name: '轻微', nameEn: 'Minor', rules: '几乎不影响产品外观和功能', color: '#65A30D' }
    ]
  };

  db.serialize(() => {
    // 插入客人类型
    sampleData.customerTypes.forEach(ct => {
      db.run('INSERT OR IGNORE INTO customer_types (name, code) VALUES (?, ?)', [ct.name, ct.code]);
    });

    // 插入缺陷类型
    sampleData.defectCategories.forEach(cat => {
      db.run('INSERT INTO defect_categories (name) VALUES (?)', [cat.name], function(err) {
        if (!err) {
          const parentId = this.lastID;
          cat.children.forEach(child => {
            db.run('INSERT INTO defect_categories (name, parent_id) VALUES (?, ?)', [child, parentId]);
          });
        }
      });
    });

    // 插入严重等级
    sampleData.severityLevels.forEach(sl => {
      db.run(
        'INSERT INTO severity_levels (level, name, name_en, rules, color) VALUES (?, ?, ?, ?, ?)',
        [sl.level, sl.name, sl.nameEn, sl.rules, sl.color]
      );
    });

    res.json({ message: '示例数据初始化成功' });
  });
});

// ==================== 导入导出接口 ====================

// 导出缺陷数据为Excel
app.get('/api/export/excel', authenticateToken, async (req, res) => {
  try {
    if (!XLSX) {
      return res.status(500).json({ error: 'Excel导出功能不可用，请安装xlsx模块' });
    }

    const { customerTypeId, categoryId, severityId, isCalibrated, search } = req.query;
    
    let sql = `
      SELECT dr.*, 
        ct.name as customer_type_name,
        dc.name as category_name,
        dsc.name as subcategory_name,
        sl.name as severity_name,
        u.display_name as created_by_name,
        cu.display_name as calibrated_by_name
      FROM defect_records dr
      LEFT JOIN customer_types ct ON dr.customer_type_id = ct.id
      LEFT JOIN defect_categories dc ON dr.defect_category_id = dc.id
      LEFT JOIN defect_categories dsc ON dr.defect_subcategory_id = dsc.id
      LEFT JOIN severity_levels sl ON dr.severity_id = sl.id
      LEFT JOIN users u ON dr.created_by = u.id
      LEFT JOIN users cu ON dr.calibrated_by = cu.id
      WHERE 1=1
    `;
    const params = [];

    if (customerTypeId) {
      sql += ' AND dr.customer_type_id = ?';
      params.push(customerTypeId);
    }
    if (categoryId) {
      sql += ' AND (dr.defect_category_id = ? OR dr.defect_subcategory_id = ?)';
      params.push(categoryId, categoryId);
    }
    if (severityId) {
      sql += ' AND dr.severity_id = ?';
      params.push(severityId);
    }
    if (isCalibrated !== undefined) {
      sql += ' AND dr.is_calibrated = ?';
      params.push(isCalibrated);
    }
    if (search) {
      sql += ' AND (dr.description LIKE ? OR dr.location LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY dr.created_at DESC';

    db.all(sql, params, async (err, rows) => {
      if (err) {
        return res.status(500).json({ error: '获取缺陷记录失败' });
      }

      // 解析图片JSON
      rows.forEach(row => {
        if (row.images) {
          try { row.images = JSON.parse(row.images); } catch(e) { row.images = []; }
        }
      });

      // 创建Excel工作簿
      const workbook = XLSX.utils.book_new();
      
      // 准备数据
      const exportData = rows.map(row => ({
        'ID': row.id,
        '报告编号': row.report_id || '',
        'PO号': row.report_po_no || '',
        '款号': row.report_style_no || '',
        '客人类型': row.customer_type_name || '',
        '缺陷大类': row.category_name || '',
        '缺陷子类': row.subcategory_name || '',
        '严重等级': row.severity_name || '',
        '缺陷描述': row.description || '',
        '位置': row.location || '',
        '原分类': row.original_category_id || '',
        '原严重等级': row.original_severity_id || '',
        '原描述': row.original_description || '',
        '是否校准': row.is_calibrated ? '是' : '否',
        '校准人': row.calibrated_by_name || '',
        '校准时间': row.calibrated_at || '',
        '校准原因': row.calibration_reason || '',
        '校准结果': row.calibration_result || '',
        '创建人': row.created_by_name || '',
        '创建时间': row.created_at || ''
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      XLSX.utils.book_append_sheet(workbook, worksheet, '缺陷记录');

      // 生成Excel文件
      const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      
      // 保存到临时目录
      const filename = `defects_export_${Date.now()}.xlsx`;
      const filepath = path.join(exportsDir, filename);
      fs.writeFileSync(filepath, excelBuffer);

      res.json({ 
        success: true, 
        downloadUrl: `/api/export/download/${filename}`,
        filename: filename,
        count: rows.length
      });
    });
  } catch (error) {
    console.error('导出Excel错误:', error);
    res.status(500).json({ error: '导出失败' });
  }
});

// 导出缺陷数据为PDF
app.get('/api/export/pdf', authenticateToken, async (req, res) => {
  try {
    if (!PDFDocument) {
      return res.status(500).json({ error: 'PDF导出功能不可用，请安装pdf-lib模块' });
    }

    const { customerTypeId, categoryId, severityId, isCalibrated, search } = req.query;
    
    let sql = `
      SELECT dr.*, 
        ct.name as customer_type_name,
        dc.name as category_name,
        dsc.name as subcategory_name,
        sl.name as severity_name,
        u.display_name as created_by_name,
        cu.display_name as calibrated_by_name
      FROM defect_records dr
      LEFT JOIN customer_types ct ON dr.customer_type_id = ct.id
      LEFT JOIN defect_categories dc ON dr.defect_category_id = dc.id
      LEFT JOIN defect_categories dsc ON dr.defect_subcategory_id = dsc.id
      LEFT JOIN severity_levels sl ON dr.severity_id = sl.id
      LEFT JOIN users u ON dr.created_by = u.id
      LEFT JOIN users cu ON dr.calibrated_by = cu.id
      WHERE 1=1
    `;
    const params = [];

    if (customerTypeId) {
      sql += ' AND dr.customer_type_id = ?';
      params.push(customerTypeId);
    }
    if (categoryId) {
      sql += ' AND (dr.defect_category_id = ? OR dr.defect_subcategory_id = ?)';
      params.push(categoryId, categoryId);
    }
    if (severityId) {
      sql += ' AND dr.severity_id = ?';
      params.push(severityId);
    }
    if (isCalibrated !== undefined) {
      sql += ' AND dr.is_calibrated = ?';
      params.push(isCalibrated);
    }
    if (search) {
      sql += ' AND (dr.description LIKE ? OR dr.location LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY dr.created_at DESC LIMIT 100'; // PDF限制100条

    db.all(sql, params, async (err, rows) => {
      if (err) {
        return res.status(500).json({ error: '获取缺陷记录失败' });
      }

      // 创建PDF文档
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      
      let page = pdfDoc.addPage([595.28, 841.89]); // A4
      const { width, height } = page.getSize();
      let y = height - 50;

      // 标题
      page.drawText('缺陷记录报告', {
        x: 50,
        y,
        size: 20,
        font: fontBold,
        color: rgb(0, 0, 0)
      });
      y -= 30;

      page.drawText(`生成时间: ${new Date().toLocaleString('zh-CN')}`, {
        x: 50,
        y,
        size: 10,
        font,
        color: rgb(0.4, 0.4, 0.4)
      });
      y -= 40;

      // 数据表格
      rows.forEach((row, index) => {
        if (y < 100) {
          page = pdfDoc.addPage([595.28, 841.89]);
          y = height - 50;
        }

        page.drawText(`#${index + 1}`, {
          x: 50,
          y,
          size: 12,
          font: fontBold,
          color: rgb(0.2, 0.4, 0.8)
        });
        y -= 20;

        const fields = [
          ['PO号', row.report_po_no || 'N/A'],
          ['款号', row.report_style_no || 'N/A'],
          ['客人类型', row.customer_type_name || 'N/A'],
          ['缺陷分类', `${row.category_name || 'N/A'} ${row.subcategory_name ? '- ' + row.subcategory_name : ''}`],
          ['严重等级', row.severity_name || 'N/A'],
          ['描述', row.description || 'N/A'],
          ['位置', row.location || 'N/A'],
          ['校准状态', row.is_calibrated ? `已校准 (${row.calibrated_by_name || ''})` : '未校准'],
          ['创建时间', row.created_at || 'N/A']
        ];

        fields.forEach(([label, value]) => {
          page.drawText(`${label}:`, {
            x: 60,
            y,
            size: 9,
            font: fontBold,
            color: rgb(0.3, 0.3, 0.3)
          });
          page.drawText(String(value), {
            x: 120,
            y,
            size: 9,
            font,
            color: rgb(0, 0, 0)
          });
          y -= 14;
        });

        y -= 10; // 间距
      });

      const pdfBytes = await pdfDoc.save();
      const filename = `defects_export_${Date.now()}.pdf`;
      const filepath = path.join(exportsDir, filename);
      fs.writeFileSync(filepath, pdfBytes);

      res.json({ 
        success: true, 
        downloadUrl: `/api/export/download/${filename}`,
        filename: filename,
        count: rows.length
      });
    });
  } catch (error) {
    console.error('导出PDF错误:', error);
    res.status(500).json({ error: '导出失败' });
  }
});

// 下载导出文件
app.get('/api/export/download/:filename', authenticateToken, (req, res) => {
  const { filename } = req.params;
  const filepath = path.join(exportsDir, filename);
  
  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: '文件不存在' });
  }

  res.download(filepath, filename, (err) => {
    if (err) {
      console.error('下载错误:', err);
      res.status(500).json({ error: '下载失败' });
    }
  });
});

// 导入Excel数据
app.post('/api/import/excel', authenticateToken, upload.single('file'), (req, res) => {
  try {
    if (!XLSX) {
      return res.status(500).json({ error: 'Excel导入功能不可用，请安装xlsx模块' });
    }

    if (!req.file) {
      return res.status(400).json({ error: '请上传文件' });
    }

    const workbook = XLSX.readFile(req.file.path);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(worksheet);

    let imported = 0;
    let errors = [];

    db.serialize(() => {
      data.forEach((row, index) => {
        try {
          db.run(
            `INSERT INTO defect_records 
            (report_id, report_po_no, report_style_no, customer_type_id,
             defect_category_id, defect_subcategory_id, severity_id,
             description, location, images, original_category_id, original_severity_id, original_description, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              row['报告编号'] || null,
              row['PO号'] || null,
              row['款号'] || null,
              row['客人类型ID'] || null,
              row['缺陷大类ID'] || null,
              row['缺陷子类ID'] || null,
              row['严重等级ID'] || null,
              row['缺陷描述'] || '',
              row['位置'] || '',
              '[]',
              row['缺陷大类ID'] || null,
              row['严重等级ID'] || null,
              row['缺陷描述'] || '',
              req.user.id
            ],
            function(err) {
              if (err) {
                errors.push(`行 ${index + 1}: ${err.message}`);
              } else {
                imported++;
              }
            }
          );
        } catch (e) {
          errors.push(`行 ${index + 1}: ${e.message}`);
        }
      });

      // 清理上传文件
      fs.unlinkSync(req.file.path);

      res.json({ 
        success: true, 
        imported,
        total: data.length,
        errors: errors.slice(0, 10) // 只返回前10个错误
      });
    });
  } catch (error) {
    console.error('导入Excel错误:', error);
    res.status(500).json({ error: '导入失败' });
  }
});

// 导入PDF数据（简化版，提取文本后手动解析）
app.post('/api/import/pdf', authenticateToken, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传文件' });
    }

    // PDF导入需要更复杂的解析逻辑，这里返回提示信息
    // 实际实现中可以使用pdf-parse等库提取文本
    fs.unlinkSync(req.file.path);

    res.json({ 
      success: false, 
      message: 'PDF导入功能需要手动解析，请先将PDF转换为Excel格式导入',
      suggestion: '建议使用Excel格式导入，或在缺陷数据库中手动添加记录'
    });
  } catch (error) {
    console.error('导入PDF错误:', error);
    res.status(500).json({ error: '导入失败' });
  }
});

// ==================== 错误处理 ====================

app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({ error: '服务器内部错误' });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`缺陷判定校准系统服务器运行在端口 ${PORT}`);
  console.log(`API地址: http://localhost:${PORT}/api`);
});

module.exports = app;
