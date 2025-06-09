import { isWithinInterval } from 'date-fns';

export type TimeFilter = {
  type: 'all' | 'today' | 'week' | 'month' | 'custom';
  startDate?: Date;
  endDate?: Date;
};

// Helper function to filter posts by time
export function filterPostsByTime<T extends { scheduledAt: Date }>(
  posts: T[],
  filter: TimeFilter
): T[] {
  if (filter.type === 'all') {
    return posts;
  }

  if (!filter.startDate && !filter.endDate) {
    return posts;
  }

  return posts.filter((post) => {
    if (filter.startDate && filter.endDate) {
      return isWithinInterval(post.scheduledAt, {
        start: filter.startDate,
        end: filter.endDate,
      });
    } else if (filter.startDate) {
      return post.scheduledAt >= filter.startDate;
    } else if (filter.endDate) {
      return post.scheduledAt <= filter.endDate;
    }
    return true;
  });
}