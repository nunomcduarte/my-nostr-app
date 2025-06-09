import { type NLoginType, NUser, useNostrLogin } from '@nostrify/react/login';
import { useNostr } from '@nostrify/react';
import { useCallback, useMemo } from 'react';


import { useProfileWithFallback } from './useProfileWithFallback.ts';
import { useAppContext } from './useAppContext.ts';

export function useCurrentUser() {
  const { nostr } = useNostr();
  const { logins } = useNostrLogin();
  const { config } = useAppContext();

  const loginToUser = useCallback((login: NLoginType): NUser  => {
    switch (login.type) {
      case 'nsec': // Nostr login with secret key
        return NUser.fromNsecLogin(login);
      case 'bunker': // Nostr login with NIP-46 "bunker://" URI
        return NUser.fromBunkerLogin(login, nostr);
      case 'extension': // Nostr login with NIP-07 browser extension
        return NUser.fromExtensionLogin(login);
      // Other login types can be defined here
      default:
        throw new Error(`Unsupported login type: ${login.type}`);
    }
  }, [nostr]);

  const users = useMemo(() => {
    const users: NUser[] = [];

    for (const login of logins) {
      try {
        const user = loginToUser(login);
        users.push(user);
      } catch (error) {
        console.warn('Skipped invalid login', login.id, error);
      }
    }

    return users;
  }, [logins, loginToUser]);

  const user = users[0] as NUser | undefined;
  
  // Use the improved profile fetching that tries multiple relays
  const profileQuery = useProfileWithFallback(user?.pubkey, config.relayUrl);

  return {
    user,
    users,
    metadata: profileQuery.data?.metadata,
    event: profileQuery.data?.event,
    isLoading: profileQuery.isLoading,
    error: profileQuery.error,
    isError: profileQuery.isError,
    foundOnRelay: profileQuery.data?.foundOnRelay,
    triedRelays: profileQuery.triedRelays,
    hasTriedMultipleRelays: profileQuery.hasTriedMultipleRelays,
    currentTryRelay: profileQuery.currentTryRelay,
  };
}
