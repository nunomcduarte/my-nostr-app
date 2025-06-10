import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getFollowerCount, type NostrClient } from './getFollowerCount';

describe('getFollowerCount', () => {
  let mockNostr: NostrClient;

  beforeEach(() => {
    mockNostr = {
      query: vi.fn(),
    };
  });

  const validPubkey = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

  it('returns correct follower count for valid pubkey', async () => {
    const mockEvents = [
      { pubkey: 'follower1'.padEnd(64, '0'), kind: 3 },
      { pubkey: 'follower2'.padEnd(64, '0'), kind: 3 },
      { pubkey: 'follower3'.padEnd(64, '0'), kind: 3 },
    ];

    vi.mocked(mockNostr.query).mockResolvedValue(mockEvents);

    const count = await getFollowerCount(mockNostr, validPubkey);

    expect(count).toBe(3);
    expect(mockNostr.query).toHaveBeenCalledWith(
      [{ kinds: [3], '#p': [validPubkey], limit: 1000 }],
      { signal: expect.any(AbortSignal) }
    );
  });

  it('deduplicates followers correctly', async () => {
    const mockEvents = [
      { pubkey: 'follower1'.padEnd(64, '0'), kind: 3 },
      { pubkey: 'follower1'.padEnd(64, '0'), kind: 3 }, // Duplicate
      { pubkey: 'follower2'.padEnd(64, '0'), kind: 3 },
    ];

    vi.mocked(mockNostr.query).mockResolvedValue(mockEvents);

    const count = await getFollowerCount(mockNostr, validPubkey);

    expect(count).toBe(2);
  });

  it('returns 0 for no followers', async () => {
    vi.mocked(mockNostr.query).mockResolvedValue([]);

    const count = await getFollowerCount(mockNostr, validPubkey);

    expect(count).toBe(0);
  });

  it('throws error for invalid pubkey format', async () => {
    await expect(getFollowerCount(mockNostr, 'invalid')).rejects.toThrow(
      'Invalid pubkey format. Expected 64 character hex string.'
    );
  });

  it('accepts custom timeout and limit options', async () => {
    vi.mocked(mockNostr.query).mockResolvedValue([]);

    await getFollowerCount(mockNostr, validPubkey, {
      timeout: 10000,
      limit: 500,
    });

    expect(mockNostr.query).toHaveBeenCalledWith(
      [{ kinds: [3], '#p': [validPubkey], limit: 500 }],
      { signal: expect.any(AbortSignal) }
    );
  });

  it('handles external abort signal', async () => {
    const controller = new AbortController();
    vi.mocked(mockNostr.query).mockResolvedValue([]);

    await getFollowerCount(mockNostr, validPubkey, {
      signal: controller.signal,
    });

    expect(mockNostr.query).toHaveBeenCalledWith(
      [{ kinds: [3], '#p': [validPubkey], limit: 1000 }],
      { signal: expect.any(AbortSignal) }
    );
  });

  it('throws timeout error when query times out', async () => {
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    vi.mocked(mockNostr.query).mockRejectedValue(abortError);

    await expect(getFollowerCount(mockNostr, validPubkey, { timeout: 1000 })).rejects.toThrow(
      'Follower count query timed out after 1000ms'
    );
  });

  it('preserves other errors', async () => {
    const customError = new Error('Network error');
    vi.mocked(mockNostr.query).mockRejectedValue(customError);

    await expect(getFollowerCount(mockNostr, validPubkey)).rejects.toThrow('Network error');
  });
});