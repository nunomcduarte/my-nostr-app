import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getUserAnalytics, getUserMetricsSummary, compareUsers, type NostrClient } from './getUserAnalytics';

// Mock all the individual metric functions
vi.mock('./getFollowerCount', () => ({
  getFollowerCount: vi.fn()
}));

vi.mock('./getLikeCount', () => ({
  getLikeCount: vi.fn()
}));

vi.mock('./getReplyCount', () => ({
  getReplyCount: vi.fn()
}));

vi.mock('./getRepostCount', () => ({
  getRepostCount: vi.fn()
}));

vi.mock('./getZapCount', () => ({
  getZapCount: vi.fn()
}));

import { getFollowerCount } from './getFollowerCount';
import { getLikeCount } from './getLikeCount';
import { getReplyCount } from './getReplyCount';
import { getRepostCount } from './getRepostCount';
import { getZapCount } from './getZapCount';

describe('getUserAnalytics', () => {
  let mockNostr: NostrClient;

  beforeEach(() => {
    mockNostr = {
      query: vi.fn(),
    };
    vi.clearAllMocks();
  });

  const validPubkey = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

  it('returns comprehensive analytics for a valid pubkey', async () => {
    // Mock user's notes
    const mockNotes = [
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 1000, id: 'note1' },
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 2000, id: 'note2' },
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 3000, id: 'note3' },
    ];

    vi.mocked(mockNostr.query).mockResolvedValue(mockNotes);

    // Mock all the individual metric functions
    vi.mocked(getFollowerCount).mockResolvedValue(150);
    vi.mocked(getLikeCount).mockResolvedValue(45);
    vi.mocked(getReplyCount).mockResolvedValue(23);
    vi.mocked(getRepostCount).mockResolvedValue(12);
    vi.mocked(getZapCount).mockResolvedValue({
      totalZaps: 8,
      totalSats: 5000,
      averageSats: 625
    });

    const analytics = await getUserAnalytics(mockNostr, validPubkey);

    expect(analytics).toEqual({
      pubkey: validPubkey,
      followerCount: 150,
      noteCount: 3,
      totalLikes: 45,
      totalReplies: 23,
      totalReposts: 12,
      zapSummary: {
        totalZaps: 8,
        totalSats: 5000,
        averageSats: 625
      },
      engagementRate: expect.closeTo(2933.33, 2), // (45+23+12+8)/3 * 100
      averageEngagement: expect.closeTo(29.33, 2), // (45+23+12+8)/3
      totalEngagement: 88, // 45+23+12+8
      metrics: {
        followers: 150,
        notes: 3,
        likes: 45,
        replies: 23,
        reposts: 12,
        zaps: 8,
        sats: 5000,
      }
    });
  });

  it('handles user with no notes', async () => {
    vi.mocked(mockNostr.query).mockResolvedValue([]);
    vi.mocked(getFollowerCount).mockResolvedValue(10);
    vi.mocked(getLikeCount).mockResolvedValue(0);
    vi.mocked(getReplyCount).mockResolvedValue(0);
    vi.mocked(getRepostCount).mockResolvedValue(0);
    vi.mocked(getZapCount).mockResolvedValue({
      totalZaps: 0,
      totalSats: 0,
      averageSats: 0
    });

    const analytics = await getUserAnalytics(mockNostr, validPubkey);

    expect(analytics.noteCount).toBe(0);
    expect(analytics.engagementRate).toBe(0);
    expect(analytics.averageEngagement).toBe(0);
    expect(analytics.totalEngagement).toBe(0);
  });

  it('throws error for invalid pubkey format', async () => {
    await expect(getUserAnalytics(mockNostr, 'invalid')).rejects.toThrow(
      'Invalid pubkey format. Expected 64 character hex string.'
    );
  });

  it('passes options correctly to individual functions', async () => {
    vi.mocked(mockNostr.query).mockResolvedValue([
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 1000, id: 'note1' }
    ]);

    vi.mocked(getFollowerCount).mockResolvedValue(10);
    vi.mocked(getLikeCount).mockResolvedValue(5);
    vi.mocked(getReplyCount).mockResolvedValue(3);
    vi.mocked(getRepostCount).mockResolvedValue(2);
    vi.mocked(getZapCount).mockResolvedValue({
      totalZaps: 1,
      totalSats: 100,
      averageSats: 100
    });

    const options = {
      timeout: 20000,
      since: 1000,
      until: 2000,
      includeRootReplies: false,
      excludeSelfInteractions: false
    };

    await getUserAnalytics(mockNostr, validPubkey, options);

    expect(getFollowerCount).toHaveBeenCalledWith(mockNostr, validPubkey, {
      timeout: 20000,
      signal: expect.any(AbortSignal),
      limit: 2000
    });

    expect(getLikeCount).toHaveBeenCalledWith(mockNostr, validPubkey, {
      timeout: 20000,
      signal: expect.any(AbortSignal),
      since: 1000,
      until: 2000,
      limit: 10000
    });

    expect(getReplyCount).toHaveBeenCalledWith(mockNostr, validPubkey, {
      timeout: 20000,
      signal: expect.any(AbortSignal),
      since: 1000,
      until: 2000,
      includeRootReplies: false,
      limit: 5000
    });

    expect(getRepostCount).toHaveBeenCalledWith(mockNostr, validPubkey, {
      timeout: 20000,
      signal: expect.any(AbortSignal),
      since: 1000,
      until: 2000,
      excludeSelfReposts: false,
      limit: 3000
    });

    expect(getZapCount).toHaveBeenCalledWith(mockNostr, validPubkey, {
      timeout: 20000,
      signal: expect.any(AbortSignal),
      since: 1000,
      until: 2000,
      excludeSelfZaps: false,
      limit: 5000
    });
  });

  it('handles timeout errors', async () => {
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    vi.mocked(mockNostr.query).mockRejectedValue(abortError);

    await expect(getUserAnalytics(mockNostr, validPubkey, { timeout: 1000 })).rejects.toThrow(
      'User analytics query timed out after 6000ms'
    );
  });

  it('preserves other errors', async () => {
    const customError = new Error('Network error');
    vi.mocked(mockNostr.query).mockRejectedValue(customError);

    await expect(getUserAnalytics(mockNostr, validPubkey)).rejects.toThrow('Network error');
  });
});

describe('getUserMetricsSummary', () => {
  let mockNostr: NostrClient;

  beforeEach(() => {
    mockNostr = {
      query: vi.fn(),
    };
    vi.clearAllMocks();
  });

  const validPubkey = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

  it('returns simplified metrics summary', async () => {
    vi.mocked(mockNostr.query).mockResolvedValue([
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 1000, id: 'note1' }
    ]);

    vi.mocked(getFollowerCount).mockResolvedValue(100);
    vi.mocked(getLikeCount).mockResolvedValue(50);
    vi.mocked(getReplyCount).mockResolvedValue(25);
    vi.mocked(getRepostCount).mockResolvedValue(10);
    vi.mocked(getZapCount).mockResolvedValue({
      totalZaps: 5,
      totalSats: 2000,
      averageSats: 400
    });

    const summary = await getUserMetricsSummary(mockNostr, validPubkey);

    expect(summary).toEqual({
      followers: 100,
      notes: 1,
      totalEngagement: 90, // 50+25+10+5
      totalSats: 2000
    });
  });
});

describe('compareUsers', () => {
  let mockNostr: NostrClient;

  beforeEach(() => {
    mockNostr = {
      query: vi.fn(),
    };
    vi.clearAllMocks();
  });

  const pubkey1 = '1111111111111111111111111111111111111111111111111111111111111111';
  const pubkey2 = '2222222222222222222222222222222222222222222222222222222222222222';

  it('compares two users correctly', async () => {
    // Mock notes for both users
    vi.mocked(mockNostr.query)
      .mockResolvedValueOnce([{ pubkey: pubkey1, kind: 1, tags: [], created_at: 1000, id: 'note1' }])
      .mockResolvedValueOnce([{ pubkey: pubkey2, kind: 1, tags: [], created_at: 1000, id: 'note2' }]);

    // Mock metrics for user1 (stronger)
    vi.mocked(getFollowerCount)
      .mockResolvedValueOnce(200) // user1
      .mockResolvedValueOnce(100); // user2

    vi.mocked(getLikeCount)
      .mockResolvedValueOnce(60) // user1
      .mockResolvedValueOnce(30); // user2

    vi.mocked(getReplyCount)
      .mockResolvedValueOnce(40) // user1
      .mockResolvedValueOnce(20); // user2

    vi.mocked(getRepostCount)
      .mockResolvedValueOnce(20) // user1
      .mockResolvedValueOnce(10); // user2

    vi.mocked(getZapCount)
      .mockResolvedValueOnce({ totalZaps: 10, totalSats: 5000, averageSats: 500 }) // user1
      .mockResolvedValueOnce({ totalZaps: 5, totalSats: 2000, averageSats: 400 }); // user2

    const comparison = await compareUsers(mockNostr, pubkey1, pubkey2);

    expect(comparison.user1.pubkey).toBe(pubkey1);
    expect(comparison.user2.pubkey).toBe(pubkey2);
    expect(comparison.comparison.followerRatio).toBe(2); // 200/100
    expect(comparison.comparison.engagementRatio).toBe(2); // 130/65
    expect(comparison.comparison.satsRatio).toBe(2.5); // 5000/2000
    expect(comparison.comparison.winner).toBe('user1');
  });

  it('handles edge case with zero values', async () => {
    vi.mocked(mockNostr.query)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    vi.mocked(getFollowerCount)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    vi.mocked(getLikeCount)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    vi.mocked(getReplyCount)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    vi.mocked(getRepostCount)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    vi.mocked(getZapCount)
      .mockResolvedValueOnce({ totalZaps: 0, totalSats: 0, averageSats: 0 })
      .mockResolvedValueOnce({ totalZaps: 0, totalSats: 0, averageSats: 0 });

    const comparison = await compareUsers(mockNostr, pubkey1, pubkey2);

    expect(comparison.comparison.followerRatio).toBe(1);
    expect(comparison.comparison.engagementRatio).toBe(1);
    expect(comparison.comparison.satsRatio).toBe(1);
    expect(comparison.comparison.winner).toBe('tie');
  });
});