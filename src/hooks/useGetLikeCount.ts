import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { getLikeCount } from '@/lib/getLikeCount';

/**
 * React hook that provides like count for notes from any pubkey using React Query for caching.
 * This is a wrapper around the standalone getLikeCount function.
 * 
 * @param pubkey - The public key (hex format) whose notes' likes to count
 * @param options - Optional configuration
 * @param options.enabled - Whether the query should be enabled (default: true)
 * @param options.staleTime - How long data stays fresh in ms (default: 2 minutes)
 * @param options.refetchInterval - Auto-refetch interval in ms (default: 5 minutes)
 * @param options.since - Only count likes after this timestamp (optional)
 * @param options.until - Only count likes before this timestamp (optional)
 * @returns Query result with like count data
 * 
 * @example
 * ```typescript
 * import { useGetLikeCount } from '@/hooks/useGetLikeCount';
 * 
 * function UserProfile({ pubkey }: { pubkey: string }) {
 *   const { data: likeCount, isLoading, error } = useGetLikeCount(pubkey);
 * 
 *   if (isLoading) return <div>Loading likes...</div>;
 *   if (error) return <div>Error loading likes</div>;
 * 
 *   return <div>{likeCount} likes on notes</div>;
 * }
 * ```
 */
export function useGetLikeCount(
  pubkey: string,
  options: {
    enabled?: boolean;
    staleTime?: number;
    refetchInterval?: number;
    since?: number;
    until?: number;
  } = {}
) {
  const { nostr } = useNostr();
  const { 
    enabled = true, 
    staleTime = 2 * 60 * 1000, 
    refetchInterval = 5 * 60 * 1000,
    since,
    until
  } = options;

  return useQuery({
    queryKey: ['like-count', pubkey, since, until],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(10000)]);
      return await getLikeCount(nostr, pubkey, { 
        signal,
        since,
        until
      });
    },
    enabled: enabled && !!pubkey && /^[0-9a-f]{64}$/i.test(pubkey),
    staleTime,
    refetchInterval,
  });
}