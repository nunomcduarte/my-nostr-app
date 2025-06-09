import { useEffect } from 'react';
import { useSchedulerService } from '@/hooks/useSchedulerService';

/**
 * Component that provides the scheduler service to automatically publish posts.
 * This should be included once in the app to enable auto-publishing.
 */
export function SchedulerServiceProvider() {
  const { isEnabled, postsCount } = useSchedulerService({
    checkInterval: 45000, // Check every 45 seconds to reduce duplicate risk
    enabled: true,
  });

  useEffect(() => {
    if (isEnabled && postsCount > 0) {
      console.log(`Scheduler service active: monitoring ${postsCount} scheduled posts`);
    }
  }, [isEnabled, postsCount]);

  // This component doesn't render anything, it just provides the service
  return null;
}