import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { getReplyCount } from '@/lib/getReplyCount';

/**
 * React hook that provides reply count for notes from any pubkey using React Query for caching.
 * This is a wrapper around the standalone getReplyCount function.
 * 
 * @param pubkey - The public key (hex format) whose notes' replies to count
 * @param options - Optional configuration
 * @param options.enabled - Whether the query should be enabled (default: true)
 * @param options.staleTime - How long data stays fresh in ms (default: 3 minutes)
 * @param options.refetchInterval - Auto-refetch interval in ms (default: 10 minutes)
 * @param options.since - Only count replies after this timestamp (optional)
 * @param options.until - Only count replies before this timestamp (optional)
 * @param options.includeRootReplies - Include replies that reference notes as root events (default: true)
 * @returns Query result with reply count data
 * 
 * @example
 * ```typescript
 * import { useGetReplyCount } from '@/hooks/useGetReplyCount';
 * 
 * function UserProfile({ pubkey }: { pubkey: string }) {
 *   const { data: replyCount, isLoading, error } = useGetReplyCount(pubkey);
 * 
 *   if (isLoading) return <div>Loading replies...</div>;
 *   if (error) return <div>Error loading replies</div>;
 * 
 *   return <div>{replyCount} replies to notes</div>;
 * }
 * ```
 */
export function useGetReplyCount(
  pubkey: string,
  options: {
    enabled?: boolean;
    staleTime?: number;
    refetchInterval?: number;
    since?: number;
    until?: number;
    includeRootReplies?: boolean;
  } = {}
) {
  const { nostr } = useNostr();
  const { 
    enabled = true, 
    staleTime = 3 * 60 * 1000, 
    refetchInterval = 10 * 60 * 1000,
    since,
    until,
    includeRootReplies = true
  } = options;

  return useQuery({
    queryKey: ['reply-count', pubkey, since, until, includeRootReplies],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(10000)]);
      return await getReplyCount(nostr, pubkey, { 
        signal,
        since,
        until,
        includeRootReplies
      });
    },
    enabled: enabled && !!pubkey && /^[0-9a-f]{64}$/i.test(pubkey),
    staleTime,
    refetchInterval,
  });
}