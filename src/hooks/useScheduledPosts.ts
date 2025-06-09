import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';

const SCHEDULED_POST_KIND = 36611;

// Validation function for scheduled post events
function validateScheduledPost(event: NostrEvent): boolean {
  if (event.kind !== SCHEDULED_POST_KIND) return false;

  // Check for required tags
  const d = event.tags.find(([name]) => name === 'd')?.[1];
  const scheduledAt = event.tags.find(([name]) => name === 'scheduled_at')?.[1];
  const postKind = event.tags.find(([name]) => name === 'post_kind')?.[1];

  if (!d || !scheduledAt || !postKind) return false;

  // Validate scheduled_at is a valid unix timestamp
  const timestamp = parseInt(scheduledAt);
  if (isNaN(timestamp) || timestamp <= 0) return false;

  // Validate post_kind is a valid number
  const kind = parseInt(postKind);
  if (isNaN(kind) || kind <= 0) return false;

  return true;
}

export interface ScheduledPost {
  id: string;
  d: string;
  content: string;
  scheduledAt: Date;
  postKind: number;
  title?: string;
  status: 'scheduled' | 'published' | 'failed' | 'cancelled';
  publishedEventId?: string;
  createdAt: Date;
  pubkey: string;
}

export interface DraftPost {
  kind: number;
  content: string;
  tags?: string[][];
  images?: Array<{
    url: string;
    alt?: string;
    tags: string[][]; // NIP-94 tags for the image
  }>;
}

function parseScheduledPost(event: NostrEvent): ScheduledPost {
  const d = event.tags.find(([name]) => name === 'd')?.[1] || '';
  const scheduledAtStr = event.tags.find(([name]) => name === 'scheduled_at')?.[1] || '0';
  const postKindStr = event.tags.find(([name]) => name === 'post_kind')?.[1] || '1';
  const title = event.tags.find(([name]) => name === 'title')?.[1];
  const status = event.tags.find(([name]) => name === 'status')?.[1] as ScheduledPost['status'] || 'scheduled';
  const publishedEventId = event.tags.find(([name]) => name === 'published_event_id')?.[1];

  return {
    id: event.id,
    d,
    content: event.content,
    scheduledAt: new Date(parseInt(scheduledAtStr) * 1000),
    postKind: parseInt(postKindStr),
    title,
    status,
    publishedEventId,
    createdAt: new Date(event.created_at * 1000),
    pubkey: event.pubkey,
  };
}

export function useScheduledPosts(authorPubkey?: string) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['scheduled-posts', authorPubkey],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(3000)]);
      
      const filters: Array<{
        kinds: number[];
        authors?: string[];
      }> = [{ kinds: [SCHEDULED_POST_KIND] }];
      
      // If authorPubkey is provided, filter by author
      if (authorPubkey) {
        filters[0].authors = [authorPubkey];
      }

      const events = await nostr.query(filters, { signal });
      
      // Filter and validate events
      const validEvents = events.filter(validateScheduledPost);
      
      // Parse into ScheduledPost objects and sort by scheduled time
      return validEvents
        .map(parseScheduledPost)
        .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
    },
    enabled: !!nostr,
  });
}

export function useMyScheduledPosts() {
  const { nostr } = useNostr();
  
  return useQuery({
    queryKey: ['my-scheduled-posts'],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(3000)]);
      
      // Get current user's public key (this would need to be implemented)
      // For now, we'll query all and filter client-side
      const events = await nostr.query([{ kinds: [SCHEDULED_POST_KIND] }], { signal });
      
      // Filter and validate events
      const validEvents = events.filter(validateScheduledPost);
      
      // Parse into ScheduledPost objects and sort by scheduled time
      return validEvents
        .map(parseScheduledPost)
        .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
    },
    enabled: !!nostr,
  });
}