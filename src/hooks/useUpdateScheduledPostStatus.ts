import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNostrPublish } from './useNostrPublish';
import type { NostrEvent } from '@nostrify/nostrify';
import type { ScheduledPost } from './useScheduledPosts';

const SCHEDULED_POST_KIND = 36611;

export function useUpdateScheduledPostStatus() {
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      scheduledPost, 
      newStatus, 
      publishedEventId 
    }: { 
      scheduledPost: ScheduledPost; 
      newStatus: ScheduledPost['status']; 
      publishedEventId?: string;
    }) => {
      // Update the scheduled post status
      const updatedScheduledEvent: Partial<NostrEvent> = {
        kind: SCHEDULED_POST_KIND,
        content: scheduledPost.content, // Keep encrypted content
        tags: [
          ['d', scheduledPost.d],
          ['scheduled_at', Math.floor(scheduledPost.scheduledAt.getTime() / 1000).toString()],
          ['post_kind', scheduledPost.postKind.toString()],
          ['status', newStatus],
        ],
      };

      // Add optional tags
      if (scheduledPost.title) {
        updatedScheduledEvent.tags!.push(['title', scheduledPost.title]);
      }

      if (publishedEventId) {
        updatedScheduledEvent.tags!.push(['published_event_id', publishedEventId]);
      } else if (scheduledPost.publishedEventId) {
        updatedScheduledEvent.tags!.push(['published_event_id', scheduledPost.publishedEventId]);
      }

      // Publish the updated scheduled post event
      return await publishEvent(updatedScheduledEvent);
    },
    onSuccess: () => {
      // Invalidate scheduled posts queries to refresh the list
      queryClient.invalidateQueries({ queryKey: ['scheduled-posts'] });
      queryClient.invalidateQueries({ queryKey: ['my-scheduled-posts'] });
    },
  });
}