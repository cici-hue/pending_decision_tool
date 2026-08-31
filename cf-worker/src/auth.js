/**
 * 认证模块
 * - 使用 Web Crypto API (PBKDF2) 进行密码哈希
 * - 使用 jose 库进行 JWT 签发和验证
 */

import { SignJWT, jwtVerify } from 'jose';

// 密码哈希参数
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_HASH = 'SHA-256';
const SALT_BYTES = 16;
const KEY_BITS = 256;

/**
 * 使用 PBKDF2 哈希密码
 * @param {string} password
 * @returns {Promise<string>} 格式: "pbkdf2$iterations$salt_b64$hash_b64"
 */
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2${PBKDF2_ITERATIONS}$${b64url(salt)}$${b64url(key)}`;
}

/**
 * 验证密码
 * @param {string} password
 * @param {string} stored 存储的哈希值
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, stored) {
  try {
    const parts = stored.split('$');
    if (parts.length !== 4 || parts[0] !== 'pbkdf2') {
      return false;
    }
    const iterations = parseInt(parts[1], 10);
    const salt = b64urlDecode(parts[2]);
    const expectedHash = b64urlDecode(parts[3]);
    const actualHash = await deriveKey(password, salt, iterations);
    return constantTimeEqual(expectedHash, actualHash);
  } catch (error) {
    console.error('verifyPassword error:', error.message);
    return false;
  }
}

async function deriveKey(password, salt, iterations) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: PBKDF2_HASH,
    },
    keyMaterial,
    KEY_BITS
  );
  return new Uint8Array(derivedBits);
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

function b64url(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * 签发 JWT
 * @param {object} payload { id, username, role }
 * @param {string} secret
 * @param {number} expiresInSeconds
 * @returns {Promise<string>}
 */
export async function signJWT(payload, secret, expiresInSeconds = 86400) {
  const secretKey = new TextEncoder().encode(secret);
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSeconds)
    .sign(secretKey);
}

/**
 * 验证 JWT
 * @param {string} token
 * @param {string} secret
 * @returns {Promise<object|null>} payload 或 null（无效时）
 */
export async function verifyJWT(token, secret) {
  try {
    const secretKey = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, secretKey);
    return payload;
  } catch (error) {
    return null;
  }
}

/**
 * 从请求头中提取 token
 * @param {Request} request
 * @returns {string|null}
 */
export function extractToken(request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  return parts.length === 2 ? parts[1] : null;
}

/**
 * 鉴权中间件 - 验证 token 并返回用户信息
 * @param {Request} request
 * @param {string} secret
 * @returns {Promise<{user: object} | {response: Response}>}
 */
export async function authenticate(request, secret) {
  const token = extractToken(request);
  if (!token) {
    return { response: new Response(JSON.stringify({ error: '未提供认证令牌' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    }) };
  }
  const payload = await verifyJWT(token, secret);
  if (!payload) {
    return { response: new Response(JSON.stringify({ error: '令牌无效或已过期' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    }) };
  }
  return { user: payload };
}

/**
 * 角色检查中间件
 * @param {object} user
 * @param {string[]} roles
 * @returns {Response|null} 失败时返回 Response，成功时返回 null
 */
export function requireRole(user, roles) {
  if (!roles.includes(user.role)) {
    return new Response(JSON.stringify({ error: '权限不足' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return null;
}
