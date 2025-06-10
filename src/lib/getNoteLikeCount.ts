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
 * Returns the number of likes (kind 7 events) for a specific note.
 * Compatible with mkstack and any Nostr client that implements the query interface.
 * 
 * @param nostr - Nostr client instance with query method
 * @param noteId - The note ID (hex format) to count likes for
 * @param options - Optional configuration
 * @param options.timeout - Timeout in milliseconds (default: 5000)
 * @param options.limit - Maximum number of like events to fetch (default: 1000)
 * @param options.signal - AbortSignal for cancellation
 * @param options.since - Only count likes after this timestamp (optional)
 * @param options.until - Only count likes before this timestamp (optional)
 * @returns Promise that resolves to the number of unique likes for the note
 * 
 * @example
 * ```typescript
 * import { useNostr } from '@nostrify/react';
 * import { getNoteLikeCount } from '@/lib/getNoteLikeCount';
 * 
 * function NoteCard({ noteId }: { noteId: string }) {
 *   const { nostr } = useNostr();
 *   
 *   const handleGetLikes = async () => {
 *     try {
 *       const count = await getNoteLikeCount(nostr, noteId);
 *       console.log(`Note has ${count} likes`);
 *     } catch (error) {
 *       console.error('Failed to get note like count:', error);
 *     }
 *   };
 * }
 * ```
 */
export async function getNoteLikeCount(
  nostr: NostrClient,
  noteId: string,
  options: {
    timeout?: number;
    limit?: number;
    signal?: AbortSignal;
    since?: number;
    until?: number;
  } = {}
): Promise<number> {
  const { timeout = 5000, limit = 1000, signal, since, until } = options;

  // Validate noteId format (should be 64 character hex string)
  if (!/^[0-9a-f]{64}$/i.test(noteId)) {
    throw new Error('Invalid note ID format. Expected 64 character hex string.');
  }

  // Create abort signal with timeout
  const timeoutSignal = AbortSignal.timeout(timeout);
  const combinedSignal = signal 
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal;

  try {
    // Query for kind 7 events (likes) that reference this specific note
    const likeFilter: NostrFilter = {
      kinds: [7],
      '#e': [noteId], // Events that tag this note ID
      limit,
    };

    if (since !== undefined) likeFilter.since = since;
    if (until !== undefined) likeFilter.until = until;

    const likes = await nostr.query([likeFilter], { signal: combinedSignal });

    // Deduplicate likes by author (one like per user per note)
    const uniqueLikers = new Set<string>();

    for (const like of likes) {
      // Verify this like actually references our note
      const referencesNote = like.tags.some(tag => 
        tag[0] === 'e' && tag[1] === noteId
      );

      if (referencesNote) {
        uniqueLikers.add(like.pubkey);
      }
    }

    return uniqueLikers.size;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Note like count query timed out after ${timeout}ms`);
    }
    throw error;
  }
}