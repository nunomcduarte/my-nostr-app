import { useState } from 'react';
import { Clock, Plus, Activity, Calendar } from 'lucide-react';
import { useSchedulerService } from '@/hooks/useSchedulerService';
import { useScheduledPosts } from '@/hooks/useScheduledPosts';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { LoginArea } from '@/components/auth/LoginArea';
// LogoutButton moved to sidebar
import { genUserName } from '@/lib/genUserName';
import { SchedulePostForm } from '@/components/SchedulePostForm';
import { ScheduledPostsList } from '@/components/ScheduledPostsList';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

function StatsCard({ title, value, description, icon: Icon }: {
  title: string;
  value: string | number;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

export function Scheduler() {
  const { user, metadata, isLoading: isLoadingProfile } = useCurrentUser();
  const { data: posts } = useScheduledPosts(user?.pubkey);
  const { isEnabled } = useSchedulerService();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="flex items-center justify-center gap-2">
                <Clock className="h-6 w-6" />
                Nostr Post Scheduler
              </CardTitle>
              <CardDescription>
                Schedule your social media posts on Nostr to be published automatically
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center space-y-4">
                <p className="text-muted-foreground">
                  Sign in to start scheduling your posts
                </p>
                <LoginArea className="w-full max-w-sm mx-auto" />
              </div>
              
              <div className="grid gap-4 text-sm">
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-blue-500 mt-0.5" />
                  <div>
                    <p className="font-medium">Schedule Posts</p>
                    <p className="text-muted-foreground">
                      Plan your content in advance and publish at optimal times
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Activity className="h-5 w-5 text-green-500 mt-0.5" />
                  <div>
                    <p className="font-medium">Auto-Publishing</p>
                    <p className="text-muted-foreground">
                      Your posts are published automatically when the scheduled time arrives
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-purple-500 mt-0.5" />
                  <div>
                    <p className="font-medium">Manage Schedule</p>
                    <p className="text-muted-foreground">
                      View, edit, or cancel your scheduled posts anytime
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Calculate stats
  const userPosts = posts?.filter(p => p.pubkey === user.pubkey) || [];
  const scheduledCount = userPosts.filter(p => p.status === 'scheduled').length;
  const publishedCount = userPosts.filter(p => p.status === 'published').length;
  const failedCount = userPosts.filter(p => p.status === 'failed').length;

  // Profile info
  const displayName = metadata?.display_name || metadata?.name || (user ? genUserName(user.pubkey) : '');
  const hasRealProfile = metadata && (metadata.name || metadata.display_name || metadata.picture || metadata.about);

  return (
    <div className="px-6 py-6">
      <div className="space-y-8">
        {/* Navigation moved to sidebar */}
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Clock className="h-8 w-8" />
              Post Scheduler
            </h1>
            <div className="flex items-center gap-2 mt-2">
              <p className="text-muted-foreground">
                {isLoadingProfile ? (
                  'Loading profile...'
                ) : (
                  <>
                    Welcome back, {displayName}
                    {!hasRealProfile && (
                      <span className="text-orange-600 ml-1">(using generated name)</span>
                    )}
                  </>
                )}
              </p>
              {isEnabled && (
                <Badge variant="secondary">
                  Auto-publish enabled
                </Badge>
              )}
            </div>
          </div>
          
          {/* Schedule Post button moved to sidebar */}
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <StatsCard
            title="Scheduled"
            value={scheduledCount}
            description="Posts waiting to be published"
            icon={Clock}
          />
          <StatsCard
            title="Published"
            value={publishedCount}
            description="Successfully published posts"
            icon={Activity}
          />
          <StatsCard
            title="Failed"
            value={failedCount}
            description="Posts that failed to publish"
            icon={Clock}
          />
          <StatsCard
            title="Total"
            value={userPosts.length}
            description="All scheduled posts"
            icon={Calendar}
          />
        </div>

        {/* Main Content */}
        <Tabs defaultValue="manage" className="space-y-6">
          <TabsList>
            <TabsTrigger value="manage">Manage Posts</TabsTrigger>
            <TabsTrigger value="create">Create New</TabsTrigger>
          </TabsList>
          
          <TabsContent value="manage" className="space-y-6">
            <ScheduledPostsList />
          </TabsContent>
          
          <TabsContent value="create" className="space-y-6">
            <div className="max-w-2xl">
              <SchedulePostForm />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}