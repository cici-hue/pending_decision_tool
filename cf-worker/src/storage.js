/**
 * R2 对象存储辅助函数
 * 用于存储用户上传的图片、PDF 等文件
 */

/**
 * 上传文件到 R2
 * @param {R2Bucket} bucket
 * @param {string} key 文件 key（路径）
 * @param {ArrayBuffer|ReadableStream|string} body
 * @param {string} contentType
 * @returns {Promise<R2Object>}
 */
export async function uploadFile(bucket, key, body, contentType) {
  return await bucket.put(key, body, {
    httpMetadata: {
      contentType,
    },
  });
}

/**
 * 从 R2 下载文件
 * @param {R2Bucket} bucket
 * @param {string} key
 * @returns {Promise<R2ObjectBody|null>}
 */
export async function downloadFile(bucket, key) {
  return await bucket.get(key);
}

/**
 * 删除 R2 文件
 * @param {R2Bucket} bucket
 * @param {string} key
 * @returns {Promise<void>}
 */
export async function deleteFile(bucket, key) {
  await bucket.delete(key);
}

/**
 * 生成唯一文件名
 * @param {string} originalName
 * @returns {string}
 */
export function generateUniqueKey(type, originalName) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 11);
  const ext = originalName.split('.').pop().toLowerCase();
  return `${type}/${timestamp}-${random}.${ext}`;
}

/**
 * 验证文件类型
 * @param {string} contentType
 * @param {string} filename
 * @returns {boolean}
 */
export function isValidFileType(contentType, filename) {
  const allowedTypes = /jpeg|jpg|png|gif|webp|pdf/;
  const extOk = allowedTypes.test(filename.toLowerCase());
  const mimeOk = allowedTypes.test(contentType);
  return extOk && mimeOk;
}
