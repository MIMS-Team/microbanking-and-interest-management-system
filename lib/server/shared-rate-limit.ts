import { createHash, randomBytes } from 'node:crypto';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { RateLimitResult } from './rate-limit';

/** Bucket locks serialize attempts across processes; time comes from MySQL. */
export async function sharedRateLimit(pool: Pool, keys: string[], limit: number, windowMs: number,maxBuckets=100000): Promise<RateLimitResult> {
  if(!Number.isInteger(maxBuckets)||maxBuckets<1||maxBuckets>100000||!Number.isInteger(limit)||limit<1||limit>500||!Number.isInteger(windowMs)||windowMs<1000||windowMs>3600000)throw new Error('Invalid bounded limiter configuration.');
  const hashes = [...new Set(keys.map(key => createHash('sha256').update(key).digest('hex')))].sort();
  const connection = await pool.getConnection();
  try {
    await connection.query("SET time_zone='+00:00'");
    const [existing]=await connection.query<RowDataPacket[]>('SELECT key_hash FROM http_rate_buckets WHERE key_hash IN (?)',[hashes]);
    if(existing.length!==hashes.length){
      const [expired]=await connection.query<RowDataPacket[]>('SELECT key_hash FROM http_rate_buckets FORCE INDEX(rate_expiry) WHERE expires_at<UTC_TIMESTAMP(3) ORDER BY expires_at,key_hash LIMIT 100');
      // Autocommit one expired key at a time. Never hold the expiry-index locks
      // while acquiring multiple active bucket locks in the enforcement TX.
      for(const row of expired)await connection.query('DELETE FROM http_rate_buckets WHERE key_hash=? AND expires_at<UTC_TIMESTAMP(3)',[row.key_hash]);
    }
    await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await connection.beginTransaction();
    if(existing.length!==hashes.length){
      // Capacity is serialized only when creating buckets. Existing requests
      // lock only their own dimensions. Refuse growth instead of evicting live
      // protections, which would otherwise provide an attacker with a bypass.
      const [[guard]]=await connection.query<RowDataPacket[]>("SELECT name FROM database_guards WHERE name='http-rate-capacity' FOR UPDATE");
      if(!guard)throw new Error('Limiter capacity guard is unavailable.');
      const [[size]]=await connection.query<RowDataPacket[]>('SELECT COUNT(*) AS count FROM http_rate_buckets');
      const [current]=await connection.query<RowDataPacket[]>('SELECT key_hash FROM http_rate_buckets WHERE key_hash IN (?)',[hashes]);
      if(Number(size.count)+hashes.length-current.length>maxBuckets)throw new Error('Limiter store capacity exhausted.');
    }
    let remaining = limit, resetInSeconds = 1;
    for (const hash of hashes) {
      await connection.query(`INSERT INTO http_rate_buckets(key_hash,expires_at) VALUES(?,TIMESTAMPADD(MICROSECOND,?,UTC_TIMESTAMP(3)))
        ON DUPLICATE KEY UPDATE key_hash=VALUES(key_hash)`, [hash, windowMs * 1000]);
      await connection.query('SELECT key_hash FROM http_rate_buckets WHERE key_hash=? FOR UPDATE', [hash]);
      await connection.query('DELETE FROM http_rate_events WHERE key_hash=? AND occurred_at<=TIMESTAMPADD(MICROSECOND,?,UTC_TIMESTAMP(3))', [hash, -windowMs * 1000]);
      const [[row]] = await connection.query<RowDataPacket[]>(`SELECT COUNT(*) AS count,
        COALESCE(CEIL(TIMESTAMPDIFF(MICROSECOND,UTC_TIMESTAMP(3),TIMESTAMPADD(MICROSECOND,?,MIN(occurred_at)))/1000000),1) AS retry
        FROM http_rate_events WHERE key_hash=?`, [windowMs * 1000, hash]);
      remaining = Math.min(remaining, limit - Number(row.count));
      if(Number(row.count)>=limit)resetInSeconds = Math.max(resetInSeconds, Number(row.retry));
    }
    if (remaining > 0) for (const hash of hashes) {
      await connection.query('INSERT INTO http_rate_events VALUES(?,UTC_TIMESTAMP(3),?)', [hash, randomBytes(16)]);
      await connection.query('UPDATE http_rate_buckets SET expires_at=TIMESTAMPADD(MICROSECOND,?,UTC_TIMESTAMP(3)),attempts=attempts+1 WHERE key_hash=?', [windowMs * 1000, hash]);
    }
    if(remaining>0)await connection.commit();else await connection.rollback();
    return { allowed: remaining > 0, limit, remaining: Math.max(0, remaining - 1), resetInSeconds };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
