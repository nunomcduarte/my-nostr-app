import { Link, useLocation } from 'react-router-dom';
import { Clock, User, Calendar as CalendarIcon, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function Navigation() {
  const location = useLocation();

  const navItems = [
    {
      href: '/scheduler',
      label: 'Scheduler',
      icon: Clock,
    },
    {
      href: '/calendar',
      label: 'Calendar',
      icon: CalendarIcon,
    },
    {
      href: '/dashboard',
      label: 'Dashboard',
      icon: BarChart3,
    },
    {
      href: '/profile',
      label: 'Profile',
      icon: User,
    },
  ];

  return (
    <nav className="flex items-center gap-2">
      {navItems.map(({ href, label, icon: Icon }) => (
        <Button
          key={href}
          variant="ghost"
          size="sm"
          asChild
          className={cn(
            "gap-2",
            location.pathname === href && "bg-muted"
          )}
        >
          <Link to={href}>
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        </Button>
      ))}
    </nav>
  );
}