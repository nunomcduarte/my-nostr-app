import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getLikeCount, type NostrClient } from './getLikeCount';

describe('getLikeCount', () => {
  let mockNostr: NostrClient;

  beforeEach(() => {
    mockNostr = {
      query: vi.fn(),
    };
  });

  const validPubkey = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

  it('returns correct like count for notes from valid pubkey', async () => {
    // Mock notes from the target user
    const mockNotes = [
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 1000, id: 'note1' },
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 2000, id: 'note2' },
    ];

    // Mock likes for those notes
    const mockLikes = [
      { pubkey: 'liker1'.padEnd(64, '0'), kind: 7, tags: [['e', 'note1']], created_at: 3000 },
      { pubkey: 'liker2'.padEnd(64, '0'), kind: 7, tags: [['e', 'note1']], created_at: 3001 },
      { pubkey: 'liker1'.padEnd(64, '0'), kind: 7, tags: [['e', 'note2']], created_at: 3002 },
    ];

    vi.mocked(mockNostr.query)
      .mockResolvedValueOnce(mockNotes) // First call for notes
      .mockResolvedValueOnce(mockLikes); // Second call for likes

    const count = await getLikeCount(mockNostr, validPubkey);

    expect(count).toBe(3); // 3 unique likes (2 for note1, 1 for note2)
    expect(mockNostr.query).toHaveBeenCalledTimes(2);
    
    // Check first call (notes query)
    expect(mockNostr.query).toHaveBeenNthCalledWith(1,
      [{ kinds: [1], authors: [validPubkey], limit: 1000 }],
      { signal: expect.any(AbortSignal) }
    );
    
    // Check second call (likes query)
    expect(mockNostr.query).toHaveBeenNthCalledWith(2,
      [{ kinds: [7], '#e': ['note1', 'note2'], limit: 5000 }],
      { signal: expect.any(AbortSignal) }
    );
  });

  it('deduplicates multiple likes from same user on same note', async () => {
    const mockNotes = [
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 1000, id: 'note1' },
    ];

    const mockLikes = [
      { pubkey: 'liker1'.padEnd(64, '0'), kind: 7, tags: [['e', 'note1']], created_at: 3000 },
      { pubkey: 'liker1'.padEnd(64, '0'), kind: 7, tags: [['e', 'note1']], created_at: 3001 }, // Duplicate
    ];

    vi.mocked(mockNostr.query)
      .mockResolvedValueOnce(mockNotes)
      .mockResolvedValueOnce(mockLikes);

    const count = await getLikeCount(mockNostr, validPubkey);

    expect(count).toBe(1); // Only 1 unique like (deduplicated)
  });

  it('returns 0 when user has no notes', async () => {
    vi.mocked(mockNostr.query)
      .mockResolvedValueOnce([]); // No notes found

    const count = await getLikeCount(mockNostr, validPubkey);

    expect(count).toBe(0);
    expect(mockNostr.query).toHaveBeenCalledTimes(1); // Only called once for notes
  });

  it('returns 0 when notes have no likes', async () => {
    const mockNotes = [
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 1000, id: 'note1' },
    ];

    vi.mocked(mockNostr.query)
      .mockResolvedValueOnce(mockNotes)
      .mockResolvedValueOnce([]); // No likes found

    const count = await getLikeCount(mockNostr, validPubkey);

    expect(count).toBe(0);
  });

  it('handles notes without valid IDs', async () => {
    const mockNotes = [
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 1000 }, // No id field
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 2000, id: '' }, // Empty id
    ];

    vi.mocked(mockNostr.query)
      .mockResolvedValueOnce(mockNotes);

    const count = await getLikeCount(mockNostr, validPubkey);

    expect(count).toBe(0);
    expect(mockNostr.query).toHaveBeenCalledTimes(1); // Only called once, no valid note IDs
  });

  it('throws error for invalid pubkey format', async () => {
    await expect(getLikeCount(mockNostr, 'invalid')).rejects.toThrow(
      'Invalid pubkey format. Expected 64 character hex string.'
    );
  });

  it('accepts custom timeout and limit options', async () => {
    const mockNotes = [
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 1000, id: 'note1' },
    ];

    vi.mocked(mockNostr.query)
      .mockResolvedValueOnce(mockNotes)
      .mockResolvedValueOnce([]);

    await getLikeCount(mockNostr, validPubkey, {
      timeout: 15000,
      limit: 2000,
    });

    expect(mockNostr.query).toHaveBeenNthCalledWith(2,
      [{ kinds: [7], '#e': ['note1'], limit: 2000 }],
      { signal: expect.any(AbortSignal) }
    );
  });

  it('accepts since and until options', async () => {
    const mockNotes = [
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 1000, id: 'note1' },
    ];

    vi.mocked(mockNostr.query)
      .mockResolvedValueOnce(mockNotes)
      .mockResolvedValueOnce([]);

    await getLikeCount(mockNostr, validPubkey, {
      since: 500,
      until: 2000,
    });

    // Check that since/until are passed to both queries
    expect(mockNostr.query).toHaveBeenNthCalledWith(1,
      [{ kinds: [1], authors: [validPubkey], limit: 1000, since: 500, until: 2000 }],
      { signal: expect.any(AbortSignal) }
    );

    expect(mockNostr.query).toHaveBeenNthCalledWith(2,
      [{ kinds: [7], '#e': ['note1'], limit: 5000, since: 500, until: 2000 }],
      { signal: expect.any(AbortSignal) }
    );
  });

  it('handles external abort signal', async () => {
    const controller = new AbortController();
    const mockNotes = [
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 1000, id: 'note1' },
    ];

    vi.mocked(mockNostr.query)
      .mockResolvedValueOnce(mockNotes)
      .mockResolvedValueOnce([]);

    await getLikeCount(mockNostr, validPubkey, {
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

    await expect(getLikeCount(mockNostr, validPubkey, { timeout: 1000 })).rejects.toThrow(
      'Like count query timed out after 1000ms'
    );
  });

  it('preserves other errors', async () => {
    const customError = new Error('Network error');
    vi.mocked(mockNostr.query).mockRejectedValue(customError);

    await expect(getLikeCount(mockNostr, validPubkey)).rejects.toThrow('Network error');
  });

  it('handles likes with multiple e-tags correctly', async () => {
    const mockNotes = [
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 1000, id: 'note1' },
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 2000, id: 'note2' },
    ];

    // Like that references multiple notes (e.g., quote repost that likes multiple things)
    const mockLikes = [
      { 
        pubkey: 'liker1'.padEnd(64, '0'), 
        kind: 7, 
        tags: [['e', 'note1'], ['e', 'note2'], ['e', 'other_note']], 
        created_at: 3000 
      },
    ];

    vi.mocked(mockNostr.query)
      .mockResolvedValueOnce(mockNotes)
      .mockResolvedValueOnce(mockLikes);

    const count = await getLikeCount(mockNostr, validPubkey);

    expect(count).toBe(2); // 2 likes (one for note1, one for note2)
  });

  it('ignores likes that reference unrelated notes', async () => {
    const mockNotes = [
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 1000, id: 'note1' },
    ];

    const mockLikes = [
      { pubkey: 'liker1'.padEnd(64, '0'), kind: 7, tags: [['e', 'note1']], created_at: 3000 }, // Valid
      { pubkey: 'liker2'.padEnd(64, '0'), kind: 7, tags: [['e', 'other_note']], created_at: 3001 }, // Invalid
    ];

    vi.mocked(mockNostr.query)
      .mockResolvedValueOnce(mockNotes)
      .mockResolvedValueOnce(mockLikes);

    const count = await getLikeCount(mockNostr, validPubkey);

    expect(count).toBe(1); // Only the valid like is counted
  });
});