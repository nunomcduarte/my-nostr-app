import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import type { NostrEvent } from '@nostrify/nostrify';
import type { ScheduledPost, DraftPost } from './useScheduledPosts';

const SCHEDULED_POST_KIND = 36611;

// Track publishing operations to prevent duplicates
const publishingOperations = new Map<string, Promise<NostrEvent>>();

export function usePublishScheduledPost() {
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (scheduledPost: ScheduledPost) => {
      const operationKey = `publish-${scheduledPost.id}`;
      
      // Check if this post is already being published
      if (publishingOperations.has(operationKey)) {
        console.log(`Post ${scheduledPost.id} is already being published, returning existing promise`);
        return await publishingOperations.get(operationKey);
      }

      // Create the publishing operation
      const publishOperation = (async () => {
        try {
          if (!user?.signer?.nip44) {
            throw new Error('NIP-44 decryption not available. Please upgrade your signer.');
          }

          // Check if post is already published (additional safety check)
          if (scheduledPost.status === 'published') {
            console.log(`Post ${scheduledPost.id} is already published, skipping`);
            throw new Error('Post is already published');
          }

          // Additional check: if post has a published event ID, it's already published
          if (scheduledPost.publishedEventId) {
            console.log(`Post ${scheduledPost.id} already has published event ID ${scheduledPost.publishedEventId}, skipping`);
            throw new Error('Post already has a published event ID');
          }

          console.log(`Starting publish operation for post ${scheduledPost.id}`);

          // Decrypt the scheduled post content
          let draftPost: DraftPost;
          try {
            const decryptedContent = await user.signer.nip44.decrypt(
              user.pubkey,
              scheduledPost.content
            );
            draftPost = JSON.parse(decryptedContent);
          } catch {
            throw new Error('Failed to decrypt scheduled post content');
          }

          // Prepare content and tags for publishing
          let finalContent = draftPost.content;
          const finalTags = [...(draftPost.tags || [])];

          // Add images to the post if they exist
          if (draftPost.images && draftPost.images.length > 0) {
            // Add image URLs to content (NIP-92 style)
            const imageUrls = draftPost.images.map(img => img.url).join('\n\n');
            if (imageUrls) {
              finalContent = finalContent + '\n\n' + imageUrls;
            }

            // Add imeta tags for each image (NIP-92)
            draftPost.images.forEach(image => {
              if (image.tags && image.tags.length > 0) {
                // Add imeta tag with all the image metadata
                const imetaValues = image.tags.map(([key, value]) => `${key} ${value}`).join(' ');
                finalTags.push(['imeta', imetaValues]);
              }
            });
          }

          // Publish the actual post
          console.log(`Publishing actual post for ${scheduledPost.id}`);
          const publishedEvent = await publishEvent({
            kind: draftPost.kind,
            content: finalContent,
            tags: finalTags,
          });

          console.log(`Published post ${scheduledPost.id} as event ${publishedEvent.id}`);

          // Update the scheduled post status
          const updatedScheduledEvent: Partial<NostrEvent> = {
            kind: SCHEDULED_POST_KIND,
            content: scheduledPost.content, // Keep encrypted content
            tags: [
              ['d', scheduledPost.d],
              ['scheduled_at', Math.floor(scheduledPost.scheduledAt.getTime() / 1000).toString()],
              ['post_kind', scheduledPost.postKind.toString()],
              ['status', 'published'],
              ['published_event_id', publishedEvent.id],
            ],
          };

          // Add optional tags
          if (scheduledPost.title) {
            updatedScheduledEvent.tags!.push(['title', scheduledPost.title]);
          }

          // Publish the updated scheduled post event
          console.log(`Updating scheduled post status for ${scheduledPost.id}`);
          await publishEvent(updatedScheduledEvent);

          console.log(`Successfully completed publish operation for ${scheduledPost.id}`);
          return publishedEvent;
        } finally {
          // Always clean up the operation tracking
          publishingOperations.delete(operationKey);
        }
      })();

      // Store the operation to prevent duplicates
      publishingOperations.set(operationKey, publishOperation);
      
      return await publishOperation;
    },
    onSuccess: () => {
      // Invalidate scheduled posts queries to refresh the list
      queryClient.invalidateQueries({ queryKey: ['scheduled-posts'] });
      queryClient.invalidateQueries({ queryKey: ['my-scheduled-posts'] });
    },
  });
}

export function useCancelScheduledPost() {
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (scheduledPost: ScheduledPost) => {
      // Update the scheduled post status to cancelled
      const updatedScheduledEvent: Partial<NostrEvent> = {
        kind: SCHEDULED_POST_KIND,
        content: scheduledPost.content, // Keep encrypted content
        tags: [
          ['d', scheduledPost.d],
          ['scheduled_at', Math.floor(scheduledPost.scheduledAt.getTime() / 1000).toString()],
          ['post_kind', scheduledPost.postKind.toString()],
          ['status', 'cancelled'],
        ],
      };

      // Add optional tags
      if (scheduledPost.title) {
        updatedScheduledEvent.tags!.push(['title', scheduledPost.title]);
      }

      if (scheduledPost.publishedEventId) {
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