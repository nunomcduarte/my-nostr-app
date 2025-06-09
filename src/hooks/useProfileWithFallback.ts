import { useState, useEffect } from 'react';
import { type NostrEvent, type NostrMetadata, NSchema as n } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

// Popular Nostr relays that are likely to have profile data
const FALLBACK_RELAYS = [
  'wss://relay.nostr.band',
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://relay.snort.social',
];

export function useProfileWithFallback(pubkey: string | undefined, currentRelayUrl?: string) {
  const { nostr } = useNostr();
  const [triedRelays, setTriedRelays] = useState<string[]>([]);
  const [currentTryRelay, setCurrentTryRelay] = useState<string | null>(null);

  // Reset state when pubkey changes
  useEffect(() => {
    if (pubkey) {
      setTriedRelays([]);
      setCurrentTryRelay(currentRelayUrl || null);
    }
  }, [pubkey, currentRelayUrl]);

  const query = useQuery<{ 
    event?: NostrEvent; 
    metadata?: NostrMetadata; 
    foundOnRelay?: string;
    triedRelays?: string[];
  }>({
    queryKey: ['profile-with-fallback', pubkey ?? '', currentTryRelay],
    queryFn: async ({ signal }) => {
      if (!pubkey) {
        return {};
      }

      const relayToTry = currentTryRelay || currentRelayUrl || FALLBACK_RELAYS[0];
      console.log(`🔍 Trying to fetch profile for ${pubkey.slice(0, 8)}... from relay: ${relayToTry}`);

      try {
        // Try current relay first
        const [event] = await nostr.query(
          [{ kinds: [0], authors: [pubkey], limit: 1 }],
          { signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]) }
        );

        if (event) {
          console.log(`✅ Found profile on relay: ${relayToTry}`);
          try {
            const metadata = n.json().pipe(n.metadata()).parse(event.content);
            return { 
              metadata, 
              event, 
              foundOnRelay: relayToTry,
              triedRelays: [...triedRelays, relayToTry]
            };
          } catch {
            return { 
              event, 
              foundOnRelay: relayToTry,
              triedRelays: [...triedRelays, relayToTry]
            };
          }
        } else {
          console.log(`❌ No profile found on relay: ${relayToTry}`);
          throw new Error('Profile not found on this relay');
        }
      } catch (error) {
        console.log(`❌ Failed to fetch from ${relayToTry}:`, error);
        
        // Add current relay to tried list
        const newTriedRelays = [...triedRelays, relayToTry];
        setTriedRelays(newTriedRelays);
        
        // Find next relay to try
        const availableRelays = FALLBACK_RELAYS.filter(relay => 
          !newTriedRelays.includes(relay) && relay !== relayToTry
        );
        
        if (availableRelays.length > 0) {
          console.log(`🔄 Trying next relay: ${availableRelays[0]}`);
          setCurrentTryRelay(availableRelays[0]);
          throw new Error('Trying next relay'); // This will trigger a retry with the new relay
        } else {
          console.log(`⚠️  No more relays to try for ${pubkey.slice(0, 8)}...`);
          return { triedRelays: newTriedRelays };
        }
      }
    },
    retry: false, // We handle retries manually by changing the relay
    enabled: !!pubkey,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Check if we should try the next relay
  useEffect(() => {
    if (query.isError && currentTryRelay) {
      const availableRelays = FALLBACK_RELAYS.filter(relay => 
        !triedRelays.includes(relay) && relay !== currentTryRelay
      );
      
      if (availableRelays.length > 0) {
        const nextRelay = availableRelays[0];
        console.log(`🔄 Auto-trying next relay: ${nextRelay}`);
        setCurrentTryRelay(nextRelay);
        // Refetch will happen automatically due to queryKey change
      }
    }
  }, [query.isError, currentTryRelay, triedRelays]);

  return {
    ...query,
    currentTryRelay,
    triedRelays,
    hasTriedMultipleRelays: triedRelays.length > 1,
  };
}