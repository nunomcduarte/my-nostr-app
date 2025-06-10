import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { genUserName } from '@/lib/genUserName';
import { LogoutButton } from '@/components/auth/LogoutButton';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { SchedulePostForm } from '@/components/SchedulePostForm';
import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Plus, Calendar as CalendarIcon, BarChart3, Clock } from 'lucide-react';

interface SidebarLayoutProps {
  children: ReactNode;
}

export function SidebarLayout({ children }: SidebarLayoutProps) {
  const location = useLocation();
  const { user, metadata } = useCurrentUser();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  // Profile info
  const displayName = metadata?.display_name || metadata?.name || (user ? genUserName(user.pubkey) : '');
  const picture = metadata?.picture || '';
  const initials = displayName ? displayName.substring(0, 2).toUpperCase() : 'NO';

  const navItems = [
    {
      href: '/scheduler',
      label: 'Scheduler',
      icon: '📅',
      description: 'Schedule and manage posts'
    },
    {
      href: '/dashboard',
      label: 'Dashboard',
      icon: '📊',
      description: 'View analytics and metrics'
    },
    {
      href: '/calendar',
      label: 'Calendar',
      icon: '🗓️',
      description: 'Calendar view of posts'
    },
    {
      href: '/profile',
      label: 'Profile',
      icon: '👤',
      description: 'Manage your profile'
    },
  ];

  if (!user) return <>{children}</>;

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-background flex flex-col h-screen sticky top-0">
        {/* Profile section */}
        <div className="p-4 border-b">
          <div className="flex items-center gap-3 mb-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={picture} alt={displayName} />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="font-medium truncate">{displayName}</span>
              <span className="text-xs text-muted-foreground truncate">
                {user.pubkey.substring(0, 8)}...
              </span>
            </div>
          </div>
          <LogoutButton variant="outline" size="sm" className="w-full" />
        </div>

        {/* Schedule post button */}
        <div className="p-4 border-b">
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Schedule Post
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Schedule a New Post</DialogTitle>
                <DialogDescription>
                  Create a post that will be automatically published at a future time
                </DialogDescription>
              </DialogHeader>
              <SchedulePostForm onSuccess={() => setIsCreateDialogOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>

        {/* Navigation links */}
        <nav className="flex-1 p-2">
          <div className="space-y-1">
            {navItems.map(({ href, label, icon, description }) => (
              <Button
                key={href}
                variant={location.pathname === href ? "secondary" : "ghost"}
                size="sm"
                asChild
                className={cn(
                  "w-full justify-start text-left h-auto py-3",
                  location.pathname === href && "bg-secondary"
                )}
              >
                <Link to={href} className="flex items-center">
                  <span className="text-xl mr-3">{icon}</span>
                  <div className="flex flex-col">
                    <span>{label}</span>
                    <span className="text-xs text-muted-foreground">{description}</span>
                  </div>
                </Link>
              </Button>
            ))}
          </div>
        </nav>

        {/* App info */}
        <div className="p-4 border-t mt-auto">
          <div className="text-xs text-center text-muted-foreground">
            <p>Nostr Post Scheduler</p>
            <p className="mt-1">v1.0.0</p>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
