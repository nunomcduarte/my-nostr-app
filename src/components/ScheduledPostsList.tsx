import { useState } from 'react';
import { format } from 'date-fns';
import { Clock, Calendar as CalendarIcon, Eye, List, Trash2, Play, CheckCircle, XCircle, AlertCircle, Plus } from 'lucide-react';

// Import FullCalendar and required plugins
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { useScheduledPosts } from '@/hooks/useScheduledPosts';
import { usePublishScheduledPost, useCancelScheduledPost } from '@/hooks/usePublishScheduledPost';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PostPreview } from '@/components/PostPreview';
import { PostTimeFilter } from '@/components/PostTimeFilter';
import { filterPostsByTime, type TimeFilter } from '@/lib/postFilters';

import { SchedulePostForm } from '@/components/SchedulePostForm';
import type { ScheduledPost } from '@/hooks/useScheduledPosts';

function getStatusInfo(status: ScheduledPost['status']) {
  switch (status) {
    case 'scheduled':
      return {
        icon: Clock,
        label: 'Scheduled',
        variant: 'secondary' as const,
        color: 'text-blue-600',
      };
    case 'published':
      return {
        icon: CheckCircle,
        label: 'Published',
        variant: 'secondary' as const,
        color: 'text-green-600',
      };
    case 'failed':
      return {
        icon: AlertCircle,
        label: 'Failed',
        variant: 'destructive' as const,
        color: 'text-red-600',
      };
    case 'cancelled':
      return {
        icon: XCircle,
        label: 'Cancelled',
        variant: 'outline' as const,
        color: 'text-gray-600',
      };
  }
}

interface ScheduledPostCardProps {
  post: ScheduledPost;
  canDecrypt: boolean;
}

interface ScheduledPostActionsProps {
  post: ScheduledPost;
}

// Component for dialog actions to avoid hook call in callback
function EventDialogActions({ post, onClose }: { post: ScheduledPost; onClose: () => void }) {
  const { mutate: publishPost, isPending } = usePublishScheduledPost();
  const { toast } = useToast();

  const handlePublish = () => {
    publishPost(post, {
      onSuccess: () => {
        toast({
          title: 'Post published!',
          description: 'Your scheduled post has been published successfully',
        });
        onClose();
      },
      onError: (error) => {
        toast({
          title: 'Failed to publish',
          description: error.message,
          variant: 'destructive',
        });
      },
    });
  };

  return (
    <div className="flex justify-end gap-2 mt-4">
      {post.status === 'scheduled' && (
        <Button 
          variant="default" 
          onClick={handlePublish}
          disabled={isPending}
        >
          <Play className="w-4 h-4 mr-2" />
          {isPending ? 'Publishing...' : 'Publish Now'}
        </Button>
      )}
      <Button variant="outline" onClick={onClose}>Close</Button>
    </div>
  );
}

function ScheduledPostActions({ post }: ScheduledPostActionsProps) {
  const { mutate: publishPost, isPending: isPublishing } = usePublishScheduledPost();
  const { mutate: cancelPost, isPending: isCancelling } = useCancelScheduledPost();
  const { toast } = useToast();

  const isScheduled = post.status === 'scheduled';

  const handlePublishNow = () => {
    publishPost(post, {
      onSuccess: () => {
        toast({
          title: 'Post published!',
          description: 'Your scheduled post has been published successfully',
        });
      },
      onError: (error) => {
        toast({
          title: 'Failed to publish',
          description: error.message,
          variant: 'destructive',
        });
      },
    });
  };

  const handleCancel = () => {
    cancelPost(post, {
      onSuccess: () => {
        toast({
          title: 'Post cancelled',
          description: 'Your scheduled post has been cancelled',
        });
      },
      onError: (error) => {
        toast({
          title: 'Failed to cancel',
          description: error.message,
          variant: 'destructive',
        });
      },
    });
  };

  if (!isScheduled) {
    return null;
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handlePublishNow}
        disabled={isPublishing || isCancelling}
      >
        <Play className="w-4 h-4" />
        {isPublishing ? 'Publishing...' : 'Publish Now'}
      </Button>
      
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" disabled={isPublishing || isCancelling}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Scheduled Post</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this scheduled post? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Scheduled</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel}>
              {isCancelling ? 'Cancelling...' : 'Cancel Post'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ScheduledPostCard({ post, canDecrypt }: ScheduledPostCardProps) {
  const [decryptedContent, setDecryptedContent] = useState<string | null>(null);
  const [decryptedImages, setDecryptedImages] = useState<Array<{url: string; alt?: string}>>([]);
  const { user } = useCurrentUser();
  const { toast } = useToast();

  const statusInfo = getStatusInfo(post.status);
  const StatusIcon = statusInfo.icon;
  const isScheduled = post.status === 'scheduled';
  const isPastDue = isScheduled && post.scheduledAt < new Date();

  const handleDecryptContent = async () => {
    if (!user?.signer?.nip44 || decryptedContent) return;

    try {
      const decrypted = await user.signer.nip44.decrypt(user.pubkey, post.content);
      const draftPost = JSON.parse(decrypted);
      setDecryptedContent(draftPost.content);
      
      // Set images if they exist
      if (draftPost.images && draftPost.images.length > 0) {
        setDecryptedImages(draftPost.images);
      }
    } catch {
      toast({
        title: 'Failed to decrypt',
        description: 'Could not decrypt post content',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card className={`${isPastDue ? 'border-orange-200 bg-orange-50/50' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg flex items-center gap-2">
              {post.title || 'Untitled Post'}
              <Badge variant={statusInfo.variant} className="ml-2">
                <StatusIcon className="w-3 h-3 mr-1" />
                {statusInfo.label}
              </Badge>
              {isPastDue && (
                <Badge variant="outline" className="text-orange-600 border-orange-300">
                  Past Due
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <CalendarIcon className="w-4 h-4" />
                {format(post.scheduledAt, 'PPP')}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {format(post.scheduledAt, 'p')}
              </span>
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {canDecrypt && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" onClick={handleDecryptContent}>
                    <Eye className="w-4 h-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>{post.title || 'Scheduled Post'}</DialogTitle>
                    <DialogDescription>
                      Scheduled for {format(post.scheduledAt, 'PPP')} at {format(post.scheduledAt, 'p')}
                    </DialogDescription>
                  </DialogHeader>
                  <ScrollArea className="max-h-96">
                    <div className="space-y-4">
                      <div className="whitespace-pre-wrap break-words p-4 bg-muted rounded-md">
                        {decryptedContent || 'Click to decrypt content...'}
                      </div>
                      {decryptedImages.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-sm font-medium">Images:</p>
                          <div className="grid grid-cols-2 gap-2">
                            {decryptedImages.map((image, index) => (
                              <img
                                key={index}
                                src={image.url}
                                alt={image.alt || `Image ${index + 1}`}
                                className="w-full h-24 object-cover rounded"
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </DialogContent>
              </Dialog>
            )}
            
            <ScheduledPostActions post={post} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-sm text-muted-foreground">
          <p>Post Type: Kind {post.postKind}</p>
          <p>Created: {format(post.createdAt, 'PPp')}</p>
          {post.publishedEventId && (
            <p className="font-mono text-xs">Published Event: {post.publishedEventId.slice(0, 16)}...</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface ScheduledPostsListProps {
  className?: string;
}

export function ScheduledPostsList({ className }: ScheduledPostsListProps) {
  const { user } = useCurrentUser();
  const { data: posts, isLoading, error } = useScheduledPosts(user?.pubkey);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>({ type: 'all' });
  const [viewMode, setViewMode] = useState<'preview' | 'list' | 'calendar'>('preview');
  const [selectedEvent, setSelectedEvent] = useState<ScheduledPost | null>(null);
  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false);
  const [isNewPostDialogOpen, setIsNewPostDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  
  // Custom event content renderer to show time and title on the same line
  const renderEventContent = (eventInfo: { event: { title: string; start: Date | null; extendedProps: { post: ScheduledPost } }; view: { type: string } }) => {
    const { event, view } = eventInfo;
    const post = event.extendedProps.post as ScheduledPost;
    const status = post?.status || 'scheduled';
    const statusColors: Record<string, string> = {
      published: '#4CAF50', // green
      scheduled: '#FFC107', // yellow
      failed: '#F44336',    // red
      cancelled: '#9E9E9E'  // grey
    };
    const color = statusColors[status] || statusColors.scheduled;
    
    // Format the time to show hours and minutes
    const eventTime = new Date(event.start || '');
    const formattedTime = eventTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    // Check which view we're in to apply appropriate styling
    const _isMonthView = view.type === 'dayGridMonth';
    const isWeekView = view.type === 'timeGridWeek';
    const isDayView = view.type === 'timeGridDay';
    
    // Determine title length based on view type
    let titleMaxLength = 10; // Default for month view
    let titleMaxWidth = '40px';
    
    if (isWeekView) {
      titleMaxLength = 15;
      titleMaxWidth = '80px';
    } else if (isDayView) {
      titleMaxLength = 25;
      titleMaxWidth = '150px';
    }
    
    // Truncate title based on view type
    const shortTitle = event.title.length > titleMaxLength ? 
      event.title.substring(0, titleMaxLength) + '...' : 
      event.title;
    
    return (
      <div className="fc-event-main-content" style={{ width: '100%', maxWidth: '100%' }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center',
          width: '100%',
          maxWidth: '100%',
          overflow: 'hidden'
        }}>
          <div 
            style={{ 
              width: '8px', 
              height: '8px', 
              borderRadius: '50%', 
              backgroundColor: color,
              flexShrink: 0,
              marginRight: '4px'
            }} 
          />
          <span style={{ 
            fontWeight: 500, 
            fontSize: '0.85em',
            flexShrink: 0,
            marginRight: '2px'
          }}>
            {formattedTime}
          </span>
          <span style={{ 
            fontSize: '0.85em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: titleMaxWidth
          }}>
            {shortTitle}
          </span>
        </div>
      </div>
    );
  };

  if (!user) {
    return (
      <Card className={className}>
        <CardContent className="py-12 px-8 text-center">
          <p className="text-muted-foreground">Please log in to view your scheduled posts</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className={`space-y-4 ${className}`}>
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-32" />
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-9 w-9" />
                  <Skeleton className="h-9 w-24" />
                  <Skeleton className="h-9 w-9" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-32" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="py-12 px-8 text-center">
          <p className="text-destructive">Failed to load scheduled posts</p>
          <p className="text-sm text-muted-foreground mt-2">{(error as Error).message}</p>
        </CardContent>
      </Card>
    );
  }

  if (!posts || posts.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="py-12 px-8 text-center">
          <Clock className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No scheduled posts yet</p>
          <p className="text-sm text-muted-foreground mt-2">
            Create your first scheduled post to see it here
          </p>
        </CardContent>
      </Card>
    );
  }

  // Filter posts by current user
  const userPosts = posts.filter(post => post.pubkey === user.pubkey);
  const canDecrypt = !!user.signer?.nip44;

  // Apply time filter
  const filteredPosts = filterPostsByTime(userPosts, timeFilter);

  // Group posts by status
  const scheduledPosts = filteredPosts.filter(p => p.status === 'scheduled');
  const publishedPosts = filteredPosts.filter(p => p.status === 'published');
  const otherPosts = filteredPosts.filter(p => !['scheduled', 'published'].includes(p.status));

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Time Filter */}
      <div className="bg-muted/50 p-4 rounded-lg">
        <PostTimeFilter
          filter={timeFilter}
          onFilterChange={setTimeFilter}
          totalCount={userPosts.length}
          filteredCount={filteredPosts.length}
        />
      </div>

      {/* View Mode Tabs */}
      <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as 'list' | 'preview' | 'calendar')} className="w-full">
        <TabsList>
          <TabsTrigger value="preview">
            <div className="flex items-center gap-1">
              <Eye className="h-4 w-4" />
              Preview Mode
            </div>
          </TabsTrigger>
          <TabsTrigger value="list">
            <div className="flex items-center gap-1">
              <List className="h-4 w-4" />
              List Mode
            </div>
          </TabsTrigger>
          <TabsTrigger value="calendar">
            <div className="flex items-center gap-1">
              <CalendarIcon className="h-4 w-4" />
              Calendar Mode
            </div>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="preview" className="mt-6">
          {/* Preview Mode - Better post previews */}
          {filteredPosts.length === 0 ? (
            <Card>
              <CardContent className="py-12 px-8 text-center">
                <Clock className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {timeFilter.type === 'all' ? 'No scheduled posts yet' : 'No posts found for the selected time period'}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  {timeFilter.type === 'all' 
                    ? 'Create your first scheduled post to see it here'
                    : 'Try adjusting your time filter to see more posts'
                  }
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {scheduledPosts.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Clock className="h-5 w-5 text-blue-600" />
                    Scheduled Posts ({scheduledPosts.length})
                  </h3>
                  <div className="space-y-4">
                    {scheduledPosts.map(post => (
                      <div key={post.id} className="relative">
                        <PostPreview post={post} showAuthor={false} />
                        {/* Action buttons overlay */}
                        <div className="absolute top-4 right-4 flex items-center gap-2">
                          {canDecrypt && (
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm">
                                  <Eye className="w-4 h-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-2xl">
                                <DialogHeader>
                                  <DialogTitle>{post.title || 'Scheduled Post'}</DialogTitle>
                                  <DialogDescription>
                                    Scheduled for {format(post.scheduledAt, 'PPP')} at {format(post.scheduledAt, 'p')}
                                  </DialogDescription>
                                </DialogHeader>
                                <PostPreview post={post} showAuthor={true} />
                              </DialogContent>
                            </Dialog>
                          )}
                          <ScheduledPostActions post={post} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {publishedPosts.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    Published Posts ({publishedPosts.length})
                  </h3>
                  <div className="space-y-4">
                    {publishedPosts.map(post => (
                      <PostPreview key={post.id} post={post} showAuthor={false} />
                    ))}
                  </div>
                </div>
              )}

              {otherPosts.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-orange-600" />
                    Other Posts ({otherPosts.length})
                  </h3>
                  <div className="space-y-4">
                    {otherPosts.map(post => (
                      <PostPreview key={post.id} post={post} showAuthor={false} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="list" className="mt-6">
          {/* List Mode - Original compact view */}
          {filteredPosts.length === 0 ? (
            <Card>
              <CardContent className="py-12 px-8 text-center">
                <Clock className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {timeFilter.type === 'all' ? 'No scheduled posts yet' : 'No posts found for the selected time period'}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  {timeFilter.type === 'all' 
                    ? 'Create your first scheduled post to see it here'
                    : 'Try adjusting your time filter to see more posts'
                  }
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {scheduledPosts.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-3">Scheduled Posts ({scheduledPosts.length})</h3>
                  <div className="space-y-4">
                    {scheduledPosts.map(post => (
                      <ScheduledPostCard key={post.id} post={post} canDecrypt={canDecrypt} />
                    ))}
                  </div>
                </div>
              )}

              {publishedPosts.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-3">Published Posts ({publishedPosts.length})</h3>
                  <div className="space-y-4">
                    {publishedPosts.map(post => (
                      <ScheduledPostCard key={post.id} post={post} canDecrypt={canDecrypt} />
                    ))}
                  </div>
                </div>
              )}

              {otherPosts.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-3">Other Posts ({otherPosts.length})</h3>
                  <div className="space-y-4">
                    {otherPosts.map(post => (
                      <ScheduledPostCard key={post.id} post={post} canDecrypt={canDecrypt} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="calendar" className="mt-6">
          {/* Calendar Mode */}
          <div className="calendar-wrapper">
            {filteredPosts.length === 0 ? (
              <Card>
                <CardContent className="py-12 px-8 text-center">
                  <CalendarIcon className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    {timeFilter.type === 'all' ? 'No scheduled posts yet' : 'No posts found for the selected time period'}
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    {timeFilter.type === 'all' 
                      ? 'Create your first scheduled post to see it here'
                      : 'Try adjusting your time filter to see more posts'
                    }
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <CalendarIcon className="h-5 w-5" />
                      Calendar View
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 text-xs">
                        <div className="w-3 h-3 rounded-full bg-[#eab308]" />
                        <span>Scheduled</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs">
                        <div className="w-3 h-3 rounded-full bg-[#22c55e]" />
                        <span>Published</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs">
                        <div className="w-3 h-3 rounded-full bg-[#ef4444]" />
                        <span>Failed</span>
                      </div>
                    </div>
                  </div>
                  <CardDescription>
                    Click on a date to schedule a new post or click on an event to view details
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="calendar-container" style={{ 
                    '--fc-border-color': 'hsl(var(--border))',
                    '--fc-button-bg-color': 'hsl(var(--primary))',
                    '--fc-button-border-color': 'hsl(var(--primary))',
                    '--fc-button-hover-bg-color': 'hsl(var(--primary) / 0.9)',
                    '--fc-button-hover-border-color': 'hsl(var(--primary) / 0.9)',
                    '--fc-button-active-bg-color': 'hsl(var(--primary) / 0.8)',
                    '--fc-button-active-border-color': 'hsl(var(--primary) / 0.8)',
                    '--fc-event-border-color': 'transparent',
                    '--fc-page-bg-color': 'transparent',
                    '--fc-today-bg-color': 'hsl(var(--muted) / 0.5)',
                    '--fc-event-bg-color': 'hsl(var(--primary))',
                    '--fc-event-text-color': 'hsl(var(--primary-foreground))',
                    '--fc-daygrid-event-dot-width': '8px',
                    '--fc-list-event-dot-width': '10px',
                    '--fc-list-event-hover-bg-color': 'hsl(var(--accent))',
                    '--fc-highlight-color': 'hsl(var(--accent) / 0.2)',
                    '--fc-non-business-color': 'hsl(var(--muted) / 0.2)',
                  } as React.CSSProperties}>
                    {/* Add custom CSS for calendar styling */}
                    <style dangerouslySetInnerHTML={{ __html: `
                      .fc .fc-daygrid-day-top {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 4px 8px;
                      }
                      .fc .fc-daygrid-day-number {
                        padding: 0;
                      }
                      .date-add-button {
                        opacity: 0;
                        transition: opacity 0.2s ease;
                        cursor: pointer;
                        background: hsl(var(--primary));
                        color: hsl(var(--primary-foreground));
                        width: 18px;
                        height: 18px;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 14px;
                        font-weight: bold;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                      }
                      .fc-day:hover .date-add-button {
                        opacity: 1;
                      }
                      .fc-event {
                        background-color: transparent !important;
                        border: 1px solid transparent !important;
                        box-shadow: none !important;
                        border-radius: 4px;
                        transition: all 0.2s ease;
                        padding: 2px 4px;
                      }
                      
                      .fc-event:hover {
                        border-color: hsl(var(--border)) !important;
                        background-color: hsl(var(--accent)/0.1) !important;
                        transform: translateY(-1px);
                        cursor: pointer;
                      }
                      }
                      
                      /* Add status indicator before event title */
                      .fc-event-title::before {
                        content: '';
                        display: inline-block;
                        width: 8px;
                        height: 8px;
                        border-radius: 50%;
                        margin-right: 6px;
                        vertical-align: middle;
                      }
                      
                      .fc-event.status-published .fc-event-title::before {
                        background-color: #22c55e;
                      }
                      
                      .fc-event.status-scheduled .fc-event-title::before {
                        background-color: #eab308;
                      }
                      
                      .fc-event.status-failed .fc-event-title::before {
                        background-color: #ef4444;
                      }
                      
                      .fc-event.status-cancelled .fc-event-title::before {
                        background-color: hsl(var(--muted-foreground));
                      }
                      .fc-daygrid-day-frame {
                        min-height: 100px;
                      }
                      .fc .fc-toolbar-title {
                        font-size: 1.25rem;
                        font-weight: 600;
                      }
                      .fc .fc-button {
                        font-size: 0.875rem;
                        padding: 0.25rem 0.5rem;
                      }
                      
                      /* Custom navigation buttons styled with shadcn UI design system */
                      .fc .fc-button {
                        font-family: inherit;
                        font-size: 0.875rem;
                        height: 2.25rem;
                        transition-property: color, background-color, border-color, text-decoration-color, fill, stroke;
                        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
                        transition-duration: 150ms;
                      }
                      
                      .fc .fc-button-primary {
                        background-color: transparent !important;
                        color: hsl(var(--foreground)) !important;
                        border: 1px solid hsl(var(--border)) !important;
                      }
                      
                      .fc .fc-button-primary:not(:disabled):hover {
                        background-color: hsl(var(--accent)) !important;
                        color: hsl(var(--accent-foreground)) !important;
                      }
                      
                      .fc .fc-button-primary:not(:disabled):active,
                      .fc .fc-button-primary.fc-button-active {
                        background-color: hsl(var(--accent)) !important;
                        color: hsl(var(--accent-foreground)) !important;
                      }
                      
                      /* Navigation buttons (prev/next) */
                      .fc .fc-prev-button,
                      .fc .fc-next-button {
                        background-color: hsla(var(--muted)/0.3) !important;
                        border: 1px solid hsla(var(--border)/0.2) !important;
                        color: hsl(var(--foreground)) !important;
                        border-radius: 9999px !important;
                        width: 2.5rem !important;
                        height: 2.5rem !important;
                        padding: 0 !important;
                        display: flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        margin: 0 0.25rem !important;
                        overflow: hidden !important;
                        box-shadow: none !important;
                      }
                      
                      .fc .fc-prev-button:hover,
                      .fc .fc-next-button:hover {
                        background-color: hsla(var(--muted)/0.5) !important;
                      }
                      
                      .fc .fc-button-group {
                        gap: 0.5rem;
                      }
                      
                      /* Today button */
                      .fc .fc-today-button {
                        background-color: hsla(var(--primary)/0.2) !important;
                        color: hsl(var(--primary)) !important;
                        border: 1px solid hsla(var(--primary)/0.2) !important;
                        border-radius: 0.375rem !important;
                        font-weight: 500 !important;
                        padding: 0.5rem 1rem !important;
                        text-transform: none !important;
                        font-size: 0.875rem !important;
                      }
                      
                      .fc .fc-today-button:hover:not(:disabled) {
                        background-color: hsla(var(--primary)/0.3) !important;
                      }
                      
                      /* Remove any inner square containers */
                      .fc .fc-prev-button span,
                      .fc .fc-next-button span {
                        background: none !important;
                        border: none !important;
                        box-shadow: none !important;
                        width: 100% !important;
                        height: 100% !important;
                        display: flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                      }
                      
                      /* Hide default icons */
                      .fc .fc-icon-chevron-left,
                      .fc .fc-icon-chevron-right {
                        font-size: 0 !important;
                      }
                      
                      .fc .fc-prev-button .fc-icon,
                      .fc .fc-next-button .fc-icon {
                        font-family: inherit;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        background: none !important;
                        width: 100% !important;
                        height: 100% !important;
                        position: relative;
                      }
                      
                      .fc .fc-prev-button .fc-icon:after {
                        content: '';
                        width: 0.75rem;
                        height: 0.75rem;
                        border-width: 0 0 2px 2px;
                        border-style: solid;
                        border-color: currentColor;
                        transform: rotate(45deg);
                        position: absolute;
                        left: 55%;
                      }
                      
                      .fc .fc-next-button .fc-icon:after {
                        content: '';
                        width: 0.75rem;
                        height: 0.75rem;
                        border-width: 2px 2px 0 0;
                        border-style: solid;
                        border-color: currentColor;
                        transform: rotate(45deg);
                        position: absolute;
                        right: 55%;
                      }
                      .fc-theme-standard .fc-scrollgrid {
                        border-radius: 0.5rem;
                        overflow: hidden;
                      }
                      .fc-theme-standard td, .fc-theme-standard th {
                        border-color: hsl(var(--border));
                      }
                      .fc-day-today {
                        background-color: hsl(var(--accent) / 0.2) !important;
                      }
                      .fc-event-title {
                        font-weight: 500;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                      }
                    ` }} />
                    <FullCalendar
                      plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                      initialView="dayGridMonth"
                      headerToolbar={{
                        left: 'prev,next today',
                        center: 'title',
                        right: 'dayGridMonth,timeGridWeek,timeGridDay'
                      }}
                      dayCellDidMount={(info) => {
                        // Add plus button to each day cell
                        const plusButton = document.createElement('div');
                        plusButton.className = 'date-add-button';
                        plusButton.innerHTML = '+';
                        plusButton.addEventListener('click', (e) => {
                          e.stopPropagation(); // Prevent the dateClick event from firing
                          setSelectedDate(info.date);
                          setIsNewPostDialogOpen(true);
                        });
                        
                        // Find the day number element and append the plus button next to it
                        const dayTop = info.el.querySelector('.fc-daygrid-day-top');
                        if (dayTop) {
                          dayTop.appendChild(plusButton);
                        }
                      }}
                      events={filteredPosts.map(post => ({
                        id: post.id,
                        title: post.title || (post.content.length > 30 ? post.content.substring(0, 27) + '...' : post.content) || 'Scheduled Post',
                        start: post.scheduledAt,
                        allDay: false,
                        className: `status-${post.status}`,
                        extendedProps: {
                          post,
                          status: post.status
                        }
                      }))}
                      eventContent={renderEventContent}
                      eventClick={(clickInfo) => {
                        const post = clickInfo.event.extendedProps.post as ScheduledPost;
                        setSelectedEvent(post);
                        setIsEventDialogOpen(true);
                      }}
                      dateClick={(info) => {
                        setSelectedDate(info.date);
                        setIsNewPostDialogOpen(true);
                      }}
                      dayMaxEvents={true}
                      height="auto"
                      selectable={true}
                      aspectRatio={1.5}
                      buttonText={{
                        today: 'Today',
                        month: 'Month',
                        week: 'Week',
                        day: 'Day',
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
          
          {/* Event Details Dialog */}
          {selectedEvent && (
            <Dialog open={isEventDialogOpen} onOpenChange={setIsEventDialogOpen}>
              <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <div className="flex items-center justify-between">
                    <DialogTitle className="flex items-center gap-2">
                      {selectedEvent.title || 'Post Details'}
                      <Badge 
                        variant={selectedEvent.status === 'published' ? 'default' : 
                                selectedEvent.status === 'scheduled' ? 'secondary' : 
                                selectedEvent.status === 'failed' ? 'destructive' : 'outline'}
                      >
                        {selectedEvent.status}
                      </Badge>
                    </DialogTitle>
                    <div className="text-sm text-muted-foreground flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {format(selectedEvent.scheduledAt, 'PPpp')}
                    </div>
                  </div>
                </DialogHeader>
                
                <div className="mt-4">
                  <PostPreview post={selectedEvent} showAuthor={true} />
                </div>
                
                <EventDialogActions post={selectedEvent} onClose={() => setIsEventDialogOpen(false)} />
              </DialogContent>
            </Dialog>
          )}
          
          {/* New Post Dialog */}
          {selectedDate && (
            <Dialog open={isNewPostDialogOpen} onOpenChange={setIsNewPostDialogOpen}>
              <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <div className="flex items-center justify-between">
                    <DialogTitle className="flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      Schedule New Post
                    </DialogTitle>
                    <div className="text-sm text-muted-foreground flex items-center gap-1">
                      <CalendarIcon className="h-4 w-4" />
                      {format(selectedDate, 'PPP')}
                    </div>
                  </div>
                  <DialogDescription>
                    Create a post to be published on {format(selectedDate, 'PPPP')}
                  </DialogDescription>
                </DialogHeader>
                
                <div className="mt-4">
                  <SchedulePostForm 
                    onSuccess={() => setIsNewPostDialogOpen(false)}
                    preselectedDate={selectedDate}
                  />
                </div>
              </DialogContent>
            </Dialog>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}