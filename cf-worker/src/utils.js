/**
 * 通用辅助函数
 */

/**
 * CORS headers
 */
export function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

/**
 * JSON 响应
 */
export function jsonResponse(data, status = 200, origin = '*') {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      ...corsHeaders(origin),
    },
  });
}

/**
 * 错误响应
 */
export function errorResponse(message, status = 400, origin = '*') {
  return jsonResponse({ error: message }, status, origin);
}

/**
 * 解析 JSON 请求体
 */
export async function parseJSON(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/**
 * 内存速率限制
 */
const rateLimitMap = new Map();
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 20;

export function checkRateLimit(ip, max = RATE_MAX) {
  const now = Date.now();
  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, []);
  }
  const timestamps = rateLimitMap.get(ip).filter(t => now - t < RATE_WINDOW_MS);
  if (timestamps.length >= max) {
    return false;
  }
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  return true;
}

/**
 * 解析分页参数
 */
export function parsePagination(url) {
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);
  return { page, limit, offset: (page - 1) * limit };
}
