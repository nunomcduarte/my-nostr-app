import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { useCurrentUser } from './useCurrentUser';
import { subDays, format, startOfDay } from 'date-fns';

export interface DailyEngagement {
  date: string;
  posts: number;
  reactions: number;
  reposts: number;
  comments: number;
  zaps: number;
  followers: number;
}

export function useEngagementTrends(days = 30) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery({
    queryKey: ['engagement-trends', user?.pubkey, days],
    queryFn: async (c) => {
      if (!user?.pubkey) return [];

      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(15000)]);
      
      const endDate = new Date();
      const startDate = subDays(endDate, days - 1);
      const startTimestamp = Math.floor(startOfDay(startDate).getTime() / 1000);
      
      // Get all relevant events since start date
      const [posts, reactions, reposts, comments, zaps, follows] = await Promise.all([
        // User's posts
        nostr.query([{ 
          kinds: [1], 
          authors: [user.pubkey],
          since: startTimestamp
        }], { signal }),
        
        // Reactions to user's content
        nostr.query([{ 
          kinds: [7], 
          '#p': [user.pubkey],
          since: startTimestamp
        }], { signal }),
        
        // Reposts of user's content  
        nostr.query([{ 
          kinds: [6, 16], 
          '#p': [user.pubkey],
          since: startTimestamp
        }], { signal }),
        
        // Comments/replies to user's content
        nostr.query([{ 
          kinds: [1], 
          '#p': [user.pubkey],
          since: startTimestamp
        }], { signal }).then(events => 
          events.filter(event => event.pubkey !== user.pubkey)
        ),
        
        // Zaps to user's content
        nostr.query([{ 
          kinds: [9735], 
          '#p': [user.pubkey],
          since: startTimestamp
        }], { signal }),
        
        // New follows
        nostr.query([{ 
          kinds: [3], 
          '#p': [user.pubkey],
          since: startTimestamp
        }], { signal }),
      ]);

      // Create daily engagement data
      const dailyData: DailyEngagement[] = [];
      
      for (let i = 0; i < days; i++) {
        const date = subDays(endDate, days - 1 - i);
        const dayStart = Math.floor(startOfDay(date).getTime() / 1000);
        const dayEnd = dayStart + 86400; // 24 hours in seconds
        
        const dayPosts = posts.filter(p => p.created_at >= dayStart && p.created_at < dayEnd);
        const dayReactions = reactions.filter(r => r.created_at >= dayStart && r.created_at < dayEnd);
        const dayReposts = reposts.filter(r => r.created_at >= dayStart && r.created_at < dayEnd);
        const dayComments = comments.filter(c => c.created_at >= dayStart && c.created_at < dayEnd);
        const dayZaps = zaps.filter(z => z.created_at >= dayStart && z.created_at < dayEnd);
        const dayFollows = follows.filter(f => f.created_at >= dayStart && f.created_at < dayEnd);

        dailyData.push({
          date: format(date, 'yyyy-MM-dd'),
          posts: dayPosts.length,
          reactions: dayReactions.length,
          reposts: dayReposts.length,
          comments: dayComments.length,
          zaps: dayZaps.length,
          followers: dayFollows.length,
        });
      }

      return dailyData;
    },
    enabled: !!user?.pubkey,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 10 * 60 * 1000, // Refetch every 10 minutes
  });
}