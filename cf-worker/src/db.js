/**
 * D1 数据库操作辅助函数
 * D1 是 Cloudflare 的 SQLite 数据库，使用标准 SQL 语法
 */

/**
 * 执行 SELECT 查询，返回多行
 * @param {D1Database} db
 * @param {string} sql
 * @param {any[]} params
 * @returns {Promise<any[]>}
 */
export async function queryAll(db, sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    const result = await stmt.bind(...params).all();
    return result.results || [];
  } catch (error) {
    console.error('queryAll error:', error.message, { sql, params });
    throw error;
  }
}

/**
 * 执行 SELECT 查询，返回单行
 * @param {D1Database} db
 * @param {string} sql
 * @param {any[]} params
 * @returns {Promise<any|null>}
 */
export async function queryFirst(db, sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    const result = await stmt.bind(...params).first();
    return result || null;
  } catch (error) {
    console.error('queryFirst error:', error.message, { sql, params });
    throw error;
  }
}

/**
 * 执行 INSERT/UPDATE/DELETE，返回影响行数
 * @param {D1Database} db
 * @param {string} sql
 * @param {any[]} params
 * @returns {Promise<{success: boolean, meta: any}>}
 */
export async function run(db, sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    const result = await stmt.bind(...params).run();
    return { success: true, meta: result };
  } catch (error) {
    console.error('run error:', error.message, { sql, params });
    throw error;
  }
}

/**
 * 执行多条 SQL 插入（用于批量）
 * @param {D1Database} db
 * @param {string} sql
 * @param {any[][]} paramsArray
 * @returns {Promise<void>}
 */
export async function runBatch(db, sql, paramsArray) {
  try {
    const stmt = db.prepare(sql);
    const batch = paramsArray.map(params => stmt.bind(...params));
    await db.batch(batch);
  } catch (error) {
    console.error('runBatch error:', error.message);
    throw error;
  }
}
