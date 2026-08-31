/**
 * Cloudflare Worker - DeepSeek API 代理
 *
 * 目的：保护 DeepSeek API key 不暴露到前端
 * 不需要数据库、不需要文件存储、不需要用户系统
 *
 * 路由：
 * - POST /api/deepseek/extract - PDF 提取结构化数据（JSON 模式）
 * - POST /api/deepseek/analyze  - 通用分析（普通模式）
 */

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '*';
    const allowedOrigin = env.ALLOWED_ORIGIN || '*';
    const corsOrigin = allowedOrigin === '*' ? '*' : origin;
    const url = new URL(request.url);

    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(corsOrigin),
      });
    }

    // 健康检查
    if (url.pathname === '/') {
      return jsonResponse({
        status: 'ok',
        service: 'deepseek-proxy',
        timestamp: new Date().toISOString(),
      }, 200, corsOrigin);
    }

    // DeepSeek 代理
    if (url.pathname === '/api/deepseek/extract' && request.method === 'POST') {
      return handleDeepSeek(request, env, corsOrigin, true);
    }
    if (url.pathname === '/api/deepseek/analyze' && request.method === 'POST') {
      return handleDeepSeek(request, env, corsOrigin, false);
    }

    return errorResponse('路径不存在', 404, corsOrigin);
  },
};

async function handleDeepSeek(request, env, origin, useJsonMode) {
  if (!env.DEEPSEEK_API_KEY) {
    return errorResponse('服务端未配置 DEEPSEEK_API_KEY', 500, origin);
  }

  const body = await parseJSON(request);
  if (!body || !body.pdfText || typeof body.pdfText !== 'string') {
    return errorResponse('缺少 pdfText 参数', 400, origin);
  }
  if (body.pdfText.length > 100000) {
    return errorResponse('PDF 文本过长（最大 100KB）', 400, origin);
  }

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
      return errorResponse(`DeepSeek API 错误 ${response.status}`, response.status, origin);
    }

    const result = await response.json();
    return jsonResponse(result, 200, origin);
  } catch (error) {
    return errorResponse('AI 服务调用失败: ' + error.message, 500, origin);
  }
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      ...corsHeaders(origin),
    },
  });
}

function errorResponse(message, status, origin) {
  return jsonResponse({ error: message }, status, origin);
}

async function parseJSON(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
