import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { getUserAnalytics, getUserMetricsSummary } from '@/lib/getUserAnalytics';

/**
 * React hook that provides comprehensive user analytics using React Query for caching.
 * This is a wrapper around the standalone getUserAnalytics function.
 * 
 * @param pubkey - The public key (hex format) to analyze
 * @param options - Optional configuration
 * @param options.enabled - Whether the query should be enabled (default: true)
 * @param options.staleTime - How long data stays fresh in ms (default: 5 minutes)
 * @param options.refetchInterval - Auto-refetch interval in ms (default: 15 minutes)
 * @param options.since - Only analyze activity after this timestamp (optional)
 * @param options.until - Only analyze activity before this timestamp (optional)
 * @param options.includeRootReplies - Include root replies in reply count (default: true)
 * @param options.excludeSelfInteractions - Exclude self-interactions (default: true)
 * @returns Query result with comprehensive user analytics
 * 
 * @example
 * ```typescript
 * import { useUserAnalytics } from '@/hooks/useUserAnalytics';
 * 
 * function UserDashboard({ pubkey }: { pubkey: string }) {
 *   const { data: analytics, isLoading, error } = useUserAnalytics(pubkey);
 * 
 *   if (isLoading) return <div>Loading analytics...</div>;
 *   if (error) return <div>Error loading analytics</div>;
 * 
 *   return (
 *     <div>
 *       <h2>User Analytics</h2>
 *       <p>Followers: {analytics.followerCount}</p>
 *       <p>Notes: {analytics.noteCount}</p>
 *       <p>Engagement Rate: {analytics.engagementRate.toFixed(2)}%</p>
 *       <p>Total Sats: {analytics.zapSummary.totalSats}</p>
 *     </div>
 *   );
 * }
 * ```
 */
export function useUserAnalytics(
  pubkey: string,
  options: {
    enabled?: boolean;
    staleTime?: number;
    refetchInterval?: number;
    since?: number;
    until?: number;
    includeRootReplies?: boolean;
    excludeSelfInteractions?: boolean;
  } = {}
) {
  const { nostr } = useNostr();
  const { 
    enabled = true, 
    staleTime = 5 * 60 * 1000, 
    refetchInterval = 15 * 60 * 1000,
    since,
    until,
    includeRootReplies = true,
    excludeSelfInteractions = true
  } = options;

  return useQuery({
    queryKey: ['user-analytics', pubkey, since, until, includeRootReplies, excludeSelfInteractions],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(90000)]); // 90 second timeout
      return await getUserAnalytics(nostr, pubkey, { 
        signal,
        since,
        until,
        includeRootReplies,
        excludeSelfInteractions
      });
    },
    enabled: enabled && !!pubkey && /^[0-9a-f]{64}$/i.test(pubkey),
    staleTime,
    refetchInterval,
  });
}

/**
 * Lightweight hook for just the key metrics summary.
 */
export function useUserMetricsSummary(
  pubkey: string,
  options: {
    enabled?: boolean;
    staleTime?: number;
    refetchInterval?: number;
  } = {}
) {
  const { nostr } = useNostr();
  const { 
    enabled = true, 
    staleTime = 3 * 60 * 1000, 
    refetchInterval = 10 * 60 * 1000
  } = options;

  return useQuery({
    queryKey: ['user-metrics-summary', pubkey],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(60000)]);
      return await getUserMetricsSummary(nostr, pubkey, { signal });
    },
    enabled: enabled && !!pubkey && /^[0-9a-f]{64}$/i.test(pubkey),
    staleTime,
    refetchInterval,
  });
}

/**
 * Hook for comparing two users' analytics.
 */
export function useCompareUsers(
  pubkey1: string,
  pubkey2: string,
  options: {
    enabled?: boolean;
    staleTime?: number;
    since?: number;
    until?: number;
  } = {}
) {
  const { nostr } = useNostr();
  const { 
    enabled = true, 
    staleTime = 10 * 60 * 1000,
    since,
    until
  } = options;

  const bothValid = /^[0-9a-f]{64}$/i.test(pubkey1) && /^[0-9a-f]{64}$/i.test(pubkey2);

  return useQuery({
    queryKey: ['compare-users', pubkey1, pubkey2, since, until],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(120000)]); // 2 minute timeout
      const { compareUsers } = await import('@/lib/getUserAnalytics');
      return await compareUsers(nostr, pubkey1, pubkey2, { 
        signal,
        since,
        until
      });
    },
    enabled: enabled && !!pubkey1 && !!pubkey2 && bothValid,
    staleTime,
  });
}