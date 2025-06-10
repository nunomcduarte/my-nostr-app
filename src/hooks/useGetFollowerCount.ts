import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { getFollowerCount } from '@/lib/getFollowerCount';

/**
 * React hook that provides follower count for any pubkey using React Query for caching.
 * This is a wrapper around the standalone getFollowerCount function.
 * 
 * @param pubkey - The public key (hex format) to get follower count for
 * @param options - Optional configuration
 * @param options.enabled - Whether the query should be enabled (default: true)
 * @param options.staleTime - How long data stays fresh in ms (default: 5 minutes)
 * @param options.refetchInterval - Auto-refetch interval in ms (default: 10 minutes)
 * @returns Query result with follower count data
 * 
 * @example
 * ```typescript
 * import { useGetFollowerCount } from '@/hooks/useGetFollowerCount';
 * 
 * function UserProfile({ pubkey }: { pubkey: string }) {
 *   const { data: followerCount, isLoading, error } = useGetFollowerCount(pubkey);
 * 
 *   if (isLoading) return <div>Loading followers...</div>;
 *   if (error) return <div>Error loading followers</div>;
 * 
 *   return <div>{followerCount} followers</div>;
 * }
 * ```
 */
export function useGetFollowerCount(
  pubkey: string,
  options: {
    enabled?: boolean;
    staleTime?: number;
    refetchInterval?: number;
  } = {}
) {
  const { nostr } = useNostr();
  const { enabled = true, staleTime = 5 * 60 * 1000, refetchInterval = 10 * 60 * 1000 } = options;

  return useQuery({
    queryKey: ['follower-count', pubkey],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(5000)]);
      return await getFollowerCount(nostr, pubkey, { signal });
    },
    enabled: enabled && !!pubkey && /^[0-9a-f]{64}$/i.test(pubkey),
    staleTime,
    refetchInterval,
  });
}