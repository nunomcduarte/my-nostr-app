import { useState, useMemo } from 'react';
import { Calendar as CalendarIcon, ArrowUp, MessageSquare, Repeat, Zap, BarChart3, List, Copy, ExternalLink, Check } from 'lucide-react';
import { format } from 'date-fns';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useZapAnalytics } from '@/hooks/useZapAnalytics';
import { useGetLikeCount } from '@/hooks/useGetLikeCount';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// Helper Components
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <Button 
      variant="ghost" 
      size="icon" 
      className="h-6 w-6" 
      onClick={handleCopy}
      title="Copy to clipboard"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
}

function PostContent({ content }: { content: string }) {
  // Extract URLs that might be images
  const extractedUrls = useMemo(() => {
    const urlRegex = /(https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp)(\?[^\s]*)?)/gi;
    return content.match(urlRegex) || [];
  }, [content]);
  
  // Format the text content with line breaks preserved
  const formattedContent = useMemo(() => {
    // Replace image URLs with placeholders to avoid showing them twice
    let processedContent = content;
    extractedUrls.forEach(url => {
      processedContent = processedContent.replace(url, '');
    });
    return processedContent.trim();
  }, [content, extractedUrls]);
  
  return (
    <div className="space-y-4">
      {/* Text content */}
      <div className="whitespace-pre-wrap">{formattedContent}</div>
      
      {/* Images if any */}
      {extractedUrls.length > 0 && (
        <div className="space-y-2">
          {extractedUrls.map((url, index) => (
            <div key={index} className="rounded-md overflow-hidden">
              <img 
                src={url} 
                alt="Post content" 
                className="max-w-full h-auto object-cover" 
                onError={(e) => {
                  // Hide image if it fails to load
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Types
interface MetricCardProps {
  title: string;
  value: number | string;
  description: string;
  icon: React.ReactNode;
  trend?: number;
  loading?: boolean;
}

interface PostMetrics {
  likes: number;
  comments: number;
  reposts: number;
  zaps: number;
  zapAmount: number;
}

interface PostWithMetrics {
  id: string;
  title?: string;
  content: string;
  publishedAt: Date;
  metrics: PostMetrics;
}

// Helper function to get post metrics
async function getPostMetrics(nostr: any, eventId: string): Promise<PostMetrics> {
  // Get likes (kind 7 with e tag pointing to the event)
  const likes = await nostr.query([
    { kinds: [7], '#e': [eventId] }
  ]);
  
  // Get comments (kind 1 with e tag pointing to the event)
  const comments = await nostr.query([
    { kinds: [1], '#e': [eventId] }
  ]);
  
  // Get reposts (kind 6 with e tag pointing to the event)
  const reposts = await nostr.query([
    { kinds: [6], '#e': [eventId] }
  ]);
  
  // Get zaps (kind 9735 with e tag pointing to the event)
  const zaps = await nostr.query([
    { kinds: [9735], '#e': [eventId] }
  ]);
  
  // Calculate total zap amount
  let zapAmount = 0;
  for (const zap of zaps) {
    const bolt11Tag = zap.tags.find((tag: string[]) => tag[0] === 'bolt11');
    if (bolt11Tag?.[1]) {
      try {
        // This is a simplified version - in production you'd use a proper bolt11 parser
        const amountMatch = bolt11Tag[1].match(/lnbc(\d+)([munp]?)/i);
        if (amountMatch) {
          const amount = parseInt(amountMatch[1]);
          const unit = amountMatch[2]?.toLowerCase();
          
          // Convert to sats based on unit
          switch (unit) {
            case 'm': zapAmount += amount * 100000; break; // milli-bitcoin to sats
            case 'u': zapAmount += amount * 100; break; // micro-bitcoin to sats  
            case 'n': zapAmount += amount / 10; break; // nano-bitcoin to sats
            case 'p': zapAmount += amount / 10000; break; // pico-bitcoin to sats
            default: zapAmount += amount * 100000000; break; // bitcoin to sats
          }
        }
      } catch (error) {
        console.error('Failed to parse zap amount', error);
      }
    }
  }
  
  return {
    likes: likes.length,
    comments: comments.length,
    reposts: reposts.length,
    zaps: zaps.length,
    zapAmount
  };
}

// MetricCard Component
function MetricCard({ title, value, description, icon, trend, loading = false }: MetricCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="h-4 w-4 text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-7 w-[100px]" />
        ) : (
          <div className="text-2xl font-bold">{value}</div>
        )}
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
      {trend !== undefined && (
        <CardFooter className="p-2">
          <p className={cn(
            "text-xs font-medium",
            trend > 0 ? "text-green-500" : trend < 0 ? "text-red-500" : "text-gray-500"
          )}>
            {trend > 0 ? "+" : ""}{trend}% from last period
          </p>
        </CardFooter>
      )}
    </Card>
  );
}

// Dashboard Component
export default function Dashboard() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const [dateRange, setDateRange] = useState<Date | undefined>(new Date());
  const [timeFrame, setTimeFrame] = useState<string>("week");
  const [selectedPost, setSelectedPost] = useState<PostWithMetrics | null>(null);
  
  // Get zap analytics
  const { data: zapAnalytics, isLoading: zapLoading } = useZapAnalytics();
  
  // Get like count
  const { data: likeCount, isLoading: likesLoading } = useGetLikeCount(
    user?.pubkey || '',
    { enabled: !!user?.pubkey }
  );
  
  // Get published events from scheduled posts and regular posts
  const { data: publishedPosts, isLoading: postsLoading } = useQuery({
    queryKey: ['published-posts', user?.pubkey],
    queryFn: async () => {
      if (!user?.pubkey || !nostr) return [];
      
      const result: PostWithMetrics[] = [];
      
      // Get all scheduled posts that have been published
      const scheduledPosts = await nostr.query([
        { kinds: [36611], authors: [user.pubkey], '#status': ['published'] }
      ]);
      
      // Process scheduled posts
      for (const post of scheduledPosts) {
        const publishedEventId = post.tags.find((tag: string[]) => tag[0] === 'published_event_id')?.[1];
        if (!publishedEventId) continue;
        
        // Get the published event
        const publishedEvents = await nostr.query([
          { ids: [publishedEventId] }
        ]);
        
        if (publishedEvents.length === 0) continue;
        const publishedEvent = publishedEvents[0];
        
        // Get metrics for this post
        const metrics = await getPostMetrics(nostr, publishedEventId);
        
        // Get title if available
        const title = post.tags.find((tag: string[]) => tag[0] === 'title')?.[1];
        
        result.push({
          id: publishedEventId,
          title: title,
          content: publishedEvent.content,
          publishedAt: new Date(publishedEvent.created_at * 1000),
          metrics
        });
      }
      
      // Get regular posts (kind 1)
      const regularPosts = await nostr.query([
        { kinds: [1], authors: [user.pubkey] }
      ]);
      
      // Process regular posts
      for (const post of regularPosts) {
        // Skip posts that are already included from scheduled posts
        if (result.some(p => p.id === post.id)) continue;
        
        // Get metrics for this post
        const metrics = await getPostMetrics(nostr, post.id);
        
        result.push({
          id: post.id,
          content: post.content,
          publishedAt: new Date(post.created_at * 1000),
          metrics
        });
      }
      
      // Sort by published date (newest first)
      return result.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
    },
    enabled: !!user?.pubkey && !!nostr
  });
  
  // Calculate total metrics
  const totalMetrics = publishedPosts?.reduce(
    (acc, post) => {
      acc.likes += post.metrics.likes;
      acc.comments += post.metrics.comments;
      acc.reposts += post.metrics.reposts;
      acc.zaps += post.metrics.zaps;
      acc.zapAmount += post.metrics.zapAmount;
      return acc;
    },
    { likes: 0, comments: 0, reposts: 0, zaps: 0, zapAmount: 0 }
  ) || { likes: 0, comments: 0, reposts: 0, zaps: 0, zapAmount: 0 };
  
  // Filter posts by selected time frame
  const getFilteredPosts = () => {
    if (!publishedPosts) return [];
    
    const now = new Date();
    let cutoffDate = new Date();
    
    switch (timeFrame) {
      case 'day':
        cutoffDate.setDate(now.getDate() - 1);
        break;
      case 'week':
        cutoffDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        cutoffDate.setMonth(now.getMonth() - 1);
        break;
      case 'year':
        cutoffDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        cutoffDate = new Date(0); // All time
    }
    
    return publishedPosts.filter(post => post.publishedAt >= cutoffDate);
  };
  
  const filteredPosts = getFilteredPosts();
  
  // Calculate filtered metrics
  const filteredMetrics = filteredPosts.reduce(
    (acc, post) => {
      acc.likes += post.metrics.likes;
      acc.comments += post.metrics.comments;
      acc.reposts += post.metrics.reposts;
      acc.zaps += post.metrics.zaps;
      acc.zapAmount += post.metrics.zapAmount;
      return acc;
    },
    { likes: 0, comments: 0, reposts: 0, zaps: 0, zapAmount: 0 }
  );
  
  // Loading state
  const isLoading = postsLoading || zapLoading || likesLoading;
  
  return (
    <div className="container py-10 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Track engagement metrics for your scheduled posts
        </p>
      </div>
      
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Select value={timeFrame} onValueChange={setTimeFrame}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select time frame" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Last 24 hours</SelectItem>
              <SelectItem value="week">Last 7 days</SelectItem>
              <SelectItem value="month">Last 30 days</SelectItem>
              <SelectItem value="year">Last year</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
          
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-[240px] justify-start text-left font-normal",
                  !dateRange && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateRange ? format(dateRange, 'PPP') : <span>Pick a date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateRange}
                onSelect={setDateRange}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Likes"
          value={isLoading ? "..." : filteredMetrics.likes.toString()}
          description={`From ${filteredPosts.length} published posts`}
          icon={<ArrowUp className="h-4 w-4" />}
          loading={isLoading}
        />
        <MetricCard
          title="Total Comments"
          value={isLoading ? "..." : filteredMetrics.comments.toString()}
          description={`From ${filteredPosts.length} published posts`}
          icon={<MessageSquare className="h-4 w-4" />}
          loading={isLoading}
        />
        <MetricCard
          title="Total Reposts"
          value={isLoading ? "..." : filteredMetrics.reposts.toString()}
          description={`From ${filteredPosts.length} published posts`}
          icon={<Repeat className="h-4 w-4" />}
          loading={isLoading}
        />
        <MetricCard
          title="Total Zaps"
          value={isLoading ? "..." : `${filteredMetrics.zaps} (${filteredMetrics.zapAmount.toLocaleString()} sats)`}
          description={`From ${filteredPosts.length} published posts`}
          icon={<Zap className="h-4 w-4" />}
          loading={isLoading}
        />
      </div>
      
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="posts">Posts</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-4">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-4 w-[250px]" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-4 w-full mb-2" />
                    <Skeleton className="h-4 w-[80%]" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredPosts.length === 0 ? (
            <Card>
              <CardContent className="py-10">
                <div className="text-center text-muted-foreground">
                  No published posts found in the selected time frame
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredPosts.map(post => (
                <Card key={post.id}>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {post.title || post.content.substring(0, 50) + (post.content.length > 50 ? '...' : '')}
                    </CardTitle>
                    <CardDescription>
                      Published on {format(post.publishedAt, 'PPP')} at {format(post.publishedAt, 'p')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-3">
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <ArrowUp className="h-3 w-3" /> {post.metrics.likes} likes
                      </Badge>
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" /> {post.metrics.comments} comments
                      </Badge>
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <Repeat className="h-3 w-3" /> {post.metrics.reposts} reposts
                      </Badge>
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <Zap className="h-3 w-3" /> {post.metrics.zaps} zaps ({post.metrics.zapAmount.toLocaleString()} sats)
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="analytics" className="space-y-6">
          <h2 className="text-xl font-semibold mt-4">Engagement Analytics</h2>
          
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Top Zappers</CardTitle>
                <CardDescription>Users who've sent you the most zaps</CardDescription>
              </CardHeader>
              <CardContent>
                {zapLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4, 5].map(i => (
                      <Skeleton key={i} className="h-5 w-full" />
                    ))}
                  </div>
                ) : zapAnalytics?.topZappers.length === 0 ? (
                  <p className="text-muted-foreground">No zaps received yet</p>
                ) : (
                  <ul className="space-y-2">
                    {zapAnalytics?.topZappers.map((zapper, i) => (
                      <li key={zapper.pubkey} className="flex items-center justify-between">
                        <span className="text-sm">
                          {zapper.pubkey.substring(0, 8)}...{zapper.pubkey.substring(zapper.pubkey.length - 4)}
                        </span>
                        <span className="text-sm font-medium">
                          {zapper.amount.toLocaleString()} sats ({zapper.count} zaps)
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Engagement Summary</CardTitle>
                <CardDescription>Overall engagement statistics</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Total Published Posts:</span>
                    <span className="font-medium">{isLoading ? "..." : publishedPosts?.length || 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Average Likes per Post:</span>
                    <span className="font-medium">
                      {isLoading ? "..." : 
                        publishedPosts && publishedPosts.length > 0 
                          ? (totalMetrics.likes / publishedPosts.length).toFixed(1) 
                          : "0"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Average Comments per Post:</span>
                    <span className="font-medium">
                      {isLoading ? "..." : 
                        publishedPosts && publishedPosts.length > 0 
                          ? (totalMetrics.comments / publishedPosts.length).toFixed(1) 
                          : "0"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Average Zaps per Post:</span>
                    <span className="font-medium">
                      {isLoading ? "..." : 
                        publishedPosts && publishedPosts.length > 0 
                          ? (totalMetrics.zaps / publishedPosts.length).toFixed(1) 
                          : "0"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Average Sats per Post:</span>
                    <span className="font-medium">
                      {isLoading ? "..." : 
                        publishedPosts && publishedPosts.length > 0 
                          ? (totalMetrics.zapAmount / publishedPosts.length).toFixed(0) 
                          : "0"}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Engagement Trends</CardTitle>
                <CardDescription>How your engagement has changed over time</CardDescription>
              </div>
              <BarChart3 className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-center py-10">
                Detailed analytics charts will be implemented in a future update
              </p>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="posts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">All Posts</CardTitle>
              <CardDescription>View all your posts and their engagement metrics</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : publishedPosts && publishedPosts.length > 0 ? (
                <div className="rounded-md border">
                  <Table>
                    <TableCaption>A list of all your posts and their engagement metrics</TableCaption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title/Content</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Likes</TableHead>
                        <TableHead className="text-right">Comments</TableHead>
                        <TableHead className="text-right">Reposts</TableHead>
                        <TableHead className="text-right">Zaps</TableHead>
                        <TableHead className="text-right">Zaps (Sats)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPosts.map((post) => (
                        <TableRow 
                          key={post.id} 
                          className="group cursor-pointer hover:bg-muted/80"
                        >
                          <TableCell className="font-medium" onClick={() => setSelectedPost(post)}>
                            <div className="flex items-center justify-between">
                              <span>{post.title || post.content.substring(0, 50) + (post.content.length > 50 ? '...' : '')}</span>
                              <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => { e.stopPropagation(); setSelectedPost(post); }}>View</Button>
                            </div>
                          </TableCell>
                          <TableCell onClick={() => setSelectedPost(post)}>{format(post.publishedAt, 'PPP')}</TableCell>
                          <TableCell className="text-right" onClick={() => setSelectedPost(post)}>{post.metrics.likes}</TableCell>
                          <TableCell className="text-right" onClick={() => setSelectedPost(post)}>{post.metrics.comments}</TableCell>
                          <TableCell className="text-right" onClick={() => setSelectedPost(post)}>{post.metrics.reposts}</TableCell>
                          <TableCell className="text-right" onClick={() => setSelectedPost(post)}>{post.metrics.zaps}</TableCell>
                          <TableCell className="text-right" onClick={() => setSelectedPost(post)}>{post.metrics.zapAmount.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="py-6 text-center text-muted-foreground">
                  <List className="mx-auto h-8 w-8 opacity-50" />
                  <p className="mt-2">No posts found</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Post Detail Dialog */}
      <Dialog 
        open={!!selectedPost} 
        onOpenChange={(open) => !open && setSelectedPost(null)}
      >
        <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl">
                {selectedPost?.title || 'Post Details'}
              </DialogTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {selectedPost?.id ? `ID: ${selectedPost.id.substring(0, 8)}...` : ''}
                </Badge>
                <CopyButton value={selectedPost?.id || ''} />
              </div>
            </div>
            <DialogDescription className="flex items-center justify-between">
              <span>Published on {selectedPost && format(selectedPost.publishedAt, 'PPP')} at {selectedPost && format(selectedPost.publishedAt, 'p')}</span>
              <div className="flex items-center gap-1 text-xs">
                <Badge variant="secondary" className="flex items-center gap-1">
                  <ArrowUp className="h-3 w-3" /> {selectedPost?.metrics.likes || 0}
                </Badge>
                <Badge variant="secondary" className="flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" /> {selectedPost?.metrics.comments || 0}
                </Badge>
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Repeat className="h-3 w-3" /> {selectedPost?.metrics.reposts || 0}
                </Badge>
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Zap className="h-3 w-3" /> {selectedPost?.metrics.zaps || 0}
                </Badge>
              </div>
            </DialogDescription>
          </DialogHeader>
          
          {selectedPost && (
            <div className="space-y-6">
              {/* Post Content with Images */}
              <Card>
                <CardContent className="pt-6">
                  <div className="prose max-w-none dark:prose-invert">
                    <PostContent content={selectedPost.content} />
                  </div>
                </CardContent>
              </Card>
              
              {/* Metrics and Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Engagement Details</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <ArrowUp className="h-4 w-4 text-blue-500" />
                          <span className="text-muted-foreground">Likes</span>
                        </div>
                        <span className="font-medium">{selectedPost.metrics.likes}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="h-4 w-4 text-green-500" />
                          <span className="text-muted-foreground">Comments</span>
                        </div>
                        <span className="font-medium">{selectedPost.metrics.comments}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <Repeat className="h-4 w-4 text-purple-500" />
                          <span className="text-muted-foreground">Reposts</span>
                        </div>
                        <span className="font-medium">{selectedPost.metrics.reposts}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Zap Details</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <Zap className="h-4 w-4 text-yellow-500" />
                          <span className="text-muted-foreground">Count</span>
                        </div>
                        <span className="font-medium">{selectedPost.metrics.zaps}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <Zap className="h-4 w-4 text-yellow-500" />
                          <span className="text-muted-foreground">Amount</span>
                        </div>
                        <span className="font-medium">{selectedPost.metrics.zapAmount.toLocaleString()} sats</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <Zap className="h-4 w-4 text-yellow-500" />
                          <span className="text-muted-foreground">Avg per Zap</span>
                        </div>
                        <span className="font-medium">
                          {selectedPost.metrics.zaps > 0 
                            ? Math.round(selectedPost.metrics.zapAmount / selectedPost.metrics.zaps).toLocaleString() 
                            : 0} sats
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              {/* Post ID and Actions */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Post Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Post ID:</span>
                      <div className="flex items-center gap-2">
                        <code className="text-xs bg-muted px-1 py-0.5 rounded">
                          {selectedPost.id}
                        </code>
                        <CopyButton value={selectedPost.id} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Character Count:</span>
                      <span>{selectedPost.content.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Word Count:</span>
                      <span>{selectedPost.content.trim().split(/\s+/).length}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <div className="flex justify-between">
                <Button 
                  variant="outline" 
                  size="sm"
                  className="flex items-center gap-1"
                  onClick={() => window.open(`https://nostr.com/${selectedPost.id}`, '_blank')}
                >
                  <ExternalLink className="h-4 w-4" />
                  View on Nostr
                </Button>
                <Button variant="outline" onClick={() => setSelectedPost(null)}>Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
