import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useScheduledPosts } from './useScheduledPosts';
import { usePublishScheduledPost } from './usePublishScheduledPost';
import { useUpdateScheduledPostStatus } from './useUpdateScheduledPostStatus';
import { useCurrentUser } from './useCurrentUser';
import { useToast } from './useToast';
import { usePublishingLock } from './usePublishingLock';



interface SchedulerConfig {
  checkInterval?: number; // How often to check for posts to publish (in ms)
  enabled?: boolean; // Whether the scheduler is enabled
}

/**
 * Hook that automatically publishes scheduled posts when their time comes
 */
export function useSchedulerService(config: SchedulerConfig = {}) {
  const { checkInterval = 60000, enabled = true } = config; // Default: check every minute
  const { user } = useCurrentUser();
  const { data: posts } = useScheduledPosts(user?.pubkey);
  const { mutateAsync: publishPost } = usePublishScheduledPost();
  const { mutateAsync: updatePostStatus } = useUpdateScheduledPostStatus();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const intervalRef = useRef<NodeJS.Timeout>();
  const lockManager = usePublishingLock();

  useEffect(() => {
    if (!enabled || !user || !posts) {
      return;
    }

    const checkAndPublishPosts = async () => {
      if (!user?.pubkey) return;
      
      // Clean up stale entries first
      lockManager.cleanup();
      
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000); // 5 minutes grace period
      
      console.log(`🔍 Checking ${posts.length} posts for publishing...`);
      
      // Find posts that are scheduled and past due with enhanced filtering
      const postsToPublish = posts.filter(post => {
        const isMyPost = post.pubkey === user.pubkey;
        const isScheduled = post.status === 'scheduled';
        const isPastDue = post.scheduledAt <= now;
        const isNotTooOld = post.scheduledAt >= fiveMinutesAgo; // Don't publish very old posts
        const hasValidDate = !isNaN(post.scheduledAt.getTime());
        const hasNoPublishedEventId = !post.publishedEventId; // Extra safety check
        const notAlreadyPublished = !lockManager.isAlreadyPublished(post.id, user.pubkey);
        
        const shouldPublish = isMyPost && isScheduled && isPastDue && isNotTooOld && hasValidDate && hasNoPublishedEventId && notAlreadyPublished;
        
        if (isMyPost && isScheduled && isPastDue) {
          console.log(`📋 Post ${post.id.slice(0, 8)}... analysis:`, {
            isScheduled,
            isPastDue,
            isNotTooOld,
            hasValidDate,
            hasNoPublishedEventId,
            notAlreadyPublished,
            shouldPublish,
            scheduledAt: post.scheduledAt.toISOString(),
            status: post.status,
            publishedEventId: post.publishedEventId
          });
        }
        
        return shouldPublish;
      });

      if (postsToPublish.length === 0) {
        console.log(`✅ No posts ready to publish (${posts.filter(p => p.pubkey === user.pubkey && p.status === 'scheduled').length} scheduled posts total)`);
        return;
      }

      console.log(`🚀 Found ${postsToPublish.length} posts ready to publish`);

      // Publish each post with bulletproof deduplication
      for (const post of postsToPublish) {
        // Final check: refresh post data to ensure it's still scheduled
        const currentPosts = queryClient.getQueryData<typeof posts>(['scheduled-posts', user.pubkey]);
        const currentPost = currentPosts?.find(p => p.id === post.id);
        
        if (!currentPost || currentPost.status !== 'scheduled' || currentPost.publishedEventId) {
          console.log(`⏭️  Post ${post.id} status changed or already published, skipping`);
          continue;
        }

        // Check if already published in our cache
        if (lockManager.isAlreadyPublished(post.id, user.pubkey)) {
          console.log(`⏭️  Post ${post.id} was already published according to our cache, skipping`);
          continue;
        }
        
        try {
          console.log(`📤 Attempting to publish scheduled post: ${post.id}`);
          await publishPost(post);
          
          toast({
            title: 'Post published!',
            description: `"${post.title || 'Untitled post'}" was published automatically`,
          });
          
          console.log(`✅ Successfully published scheduled post: ${post.id}`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`❌ Failed to publish scheduled post ${post.id}:`, errorMessage);
          
          // Don't mark as failed if it was already published or being published by another session
          if (errorMessage.includes('already published') || errorMessage.includes('being published') || errorMessage.includes('published event ID')) {
            console.log(`📝 Post ${post.id} was already published, not marking as failed`);
            continue;
          }
          
          // Update post status to failed for genuine failures
          try {
            await updatePostStatus({
              scheduledPost: post,
              newStatus: 'failed',
            });
            console.log(`📝 Updated post ${post.id} status to failed`);
          } catch (statusError) {
            console.error(`❌ Failed to update post status for ${post.id}:`, statusError);
          }
          
          toast({
            title: 'Publishing failed',
            description: `Failed to publish "${post.title || 'Untitled post'}"`,
            variant: 'destructive',
          });
        }
      }

      // Refresh the posts list if we attempted to publish anything
      if (postsToPublish.length > 0) {
        console.log(`🔄 Refreshing post queries after publishing attempts`);
        // Invalidate immediately to get fresh data
        queryClient.invalidateQueries({ queryKey: ['scheduled-posts'] });
        queryClient.invalidateQueries({ queryKey: ['my-scheduled-posts'] });
        
        // Also refetch with a delay to handle propagation
        setTimeout(() => {
          queryClient.refetchQueries({ queryKey: ['scheduled-posts'] });
        }, 2000);
      }
    };

    // Run immediately
    checkAndPublishPosts();

    // Set up interval to check periodically
    intervalRef.current = setInterval(checkAndPublishPosts, checkInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enabled, user, posts, publishPost, updatePostStatus, toast, queryClient, checkInterval, lockManager]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      // Clean up stale entries on unmount
      lockManager.cleanup();
    };
  }, [lockManager]);

  return {
    isEnabled: enabled && !!user,
    checkInterval,
    postsCount: posts?.filter(p => p.pubkey === user?.pubkey && p.status === 'scheduled').length || 0,
  };
}