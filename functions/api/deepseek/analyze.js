/**
 * Cloudflare Pages Function: DeepSeek 通用分析
 * 路径: /api/deepseek/analyze
 * API key 存储在 Pages Secret 中（DEEPSEEK_API_KEY），不进代码
 */

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DEEPSEEK_API_KEY) {
    return jsonResponse({ error: '服务端未配置 DEEPSEEK_API_KEY' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: '请求体不是合法 JSON' }, 400);
  }

  const { prompt, pdfText } = body || {};
  if (!pdfText || typeof pdfText !== 'string') {
    return jsonResponse({ error: '缺少 pdfText 参数' }, 400);
  }
  if (pdfText.length > 100000) {
    return jsonResponse({ error: 'PDF 文本过长（最大 100KB）' }, 400);
  }

  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: (prompt || '') + pdfText }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return jsonResponse({ error: `DeepSeek API 错误: ${response.status}`, detail: errText }, response.status);
    }

    const result = await response.json();
    return jsonResponse(result, 200);
  } catch (err) {
    return jsonResponse({ error: 'AI 服务调用失败: ' + err.message }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      ...corsHeaders(),
    },
  });
}
