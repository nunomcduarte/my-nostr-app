import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { usePublishingLock } from './usePublishingLock';
import type { NostrEvent } from '@nostrify/nostrify';
import type { ScheduledPost, DraftPost } from './useScheduledPosts';

const SCHEDULED_POST_KIND = 36611;



export function usePublishScheduledPost() {
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const lockManager = usePublishingLock();

  return useMutation({
    mutationFn: async (scheduledPost: ScheduledPost) => {
      if (!user?.pubkey) {
        throw new Error('User not authenticated');
      }

      const postId = scheduledPost.id;
      const userPubkey = user.pubkey;

      console.log(`🎯 Attempting to publish post ${postId}`);

      // STEP 1: Check if already published (fastest check)
      const alreadyPublishedEventId = lockManager.isAlreadyPublished(postId, userPubkey);
      if (alreadyPublishedEventId) {
        console.log(`✅ Post ${postId} was already published as ${alreadyPublishedEventId}`);
        throw new Error(`Post was already published as event ${alreadyPublishedEventId}`);
      }

      // STEP 2: Try to acquire publishing lock
      if (!lockManager.acquireLock(postId, userPubkey)) {
        console.log(`🔒 Failed to acquire lock for post ${postId} - another session is publishing it`);
        throw new Error('Post is being published by another session');
      }

      // STEP 3: Double-check with fresh data from query cache
      try {
        const currentPosts = queryClient.getQueryData<ScheduledPost[]>(['scheduled-posts', userPubkey]);
        const currentPost = currentPosts?.find(p => p.id === postId);
        
        if (currentPost) {
          if (currentPost.status === 'published') {
            console.log(`❌ Post ${postId} status is already 'published'`);
            lockManager.releaseLock(postId, userPubkey);
            throw new Error('Post status is already published');
          }

          if (currentPost.publishedEventId) {
            console.log(`❌ Post ${postId} already has publishedEventId: ${currentPost.publishedEventId}`);
            // Mark it as published in our local cache to prevent future attempts
            lockManager.markAsPublished(postId, currentPost.publishedEventId, userPubkey);
            lockManager.releaseLock(postId, userPubkey);
            throw new Error(`Post already has published event ID: ${currentPost.publishedEventId}`);
          }
        }

        // Use the most current data available
        const postToPublish = currentPost || scheduledPost;

        // STEP 4: Verify we still own the lock (in case of timing issues)
        if (!lockManager.ownsLock(postId, userPubkey)) {
          console.log(`🔒 Lost lock for post ${postId} during verification`);
          throw new Error('Lost publishing lock during verification');
        }

        console.log(`🚀 Starting publish operation for post ${postId} with lock acquired`);

        if (!user?.signer?.nip44) {
          throw new Error('NIP-44 decryption not available. Please upgrade your signer.');
        }

          // Decrypt the scheduled post content
          let draftPost: DraftPost;
          try {
            const decryptedContent = await user.signer.nip44.decrypt(
              user.pubkey,
              postToPublish.content
            );
            draftPost = JSON.parse(decryptedContent);
          } catch (error) {
            console.error(`❌ Failed to decrypt post content:`, error);
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
          console.log(`📤 Publishing actual post for ${postToPublish.id} (kind: ${draftPost.kind})`);
          const publishedEvent = await publishEvent({
            kind: draftPost.kind,
            content: finalContent,
            tags: finalTags,
          });

          console.log(`✅ Published post ${postToPublish.id} as event ${publishedEvent.id}`);

          // Update the scheduled post status - use an idempotent approach
          const updatedScheduledEvent: Partial<NostrEvent> = {
            kind: SCHEDULED_POST_KIND,
            content: postToPublish.content, // Keep encrypted content
            tags: [
              ['d', postToPublish.d],
              ['scheduled_at', Math.floor(postToPublish.scheduledAt.getTime() / 1000).toString()],
              ['post_kind', postToPublish.postKind.toString()],
              ['status', 'published'],
              ['published_event_id', publishedEvent.id],
              ['published_at', Math.floor(Date.now() / 1000).toString()], // Add timestamp for when it was actually published
            ],
          };

          // Add optional tags
          if (postToPublish.title) {
            updatedScheduledEvent.tags!.push(['title', postToPublish.title]);
          }

          // Publish the updated scheduled post event
          console.log(`📝 Updating scheduled post status for ${postToPublish.id}`);
          await publishEvent(updatedScheduledEvent);

          // STEP 5: Mark as published in our local cache
          lockManager.markAsPublished(postId, publishedEvent.id, userPubkey);

          console.log(`🎉 Successfully completed publish operation for ${postToPublish.id}`);
          return publishedEvent;
        } catch (error) {
          console.error(`❌ Publish operation failed for ${postId}:`, error);
          throw error;
        } finally {
          // STEP 6: Always release the lock
          lockManager.releaseLock(postId, userPubkey);
        }
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