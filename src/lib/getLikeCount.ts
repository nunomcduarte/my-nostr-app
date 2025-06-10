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

/**
 * Returns the number of likes (kind 7 events) that reference notes from a given pubkey.
 * Compatible with mkstack and any Nostr client that implements the query interface.
 * 
 * @param nostr - Nostr client instance with query method
 * @param pubkey - The public key (hex format) whose notes' likes to count
 * @param options - Optional configuration
 * @param options.timeout - Timeout in milliseconds (default: 10000)
 * @param options.limit - Maximum number of like events to fetch (default: 5000)
 * @param options.signal - AbortSignal for cancellation
 * @param options.since - Only count likes after this timestamp (optional)
 * @param options.until - Only count likes before this timestamp (optional)
 * @returns Promise that resolves to the number of unique likes
 * 
 * @example
 * ```typescript
 * import { useNostr } from '@nostrify/react';
 * import { getLikeCount } from '@/lib/getLikeCount';
 * 
 * function MyComponent() {
 *   const { nostr } = useNostr();
 *   
 *   const handleGetLikes = async () => {
 *     try {
 *       const count = await getLikeCount(nostr, '1234...abcd');
 *       console.log(`User's notes have ${count} likes`);
 *     } catch (error) {
 *       console.error('Failed to get like count:', error);
 *     }
 *   };
 * }
 * ```
 */
export async function getLikeCount(
  nostr: NostrClient,
  pubkey: string,
  options: {
    timeout?: number;
    limit?: number;
    signal?: AbortSignal;
    since?: number;
    until?: number;
  } = {}
): Promise<number> {
  const { timeout = 10000, limit = 5000, signal, since, until } = options;

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
      return 0; // No notes found, so no likes possible
    }

    // Extract note IDs
    const noteIds = notes.map(note => note.id || '').filter(Boolean);

    if (noteIds.length === 0) {
      return 0; // No valid note IDs found
    }

    // Step 2: Query for kind 7 events (likes) that reference these notes
    const likeFilter: NostrFilter = {
      kinds: [7],
      '#e': noteIds, // Events that tag these note IDs
      limit,
    };

    if (since !== undefined) likeFilter.since = since;
    if (until !== undefined) likeFilter.until = until;

    const likes = await nostr.query([likeFilter], { signal: combinedSignal });

    // Step 3: Deduplicate likes (one like per user per note)
    const uniqueLikes = new Set<string>();

    for (const like of likes) {
      // Find the 'e' tag that references one of our notes
      const eTags = like.tags.filter(tag => tag[0] === 'e');
      
      for (const eTag of eTags) {
        const referencedEventId = eTag[1];
        if (referencedEventId && noteIds.includes(referencedEventId)) {
          // Create unique key: liker_pubkey + referenced_note_id
          const uniqueKey = `${like.pubkey}:${referencedEventId}`;
          uniqueLikes.add(uniqueKey);
        }
      }
    }

    return uniqueLikes.size;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Like count query timed out after ${timeout}ms`);
    }
    throw error;
  }
}