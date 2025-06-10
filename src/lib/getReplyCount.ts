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
 * Returns the number of kind:1 notes that are replies to a given pubkey's notes.
 * Compatible with mkstack and any Nostr client that implements the query interface.
 * 
 * @param nostr - Nostr client instance with query method
 * @param pubkey - The public key (hex format) whose notes' replies to count
 * @param options - Optional configuration
 * @param options.timeout - Timeout in milliseconds (default: 10000)
 * @param options.limit - Maximum number of reply events to fetch (default: 5000)
 * @param options.signal - AbortSignal for cancellation
 * @param options.since - Only count replies after this timestamp (optional)
 * @param options.until - Only count replies before this timestamp (optional)
 * @param options.includeRootReplies - Include replies that reference notes as root events (default: true)
 * @returns Promise that resolves to the number of unique replies
 * 
 * @example
 * ```typescript
 * import { useNostr } from '@nostrify/react';
 * import { getReplyCount } from '@/lib/getReplyCount';
 * 
 * function MyComponent() {
 *   const { nostr } = useNostr();
 *   
 *   const handleGetReplies = async () => {
 *     try {
 *       const count = await getReplyCount(nostr, '1234...abcd');
 *       console.log(`User's notes have ${count} replies`);
 *     } catch (error) {
 *       console.error('Failed to get reply count:', error);
 *     }
 *   };
 * }
 * ```
 */
export async function getReplyCount(
  nostr: NostrClient,
  pubkey: string,
  options: {
    timeout?: number;
    limit?: number;
    signal?: AbortSignal;
    since?: number;
    until?: number;
    includeRootReplies?: boolean;
  } = {}
): Promise<number> {
  const { 
    timeout = 10000, 
    limit = 5000, 
    signal, 
    since, 
    until,
    includeRootReplies = true
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
      return 0; // No notes found, so no replies possible
    }

    // Extract note IDs
    const noteIds = notes.map(note => note.id || '').filter(Boolean);

    if (noteIds.length === 0) {
      return 0; // No valid note IDs found
    }

    // Step 2: Query for kind 1 events (notes) that reply to these notes
    const replyFilter: NostrFilter = {
      kinds: [1],
      '#e': noteIds, // Notes that tag these note IDs
      limit,
    };

    if (since !== undefined) replyFilter.since = since;
    if (until !== undefined) replyFilter.until = until;

    const replies = await nostr.query([replyFilter], { signal: combinedSignal });

    // Step 3: Filter and count valid replies
    const validReplies = new Set<string>();

    for (const reply of replies) {
      // Skip if this is one of the original author's own notes
      if (reply.pubkey === pubkey) {
        continue;
      }

      // Get all e-tags from the reply
      const eTags = reply.tags.filter(tag => tag[0] === 'e' && tag[1]);

      if (eTags.length === 0) {
        continue; // No e-tags, not a reply
      }

      // Check if any e-tag references one of our notes
      let isReplyToOurNote = false;

      for (const eTag of eTags) {
        const referencedEventId = eTag[1];
        
        if (noteIds.includes(referencedEventId)) {
          // According to NIP-10, replies can be structured as:
          // - Simple reply: single e-tag pointing to the note being replied to
          // - Thread reply: multiple e-tags where the last one is the direct parent
          // - Root reply: e-tag with "root" marker or first e-tag in a thread
          
          const marker = eTag[3]; // Fourth element is the marker (root, reply, mention)
          
          if (includeRootReplies) {
            // Count all replies that reference our notes
            isReplyToOurNote = true;
            break;
          } else {
            // Only count direct replies (last e-tag or unmarked single e-tag)
            const isLastETag = eTags.indexOf(eTag) === eTags.length - 1;
            const isDirectReply = !marker || marker === 'reply' || (eTags.length === 1 && !marker);
            
            if (isLastETag && isDirectReply) {
              isReplyToOurNote = true;
              break;
            }
          }
        }
      }

      if (isReplyToOurNote && reply.id) {
        validReplies.add(reply.id);
      }
    }

    return validReplies.size;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Reply count query timed out after ${timeout}ms`);
    }
    throw error;
  }
}