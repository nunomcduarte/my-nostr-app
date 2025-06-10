import type { NostrFilter } from '@nostrify/nostrify';

export interface NostrClient {
  query(filters: NostrFilter[], opts?: { signal?: AbortSignal }): Promise<Array<{ 
    id?: string;
    pubkey: string; 
    kind: number; 
    tags: string[][];
    created_at: number;
  }>>;
}

export interface ZapSummary {
  totalZaps: number;
  totalSats: number;
  averageSats: number;
}

/**
 * Parses a bolt11 lightning invoice to extract the amount in sats.
 */
function parseBolt11Amount(invoice: string): number {
  try {
    // Remove the 'lightning:' prefix if present
    const cleanInvoice = invoice.replace(/^lightning:/, '');
    
    // Match amount in bolt11 invoice format
    // Format: lnbc[amount][multiplier]
    const amountMatch = cleanInvoice.match(/^lnbc(\d+)([munp]?)/i);
    if (!amountMatch) return 0;
    
    const amount = parseInt(amountMatch[1]);
    const unit = amountMatch[2]?.toLowerCase();
    
    // Convert to sats based on unit
    switch (unit) {
      case 'm': return amount * 100000; // milli-bitcoin to sats (1 mBTC = 100,000 sats)
      case 'u': return amount * 100; // micro-bitcoin to sats (1 μBTC = 100 sats)
      case 'n': return amount / 10; // nano-bitcoin to sats (10 nBTC = 1 sat)
      case 'p': return amount / 10000; // pico-bitcoin to sats (10,000 pBTC = 1 sat)
      case '': return amount * 100000000; // bitcoin to sats (1 BTC = 100,000,000 sats)
      default: return amount * 100000000; // default to bitcoin
    }
  } catch (error) {
    console.warn('Failed to parse bolt11 invoice:', error);
    return 0;
  }
}

/**
 * Returns the count and total sats of zaps (kind:9735) sent to notes from a given pubkey.
 * Compatible with mkstack and any Nostr client that implements the query interface.
 * 
 * @param nostr - Nostr client instance with query method
 * @param pubkey - The public key (hex format) whose notes' zaps to count
 * @param options - Optional configuration
 * @param options.timeout - Timeout in milliseconds (default: 15000)
 * @param options.limit - Maximum number of zap events to fetch (default: 5000)
 * @param options.signal - AbortSignal for cancellation
 * @param options.since - Only count zaps after this timestamp (optional)
 * @param options.until - Only count zaps before this timestamp (optional)
 * @param options.excludeSelfZaps - Exclude zaps from the original author (default: true)
 * @returns Promise that resolves to zap summary with count and total sats
 * 
 * @example
 * ```typescript
 * import { useNostr } from '@nostrify/react';
 * import { getZapCount } from '@/lib/getZapCount';
 * 
 * function MyComponent() {
 *   const { nostr } = useNostr();
 *   
 *   const handleGetZaps = async () => {
 *     try {
 *       const result = await getZapCount(nostr, '1234...abcd');
 *       console.log(`User received ${result.totalZaps} zaps worth ${result.totalSats} sats`);
 *     } catch (error) {
 *       console.error('Failed to get zap count:', error);
 *     }
 *   };
 * }
 * ```
 */
export async function getZapCount(
  nostr: NostrClient,
  pubkey: string,
  options: {
    timeout?: number;
    limit?: number;
    signal?: AbortSignal;
    since?: number;
    until?: number;
    excludeSelfZaps?: boolean;
  } = {}
): Promise<ZapSummary> {
  const { 
    timeout = 15000, 
    limit = 5000, 
    signal, 
    since, 
    until,
    excludeSelfZaps = true
  } = options;

  // Validate pubkey format (should be 64 character hex string)
  if (!/^[0-9a-f]{64}$/i.test(pubkey)) {
    throw new Error('Invalid pubkey format. Expected 64 character hex string.');
  }

  // Create abort signal with timeout
  const timeoutSignal = AbortSignal.timeout(timeout);
  const combinedSignal = signal 
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal;

  try {
    // Step 1: Get all notes (kind 1) from the target pubkey
    const noteFilter: NostrFilter = {
      kinds: [1],
      authors: [pubkey],
      limit: 1000, // Get recent notes
    };

    if (since !== undefined) noteFilter.since = since;
    if (until !== undefined) noteFilter.until = until;

    const notes = await nostr.query([noteFilter], { signal: combinedSignal });

    if (notes.length === 0) {
      return { totalZaps: 0, totalSats: 0, averageSats: 0 };
    }

    // Extract note IDs
    const noteIds = notes.map(note => note.id || '').filter(Boolean);

    if (noteIds.length === 0) {
      return { totalZaps: 0, totalSats: 0, averageSats: 0 };
    }

    // Step 2: Query for kind 9735 events (zap receipts) that reference these notes
    const zapFilter: NostrFilter = {
      kinds: [9735],
      '#e': noteIds, // Zaps that tag these note IDs
      limit,
    };

    if (since !== undefined) zapFilter.since = since;
    if (until !== undefined) zapFilter.until = until;

    const zaps = await nostr.query([zapFilter], { signal: combinedSignal });

    // Step 3: Process and count valid zaps
    const validZaps: Array<{ id: string; amount: number; zapper: string }> = [];
    let totalSats = 0;

    for (const zap of zaps) {
      // Get the bolt11 invoice from the zap receipt
      const bolt11Tag = zap.tags.find(tag => tag[0] === 'bolt11');
      if (!bolt11Tag || !bolt11Tag[1]) {
        continue; // No bolt11 tag, not a valid zap
      }

      const amount = parseBolt11Amount(bolt11Tag[1]);
      if (amount <= 0) {
        continue; // Invalid or zero amount
      }

      // Get the zap request from the description tag
      const descriptionTag = zap.tags.find(tag => tag[0] === 'description');
      let zapperPubkey = '';
      let isZapForOurNote = false;

      if (descriptionTag && descriptionTag[1]) {
        try {
          const zapRequest = JSON.parse(descriptionTag[1]);
          zapperPubkey = zapRequest.pubkey || '';

          // Check if the zap request references one of our notes
          if (zapRequest.tags && Array.isArray(zapRequest.tags)) {
            for (const tag of zapRequest.tags) {
              if (Array.isArray(tag) && tag[0] === 'e' && noteIds.includes(tag[1])) {
                isZapForOurNote = true;
                break;
              }
            }
          }
        } catch {
          // If parsing fails, try to get zapper from P tag
          const pTag = zap.tags.find(tag => tag[0] === 'P');
          zapperPubkey = pTag?.[1] || '';
          
          // Check if any e-tag in the zap receipt references our notes
          const eTags = zap.tags.filter(tag => tag[0] === 'e');
          isZapForOurNote = eTags.some(eTag => noteIds.includes(eTag[1]));
        }
      }

      // Skip self-zaps if excluded
      if (excludeSelfZaps && zapperPubkey === pubkey) {
        continue;
      }

      // Only count zaps that reference our notes
      if (isZapForOurNote && zap.id) {
        validZaps.push({
          id: zap.id,
          amount,
          zapper: zapperPubkey
        });
        totalSats += amount;
      }
    }

    const totalZaps = validZaps.length;
    const averageSats = totalZaps > 0 ? Math.round(totalSats / totalZaps) : 0;

    return {
      totalZaps,
      totalSats,
      averageSats
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Zap count query timed out after ${timeout}ms`);
    }
    throw error;
  }
}