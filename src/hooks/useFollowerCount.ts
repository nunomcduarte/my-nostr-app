import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { useCurrentUser } from './useCurrentUser';

export function useFollowerCount() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery({
    queryKey: ['follower-count', user?.pubkey],
    queryFn: async (c) => {
      if (!user?.pubkey) return 0;

      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(5000)]);
      
      // Query for kind 3 events that include the current user in their p tags
      const followEvents = await nostr.query([
        { 
          kinds: [3], 
          '#p': [user.pubkey],
          limit: 1000 // Get a reasonable number of recent follow events
        }
      ], { signal });

      // Count unique followers (deduplicate by author)
      const uniqueFollowers = new Set(followEvents.map(event => event.pubkey));
      return uniqueFollowers.size;
    },
    enabled: !!user?.pubkey,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 10 * 60 * 1000, // Refetch every 10 minutes
  });
}