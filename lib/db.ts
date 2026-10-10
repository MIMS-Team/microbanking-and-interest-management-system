import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getMySqlPool } from './server/db';
export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[]; insertId?: number; affectedRows?: number }>;
}
export interface Database extends Queryable {
  transaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
/** Numbered bindings are an application convention. SQL is native MySQL. */
export function bind(sql: string, params: unknown[]) {
  const values: unknown[] = [];
  const statement = sql.replace(/'(?:(?:'')|[^'])*'|`[^`]*`|\$(\d+)/g, (token, index) => {
    if (!index) return token;
    const offset = Number(index) - 1;
    if (offset >= params.length) throw new Error('Missing SQL parameter ' + index);
    const value=params[offset];
    values.push(typeof value==='string' && /^\d{4}-\d{2}-\d{2}T/.test(value) ? value.replace('T',' ').replace(/Z$/,'') : value);
    return '?';
  });
  return {statement, values: values.length ? values : params};
}
function connectionQueries(connection: Pick<PoolConnection, 'query'>): Queryable {
  return {query: async <T>(sql: string, params: unknown[] = []) => {
    const {statement, values} = bind(sql, params);
    const [result] = await connection.query(statement, values);
    if (Array.isArray(result)) return {rows: result as T[]};
    const header = result as ResultSetHeader;
    return {rows: (header.insertId ? [{id:header.insertId}] : []) as T[], insertId: header.insertId, affectedRows: header.affectedRows};
  }};
}
/** Runtime never creates schemas or seeds. Auth and banking share this pool. */
export async function getDb(): Promise<Database> {
  const pool = getMySqlPool();
  return {
    ...connectionQueries(pool),
    transaction: async <T>(work: (tx: Queryable) => Promise<T>) => {
      const connection = await pool.getConnection();
      try {
        await connection.query("SET time_zone = '+00:00'");
        await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
        await connection.beginTransaction();
        const result = await work(connectionQueries(connection));
        await connection.commit();
        return result;
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
    close: () => pool.end(),
  };
}
export const db = {
  query: async <T = RowDataPacket>(sql: string, params: unknown[] = []) => (await getDb()).query<T>(sql, params),
  transaction: async <T>(work: (tx: Queryable) => Promise<T>) => (await getDb()).transaction(work),
};
