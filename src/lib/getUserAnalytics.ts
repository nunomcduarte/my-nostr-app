import type { NostrFilter } from '@nostrify/nostrify';
import { getFollowerCount } from './getFollowerCount';
import { getLikeCount } from './getLikeCount';
import { getReplyCount } from './getReplyCount';
import { getRepostCount } from './getRepostCount';
import { getZapCount, type ZapSummary } from './getZapCount';

export interface NostrClient {
  query(filters: NostrFilter[], opts?: { signal?: AbortSignal }): Promise<Array<{ 
    id?: string;
    pubkey: string; 
    kind: number; 
    tags: string[][];
    created_at: number;
  }>>;
}

export interface UserAnalytics {
  pubkey: string;
  followerCount: number;
  noteCount: number;
  totalLikes: number;
  totalReplies: number;
  totalReposts: number;
  zapSummary: ZapSummary;
  engagementRate: number; // (likes + replies + reposts + zaps) / noteCount
  averageEngagement: number; // Total engagement per note
  totalEngagement: number; // Total interactions across all metrics
  metrics: {
    followers: number;
    notes: number;
    likes: number;
    replies: number;
    reposts: number;
    zaps: number;
    sats: number;
  };
}

/**
 * Comprehensive analytics function that returns all Nostr metrics for a given pubkey.
 * Compatible with mkstack and any Nostr client that implements the query interface.
 * 
 * @param nostr - Nostr client instance with query method
 * @param pubkey - The public key (hex format) to analyze
 * @param options - Optional configuration
 * @param options.timeout - Timeout in milliseconds for each query (default: 15000)
 * @param options.signal - AbortSignal for cancellation
 * @param options.since - Only analyze activity after this timestamp (optional)
 * @param options.until - Only analyze activity before this timestamp (optional)
 * @param options.includeRootReplies - Include root replies in reply count (default: true)
 * @param options.excludeSelfInteractions - Exclude self-likes, self-reposts, self-zaps (default: true)
 * @returns Promise that resolves to comprehensive user analytics
 * 
 * @example
 * ```typescript
 * import { useNostr } from '@nostrify/react';
 * import { getUserAnalytics } from '@/lib/getUserAnalytics';
 * 
 * async function analyzeUser() {
 *   const { nostr } = useNostr();
 *   
 *   try {
 *     const analytics = await getUserAnalytics(nostr, 'user_pubkey_here');
 *     console.log(`User has ${analytics.followerCount} followers`);
 *     console.log(`Engagement rate: ${analytics.engagementRate.toFixed(2)}%`);
 *     console.log(`Total sats received: ${analytics.zapSummary.totalSats}`);
 *   } catch (error) {
 *     console.error('Analytics failed:', error);
 *   }
 * }
 * ```
 */
export async function getUserAnalytics(
  nostr: NostrClient,
  pubkey: string,
  options: {
    timeout?: number;
    signal?: AbortSignal;
    since?: number;
    until?: number;
    includeRootReplies?: boolean;
    excludeSelfInteractions?: boolean;
  } = {}
): Promise<UserAnalytics> {
  const {
    timeout = 15000,
    signal,
    since,
    until,
    includeRootReplies = true,
    excludeSelfInteractions = true
  } = options;

  // Validate pubkey format
  if (!/^[0-9a-f]{64}$/i.test(pubkey)) {
    throw new Error('Invalid pubkey format. Expected 64 character hex string.');
  }

  // Create abort signal with timeout
  const timeoutSignal = AbortSignal.timeout(timeout * 6); // Allow more time for all queries
  const combinedSignal = signal 
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal;

  try {
    // First, get the user's note count directly
    const noteFilter: NostrFilter = {
      kinds: [1],
      authors: [pubkey],
      limit: 1000,
    };

    if (since !== undefined) noteFilter.since = since;
    if (until !== undefined) noteFilter.until = until;

    const notes = await nostr.query([noteFilter], { signal: combinedSignal });
    const noteCount = notes.length;

    // Run all analytics queries in parallel for better performance
    const [
      followerCount,
      totalLikes,
      totalReplies,
      totalReposts,
      zapSummary
    ] = await Promise.all([
      getFollowerCount(nostr, pubkey, {
        timeout,
        signal: combinedSignal,
        limit: 2000 // Increase limit for followers
      }),
      
      getLikeCount(nostr, pubkey, {
        timeout,
        signal: combinedSignal,
        since,
        until,
        limit: 10000 // Increase limit for likes
      }),
      
      getReplyCount(nostr, pubkey, {
        timeout,
        signal: combinedSignal,
        since,
        until,
        includeRootReplies,
        limit: 5000
      }),
      
      getRepostCount(nostr, pubkey, {
        timeout,
        signal: combinedSignal,
        since,
        until,
        excludeSelfReposts: excludeSelfInteractions,
        limit: 3000
      }),
      
      getZapCount(nostr, pubkey, {
        timeout,
        signal: combinedSignal,
        since,
        until,
        excludeSelfZaps: excludeSelfInteractions,
        limit: 5000
      })
    ]);

    // Calculate engagement metrics
    const totalEngagement = totalLikes + totalReplies + totalReposts + zapSummary.totalZaps;
    const engagementRate = noteCount > 0 ? (totalEngagement / noteCount) * 100 : 0;
    const averageEngagement = noteCount > 0 ? totalEngagement / noteCount : 0;

    return {
      pubkey,
      followerCount,
      noteCount,
      totalLikes,
      totalReplies,
      totalReposts,
      zapSummary,
      engagementRate,
      averageEngagement,
      totalEngagement,
      metrics: {
        followers: followerCount,
        notes: noteCount,
        likes: totalLikes,
        replies: totalReplies,
        reposts: totalReposts,
        zaps: zapSummary.totalZaps,
        sats: zapSummary.totalSats,
      }
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`User analytics query timed out after ${timeout * 6}ms`);
    }
    throw error;
  }
}

/**
 * Simplified version that returns just the key metrics for quick overview.
 */
export async function getUserMetricsSummary(
  nostr: NostrClient,
  pubkey: string,
  options: {
    timeout?: number;
    signal?: AbortSignal;
  } = {}
): Promise<{
  followers: number;
  notes: number;
  totalEngagement: number;
  totalSats: number;
}> {
  const analytics = await getUserAnalytics(nostr, pubkey, options);
  
  return {
    followers: analytics.followerCount,
    notes: analytics.noteCount,
    totalEngagement: analytics.totalEngagement,
    totalSats: analytics.zapSummary.totalSats
  };
}

/**
 * Compare analytics between two users.
 */
export async function compareUsers(
  nostr: NostrClient,
  pubkey1: string,
  pubkey2: string,
  options: {
    timeout?: number;
    signal?: AbortSignal;
    since?: number;
    until?: number;
  } = {}
): Promise<{
  user1: UserAnalytics;
  user2: UserAnalytics;
  comparison: {
    followerRatio: number; // user1 followers / user2 followers
    engagementRatio: number; // user1 engagement / user2 engagement
    satsRatio: number; // user1 sats / user2 sats
    winner: 'user1' | 'user2' | 'tie';
  };
}> {
  const [user1Analytics, user2Analytics] = await Promise.all([
    getUserAnalytics(nostr, pubkey1, options),
    getUserAnalytics(nostr, pubkey2, options)
  ]);

  const followerRatio = user2Analytics.followerCount > 0 
    ? user1Analytics.followerCount / user2Analytics.followerCount 
    : user1Analytics.followerCount > 0 ? Infinity : 1;

  const engagementRatio = user2Analytics.totalEngagement > 0 
    ? user1Analytics.totalEngagement / user2Analytics.totalEngagement 
    : user1Analytics.totalEngagement > 0 ? Infinity : 1;

  const satsRatio = user2Analytics.zapSummary.totalSats > 0 
    ? user1Analytics.zapSummary.totalSats / user2Analytics.zapSummary.totalSats 
    : user1Analytics.zapSummary.totalSats > 0 ? Infinity : 1;

  // Simple scoring: followers (30%) + engagement (40%) + sats (30%)
  const user1Score = 
    (user1Analytics.followerCount * 0.3) + 
    (user1Analytics.totalEngagement * 0.4) + 
    (user1Analytics.zapSummary.totalSats * 0.0001 * 0.3); // Scale sats down

  const user2Score = 
    (user2Analytics.followerCount * 0.3) + 
    (user2Analytics.totalEngagement * 0.4) + 
    (user2Analytics.zapSummary.totalSats * 0.0001 * 0.3);

  let winner: 'user1' | 'user2' | 'tie';
  if (Math.abs(user1Score - user2Score) < 0.01) {
    winner = 'tie';
  } else {
    winner = user1Score > user2Score ? 'user1' : 'user2';
  }

  return {
    user1: user1Analytics,
    user2: user2Analytics,
    comparison: {
      followerRatio,
      engagementRatio,
      satsRatio,
      winner
    }
  };
}