import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import type { NostrEvent } from '@nostrify/nostrify';

const SCHEDULED_POST_KIND = 36611;

export interface CreateScheduledPostData {
  content: string;
  scheduledAt: Date;
  postKind?: number;
  title?: string;
  tags?: string[][];
  images?: Array<{
    url: string;
    alt?: string;
    tags: string[][]; // NIP-94 tags for the image
  }>;
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

export function useCreateScheduledPost() {
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateScheduledPostData) => {
      if (!user?.signer?.nip44) {
        throw new Error('NIP-44 encryption not available. Please upgrade your signer.');
      }

      // Create the draft post object
      const draftPost: DraftPost = {
        kind: data.postKind || 1,
        content: data.content,
        tags: data.tags || [],
        images: data.images || [],
      };

      // Encrypt the draft post content
      const encryptedContent = await user.signer.nip44.encrypt(
        user.pubkey,
        JSON.stringify(draftPost)
      );

      // Create unique identifier
      const d = `schedule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Create scheduled post event
      const scheduledEvent: Partial<NostrEvent> = {
        kind: SCHEDULED_POST_KIND,
        content: encryptedContent,
        tags: [
          ['d', d],
          ['scheduled_at', Math.floor(data.scheduledAt.getTime() / 1000).toString()],
          ['post_kind', (data.postKind || 1).toString()],
          ['status', 'scheduled'],
        ],
      };

      // Add optional tags
      if (data.title) {
        scheduledEvent.tags!.push(['title', data.title]);
      }

      // Publish the scheduled post event
      return await publishEvent(scheduledEvent);
    },
    onSuccess: () => {
      // Invalidate scheduled posts queries to refresh the list
      queryClient.invalidateQueries({ queryKey: ['scheduled-posts'] });
      queryClient.invalidateQueries({ queryKey: ['my-scheduled-posts'] });
    },
  });
}