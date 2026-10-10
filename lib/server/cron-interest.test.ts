import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../../app/api/cron/interest/route';

describe('Scheduled interest authorization', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each(['', 'incorrect-scheduler-secret'])('rejects invalid scheduler secrets (%s)', async secret => {
    vi.stubEnv('SCHEDULER_KEY', 'configured-scheduler-secret-with-more-than-32-characters');
    const response = await POST(new Request('http://localhost/api/cron/interest', {
      method: 'POST',
      headers: secret ? { authorization: `Bearer ${secret}` } : {},
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: 'A valid scheduler key is required.',
    });
  });
});
