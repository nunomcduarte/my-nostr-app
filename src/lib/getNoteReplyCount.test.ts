import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getNoteReplyCount, type NostrClient } from './getNoteReplyCount';

describe('getNoteReplyCount', () => {
  let mockNostr: NostrClient;

  beforeEach(() => {
    mockNostr = {
      query: vi.fn(),
    };
  });

  const validNoteId = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  const authorPubkey = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
  const replierPubkey = 'fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321';

  it('returns correct reply count for a specific note', async () => {
    const mockReplies = [
      { 
        pubkey: replierPubkey, 
        kind: 1, 
        tags: [['e', validNoteId]], 
        created_at: 3000,
        id: 'reply1'
      },
      { 
        pubkey: replierPubkey, 
        kind: 1, 
        tags: [['e', validNoteId]], 
        created_at: 3001,
        id: 'reply2'
      },
      { 
        pubkey: 'another'.padEnd(64, '0'), 
        kind: 1, 
        tags: [['e', validNoteId]], 
        created_at: 3002,
        id: 'reply3'
      },
    ];

    vi.mocked(mockNostr.query).mockResolvedValue(mockReplies);

    const count = await getNoteReplyCount(mockNostr, validNoteId);

    expect(count).toBe(3);
    expect(mockNostr.query).toHaveBeenCalledWith(
      [{ kinds: [1], '#e': [validNoteId], limit: 1000 }],
      { signal: expect.any(AbortSignal) }
    );
  });

  it('excludes replies from specified author (self-replies)', async () => {
    const mockReplies = [
      { 
        pubkey: replierPubkey, 
        kind: 1, 
        tags: [['e', validNoteId]], 
        created_at: 3000,
        id: 'reply1'
      },
      { 
        pubkey: authorPubkey, // Author replying to their own note
        kind: 1, 
        tags: [['e', validNoteId]], 
        created_at: 3001,
        id: 'self_reply'
      },
    ];

    vi.mocked(mockNostr.query).mockResolvedValue(mockReplies);

    const count = await getNoteReplyCount(mockNostr, validNoteId, {
      excludeAuthor: authorPubkey
    });

    expect(count).toBe(1); // Only external reply, not self-reply
  });

  it('returns 0 when note has no replies', async () => {
    vi.mocked(mockNostr.query).mockResolvedValue([]);

    const count = await getNoteReplyCount(mockNostr, validNoteId);

    expect(count).toBe(0);
  });

  it('throws error for invalid note ID format', async () => {
    await expect(getNoteReplyCount(mockNostr, 'invalid')).rejects.toThrow(
      'Invalid note ID format. Expected 64 character hex string.'
    );
  });

  it('accepts custom timeout and limit options', async () => {
    vi.mocked(mockNostr.query).mockResolvedValue([]);

    await getNoteReplyCount(mockNostr, validNoteId, {
      timeout: 8000,
      limit: 500,
    });

    expect(mockNostr.query).toHaveBeenCalledWith(
      [{ kinds: [1], '#e': [validNoteId], limit: 500 }],
      { signal: expect.any(AbortSignal) }
    );
  });

  it('accepts since and until options', async () => {
    vi.mocked(mockNostr.query).mockResolvedValue([]);

    await getNoteReplyCount(mockNostr, validNoteId, {
      since: 1000,
      until: 2000,
    });

    expect(mockNostr.query).toHaveBeenCalledWith(
      [{ kinds: [1], '#e': [validNoteId], limit: 1000, since: 1000, until: 2000 }],
      { signal: expect.any(AbortSignal) }
    );
  });

  it('handles external abort signal', async () => {
    const controller = new AbortController();
    vi.mocked(mockNostr.query).mockResolvedValue([]);

    await getNoteReplyCount(mockNostr, validNoteId, {
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

    await expect(getNoteReplyCount(mockNostr, validNoteId, { timeout: 1000 })).rejects.toThrow(
      'Note reply count query timed out after 1000ms'
    );
  });

  it('preserves other errors', async () => {
    const customError = new Error('Network error');
    vi.mocked(mockNostr.query).mockRejectedValue(customError);

    await expect(getNoteReplyCount(mockNostr, validNoteId)).rejects.toThrow('Network error');
  });

  it('handles replies with multiple e-tags (thread structure)', async () => {
    const otherNoteId = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
    const mockReplies = [
      { 
        pubkey: replierPubkey, 
        kind: 1, 
        tags: [
          ['e', otherNoteId],  // Root of thread
          ['e', validNoteId]   // Direct reply to our note
        ], 
        created_at: 3000,
        id: 'thread_reply'
      },
    ];

    vi.mocked(mockNostr.query).mockResolvedValue(mockReplies);

    const count = await getNoteReplyCount(mockNostr, validNoteId);

    expect(count).toBe(1); // Should count the thread reply
  });

  it('respects includeRootReplies option when false', async () => {
    const otherNoteId = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
    const mockReplies = [
      { 
        pubkey: replierPubkey, 
        kind: 1, 
        tags: [
          ['e', validNoteId, '', 'root'],  // Marked as root reference
          ['e', otherNoteId]               // Direct reply to different note
        ], 
        created_at: 3000,
        id: 'root_reply'
      },
      { 
        pubkey: replierPubkey, 
        kind: 1, 
        tags: [['e', validNoteId]], // Simple direct reply
        created_at: 3001,
        id: 'direct_reply'
      },
    ];

    vi.mocked(mockNostr.query).mockResolvedValue(mockReplies);

    const count = await getNoteReplyCount(mockNostr, validNoteId, {
      includeRootReplies: false
    });

    expect(count).toBe(1); // Only the direct reply, not the root reference
  });

  it('ignores replies without e-tags', async () => {
    const mockReplies = [
      { 
        pubkey: replierPubkey, 
        kind: 1, 
        tags: [['p', 'somepubkey']], // No e-tags
        created_at: 3000,
        id: 'not_a_reply'
      },
    ];

    vi.mocked(mockNostr.query).mockResolvedValue(mockReplies);

    const count = await getNoteReplyCount(mockNostr, validNoteId);

    expect(count).toBe(0); // No valid replies
  });

  it('ignores replies that do not reference the target note', async () => {
    const otherNoteId = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
    const mockReplies = [
      { 
        pubkey: replierPubkey, 
        kind: 1, 
        tags: [['e', validNoteId]], 
        created_at: 3000,
        id: 'valid_reply'
      },
      { 
        pubkey: replierPubkey, 
        kind: 1, 
        tags: [['e', otherNoteId]], // References different note
        created_at: 3001,
        id: 'unrelated_reply'
      },
    ];

    vi.mocked(mockNostr.query).mockResolvedValue(mockReplies);

    const count = await getNoteReplyCount(mockNostr, validNoteId);

    expect(count).toBe(1); // Only the valid reply
  });

  it('handles replies without IDs gracefully', async () => {
    const mockReplies = [
      { 
        pubkey: replierPubkey, 
        kind: 1, 
        tags: [['e', validNoteId]], 
        created_at: 3000
        // No id field
      },
    ];

    vi.mocked(mockNostr.query).mockResolvedValue(mockReplies);

    const count = await getNoteReplyCount(mockNostr, validNoteId);

    expect(count).toBe(0); // Reply without ID is not counted
  });

  it('handles NIP-10 reply markers correctly', async () => {
    const rootNoteId = 'root123456789012345678901234567890123456789012345678901234567890';
    const mockReplies = [
      { 
        pubkey: replierPubkey, 
        kind: 1, 
        tags: [
          ['e', rootNoteId, '', 'root'],   // Root marker
          ['e', validNoteId, '', 'reply']  // Reply marker
        ], 
        created_at: 3000,
        id: 'marked_reply'
      },
      { 
        pubkey: replierPubkey, 
        kind: 1, 
        tags: [
          ['e', validNoteId, '', 'mention']  // Mention marker (not a reply)
        ], 
        created_at: 3001,
        id: 'mention_only'
      },
    ];

    vi.mocked(mockNostr.query).mockResolvedValue(mockReplies);

    // With includeRootReplies: true (default), both should count
    const countAll = await getNoteReplyCount(mockNostr, validNoteId);
    expect(countAll).toBe(2);

    // With includeRootReplies: false, only the marked reply should count
    const countDirect = await getNoteReplyCount(mockNostr, validNoteId, {
      includeRootReplies: false
    });
    expect(countDirect).toBe(1);
  });
});