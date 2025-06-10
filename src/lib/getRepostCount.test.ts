import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getRepostCount, type NostrClient } from './getRepostCount';

describe('getRepostCount', () => {
  let mockNostr: NostrClient;

  beforeEach(() => {
    mockNostr = {
      query: vi.fn(),
    };
  });

  const validPubkey = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  const reposterPubkey = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

  it('returns correct repost count for notes from valid pubkey', async () => {
    // Mock notes from the target user
    const mockNotes = [
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 1000, id: 'note1' },
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 2000, id: 'note2' },
    ];

    // Mock reposts of those notes
    const mockReposts = [
      { 
        pubkey: reposterPubkey, 
        kind: 6, 
        tags: [['e', 'note1'], ['p', validPubkey]], 
        created_at: 3000,
        id: 'repost1'
      },
      { 
        pubkey: reposterPubkey, 
        kind: 6, 
        tags: [['e', 'note1']], // Missing p-tag but still valid
        created_at: 3001,
        id: 'repost2'
      },
      { 
        pubkey: reposterPubkey, 
        kind: 6, 
        tags: [['e', 'note2'], ['p', validPubkey]], 
        created_at: 3002,
        id: 'repost3'
      },
    ];

    vi.mocked(mockNostr.query)
      .mockResolvedValueOnce(mockNotes) // First call for notes
      .mockResolvedValueOnce(mockReposts); // Second call for reposts

    const count = await getRepostCount(mockNostr, validPubkey);

    expect(count).toBe(3); // 3 unique reposts
    expect(mockNostr.query).toHaveBeenCalledTimes(2);
    
    // Check first call (notes query)
    expect(mockNostr.query).toHaveBeenNthCalledWith(1,
      [{ kinds: [1], authors: [validPubkey], limit: 1000 }],
      { signal: expect.any(AbortSignal) }
    );
    
    // Check second call (reposts query)
    expect(mockNostr.query).toHaveBeenNthCalledWith(2,
      [{ kinds: [6], '#e': ['note1', 'note2'], limit: 5000 }],
      { signal: expect.any(AbortSignal) }
    );
  });

  it('excludes self-reposts when excludeSelfReposts is true', async () => {
    const mockNotes = [
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 1000, id: 'note1' },
    ];

    const mockReposts = [
      { 
        pubkey: reposterPubkey, 
        kind: 6, 
        tags: [['e', 'note1']], 
        created_at: 3000,
        id: 'repost1'
      },
      { 
        pubkey: validPubkey, // Self-repost
        kind: 6, 
        tags: [['e', 'note1']], 
        created_at: 3001,
        id: 'self_repost'
      },
    ];

    vi.mocked(mockNostr.query)
      .mockResolvedValueOnce(mockNotes)
      .mockResolvedValueOnce(mockReposts);

    const count = await getRepostCount(mockNostr, validPubkey);

    expect(count).toBe(1); // Only the external repost, not the self-repost
  });

  it('includes self-reposts when excludeSelfReposts is false', async () => {
    const mockNotes = [
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 1000, id: 'note1' },
    ];

    const mockReposts = [
      { 
        pubkey: reposterPubkey, 
        kind: 6, 
        tags: [['e', 'note1']], 
        created_at: 3000,
        id: 'repost1'
      },
      { 
        pubkey: validPubkey, // Self-repost
        kind: 6, 
        tags: [['e', 'note1']], 
        created_at: 3001,
        id: 'self_repost'
      },
    ];

    vi.mocked(mockNostr.query)
      .mockResolvedValueOnce(mockNotes)
      .mockResolvedValueOnce(mockReposts);

    const count = await getRepostCount(mockNostr, validPubkey, {
      excludeSelfReposts: false
    });

    expect(count).toBe(2); // Both reposts included
  });

  it('returns 0 when user has no notes', async () => {
    vi.mocked(mockNostr.query)
      .mockResolvedValueOnce([]); // No notes found

    const count = await getRepostCount(mockNostr, validPubkey);

    expect(count).toBe(0);
    expect(mockNostr.query).toHaveBeenCalledTimes(1); // Only called once for notes
  });

  it('returns 0 when notes have no reposts', async () => {
    const mockNotes = [
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 1000, id: 'note1' },
    ];

    vi.mocked(mockNostr.query)
      .mockResolvedValueOnce(mockNotes)
      .mockResolvedValueOnce([]); // No reposts found

    const count = await getRepostCount(mockNostr, validPubkey);

    expect(count).toBe(0);
  });

  it('handles notes without valid IDs', async () => {
    const mockNotes = [
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 1000 }, // No id field
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 2000, id: '' }, // Empty id
    ];

    vi.mocked(mockNostr.query)
      .mockResolvedValueOnce(mockNotes);

    const count = await getRepostCount(mockNostr, validPubkey);

    expect(count).toBe(0);
    expect(mockNostr.query).toHaveBeenCalledTimes(1); // Only called once, no valid note IDs
  });

  it('throws error for invalid pubkey format', async () => {
    await expect(getRepostCount(mockNostr, 'invalid')).rejects.toThrow(
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

    await getRepostCount(mockNostr, validPubkey, {
      timeout: 15000,
      limit: 2000,
    });

    expect(mockNostr.query).toHaveBeenNthCalledWith(2,
      [{ kinds: [6], '#e': ['note1'], limit: 2000 }],
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

    await getRepostCount(mockNostr, validPubkey, {
      since: 500,
      until: 2000,
    });

    // Check that since/until are passed to both queries
    expect(mockNostr.query).toHaveBeenNthCalledWith(1,
      [{ kinds: [1], authors: [validPubkey], limit: 1000, since: 500, until: 2000 }],
      { signal: expect.any(AbortSignal) }
    );

    expect(mockNostr.query).toHaveBeenNthCalledWith(2,
      [{ kinds: [6], '#e': ['note1'], limit: 5000, since: 500, until: 2000 }],
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

    await getRepostCount(mockNostr, validPubkey, {
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

    await expect(getRepostCount(mockNostr, validPubkey, { timeout: 1000 })).rejects.toThrow(
      'Repost count query timed out after 1000ms'
    );
  });

  it('preserves other errors', async () => {
    const customError = new Error('Network error');
    vi.mocked(mockNostr.query).mockRejectedValue(customError);

    await expect(getRepostCount(mockNostr, validPubkey)).rejects.toThrow('Network error');
  });

  it('ignores reposts without e-tags', async () => {
    const mockNotes = [
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 1000, id: 'note1' },
    ];

    const mockReposts = [
      { 
        pubkey: reposterPubkey, 
        kind: 6, 
        tags: [['p', 'somepubkey']], // No e-tags
        created_at: 3000,
        id: 'not_a_repost'
      },
    ];

    vi.mocked(mockNostr.query)
      .mockResolvedValueOnce(mockNotes)
      .mockResolvedValueOnce(mockReposts);

    const count = await getRepostCount(mockNostr, validPubkey);

    expect(count).toBe(0); // No valid reposts
  });

  it('ignores reposts that reference unrelated notes', async () => {
    const mockNotes = [
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 1000, id: 'note1' },
    ];

    const mockReposts = [
      { 
        pubkey: reposterPubkey, 
        kind: 6, 
        tags: [['e', 'note1']], 
        created_at: 3000,
        id: 'valid_repost'
      },
      { 
        pubkey: reposterPubkey, 
        kind: 6, 
        tags: [['e', 'other_note']], // References different note
        created_at: 3001,
        id: 'unrelated_repost'
      },
    ];

    vi.mocked(mockNostr.query)
      .mockResolvedValueOnce(mockNotes)
      .mockResolvedValueOnce(mockReposts);

    const count = await getRepostCount(mockNostr, validPubkey);

    expect(count).toBe(1); // Only the valid repost
  });

  it('handles reposts without IDs gracefully', async () => {
    const mockNotes = [
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 1000, id: 'note1' },
    ];

    const mockReposts = [
      { 
        pubkey: reposterPubkey, 
        kind: 6, 
        tags: [['e', 'note1']], 
        created_at: 3000
        // No id field
      },
    ];

    vi.mocked(mockNostr.query)
      .mockResolvedValueOnce(mockNotes)
      .mockResolvedValueOnce(mockReposts);

    const count = await getRepostCount(mockNostr, validPubkey);

    expect(count).toBe(0); // Repost without ID is not counted
  });
});