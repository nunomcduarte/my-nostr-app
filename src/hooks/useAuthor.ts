import { type NostrEvent, type NostrMetadata, NSchema as n } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

export function useAuthor(pubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<{ event?: NostrEvent; metadata?: NostrMetadata }>({
    queryKey: ['author', pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!pubkey) {
        return {};
      }

      console.log(`🔍 Fetching profile for pubkey: ${pubkey.slice(0, 8)}...`);
      
      const [event] = await nostr.query(
        [{ kinds: [0], authors: [pubkey!], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) }, // Increased timeout to 5 seconds
      );

      if (!event) {
        console.log(`⚠️  No profile event found for pubkey: ${pubkey.slice(0, 8)}...`);
        // Return empty object instead of throwing error - this allows graceful fallback
        return {};
      }

      console.log(`✅ Found profile event for pubkey: ${pubkey.slice(0, 8)}...`);

      try {
        const metadata = n.json().pipe(n.metadata()).parse(event.content);
        console.log(`📋 Parsed profile metadata:`, {
          name: metadata.name,
          display_name: metadata.display_name,
          picture: metadata.picture ? 'Yes' : 'No',
          about: metadata.about ? 'Yes' : 'No'
        });
        return { metadata, event };
      } catch (error) {
        console.log(`❌ Failed to parse profile metadata:`, error);
        return { event };
      }
    },
    retry: 2, // Reduced retries to avoid long delays
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    enabled: !!pubkey, // Only run query if pubkey exists
  });
}
