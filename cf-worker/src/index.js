/**
 * Cloudflare Worker - DeepSeek API 代理
 * API key 仅存储在 Cloudflare Secrets 中，从不暴露到前端
 *
 * 部署步骤：
 * 1. cd cf-worker
 * 2. npm install
 * 3. npx wrangler login
 * 4. npx wrangler secret put DEEPSEEK_API_KEY  (粘贴你的 DeepSeek key)
 * 5. npm run deploy
 */

// 简单的内存速率限制（每个 IP 每分钟最多 20 次）
const rateLimit = new Map();
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 20;

function checkRateLimit(ip) {
  const now = Date.now();
  if (!rateLimit.has(ip)) {
    rateLimit.set(ip, []);
  }
  const timestamps = rateLimit.get(ip).filter(t => now - t < RATE_WINDOW_MS);
  if (timestamps.length >= RATE_MAX) {
    return false;
  }
  timestamps.push(now);
  rateLimit.set(ip, timestamps);
  return true;
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(data, status = 200, origin = '*') {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
    },
  });
}

async function callDeepSeek(env, prompt, pdfText, useJsonMode) {
  const body = {
    model: env.DEEPSEEK_MODEL || 'deepseek-chat',
    messages: [
      {
        role: 'user',
        content: prompt + pdfText,
      },
    ],
  };

  if (useJsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const response = await fetch(
    env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek API 错误 ${response.status}: ${errorText}`);
  }

  return await response.json();
}

async function handleExtract(request, env, origin) {
  const { prompt, pdfText } = await request.json();

  if (!pdfText || typeof pdfText !== 'string') {
    return jsonResponse({ error: '缺少 pdfText 参数' }, 400, origin);
  }

  if (pdfText.length > 100000) {
    return jsonResponse({ error: 'PDF 文本过长（最大 100KB）' }, 400, origin);
  }

  const result = await callDeepSeek(env, prompt, pdfText, true);
  return jsonResponse(result, 200, origin);
}

async function handleAnalyze(request, env, origin) {
  const { prompt, pdfText } = await request.json();

  if (!pdfText || typeof pdfText !== 'string') {
    return jsonResponse({ error: '缺少 pdfText 参数' }, 400, origin);
  }

  if (pdfText.length > 100000) {
    return jsonResponse({ error: 'PDF 文本过长（最大 100KB）' }, 400, origin);
  }

  const result = await callDeepSeek(env, prompt, pdfText, false);
  return jsonResponse(result, 200, origin);
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '*';
    const allowedOrigin = env.ALLOWED_ORIGIN || '*';
    const corsOrigin = allowedOrigin === '*' ? '*' : origin;

    // CORS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(corsOrigin),
      });
    }

    const url = new URL(request.url);
    const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';

    // 速率限制
    if (!checkRateLimit(clientIp)) {
      return jsonResponse({ error: '请求过于频繁，请稍后再试' }, 429, corsOrigin);
    }

    // 健康检查
    if (url.pathname === '/' || url.pathname === '/health') {
      return jsonResponse({
        status: 'ok',
        service: 'deepseek-proxy',
        timestamp: new Date().toISOString(),
      }, 200, corsOrigin);
    }

    // 仅允许 POST 请求到 API 端点
    if (request.method !== 'POST') {
      return jsonResponse({ error: '仅支持 POST 请求' }, 405, corsOrigin);
    }

    // 检查 API key 是否配置
    if (!env.DEEPSEEK_API_KEY) {
      return jsonResponse({ error: '服务端未配置 DEEPSEEK_API_KEY' }, 500, corsOrigin);
    }

    try {
      if (url.pathname === '/api/deepseek/extract') {
        return await handleExtract(request, env, corsOrigin);
      }
      if (url.pathname === '/api/deepseek/analyze') {
        return await handleAnalyze(request, env, corsOrigin);
      }
      return jsonResponse({ error: '路径不存在' }, 404, corsOrigin);
    } catch (error) {
      console.error('处理请求失败:', error.message);
      return jsonResponse({
        error: 'AI 服务调用失败',
        message: error.message,
      }, 500, corsOrigin);
    }
  },
};
