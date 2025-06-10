import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getNoteLikeCount, type NostrClient } from './getNoteLikeCount';

describe('getNoteLikeCount', () => {
  let mockNostr: NostrClient;

  beforeEach(() => {
    mockNostr = {
      query: vi.fn(),
    };
  });

  const validNoteId = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

  it('returns correct like count for a specific note', async () => {
    const mockLikes = [
      { pubkey: 'liker1'.padEnd(64, '0'), kind: 7, tags: [['e', validNoteId]], created_at: 3000 },
      { pubkey: 'liker2'.padEnd(64, '0'), kind: 7, tags: [['e', validNoteId]], created_at: 3001 },
      { pubkey: 'liker3'.padEnd(64, '0'), kind: 7, tags: [['e', validNoteId]], created_at: 3002 },
    ];

    vi.mocked(mockNostr.query).mockResolvedValue(mockLikes);

    const count = await getNoteLikeCount(mockNostr, validNoteId);

    expect(count).toBe(3);
    expect(mockNostr.query).toHaveBeenCalledWith(
      [{ kinds: [7], '#e': [validNoteId], limit: 1000 }],
      { signal: expect.any(AbortSignal) }
    );
  });

  it('deduplicates multiple likes from same user', async () => {
    const mockLikes = [
      { pubkey: 'liker1'.padEnd(64, '0'), kind: 7, tags: [['e', validNoteId]], created_at: 3000 },
      { pubkey: 'liker1'.padEnd(64, '0'), kind: 7, tags: [['e', validNoteId]], created_at: 3001 }, // Duplicate
      { pubkey: 'liker2'.padEnd(64, '0'), kind: 7, tags: [['e', validNoteId]], created_at: 3002 },
    ];

    vi.mocked(mockNostr.query).mockResolvedValue(mockLikes);

    const count = await getNoteLikeCount(mockNostr, validNoteId);

    expect(count).toBe(2); // Only 2 unique likers
  });

  it('returns 0 when note has no likes', async () => {
    vi.mocked(mockNostr.query).mockResolvedValue([]);

    const count = await getNoteLikeCount(mockNostr, validNoteId);

    expect(count).toBe(0);
  });

  it('throws error for invalid note ID format', async () => {
    await expect(getNoteLikeCount(mockNostr, 'invalid')).rejects.toThrow(
      'Invalid note ID format. Expected 64 character hex string.'
    );
  });

  it('accepts custom timeout and limit options', async () => {
    vi.mocked(mockNostr.query).mockResolvedValue([]);

    await getNoteLikeCount(mockNostr, validNoteId, {
      timeout: 8000,
      limit: 500,
    });

    expect(mockNostr.query).toHaveBeenCalledWith(
      [{ kinds: [7], '#e': [validNoteId], limit: 500 }],
      { signal: expect.any(AbortSignal) }
    );
  });

  it('accepts since and until options', async () => {
    vi.mocked(mockNostr.query).mockResolvedValue([]);

    await getNoteLikeCount(mockNostr, validNoteId, {
      since: 1000,
      until: 2000,
    });

    expect(mockNostr.query).toHaveBeenCalledWith(
      [{ kinds: [7], '#e': [validNoteId], limit: 1000, since: 1000, until: 2000 }],
      { signal: expect.any(AbortSignal) }
    );
  });

  it('handles external abort signal', async () => {
    const controller = new AbortController();
    vi.mocked(mockNostr.query).mockResolvedValue([]);

    await getNoteLikeCount(mockNostr, validNoteId, {
      signal: controller.signal,
    });

    expect(mockNostr.query).toHaveBeenCalledWith(
      expect.any(Array),
      { signal: expect.any(AbortSignal) }
    );
  });

  it('throws timeout error when query times out', async () => {
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    vi.mocked(mockNostr.query).mockRejectedValue(abortError);

    await expect(getNoteLikeCount(mockNostr, validNoteId, { timeout: 1000 })).rejects.toThrow(
      'Note like count query timed out after 1000ms'
    );
  });

  it('preserves other errors', async () => {
    const customError = new Error('Network error');
    vi.mocked(mockNostr.query).mockRejectedValue(customError);

    await expect(getNoteLikeCount(mockNostr, validNoteId)).rejects.toThrow('Network error');
  });

  it('ignores likes with e-tags that do not reference the target note', async () => {
    const otherNoteId = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
    const mockLikes = [
      { pubkey: 'liker1'.padEnd(64, '0'), kind: 7, tags: [['e', validNoteId]], created_at: 3000 }, // Valid
      { pubkey: 'liker2'.padEnd(64, '0'), kind: 7, tags: [['e', otherNoteId]], created_at: 3001 }, // Invalid
    ];

    vi.mocked(mockNostr.query).mockResolvedValue(mockLikes);

    const count = await getNoteLikeCount(mockNostr, validNoteId);

    expect(count).toBe(1); // Only the valid like is counted
  });

  it('handles likes with multiple e-tags correctly', async () => {
    const otherNoteId = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
    const mockLikes = [
      { 
        pubkey: 'liker1'.padEnd(64, '0'), 
        kind: 7, 
        tags: [['e', validNoteId], ['e', otherNoteId]], 
        created_at: 3000 
      },
    ];

    vi.mocked(mockNostr.query).mockResolvedValue(mockLikes);

    const count = await getNoteLikeCount(mockNostr, validNoteId);

    expect(count).toBe(1); // Counts the like since it references our note
  });

  it('handles likes with no e-tags', async () => {
    const mockLikes = [
      { pubkey: 'liker1'.padEnd(64, '0'), kind: 7, tags: [['p', 'somepubkey']], created_at: 3000 }, // No e-tag
    ];

    vi.mocked(mockNostr.query).mockResolvedValue(mockLikes);

    const count = await getNoteLikeCount(mockNostr, validNoteId);

    expect(count).toBe(0); // No likes with valid e-tags
  });
});