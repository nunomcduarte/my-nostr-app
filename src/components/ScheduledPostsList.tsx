import { useState } from 'react';
import { format } from 'date-fns';
import { Clock, Calendar, Eye, Trash2, Play, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
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
                <Calendar className="w-4 h-4" />
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
  const [viewMode, setViewMode] = useState<'list' | 'preview'>('preview');

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
      <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as 'list' | 'preview')}>
        <TabsList>
          <TabsTrigger value="preview">Preview Mode</TabsTrigger>
          <TabsTrigger value="list">List Mode</TabsTrigger>
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
      </Tabs>
    </div>
  );
}