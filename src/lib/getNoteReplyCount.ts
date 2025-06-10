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
 * Returns the number of replies (kind 1 events) for a specific note.
 * Compatible with mkstack and any Nostr client that implements the query interface.
 * 
 * @param nostr - Nostr client instance with query method
 * @param noteId - The note ID (hex format) to count replies for
 * @param options - Optional configuration
 * @param options.timeout - Timeout in milliseconds (default: 5000)
 * @param options.limit - Maximum number of reply events to fetch (default: 1000)
 * @param options.signal - AbortSignal for cancellation
 * @param options.since - Only count replies after this timestamp (optional)
 * @param options.until - Only count replies before this timestamp (optional)
 * @param options.includeRootReplies - Include replies that reference note as root event (default: true)
 * @param options.excludeAuthor - Exclude replies from this pubkey (to filter out self-replies) (optional)
 * @returns Promise that resolves to the number of unique replies for the note
 * 
 * @example
 * ```typescript
 * import { useNostr } from '@nostrify/react';
 * import { getNoteReplyCount } from '@/lib/getNoteReplyCount';
 * 
 * function NoteCard({ noteId, authorPubkey }: { noteId: string; authorPubkey: string }) {
 *   const { nostr } = useNostr();
 *   
 *   const handleGetReplies = async () => {
 *     try {
 *       const count = await getNoteReplyCount(nostr, noteId, {
 *         excludeAuthor: authorPubkey // Exclude self-replies
 *       });
 *       console.log(`Note has ${count} replies`);
 *     } catch (error) {
 *       console.error('Failed to get note reply count:', error);
 *     }
 *   };
 * }
 * ```
 */
export async function getNoteReplyCount(
  nostr: NostrClient,
  noteId: string,
  options: {
    timeout?: number;
    limit?: number;
    signal?: AbortSignal;
    since?: number;
    until?: number;
    includeRootReplies?: boolean;
    excludeAuthor?: string;
  } = {}
): Promise<number> {
  const { 
    timeout = 5000, 
    limit = 1000, 
    signal, 
    since, 
    until,
    includeRootReplies = true,
    excludeAuthor
  } = options;

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
    // Query for kind 1 events (notes) that reply to this specific note
    const replyFilter: NostrFilter = {
      kinds: [1],
      '#e': [noteId], // Notes that tag this note ID
      limit,
    };

    if (since !== undefined) replyFilter.since = since;
    if (until !== undefined) replyFilter.until = until;

    const replies = await nostr.query([replyFilter], { signal: combinedSignal });

    // Filter and count valid replies
    const validReplies = new Set<string>();

    for (const reply of replies) {
      // Skip if this is from the excluded author (e.g., self-replies)
      if (excludeAuthor && reply.pubkey === excludeAuthor) {
        continue;
      }

      // Get all e-tags from the reply
      const eTags = reply.tags.filter(tag => tag[0] === 'e' && tag[1]);

      if (eTags.length === 0) {
        continue; // No e-tags, not a reply
      }

      // Check if any e-tag references our note
      let isReplyToOurNote = false;

      for (const eTag of eTags) {
        const referencedEventId = eTag[1];
        
        if (referencedEventId === noteId) {
          const marker = eTag[3]; // Fourth element is the marker (root, reply, mention)
          
          if (includeRootReplies) {
            // Count all replies that reference our note
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
      throw new Error(`Note reply count query timed out after ${timeout}ms`);
    }
    throw error;
  }
}