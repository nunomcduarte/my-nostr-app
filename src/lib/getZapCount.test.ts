import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getZapCount, type NostrClient } from './getZapCount';

describe('getZapCount', () => {
  let mockNostr: NostrClient;

  beforeEach(() => {
    mockNostr = {
      query: vi.fn(),
    };
  });

  const validPubkey = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  const zapperPubkey = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

  it('returns correct zap count and sats for notes from valid pubkey', async () => {
    // Mock notes from the target user
    const mockNotes = [
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 1000, id: 'note1' },
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 2000, id: 'note2' },
    ];

    // Mock zap receipts for those notes
    const mockZaps = [
      {
        pubkey: 'relay1'.padEnd(64, '0'),
        kind: 9735,
        tags: [
          ['bolt11', 'lnbc5000n1...'], // 500 sats
          ['description', JSON.stringify({
            pubkey: zapperPubkey,
            tags: [['e', 'note1']]
          })]
        ],
        created_at: 3000,
        id: 'zap1'
      },
      {
        pubkey: 'relay2'.padEnd(64, '0'),
        kind: 9735,
        tags: [
          ['bolt11', 'lnbc1000n1...'], // 100 sats  
          ['description', JSON.stringify({
            pubkey: zapperPubkey,
            tags: [['e', 'note2']]
          })]
        ],
        created_at: 3001,
        id: 'zap2'
      },
    ];

    vi.mocked(mockNostr.query)
      .mockResolvedValueOnce(mockNotes) // First call for notes
      .mockResolvedValueOnce(mockZaps); // Second call for zaps

    const result = await getZapCount(mockNostr, validPubkey);

    expect(result.totalZaps).toBe(2);
    expect(result.totalSats).toBe(600); // 500 + 100
    expect(result.averageSats).toBe(300); // 600 / 2
  });

  it('excludes self-zaps when excludeSelfZaps is true', async () => {
    const mockNotes = [
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 1000, id: 'note1' },
    ];

    const mockZaps = [
      {
        pubkey: 'relay1'.padEnd(64, '0'),
        kind: 9735,
        tags: [
          ['bolt11', 'lnbc5000n1...'], // 500 sats
          ['description', JSON.stringify({
            pubkey: zapperPubkey,
            tags: [['e', 'note1']]
          })]
        ],
        created_at: 3000,
        id: 'zap1'
      },
      {
        pubkey: 'relay2'.padEnd(64, '0'),
        kind: 9735,
        tags: [
          ['bolt11', 'lnbc1000n1...'], // 100 sats
          ['description', JSON.stringify({
            pubkey: validPubkey, // Self-zap
            tags: [['e', 'note1']]
          })]
        ],
        created_at: 3001,
        id: 'self_zap'
      },
    ];

    vi.mocked(mockNostr.query)
      .mockResolvedValueOnce(mockNotes)
      .mockResolvedValueOnce(mockZaps);

    const result = await getZapCount(mockNostr, validPubkey);

    expect(result.totalZaps).toBe(1); // Only external zap
    expect(result.totalSats).toBe(500); // Only external zap amount
  });

  it('returns zero for user with no notes', async () => {
    vi.mocked(mockNostr.query)
      .mockResolvedValueOnce([]); // No notes found

    const result = await getZapCount(mockNostr, validPubkey);

    expect(result.totalZaps).toBe(0);
    expect(result.totalSats).toBe(0);
    expect(result.averageSats).toBe(0);
  });

  it('returns zero when notes have no zaps', async () => {
    const mockNotes = [
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 1000, id: 'note1' },
    ];

    vi.mocked(mockNostr.query)
      .mockResolvedValueOnce(mockNotes)
      .mockResolvedValueOnce([]); // No zaps found

    const result = await getZapCount(mockNostr, validPubkey);

    expect(result.totalZaps).toBe(0);
    expect(result.totalSats).toBe(0);
    expect(result.averageSats).toBe(0);
  });

  it('throws error for invalid pubkey format', async () => {
    await expect(getZapCount(mockNostr, 'invalid')).rejects.toThrow(
      'Invalid pubkey format. Expected 64 character hex string.'
    );
  });

  it('ignores zaps without bolt11 tags', async () => {
    const mockNotes = [
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 1000, id: 'note1' },
    ];

    const mockZaps = [
      {
        pubkey: 'relay1'.padEnd(64, '0'),
        kind: 9735,
        tags: [
          // No bolt11 tag
          ['description', JSON.stringify({
            pubkey: zapperPubkey,
            tags: [['e', 'note1']]
          })]
        ],
        created_at: 3000,
        id: 'invalid_zap'
      },
    ];

    vi.mocked(mockNostr.query)
      .mockResolvedValueOnce(mockNotes)
      .mockResolvedValueOnce(mockZaps);

    const result = await getZapCount(mockNostr, validPubkey);

    expect(result.totalZaps).toBe(0);
    expect(result.totalSats).toBe(0);
  });

  it('ignores zaps with invalid bolt11 amounts', async () => {
    const mockNotes = [
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 1000, id: 'note1' },
    ];

    const mockZaps = [
      {
        pubkey: 'relay1'.padEnd(64, '0'),
        kind: 9735,
        tags: [
          ['bolt11', 'invalid_invoice'],
          ['description', JSON.stringify({
            pubkey: zapperPubkey,
            tags: [['e', 'note1']]
          })]
        ],
        created_at: 3000,
        id: 'invalid_zap'
      },
    ];

    vi.mocked(mockNostr.query)
      .mockResolvedValueOnce(mockNotes)
      .mockResolvedValueOnce(mockZaps);

    const result = await getZapCount(mockNostr, validPubkey);

    expect(result.totalZaps).toBe(0);
    expect(result.totalSats).toBe(0);
  });

  it('handles fallback to P tag when description parsing fails', async () => {
    const mockNotes = [
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 1000, id: 'note1' },
    ];

    const mockZaps = [
      {
        pubkey: 'relay1'.padEnd(64, '0'),
        kind: 9735,
        tags: [
          ['bolt11', 'lnbc5000n1...'], // 500 sats
          ['description', 'invalid json'],
          ['P', zapperPubkey],
          ['e', 'note1']
        ],
        created_at: 3000,
        id: 'zap1'
      },
    ];

    vi.mocked(mockNostr.query)
      .mockResolvedValueOnce(mockNotes)
      .mockResolvedValueOnce(mockZaps);

    const result = await getZapCount(mockNostr, validPubkey);

    expect(result.totalZaps).toBe(1);
    expect(result.totalSats).toBe(500);
  });

  it('accepts custom options', async () => {
    const mockNotes = [
      { pubkey: validPubkey, kind: 1, tags: [], created_at: 1000, id: 'note1' },
    ];

    vi.mocked(mockNostr.query)
      .mockResolvedValueOnce(mockNotes)
      .mockResolvedValueOnce([]);

    await getZapCount(mockNostr, validPubkey, {
      timeout: 20000,
      limit: 2000,
      since: 500,
      until: 2000,
      excludeSelfZaps: false
    });

    expect(mockNostr.query).toHaveBeenNthCalledWith(2,
      [{ kinds: [9735], '#e': ['note1'], limit: 2000, since: 500, until: 2000 }],
      { signal: expect.any(AbortSignal) }
    );
  });

  it('throws timeout error when query times out', async () => {
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    vi.mocked(mockNostr.query).mockRejectedValue(abortError);

    await expect(getZapCount(mockNostr, validPubkey, { timeout: 1000 })).rejects.toThrow(
      'Zap count query timed out after 1000ms'
    );
  });

  it('preserves other errors', async () => {
    const customError = new Error('Network error');
    vi.mocked(mockNostr.query).mockRejectedValue(customError);

    await expect(getZapCount(mockNostr, validPubkey)).rejects.toThrow('Network error');
  });
});