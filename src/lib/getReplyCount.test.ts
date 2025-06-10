import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getReplyCount, type NostrClient } from './getReplyCount';

describe('getReplyCount', () => {
  let mockNostr: NostrClient;

  beforeEach(() => {
    mockNostr = {
      query: vi.fn(),
    };
  });

  const validPubkey = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  const replierPubkey = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

  it('returns correct reply count for notes from valid pubkey', async () => {
    // Mock notes from the target user
    const mockNotes = [
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 1000, id: 'note1' },
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 2000, id: 'note2' },
    ];

    // Mock replies to those notes
    const mockReplies = [
      { 
        pubkey: replierPubkey, 
        kind: 1, 
        tags: [['e', 'note1']], 
        created_at: 3000,
        id: 'reply1'
      },
      { 
        pubkey: replierPubkey, 
        kind: 1, 
        tags: [['e', 'note1']], 
        created_at: 3001,
        id: 'reply2'
      },
      { 
        pubkey: replierPubkey, 
        kind: 1, 
        tags: [['e', 'note2']], 
        created_at: 3002,
        id: 'reply3'
      },
    ];

    vi.mocked(mockNostr.query)
      .mockResolvedValueOnce(mockNotes) // First call for notes
      .mockResolvedValueOnce(mockReplies); // Second call for replies

    const count = await getReplyCount(mockNostr, validPubkey);

    expect(count).toBe(3); // 3 unique replies
    expect(mockNostr.query).toHaveBeenCalledTimes(2);
    
    // Check first call (notes query)
    expect(mockNostr.query).toHaveBeenNthCalledWith(1,
      [{ kinds: [1], authors: [validPubkey], limit: 1000 }],
      { signal: expect.any(AbortSignal) }
    );
    
    // Check second call (replies query)
    expect(mockNostr.query).toHaveBeenNthCalledWith(2,
      [{ kinds: [1], '#e': ['note1', 'note2'], limit: 5000 }],
      { signal: expect.any(AbortSignal) }
    );
  });

  it('excludes replies from the original author (self-replies)', async () => {
    const mockNotes = [
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 1000, id: 'note1' },
    ];

    const mockReplies = [
      { 
        pubkey: replierPubkey, 
        kind: 1, 
        tags: [['e', 'note1']], 
        created_at: 3000,
        id: 'reply1'
      },
      { 
        pubkey: validPubkey, // Same as original author - should be excluded
        kind: 1, 
        tags: [['e', 'note1']], 
        created_at: 3001,
        id: 'self_reply'
      },
    ];

    vi.mocked(mockNostr.query)
      .mockResolvedValueOnce(mockNotes)
      .mockResolvedValueOnce(mockReplies);

    const count = await getReplyCount(mockNostr, validPubkey);

    expect(count).toBe(1); // Only the external reply, not the self-reply
  });

  it('returns 0 when user has no notes', async () => {
    vi.mocked(mockNostr.query)
      .mockResolvedValueOnce([]); // No notes found

    const count = await getReplyCount(mockNostr, validPubkey);

    expect(count).toBe(0);
    expect(mockNostr.query).toHaveBeenCalledTimes(1); // Only called once for notes
  });

  it('returns 0 when notes have no replies', async () => {
    const mockNotes = [
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 1000, id: 'note1' },
    ];

    vi.mocked(mockNostr.query)
      .mockResolvedValueOnce(mockNotes)
      .mockResolvedValueOnce([]); // No replies found

    const count = await getReplyCount(mockNostr, validPubkey);

    expect(count).toBe(0);
  });

  it('handles notes without valid IDs', async () => {
    const mockNotes = [
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 1000 }, // No id field
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 2000, id: '' }, // Empty id
    ];

    vi.mocked(mockNostr.query)
      .mockResolvedValueOnce(mockNotes);

    const count = await getReplyCount(mockNostr, validPubkey);

    expect(count).toBe(0);
    expect(mockNostr.query).toHaveBeenCalledTimes(1); // Only called once, no valid note IDs
  });

  it('throws error for invalid pubkey format', async () => {
    await expect(getReplyCount(mockNostr, 'invalid')).rejects.toThrow(
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

    await getReplyCount(mockNostr, validPubkey, {
      timeout: 15000,
      limit: 2000,
    });

    expect(mockNostr.query).toHaveBeenNthCalledWith(2,
      [{ kinds: [1], '#e': ['note1'], limit: 2000 }],
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

    await getReplyCount(mockNostr, validPubkey, {
      since: 500,
      until: 2000,
    });

    // Check that since/until are passed to both queries
    expect(mockNostr.query).toHaveBeenNthCalledWith(1,
      [{ kinds: [1], authors: [validPubkey], limit: 1000, since: 500, until: 2000 }],
      { signal: expect.any(AbortSignal) }
    );

    expect(mockNostr.query).toHaveBeenNthCalledWith(2,
      [{ kinds: [1], '#e': ['note1'], limit: 5000, since: 500, until: 2000 }],
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

    await getReplyCount(mockNostr, validPubkey, {
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

    await expect(getReplyCount(mockNostr, validPubkey, { timeout: 1000 })).rejects.toThrow(
      'Reply count query timed out after 1000ms'
    );
  });

  it('preserves other errors', async () => {
    const customError = new Error('Network error');
    vi.mocked(mockNostr.query).mockRejectedValue(customError);

    await expect(getReplyCount(mockNostr, validPubkey)).rejects.toThrow('Network error');
  });

  it('handles replies with multiple e-tags (thread replies)', async () => {
    const mockNotes = [
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 1000, id: 'note1' },
    ];

    // Reply with multiple e-tags (thread structure)
    const mockReplies = [
      { 
        pubkey: replierPubkey, 
        kind: 1, 
        tags: [
          ['e', 'root_note'],     // Root of thread
          ['e', 'note1']          // Direct reply to our note
        ], 
        created_at: 3000,
        id: 'thread_reply'
      },
    ];

    vi.mocked(mockNostr.query)
      .mockResolvedValueOnce(mockNotes)
      .mockResolvedValueOnce(mockReplies);

    const count = await getReplyCount(mockNostr, validPubkey);

    expect(count).toBe(1); // Should count the thread reply
  });

  it('respects includeRootReplies option when false', async () => {
    const mockNotes = [
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 1000, id: 'note1' },
    ];

    const mockReplies = [
      { 
        pubkey: replierPubkey, 
        kind: 1, 
        tags: [
          ['e', 'note1', '', 'root'],  // Marked as root reference
          ['e', 'other_note']          // Direct reply to different note
        ], 
        created_at: 3000,
        id: 'root_reply'
      },
      { 
        pubkey: replierPubkey, 
        kind: 1, 
        tags: [['e', 'note1']], // Simple direct reply
        created_at: 3001,
        id: 'direct_reply'
      },
    ];

    vi.mocked(mockNostr.query)
      .mockResolvedValueOnce(mockNotes)
      .mockResolvedValueOnce(mockReplies);

    const count = await getReplyCount(mockNostr, validPubkey, {
      includeRootReplies: false
    });

    expect(count).toBe(1); // Only the direct reply, not the root reference
  });

  it('ignores replies without e-tags', async () => {
    const mockNotes = [
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 1000, id: 'note1' },
    ];

    const mockReplies = [
      { 
        pubkey: replierPubkey, 
        kind: 1, 
        tags: [['p', 'somepubkey']], // No e-tags
        created_at: 3000,
        id: 'not_a_reply'
      },
    ];

    vi.mocked(mockNostr.query)
      .mockResolvedValueOnce(mockNotes)
      .mockResolvedValueOnce(mockReplies);

    const count = await getReplyCount(mockNostr, validPubkey);

    expect(count).toBe(0); // No valid replies
  });

  it('ignores replies that reference unrelated notes', async () => {
    const mockNotes = [
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 1000, id: 'note1' },
    ];

    const mockReplies = [
      { 
        pubkey: replierPubkey, 
        kind: 1, 
        tags: [['e', 'note1']], 
        created_at: 3000,
        id: 'valid_reply'
      },
      { 
        pubkey: replierPubkey, 
        kind: 1, 
        tags: [['e', 'other_note']], // References different note
        created_at: 3001,
        id: 'unrelated_reply'
      },
    ];

    vi.mocked(mockNostr.query)
      .mockResolvedValueOnce(mockNotes)
      .mockResolvedValueOnce(mockReplies);

    const count = await getReplyCount(mockNostr, validPubkey);

    expect(count).toBe(1); // Only the valid reply
  });

  it('handles replies without IDs gracefully', async () => {
    const mockNotes = [
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 1000, id: 'note1' },
    ];

    const mockReplies = [
      { 
        pubkey: replierPubkey, 
        kind: 1, 
        tags: [['e', 'note1']], 
        created_at: 3000
        // No id field
      },
    ];

    vi.mocked(mockNostr.query)
      .mockResolvedValueOnce(mockNotes)
      .mockResolvedValueOnce(mockReplies);

    const count = await getReplyCount(mockNostr, validPubkey);

    expect(count).toBe(0); // Reply without ID is not counted
  });
});