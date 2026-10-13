import 'server-only';

import type { ExecuteValues, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getMySqlPool, withMySqlTransaction } from '@/lib/server/db';

type SqlResult = Record<string, unknown>[];
export type SqlRunner = (
  strings: TemplateStringsArray,
  ...parameters: unknown[]
) => Promise<SqlResult>;

function createSqlRunner(
  execute: (statement: string, values: ExecuteValues[]) => Promise<[unknown, unknown]>,
): SqlRunner {
  return async (strings, ...parameters) => {
    let statement = strings[0];
    const values: ExecuteValues[] = [];

    for (let index = 0; index < parameters.length; index += 1) {
      const parameter = parameters[index];
      if (Array.isArray(parameter)) {
        if (parameter.length === 0) {
          throw new Error('An empty list cannot be used as a SQL parameter.');
        }
        statement += parameter.map(() => '?').join(', ');
        if (!parameter.every(isExecuteValue)) {
          throw new Error('A SQL list parameter contains an unsupported value.');
        }
        values.push(...parameter);
      } else {
        if (!isExecuteValue(parameter)) {
          throw new Error('A SQL parameter has an unsupported value.');
        }
        statement += '?';
        values.push(parameter);
      }
      statement += strings[index + 1];
    }

    const [result] = await execute(statement, values);
    if (Array.isArray(result)) {
      return result as (RowDataPacket & Record<string, unknown>)[];
    }

    const header = result as ResultSetHeader;
    return [{
      affectedRows: header.affectedRows,
      insertId: header.insertId,
    }];
  };
}

function isExecuteValue(value: unknown): value is ExecuteValues {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'boolean' ||
    value instanceof Date ||
    Buffer.isBuffer(value) ||
    value instanceof Uint8Array
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isExecuteValue);
  if (typeof value === 'object') {
    return Object.values(value).every(isExecuteValue);
  }
  return false;
}

const sql = createSqlRunner((statement, values) =>
  getMySqlPool().execute(statement, values));

export async function withSqlTransaction<T>(
  callback: (transactionSql: SqlRunner) => Promise<T>,
): Promise<T> {
  return withMySqlTransaction((connection) =>
    callback(createSqlRunner((statement, values) =>
      connection.execute(statement, values))));
}

export default sql;
