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
 * Returns the number of kind:6 events (reposts) that reference notes from a given pubkey.
 * Compatible with mkstack and any Nostr client that implements the query interface.
 * 
 * @param nostr - Nostr client instance with query method
 * @param pubkey - The public key (hex format) whose notes' reposts to count
 * @param options - Optional configuration
 * @param options.timeout - Timeout in milliseconds (default: 10000)
 * @param options.limit - Maximum number of repost events to fetch (default: 5000)
 * @param options.signal - AbortSignal for cancellation
 * @param options.since - Only count reposts after this timestamp (optional)
 * @param options.until - Only count reposts before this timestamp (optional)
 * @param options.excludeSelfReposts - Exclude reposts by the original author (default: true)
 * @returns Promise that resolves to the number of unique reposts
 * 
 * @example
 * ```typescript
 * import { useNostr } from '@nostrify/react';
 * import { getRepostCount } from '@/lib/getRepostCount';
 * 
 * function MyComponent() {
 *   const { nostr } = useNostr();
 *   
 *   const handleGetReposts = async () => {
 *     try {
 *       const count = await getRepostCount(nostr, '1234...abcd');
 *       console.log(`User's notes have ${count} reposts`);
 *     } catch (error) {
 *       console.error('Failed to get repost count:', error);
 *     }
 *   };
 * }
 * ```
 */
export async function getRepostCount(
  nostr: NostrClient,
  pubkey: string,
  options: {
    timeout?: number;
    limit?: number;
    signal?: AbortSignal;
    since?: number;
    until?: number;
    excludeSelfReposts?: boolean;
  } = {}
): Promise<number> {
  const { 
    timeout = 10000, 
    limit = 5000, 
    signal, 
    since, 
    until,
    excludeSelfReposts = true
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
      return 0; // No notes found, so no reposts possible
    }

    // Extract note IDs
    const noteIds = notes.map(note => note.id || '').filter(Boolean);

    if (noteIds.length === 0) {
      return 0; // No valid note IDs found
    }

    // Step 2: Query for kind 6 events (reposts) that reference these notes
    const repostFilter: NostrFilter = {
      kinds: [6],
      '#e': noteIds, // Reposts that tag these note IDs
      limit,
    };

    if (since !== undefined) repostFilter.since = since;
    if (until !== undefined) repostFilter.until = until;

    const reposts = await nostr.query([repostFilter], { signal: combinedSignal });

    // Step 3: Filter and count valid reposts
    const validReposts = new Set<string>();

    for (const repost of reposts) {
      // Skip if this is a self-repost and we're excluding them
      if (excludeSelfReposts && repost.pubkey === pubkey) {
        continue;
      }

      // Get all e-tags from the repost
      const eTags = repost.tags.filter(tag => tag[0] === 'e' && tag[1]);

      if (eTags.length === 0) {
        continue; // No e-tags, not a proper repost
      }

      // Check if any e-tag references one of our notes
      let isRepostOfOurNote = false;

      for (const eTag of eTags) {
        const referencedEventId = eTag[1];
        
        if (noteIds.includes(referencedEventId)) {
          isRepostOfOurNote = true;
          break;
        }
      }

      if (isRepostOfOurNote && repost.id) {
        validReposts.add(repost.id);
      }
    }

    return validReposts.size;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Repost count query timed out after ${timeout}ms`);
    }
    throw error;
  }
}