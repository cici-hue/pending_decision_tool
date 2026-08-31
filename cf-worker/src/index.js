/**
 * Cloudflare Worker - Pending Report Backend
 *
 * 整合：
 * - 缺陷校准系统 API (Express 版本迁移)
 * - DeepSeek AI 代理
 *
 * 数据存储：
 * - D1 (Cloudflare SQLite) 用于结构化数据 + 图片（base64）
 * - 环境变量 (DEEPSEEK_API_KEY) 用于 API key
 */

import { queryAll, queryFirst, run } from './db.js';
import {
  hashPassword,
  verifyPassword,
  signJWT,
  authenticate,
  requireRole,
} from './auth.js';
import { jsonResponse, errorResponse, parseJSON, checkRateLimit, parsePagination } from './utils.js';

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '*';
    const allowedOrigin = env.ALLOWED_ORIGIN || '*';
    const corsOrigin = allowedOrigin === '*' ? '*' : origin;
    const url = new URL(request.url);

    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': corsOrigin,
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // 健康检查
    if (url.pathname === '/' || url.pathname === '/health') {
      return jsonResponse({
        status: 'ok',
        service: 'pending-report-backend',
        timestamp: new Date().toISOString(),
      }, 200, corsOrigin);
    }

    // DeepSeek 代理
    if (url.pathname.startsWith('/api/deepseek/')) {
      return handleDeepSeek(request, env, corsOrigin);
    }

    // 认证相关
    if (url.pathname === '/api/auth/login' && request.method === 'POST') {
      return handleLogin(request, env, corsOrigin);
    }
    if (url.pathname === '/api/auth/me' && request.method === 'GET') {
      return handleGetMe(request, env, corsOrigin);
    }

    // 用户管理
    if (url.pathname === '/api/users' && request.method === 'POST') {
      return handleCreateUser(request, env, corsOrigin);
    }
    if (url.pathname === '/api/users' && request.method === 'GET') {
      return handleListUsers(request, env, corsOrigin);
    }

    // 客人类型
    if (url.pathname === '/api/customer-types' && request.method === 'GET') {
      return handleListCustomerTypes(request, env, corsOrigin);
    }
    if (url.pathname === '/api/customer-types' && request.method === 'POST') {
      return handleCreateCustomerType(request, env, corsOrigin);
    }

    // 缺陷类型
    if (url.pathname === '/api/defect-categories' && request.method === 'GET') {
      return handleListDefectCategories(request, env, corsOrigin);
    }
    if (url.pathname === '/api/defect-categories' && request.method === 'POST') {
      return handleCreateDefectCategory(request, env, corsOrigin);
    }

    // 严重等级
    if (url.pathname === '/api/severity-levels' && request.method === 'GET') {
      return handleListSeverityLevels(request, env, corsOrigin);
    }
    if (url.pathname === '/api/severity-levels' && request.method === 'POST') {
      return handleCreateSeverityLevel(request, env, corsOrigin);
    }

    // 案例库
    if (url.pathname === '/api/cases' && request.method === 'GET') {
      return handleListCases(request, env, corsOrigin);
    }
    if (url.pathname === '/api/cases' && request.method === 'POST') {
      return handleCreateCase(request, env, corsOrigin);
    }
    const caseDetailMatch = url.pathname.match(/^\/api\/cases\/(\d+)$/);
    if (caseDetailMatch) {
      const id = caseDetailMatch[1];
      if (request.method === 'GET') return handleGetCase(request, env, corsOrigin, id);
      if (request.method === 'PUT') return handleUpdateCase(request, env, corsOrigin, id);
      if (request.method === 'DELETE') return handleDeleteCase(request, env, corsOrigin, id);
    }

    // 缺陷记录
    if (url.pathname === '/api/defects' && request.method === 'GET') {
      return handleListDefects(request, env, corsOrigin);
    }
    if (url.pathname === '/api/defects' && request.method === 'POST') {
      return handleCreateDefect(request, env, corsOrigin);
    }
    const calibrateMatch = url.pathname.match(/^\/api\/defects\/(\d+)\/calibrate$/);
    if (calibrateMatch && request.method === 'POST') {
      return handleCalibrate(request, env, corsOrigin, calibrateMatch[1]);
    }

    // 文件上传（存储到 D1，base64 编码）
    const uploadMatch = url.pathname.match(/^\/api\/upload\/(.+)$/);
    if (uploadMatch && request.method === 'POST') {
      return handleUpload(request, env, corsOrigin, uploadMatch[1]);
    }

    // 获取已上传的图片（按 ID）
    const imageMatch = url.pathname.match(/^\/api\/images\/(\d+)$/);
    if (imageMatch && request.method === 'GET') {
      return handleGetImage(request, env, corsOrigin, imageMatch[1]);
    }

    // 统计
    if (url.pathname === '/api/stats/overview' && request.method === 'GET') {
      return handleStatsOverview(request, env, corsOrigin);
    }
    if (url.pathname === '/api/stats/deviation' && request.method === 'GET') {
      return handleStatsDeviation(request, env, corsOrigin);
    }

    // 示例数据初始化
    if (url.pathname === '/api/init-sample-data' && request.method === 'POST') {
      return handleInitSampleData(request, env, corsOrigin);
    }

    return errorResponse('路径不存在', 404, corsOrigin);
  },
};

// ==================== 认证相关 ====================

async function handleLogin(request, env, origin) {
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!checkRateLimit(clientIp, 10)) {
    return errorResponse('登录尝试过于频繁，请稍后再试', 429, origin);
  }

  const body = await parseJSON(request);
  if (!body || !body.username || !body.password) {
    return errorResponse('请提供用户名和密码', 400, origin);
  }

  const user = await queryFirst(
    env.DB,
    'SELECT * FROM users WHERE username = ? AND is_active = 1',
    [body.username]
  );

  if (!user) {
    return errorResponse('用户名或密码错误', 401, origin);
  }

  const valid = await verifyPassword(body.password, user.password_hash);
  if (!valid) {
    return errorResponse('用户名或密码错误', 401, origin);
  }

  const token = await signJWT(
    { id: user.id, username: user.username, role: user.role },
    env.JWT_SECRET,
    86400
  );

  return jsonResponse({
    token,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
    },
  }, 200, origin);
}

async function handleGetMe(request, env, origin) {
  const auth = await authenticate(request, env.JWT_SECRET);
  if (auth.response) return auth.response;

  const user = await queryFirst(
    env.DB,
    'SELECT id, username, display_name, role, region FROM users WHERE id = ?',
    [auth.user.id]
  );

  if (!user) {
    return errorResponse('用户不存在', 404, origin);
  }

  return jsonResponse({
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    role: user.role,
    region: user.region,
  }, 200, origin);
}

async function ensureDefaultAdmin(env) {
  const existing = await queryFirst(env.DB, 'SELECT id FROM users WHERE username = ?', ['admin']);
  if (existing) return;

  const passwordHash = await hashPassword('admin123');
  await run(
    env.DB,
    'INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)',
    ['admin', passwordHash, '系统管理员', 'admin']
  );
  console.log('默认管理员账户已创建 (admin/admin123)');
}

// ==================== 用户管理 ====================

async function handleCreateUser(request, env, origin) {
  const auth = await authenticate(request, env.JWT_SECRET);
  if (auth.response) return auth.response;
  const roleCheck = requireRole(auth.user, ['admin']);
  if (roleCheck) return roleCheck;

  const body = await parseJSON(request);
  if (!body || !body.username || !body.password) {
    return errorResponse('请提供用户名和密码', 400, origin);
  }

  const passwordHash = await hashPassword(body.password);
  try {
    const result = await run(
      env.DB,
      'INSERT INTO users (username, password_hash, display_name, role, region) VALUES (?, ?, ?, ?, ?)',
      [body.username, passwordHash, body.displayName || null, body.role || 'qc', body.region || null]
    );
    return jsonResponse({ id: result.meta.last_row_id, username: body.username }, 201, origin);
  } catch (error) {
    if (error.message && error.message.includes('UNIQUE')) {
      return errorResponse('用户名已存在', 409, origin);
    }
    throw error;
  }
}

async function handleListUsers(request, env, origin) {
  const auth = await authenticate(request, env.JWT_SECRET);
  if (auth.response) return auth.response;
  const roleCheck = requireRole(auth.user, ['admin']);
  if (roleCheck) return roleCheck;

  const users = await queryAll(
    env.DB,
    'SELECT id, username, display_name, role, region, created_at, is_active FROM users ORDER BY created_at DESC'
  );
  return jsonResponse(users, 200, origin);
}

// ==================== 客人类型 ====================

async function handleListCustomerTypes(request, env, origin) {
  const auth = await authenticate(request, env.JWT_SECRET);
  if (auth.response) return auth.response;

  const types = await queryAll(
    env.DB,
    'SELECT * FROM customer_types WHERE is_active = 1 ORDER BY name'
  );
  return jsonResponse(types, 200, origin);
}

async function handleCreateCustomerType(request, env, origin) {
  const auth = await authenticate(request, env.JWT_SECRET);
  if (auth.response) return auth.response;
  const roleCheck = requireRole(auth.user, ['admin']);
  if (roleCheck) return roleCheck;

  const body = await parseJSON(request);
  if (!body || !body.name) {
    return errorResponse('名称不能为空', 400, origin);
  }

  try {
    const result = await run(
      env.DB,
      'INSERT INTO customer_types (name, code, created_by) VALUES (?, ?, ?)',
      [body.name, body.code || null, auth.user.id]
    );
    return jsonResponse({ id: result.meta.last_row_id, name: body.name }, 201, origin);
  } catch (error) {
    if (error.message && error.message.includes('UNIQUE')) {
      return errorResponse('客人类型已存在', 409, origin);
    }
    throw error;
  }
}

// ==================== 缺陷类型 ====================

async function handleListDefectCategories(request, env, origin) {
  const auth = await authenticate(request, env.JWT_SECRET);
  if (auth.response) return auth.response;

  const rows = await queryAll(
    env.DB,
    'SELECT * FROM defect_categories WHERE is_active = 1 ORDER BY parent_id, name'
  );

  // 构建树形结构
  const categories = [];
  const subCategories = {};
  for (const row of rows) {
    if (row.parent_id === null || row.parent_id === undefined) {
      categories.push({ ...row, children: [] });
    } else {
      if (!subCategories[row.parent_id]) subCategories[row.parent_id] = [];
      subCategories[row.parent_id].push(row);
    }
  }
  for (const cat of categories) {
    if (subCategories[cat.id]) {
      cat.children = subCategories[cat.id];
    }
  }

  return jsonResponse(categories, 200, origin);
}

async function handleCreateDefectCategory(request, env, origin) {
  const auth = await authenticate(request, env.JWT_SECRET);
  if (auth.response) return auth.response;
  const roleCheck = requireRole(auth.user, ['admin']);
  if (roleCheck) return roleCheck;

  const body = await parseJSON(request);
  if (!body || !body.name) {
    return errorResponse('名称不能为空', 400, origin);
  }

  const result = await run(
    env.DB,
    'INSERT INTO defect_categories (name, parent_id, code, description, created_by) VALUES (?, ?, ?, ?, ?)',
    [body.name, body.parentId || null, body.code || null, body.description || null, auth.user.id]
  );
  return jsonResponse({ id: result.meta.last_row_id, name: body.name }, 201, origin);
}

// ==================== 严重等级 ====================

async function handleListSeverityLevels(request, env, origin) {
  const auth = await authenticate(request, env.JWT_SECRET);
  if (auth.response) return auth.response;

  const levels = await queryAll(
    env.DB,
    'SELECT * FROM severity_levels WHERE is_active = 1 ORDER BY level'
  );
  return jsonResponse(levels, 200, origin);
}

async function handleCreateSeverityLevel(request, env, origin) {
  const auth = await authenticate(request, env.JWT_SECRET);
  if (auth.response) return auth.response;
  const roleCheck = requireRole(auth.user, ['admin']);
  if (roleCheck) return roleCheck;

  const body = await parseJSON(request);
  if (!body || !body.level || !body.name) {
    return errorResponse('等级和名称不能为空', 400, origin);
  }

  const result = await run(
    env.DB,
    'INSERT INTO severity_levels (level, name, name_en, rules, color, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    [body.level, body.name, body.nameEn || null, body.rules || null, body.color || '#EF4444', auth.user.id]
  );
  return jsonResponse({ id: result.meta.last_row_id, level: body.level, name: body.name }, 201, origin);
}

// ==================== 案例库 ====================

async function handleListCases(request, env, origin) {
  const auth = await authenticate(request, env.JWT_SECRET);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const categoryId = url.searchParams.get('categoryId');
  const severityId = url.searchParams.get('severityId');
  const search = url.searchParams.get('search');
  const { page, limit, offset } = parsePagination(url);

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
    const kw = `%${search}%`;
    params.push(kw, kw, kw);
  }

  sql += ' ORDER BY sc.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const rows = await queryAll(env.DB, sql, params);
  // 解析 JSON 字段
  for (const row of rows) {
    if (row.images) {
      try { row.images = JSON.parse(row.images); } catch { row.images = []; }
    }
    if (row.tags) {
      try { row.tags = JSON.parse(row.tags); } catch { row.tags = []; }
    }
  }
  return jsonResponse(rows, 200, origin);
}

async function handleGetCase(request, env, origin, id) {
  const auth = await authenticate(request, env.JWT_SECRET);
  if (auth.response) return auth.response;

  const row = await queryFirst(env.DB, `
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
  `, [id]);

  if (!row) return errorResponse('案例不存在', 404, origin);

  if (row.images) {
    try { row.images = JSON.parse(row.images); } catch { row.images = []; }
  }
  if (row.tags) {
    try { row.tags = JSON.parse(row.tags); } catch { row.tags = []; }
  }

  return jsonResponse(row, 200, origin);
}

async function handleCreateCase(request, env, origin) {
  const auth = await authenticate(request, env.JWT_SECRET);
  if (auth.response) return auth.response;
  const roleCheck = requireRole(auth.user, ['admin']);
  if (roleCheck) return roleCheck;

  const body = await parseJSON(request);
  if (!body || !body.title) return errorResponse('标题不能为空', 400, origin);

  const result = await run(env.DB, `
    INSERT INTO standard_cases
    (defect_category_id, defect_subcategory_id, severity_id,
     title, description, rules, boundary, images, tags, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    body.defectCategoryId, body.defectSubcategoryId, body.severityId,
    body.title, body.description, body.rules, body.boundary,
    JSON.stringify(body.images || []), JSON.stringify(body.tags || []),
    auth.user.id
  ]);
  return jsonResponse({ id: result.meta.last_row_id, title: body.title }, 201, origin);
}

async function handleUpdateCase(request, env, origin, id) {
  const auth = await authenticate(request, env.JWT_SECRET);
  if (auth.response) return auth.response;
  const roleCheck = requireRole(auth.user, ['admin']);
  if (roleCheck) return roleCheck;

  const body = await parseJSON(request);
  if (!body) return errorResponse('请求体不能为空', 400, origin);

  const result = await run(env.DB, `
    UPDATE standard_cases SET
      defect_category_id = ?, defect_subcategory_id = ?, severity_id = ?,
      title = ?, description = ?, rules = ?, boundary = ?,
      images = ?, tags = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND is_active = 1
  `, [
    body.defectCategoryId, body.defectSubcategoryId, body.severityId,
    body.title, body.description, body.rules, body.boundary,
    JSON.stringify(body.images || []), JSON.stringify(body.tags || []),
    id
  ]);

  if (result.meta.changes === 0) return errorResponse('案例不存在', 404, origin);
  return jsonResponse({ id, title: body.title }, 200, origin);
}

async function handleDeleteCase(request, env, origin, id) {
  const auth = await authenticate(request, env.JWT_SECRET);
  if (auth.response) return auth.response;
  const roleCheck = requireRole(auth.user, ['admin']);
  if (roleCheck) return roleCheck;

  const result = await run(
    env.DB,
    'UPDATE standard_cases SET is_active = 0 WHERE id = ?',
    [id]
  );
  if (result.meta.changes === 0) return errorResponse('案例不存在', 404, origin);
  return jsonResponse({ message: '案例已删除' }, 200, origin);
}

// ==================== 缺陷记录 ====================

async function handleListDefects(request, env, origin) {
  const auth = await authenticate(request, env.JWT_SECRET);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const customerTypeId = url.searchParams.get('customerTypeId');
  const categoryId = url.searchParams.get('categoryId');
  const severityId = url.searchParams.get('severityId');
  const isCalibrated = url.searchParams.get('isCalibrated');
  const search = url.searchParams.get('search');
  const { page, limit, offset } = parsePagination(url);

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
  if (isCalibrated !== null && isCalibrated !== undefined && isCalibrated !== '') {
    sql += ' AND dr.is_calibrated = ?';
    params.push(isCalibrated);
  }
  if (search) {
    sql += ' AND (dr.description LIKE ? OR dr.location LIKE ?)';
    const kw = `%${search}%`;
    params.push(kw, kw);
  }

  sql += ' ORDER BY dr.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const rows = await queryAll(env.DB, sql, params);
  for (const row of rows) {
    if (row.images) {
      try { row.images = JSON.parse(row.images); } catch { row.images = []; }
    }
  }
  return jsonResponse(rows, 200, origin);
}

async function handleCreateDefect(request, env, origin) {
  const auth = await authenticate(request, env.JWT_SECRET);
  if (auth.response) return auth.response;

  const body = await parseJSON(request);
  if (!body) return errorResponse('请求体不能为空', 400, origin);

  const result = await run(env.DB, `
    INSERT INTO defect_records
    (report_id, report_po_no, report_style_no, customer_type_id,
     defect_category_id, defect_subcategory_id, severity_id,
     description, location, images, original_category_id, original_severity_id,
     original_description, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    body.reportId, body.reportPoNo, body.reportStyleNo,
    body.customerTypeId, body.defectCategoryId, body.defectSubcategoryId,
    body.severityId, body.description, body.location,
    JSON.stringify(body.images || []),
    body.defectCategoryId, body.severityId, body.description,
    auth.user.id
  ]);
  return jsonResponse({ id: result.meta.last_row_id }, 201, origin);
}

async function handleCalibrate(request, env, origin, id) {
  const auth = await authenticate(request, env.JWT_SECRET);
  if (auth.response) return auth.response;
  const roleCheck = requireRole(auth.user, ['admin', 'auditor']);
  if (roleCheck) return roleCheck;

  const body = await parseJSON(request);
  if (!body) return errorResponse('请求体不能为空', 400, origin);

  const defect = await queryFirst(env.DB, 'SELECT * FROM defect_records WHERE id = ?', [id]);
  if (!defect) return errorResponse('缺陷记录不存在', 404, origin);

  // 记录校准日志
  await run(env.DB, `
    INSERT INTO calibration_logs
    (defect_id, original_category_id, original_severity_id, new_category_id, new_severity_id, reason, calibrated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [id, defect.defect_category_id, defect.severity_id, body.categoryId, body.severityId, body.reason, auth.user.id]);

  // 更新缺陷记录
  await run(env.DB, `
    UPDATE defect_records SET
      defect_category_id = ?, defect_subcategory_id = ?, severity_id = ?,
      is_calibrated = 1, calibrated_by = ?, calibrated_at = CURRENT_TIMESTAMP,
      calibration_reason = ?, calibration_result = ?
    WHERE id = ?
  `, [body.categoryId, body.categoryId, body.severityId, auth.user.id, body.reason, body.result, id]);

  return jsonResponse({ message: '校准成功' }, 200, origin);
}

// ==================== 文件上传（D1 存储） ====================

async function handleUpload(request, env, origin, type) {
  const auth = await authenticate(request, env.JWT_SECRET);
  if (auth.response) return auth.response;

  if (!['cases', 'defects'].includes(type)) {
    return errorResponse('无效的上传类型', 400, origin);
  }

  const formData = await request.formData();
  const files = formData.getAll('files');
  if (files.length === 0) {
    return errorResponse('没有文件', 400, origin);
  }

  const results = [];
  for (const file of files) {
    // 验证文件类型
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    if (!allowedTypes.test(file.type) || !allowedTypes.test(file.name.toLowerCase())) {
      return errorResponse(`不支持的文件类型: ${file.type}`, 400, origin);
    }
    if (file.size > 5 * 1024 * 1024) {
      return errorResponse('文件过大（单张最大 5MB）', 400, origin);
    }

    // 读取文件并转 base64
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64Data = btoa(binary);
    const dataUri = `data:${file.type};base64,${base64Data}`;

    // 存储到 D1（每张图存一条记录）
    const result = await run(
      env.DB,
      'INSERT INTO uploaded_images (type, filename, content_type, data_uri, uploaded_by) VALUES (?, ?, ?, ?, ?)',
      [type, file.name, file.type, dataUri, auth.user.id]
    );
    const imageId = result.meta.last_row_id;

    // 返回访问 URL
    results.push({
      id: imageId,
      url: `/api/images/${imageId}`,
      thumbnail: `/api/images/${imageId}`,
      filename: file.name,
    });
  }

  return jsonResponse({ success: true, files: results }, 200, origin);
}

async function handleGetImage(request, env, origin, id) {
  const image = await queryFirst(
    env.DB,
    'SELECT content_type, data_uri FROM uploaded_images WHERE id = ?',
    [id]
  );

  if (!image) {
    return errorResponse('图片不存在', 404, origin);
  }

  // 从 data URI 提取 base64 数据
  const matches = image.data_uri.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) {
    return errorResponse('图片数据格式错误', 500, origin);
  }

  const binary = atob(matches[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Response(bytes, {
    headers: {
      'Content-Type': image.content_type,
      'Cache-Control': 'public, max-age=31536000',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// ==================== 统计 ====================

async function handleStatsOverview(request, env, origin) {
  const auth = await authenticate(request, env.JWT_SECRET);
  if (auth.response) return auth.response;

  const totalDefects = await queryFirst(env.DB, 'SELECT COUNT(*) as total FROM defect_records');
  const calibratedDefects = await queryFirst(env.DB, 'SELECT COUNT(*) as total FROM defect_records WHERE is_calibrated = 1');
  const totalCases = await queryFirst(env.DB, 'SELECT COUNT(*) as total FROM standard_cases WHERE is_active = 1');

  return jsonResponse({
    totalDefects: totalDefects?.total || 0,
    calibratedDefects: calibratedDefects?.total || 0,
    totalCases: totalCases?.total || 0,
  }, 200, origin);
}

async function handleStatsDeviation(request, env, origin) {
  const auth = await authenticate(request, env.JWT_SECRET);
  if (auth.response) return auth.response;

  const rows = await queryAll(env.DB, `
    SELECT
      dc.name as category_name,
      COUNT(*) as deviation_count,
      ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM calibration_logs), 2) as percentage
    FROM calibration_logs cl
    JOIN defect_categories dc ON cl.original_category_id = dc.id
    GROUP BY cl.original_category_id
    ORDER BY deviation_count DESC
    LIMIT 10
  `);
  return jsonResponse(rows, 200, origin);
}

// ==================== 示例数据初始化 ====================

async function handleInitSampleData(request, env, origin) {
  const auth = await authenticate(request, env.JWT_SECRET);
  if (auth.response) return auth.response;
  const roleCheck = requireRole(auth.user, ['admin']);
  if (roleCheck) return roleCheck;

  const customerTypes = ['BON PRIX', 'OTTO', 'WITT', 'C&A'];
  for (const name of customerTypes) {
    try {
      await run(env.DB, 'INSERT OR IGNORE INTO customer_types (name, code) VALUES (?, ?)',
        [name, name.substring(0, 2).toUpperCase()]);
    } catch {}
  }

  const defectCategories = [
    { name: '外观缺陷', children: ['污渍', '破损', '色差', '变形'] },
    { name: '尺寸缺陷', children: ['偏大', '偏小', '不对称'] },
    { name: '工艺缺陷', children: ['缝线不良', '纽扣问题', '拉链问题', '熨烫不良'] },
    { name: '材料缺陷', children: ['面料瑕疵', '辅料问题'] },
  ];
  for (const cat of defectCategories) {
    const result = await run(env.DB, 'INSERT INTO defect_categories (name) VALUES (?)', [cat.name]);
    const parentId = result.meta.last_row_id;
    for (const child of cat.children) {
      await run(env.DB, 'INSERT INTO defect_categories (name, parent_id) VALUES (?, ?)', [child, parentId]);
    }
  }

  const severityLevels = [
    { level: 1, name: '致命', nameEn: 'Fatal', rules: '影响产品安全或导致产品无法使用', color: '#DC2626' },
    { level: 2, name: '严重', nameEn: 'Serious', rules: '严重影响产品外观或功能', color: '#EA580C' },
    { level: 3, name: '一般', nameEn: 'General', rules: '轻微影响产品外观，不影响功能', color: '#CA8A04' },
    { level: 4, name: '轻微', nameEn: 'Minor', rules: '几乎不影响产品外观和功能', color: '#65A30D' },
  ];
  for (const sl of severityLevels) {
    await run(env.DB,
      'INSERT INTO severity_levels (level, name, name_en, rules, color) VALUES (?, ?, ?, ?, ?)',
      [sl.level, sl.name, sl.nameEn, sl.rules, sl.color]);
  }

  return jsonResponse({ message: '示例数据初始化成功' }, 200, origin);
}

// ==================== DeepSeek 代理 ====================

async function handleDeepSeek(request, env, origin) {
  const url = new URL(request.url);
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!checkRateLimit(clientIp)) {
    return errorResponse('请求过于频繁，请稍后再试', 429, origin);
  }

  if (!env.DEEPSEEK_API_KEY) {
    return errorResponse('服务端未配置 DEEPSEEK_API_KEY', 500, origin);
  }

  if (request.method !== 'POST') {
    return errorResponse('仅支持 POST 请求', 405, origin);
  }

  const body = await parseJSON(request);
  if (!body || !body.pdfText || typeof body.pdfText !== 'string') {
    return errorResponse('缺少 pdfText 参数', 400, origin);
  }
  if (body.pdfText.length > 100000) {
    return errorResponse('PDF 文本过长（最大 100KB）', 400, origin);
  }

  const useJsonMode = url.pathname === '/api/deepseek/extract';

  const requestBody = {
    model: env.DEEPSEEK_MODEL || 'deepseek-chat',
    messages: [{ role: 'user', content: body.prompt + body.pdfText }],
  };
  if (useJsonMode) {
    requestBody.response_format = { type: 'json_object' };
  }

  try {
    const response = await fetch(
      env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return errorResponse(`DeepSeek API 错误 ${response.status}: ${errorText}`, response.status, origin);
    }

    const result = await response.json();
    return jsonResponse(result, 200, origin);
  } catch (error) {
    console.error('DeepSeek 代理错误:', error.message);
    return errorResponse('AI 服务调用失败: ' + error.message, 500, origin);
  }
}

// 启动钩子：首次部署时自动创建默认管理员
export async function scheduled(event, env, ctx) {
  ctx.waitUntil(ensureDefaultAdmin(env));
}
