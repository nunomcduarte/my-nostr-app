import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useScheduledPosts } from './useScheduledPosts';
import { usePublishScheduledPost } from './usePublishScheduledPost';
import { useUpdateScheduledPostStatus } from './useUpdateScheduledPostStatus';
import { useCurrentUser } from './useCurrentUser';
import { useToast } from './useToast';

// Track posts currently being published to prevent duplicates
const publishingPosts = new Set<string>();

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

  useEffect(() => {
    if (!enabled || !user || !posts) {
      return;
    }

    const checkAndPublishPosts = async () => {
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000); // 5 minutes grace period
      
      // Find posts that are scheduled and past due, excluding ones currently being published
      const postsToPublish = posts.filter(post => {
        const isMyPost = post.pubkey === user.pubkey;
        const isScheduled = post.status === 'scheduled';
        const isPastDue = post.scheduledAt <= now;
        const isNotTooOld = post.scheduledAt >= fiveMinutesAgo; // Don't publish very old posts
        const isNotBeingPublished = !publishingPosts.has(post.id);
        const hasValidDate = !isNaN(post.scheduledAt.getTime());
        
        return isMyPost && isScheduled && isPastDue && isNotTooOld && isNotBeingPublished && hasValidDate;
      });

      if (postsToPublish.length === 0) {
        return;
      }

      console.log(`Found ${postsToPublish.length} posts ready to publish`);

      // Publish each post with proper error handling and deduplication
      for (const post of postsToPublish) {
        // Double-check to prevent race conditions
        if (publishingPosts.has(post.id)) {
          console.log(`Post ${post.id} is already being published, skipping`);
          continue;
        }

        // Mark as being published
        publishingPosts.add(post.id);
        
        try {
          console.log(`Publishing scheduled post: ${post.id}`);
          await publishPost(post);
          
          toast({
            title: 'Post published!',
            description: `"${post.title || 'Untitled post'}" was published automatically`,
          });
          
          console.log(`Successfully published scheduled post: ${post.id}`);
        } catch (error) {
          console.error(`Failed to publish scheduled post ${post.id}:`, error);
          
          // Update post status to failed
          try {
            await updatePostStatus({
              scheduledPost: post,
              newStatus: 'failed',
            });
            console.log(`Updated post ${post.id} status to failed`);
          } catch (statusError) {
            console.error(`Failed to update post status for ${post.id}:`, statusError);
          }
          
          toast({
            title: 'Publishing failed',
            description: `Failed to publish "${post.title || 'Untitled post'}"`,
            variant: 'destructive',
          });
        } finally {
          // Always remove from publishing set, even on error
          publishingPosts.delete(post.id);
        }
      }

      // Refresh the posts list if we attempted to publish anything
      if (postsToPublish.length > 0) {
        // Small delay to ensure the published events have propagated
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['scheduled-posts'] });
          queryClient.invalidateQueries({ queryKey: ['my-scheduled-posts'] });
        }, 1000);
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
  }, [enabled, user, posts, publishPost, toast, queryClient, checkInterval]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      // Clear tracking set on unmount
      publishingPosts.clear();
    };
  }, []);

  return {
    isEnabled: enabled && !!user,
    checkInterval,
    postsCount: posts?.filter(p => p.pubkey === user?.pubkey && p.status === 'scheduled').length || 0,
  };
}