import type { NostrFilter } from '@nostrify/nostrify';

export interface NostrClient {
  query(filters: NostrFilter[], opts?: { signal?: AbortSignal }): Promise<Array<{ pubkey: string; kind: number }>>;
}

/**
 * Returns the number of followers for a given pubkey.
 * Compatible with mkstack and any Nostr client that implements the query interface.
 * 
 * @param nostr - Nostr client instance with query method
 * @param pubkey - The public key (hex format) to get follower count for
 * @param options - Optional configuration
 * @param options.timeout - Timeout in milliseconds (default: 5000)
 * @param options.limit - Maximum number of follow events to fetch (default: 1000)
 * @param options.signal - AbortSignal for cancellation
 * @returns Promise that resolves to the number of unique followers
 * 
 * @example
 * ```typescript
 * import { useNostr } from '@nostrify/react';
 * import { getFollowerCount } from '@/lib/getFollowerCount';
 * 
 * function MyComponent() {
 *   const { nostr } = useNostr();
 *   
 *   const handleGetFollowers = async () => {
 *     try {
 *       const count = await getFollowerCount(nostr, '1234...abcd');
 *       console.log(`User has ${count} followers`);
 *     } catch (error) {
 *       console.error('Failed to get follower count:', error);
 *     }
 *   };
 * }
 * ```
 */
export async function getFollowerCount(
  nostr: NostrClient,
  pubkey: string,
  options: {
    timeout?: number;
    limit?: number;
    signal?: AbortSignal;
  } = {}
): Promise<number> {
  const { timeout = 5000, limit = 1000, signal } = options;

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
    // Query for kind 3 (contact list) events that include the target pubkey in their p tags
    // Kind 3 events represent a user's follow list
    const followEvents = await nostr.query([
      {
        kinds: [3],
        '#p': [pubkey], // Events that tag this pubkey (meaning they follow this pubkey)
        limit,
      }
    ], { signal: combinedSignal });

    // Count unique followers by deduplicating based on author pubkey
    // Each author can only follow a user once (replaceable event)
    const uniqueFollowers = new Set(followEvents.map(event => event.pubkey));
    
    return uniqueFollowers.size;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Follower count query timed out after ${timeout}ms`);
    }
    throw error;
  }
}