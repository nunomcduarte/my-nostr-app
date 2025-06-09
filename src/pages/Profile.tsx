import { User, Settings, LogOut, Calendar, Activity, Clock, Copy, Check, AlertCircle, Wifi, RefreshCw } from 'lucide-react';
import { useSeoMeta } from '@unhead/react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useScheduledPosts } from '@/hooks/useScheduledPosts';
import { useQueryClient } from '@tanstack/react-query';
import { LoginArea } from '@/components/auth/LoginArea';
import { LogoutButton } from '@/components/auth/LogoutButton';
import { EditProfileForm } from '@/components/EditProfileForm';
import { Navigation } from '@/components/Navigation';
import { RelaySelector } from '@/components/RelaySelector';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { genUserName } from '@/lib/genUserName';
import { useState } from 'react';
import { nip19 } from 'nostr-tools';

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

export function Profile() {
  const { 
    user, 
    metadata, 
    isLoading: isLoadingProfile, 
    foundOnRelay,
    triedRelays,
    hasTriedMultipleRelays,
    currentTryRelay
  } = useCurrentUser();
  const { data: posts } = useScheduledPosts(user?.pubkey);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [copiedNpub, setCopiedNpub] = useState(false);
  const [copiedPubkey, setCopiedPubkey] = useState(false);
  const queryClient = useQueryClient();

  // Check if we have any profile data (excluding the fallback generated name)
  const hasProfileData = metadata && (metadata.name || metadata.display_name || metadata.picture || metadata.about);
  const isUsingFallbackName = !hasProfileData;

  useSeoMeta({
    title: user ? `${metadata?.name || genUserName(user.pubkey)} - Profile` : 'Profile',
    description: metadata?.about || 'View and manage your Nostr profile',
  });

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="flex items-center justify-center gap-2">
                <User className="h-6 w-6" />
                Profile
              </CardTitle>
              <CardDescription>
                View and manage your Nostr profile
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center space-y-4">
                <p className="text-muted-foreground">
                  Sign in to view your profile
                </p>
                <LoginArea className="w-full max-w-sm mx-auto" />
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

  const displayName = metadata?.display_name || metadata?.name || genUserName(user.pubkey);
  const userName = metadata?.name || genUserName(user.pubkey);
  const profileImage = metadata?.picture;
  const about = metadata?.about;
  const website = metadata?.website;
  const nip05 = metadata?.nip05;

  const copyToClipboard = async (text: string, type: 'npub' | 'pubkey') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'npub') {
        setCopiedNpub(true);
        setTimeout(() => setCopiedNpub(false), 2000);
      } else {
        setCopiedPubkey(true);
        setTimeout(() => setCopiedPubkey(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  const refreshProfile = () => {
    if (user?.pubkey) {
      // Invalidate both query keys to force refresh
      queryClient.invalidateQueries({ queryKey: ['profile-with-fallback', user.pubkey] });
      queryClient.invalidateQueries({ queryKey: ['author', user.pubkey] });
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Navigation />
          <LogoutButton variant="outline" size="sm" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <User className="h-8 w-8" />
              Profile
            </h1>
            <p className="text-muted-foreground mt-2">
              View and manage your Nostr profile
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Settings className="h-4 w-4 mr-2" />
                  Edit Profile
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Edit Profile</DialogTitle>
                  <DialogDescription>
                    Update your Nostr profile information
                  </DialogDescription>
                </DialogHeader>
                <EditProfileForm />
              </DialogContent>
            </Dialog>
            
            <LogoutButton variant="destructive" />
          </div>
        </div>

        {/* Profile Loading/Missing Data Warning */}
        {isLoadingProfile && (
          <Alert>
            <Wifi className="h-4 w-4 animate-pulse" />
            <AlertDescription>
              {currentTryRelay ? (
                <div>
                  Searching for your profile data...
                  <br />
                  <span className="text-xs text-muted-foreground">
                    Currently trying: {currentTryRelay}
                    {triedRelays.length > 0 && ` (${triedRelays.length} relays tried)`}
                  </span>
                </div>
              ) : (
                'Loading your profile data from the relay...'
              )}
            </AlertDescription>
          </Alert>
        )}

        {foundOnRelay && hasProfileData && (
          <Alert>
            <Check className="h-4 w-4 text-green-600" />
            <AlertDescription>
              <div className="flex items-center justify-between">
                <span>
                  <strong>Profile loaded successfully!</strong> Found your profile data on {foundOnRelay.replace('wss://', '')}
                  {hasTriedMultipleRelays && ` after searching ${triedRelays.length} relays`}.
                </span>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {!isLoadingProfile && isUsingFallbackName && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="flex flex-col gap-3">
                <div>
                  <strong>Profile data not found.</strong> You're seeing a generated name because your profile metadata wasn't found
                  {triedRelays.length > 0 && ` on ${triedRelays.length} relays we tried`}.
                </div>
                {triedRelays.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    <strong>Tried relays:</strong> {triedRelays.map(relay => relay.replace('wss://', '')).join(', ')}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-sm">Try a different relay or create your profile:</span>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={refreshProfile}
                      disabled={isLoadingProfile}
                    >
                      <RefreshCw className={`h-3 w-3 mr-1 ${isLoadingProfile ? 'animate-spin' : ''}`} />
                      Retry
                    </Button>
                    <RelaySelector />
                  </div>
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Profile Info */}
        <Card>
          <CardContent className="pt-6">
            {isLoadingProfile ? (
              <div className="flex items-start gap-6">
                <Skeleton className="h-24 w-24 rounded-full" />
                <div className="flex-1 space-y-3">
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-48" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-6">
                <Avatar className="h-24 w-24">
                  <AvatarImage src={profileImage} alt={displayName} />
                  <AvatarFallback className="text-2xl">
                    {displayName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                
                <div className="flex-1 space-y-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-2xl font-bold">{displayName}</h2>
                      {isUsingFallbackName && (
                        <Badge variant="outline" className="text-orange-600 border-orange-300">
                          Generated Name
                        </Badge>
                      )}
                    </div>
                    {displayName !== userName && (
                      <p className="text-muted-foreground">@{userName}</p>
                    )}
                    {nip05 && (
                      <Badge variant="secondary" className="mt-1">
                        ✓ {nip05}
                      </Badge>
                    )}
                  </div>
                  
                  {about ? (
                    <p className="text-muted-foreground">{about}</p>
                  ) : !isLoadingProfile && (
                    <p className="text-muted-foreground italic">No bio available</p>
                  )}
                  
                  {website && (
                    <a
                      href={website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      🌐 {website}
                    </a>
                  )}
                  
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <span>npub:</span>
                      <div className="flex items-center gap-1">
                        <code className="text-xs bg-muted px-2 py-1 rounded">
                          {nip19.npubEncode(user.pubkey)}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => copyToClipboard(nip19.npubEncode(user.pubkey), 'npub')}
                        >
                          {copiedNpub ? (
                            <Check className="h-3 w-3 text-green-600" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span>Public Key:</span>
                      <div className="flex items-center gap-1">
                        <code className="text-xs bg-muted px-2 py-1 rounded">
                          {user.pubkey.slice(0, 8)}...{user.pubkey.slice(-8)}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => copyToClipboard(user.pubkey, 'pubkey')}
                        >
                          {copiedPubkey ? (
                            <Check className="h-3 w-3 text-green-600" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <StatsCard
            title="Scheduled Posts"
            value={scheduledCount}
            description="Posts waiting to be published"
            icon={Clock}
          />
          <StatsCard
            title="Published Posts"
            value={publishedCount}
            description="Successfully published posts"
            icon={Activity}
          />
          <StatsCard
            title="Failed Posts"
            value={failedCount}
            description="Posts that failed to publish"
            icon={Clock}
          />
          <StatsCard
            title="Total Posts"
            value={userPosts.length}
            description="All scheduled posts"
            icon={Calendar}
          />
        </div>

        {/* Profile Management */}
        <Tabs defaultValue="account" className="space-y-6">
          <TabsList>
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
          </TabsList>
          
          <TabsContent value="account" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Account Settings</CardTitle>
                <CardDescription>
                  Manage your account preferences and profile information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Edit Profile</h4>
                    <p className="text-sm text-muted-foreground">
                      Update your display name, bio, and other profile information
                    </p>
                  </div>
                  <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline">
                        <Settings className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Edit Profile</DialogTitle>
                        <DialogDescription>
                          Update your Nostr profile information
                        </DialogDescription>
                      </DialogHeader>
                      <EditProfileForm />
                    </DialogContent>
                  </Dialog>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="security" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Security Settings</CardTitle>
                <CardDescription>
                  Manage your account security and login preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Sign Out</h4>
                    <p className="text-sm text-muted-foreground">
                      Sign out of your account on this device
                    </p>
                  </div>
                  <LogoutButton variant="destructive">
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </LogoutButton>
                </div>
                
                <Separator />
                
                <div className="space-y-2">
                  <h4 className="font-medium">Connection Information</h4>
                  <div className="text-sm text-muted-foreground space-y-2">
                    <div>
                      <span className="font-medium">npub: </span>
                      <code className="text-xs bg-muted px-2 py-1 rounded break-all">{nip19.npubEncode(user.pubkey)}</code>
                    </div>
                    <div>
                      <span className="font-medium">Public Key: </span>
                      <code className="text-xs bg-muted px-2 py-1 rounded break-all">{user.pubkey}</code>
                    </div>
                    <p>Login Type: <Badge variant="outline">{user.signer ? 'Extension/Bunker' : 'Private Key'}</Badge></p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default Profile;