import React, { useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useScheduledPosts, type ScheduledPost } from '@/hooks/useScheduledPosts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';

// Helper to determine event color based on status
const getEventColor = (status: ScheduledPost['status']) => {
  switch (status) {
    case 'published':
      return '#10b981'; // green
    case 'scheduled':
      return '#3b82f6'; // blue
    case 'failed':
      return '#ef4444'; // red
    case 'cancelled':
      return '#6b7280'; // gray
    default:
      return '#8b5cf6'; // purple
  }
};

export function Calendar() {
  const { user } = useCurrentUser();
  const { data: posts, isLoading, error } = useScheduledPosts(user?.pubkey);
  const [selectedEvent, setSelectedEvent] = useState<ScheduledPost | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const calendarEvents = React.useMemo(() => {
    if (!posts) return [];
    return posts.map((post) => ({
      id: post.id,
      title: post.title || (post.content.length > 30 ? post.content.substring(0, 27) + '...' : post.content) || 'Scheduled Post',
      start: post.scheduledAt,
      allDay: false, // Assuming posts are scheduled at specific times
      extendedProps: {
        post,
      },
      backgroundColor: getEventColor(post.status),
      borderColor: getEventColor(post.status),
      textColor: '#ffffff',
    }));
  }, [posts]);

  const handleEventClick = (clickInfo: { event: { extendedProps: { post?: ScheduledPost } } }) => {
    const post = clickInfo.event.extendedProps.post;
    if (post) {
      setSelectedEvent(post);
      setIsDialogOpen(true);
    }
  };

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <AlertDescription>Please log in to view your post calendar.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="px-6 py-6">
      <Card className="border shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5" />
              <span>Post Calendar</span>
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="ml-2 text-muted-foreground">Loading your posts...</p>
            </div>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>
                Failed to load posts: {error instanceof Error ? error.message : 'Unknown error'}
              </AlertDescription>
            </Alert>
          )}
          {!isLoading && !error && (
            <div className="fc-styles-wrapper">
              <style dangerouslySetInnerHTML={{
                __html: `
                  .fc {
                    --fc-border-color: hsl(var(--border));
                    --fc-button-bg-color: hsl(var(--primary));
                    --fc-button-border-color: hsl(var(--primary));
                    --fc-button-hover-bg-color: hsl(var(--primary) / 0.9);
                    --fc-button-hover-border-color: hsl(var(--primary) / 0.9);
                    --fc-button-active-bg-color: hsl(var(--primary) / 0.8);
                    --fc-button-active-border-color: hsl(var(--primary) / 0.8);
                    --fc-event-border-color: transparent;
                    --fc-page-bg-color: transparent;
                    --fc-today-bg-color: hsl(var(--muted) / 0.5);
                    height: 100%;
                  }
                  .fc-theme-standard .fc-scrollgrid {
                    border-color: hsl(var(--border));
                  }
                  .fc-theme-standard td, .fc-theme-standard th {
                    border-color: hsl(var(--border));
                  }
                  .fc .fc-daygrid-day-number, .fc .fc-col-header-cell-cushion {
                    color: hsl(var(--foreground));
                    text-decoration: none;
                  }
                  .fc-day-today .fc-daygrid-day-number {
                    font-weight: bold;
                  }
                  .fc-event {
                    cursor: pointer;
                    border-radius: 4px;
                    padding: 2px 4px;
                    font-size: 0.875rem;
                  }
                  .fc-event-time {
                    font-weight: 500;
                  }
                  .fc-toolbar-title {
                    font-size: 1.25rem !important;
                    font-weight: 600;
                  }
                  .fc .fc-button {
                    font-size: 0.875rem;
                    padding: 0.25rem 0.5rem;
                    border-radius: 0.25rem;
                  }
                  .fc .fc-button-primary:not(:disabled):active,
                  .fc .fc-button-primary:not(:disabled).fc-button-active {
                    background-color: hsl(var(--primary) / 0.8);
                    border-color: hsl(var(--primary) / 0.8);
                  }
                `
              }} />
              <FullCalendar
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                initialView="dayGridMonth"
                headerToolbar={{
                  left: 'prev,next today',
                  center: 'title',
                  right: 'dayGridMonth,timeGridWeek,timeGridDay'
                }}
                events={calendarEvents}
                eventClick={handleEventClick}
                dayMaxEvents={true}
                height="auto"
                aspectRatio={1.5}
                buttonText={{
                  today: 'Today',
                  month: 'Month',
                  week: 'Week',
                  day: 'Day',
                }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Event Details Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedEvent?.title || 'Post Details'}</DialogTitle>
            <DialogDescription>
              <div className="mt-2 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Status:</span>
                  <Badge 
                    variant={selectedEvent?.status === 'published' ? 'default' : 
                           selectedEvent?.status === 'scheduled' ? 'secondary' : 
                           selectedEvent?.status === 'failed' ? 'destructive' : 'outline'}
                  >
                    {selectedEvent?.status}
                  </Badge>
                </div>
                
                <div>
                  <span className="text-sm font-medium">Scheduled for:</span>
                  <p className="text-sm">
                    {selectedEvent?.scheduledAt ? format(selectedEvent.scheduledAt, 'PPpp') : 'Unknown date'}
                  </p>
                </div>
                
                <div>
                  <span className="text-sm font-medium">Content:</span>
                  <p className="mt-1 whitespace-pre-wrap rounded-md bg-muted p-2 text-sm">
                    {selectedEvent?.content || 'No content available'}
                  </p>
                </div>
                
                {selectedEvent?.publishedEventId && (
                  <div>
                    <span className="text-sm font-medium">Published Event ID:</span>
                    <p className="mt-1 overflow-hidden text-ellipsis rounded-md bg-muted p-2 text-xs">
                      {selectedEvent.publishedEventId}
                    </p>
                  </div>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default Calendar;
