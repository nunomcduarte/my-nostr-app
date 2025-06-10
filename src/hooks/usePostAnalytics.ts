import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { useCurrentUser } from './useCurrentUser';
// import type { NostrEvent } from '@nostrify/nostrify';

export interface PostAnalytics {
  eventId: string;
  content: string;
  createdAt: number;
  reactions: number;
  reposts: number;
  comments: number;
  zaps: number;
  zapAmount: number; // in sats
}

export function usePostAnalytics(limit = 20) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery({
    queryKey: ['post-analytics', user?.pubkey, limit],
    queryFn: async (c) => {
      if (!user?.pubkey) return [];

      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(10000)]);
      
      // Get user's posts (kind 1)
      const posts = await nostr.query([
        { 
          kinds: [1], 
          authors: [user.pubkey],
          limit 
        }
      ], { signal });

      if (posts.length === 0) return [];

      const postIds = posts.map(post => post.id);

      // Get all engagement events for these posts
      const [reactions, reposts, comments, zaps] = await Promise.all([
        // Reactions (kind 7)
        nostr.query([{ kinds: [7], '#e': postIds }], { signal }),
        // Reposts (kind 6 and 16)
        nostr.query([{ kinds: [6, 16], '#e': postIds }], { signal }),
        // Comments (kind 1 with e tags referencing posts)
        nostr.query([{ kinds: [1], '#e': postIds }], { signal }).then(events => 
          events.filter(event => event.pubkey !== user.pubkey) // Exclude own replies
        ),
        // Zaps (kind 9735)
        nostr.query([{ kinds: [9735], '#e': postIds }], { signal }),
      ]);

      // Process analytics for each post
      const analytics: PostAnalytics[] = posts.map(post => {
        const postReactions = reactions.filter(r => 
          r.tags.some(tag => tag[0] === 'e' && tag[1] === post.id)
        );
        
        const postReposts = reposts.filter(r => 
          r.tags.some(tag => tag[0] === 'e' && tag[1] === post.id)
        );
        
        const postComments = comments.filter(c => 
          c.tags.some(tag => tag[0] === 'e' && tag[1] === post.id)
        );
        
        const postZaps = zaps.filter(z => 
          z.tags.some(tag => tag[0] === 'e' && tag[1] === post.id)
        );

        // Calculate zap amount from bolt11 tags
        const zapAmount = postZaps.reduce((total, zap) => {
          const bolt11Tag = zap.tags.find(tag => tag[0] === 'bolt11');
          if (!bolt11Tag?.[1]) return total;
          
          try {
            // Extract amount from bolt11 invoice (simplified)
            const invoice = bolt11Tag[1];
            const amountMatch = invoice.match(/lnbc(\d+)([munp]?)/);
            if (amountMatch) {
              const amount = parseInt(amountMatch[1]);
              const unit = amountMatch[2];
              
              // Convert to sats
              switch (unit) {
                case 'm': return total + amount * 100000; // milli-bitcoin to sats
                case 'u': return total + amount * 100; // micro-bitcoin to sats  
                case 'n': return total + amount / 10; // nano-bitcoin to sats
                case 'p': return total + amount / 10000; // pico-bitcoin to sats
                default: return total + amount * 100000000; // bitcoin to sats
              }
            }
          } catch (error) {
            console.warn('Failed to parse bolt11 invoice:', error);
          }
          
          return total;
        }, 0);

        return {
          eventId: post.id,
          content: post.content.slice(0, 100) + (post.content.length > 100 ? '...' : ''),
          createdAt: post.created_at,
          reactions: postReactions.length,
          reposts: postReposts.length,
          comments: postComments.length,
          zaps: postZaps.length,
          zapAmount: Math.round(zapAmount),
        };
      });

      // Sort by creation date (newest first)
      return analytics.sort((a, b) => b.createdAt - a.createdAt);
    },
    enabled: !!user?.pubkey,
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });
}