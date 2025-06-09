import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, Clock } from 'lucide-react';
import { useCreateScheduledPost } from '@/hooks/useCreateScheduledPost';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ImageUpload, type ImageData } from '@/components/ImageUpload';
import { cn } from '@/lib/utils';

interface SchedulePostFormProps {
  onSuccess?: () => void;
  className?: string;
}

export function SchedulePostForm({ onSuccess, className }: SchedulePostFormProps) {
  const { user } = useCurrentUser();
  const { mutate: createScheduledPost, isPending } = useCreateScheduledPost();
  const { toast } = useToast();

  // Form state
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [scheduledDate, setScheduledDate] = useState<Date>();
  const [scheduledTime, setScheduledTime] = useState('');
  const [postKind, setPostKind] = useState('1');
  const [images, setImages] = useState<ImageData[]>([]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!content.trim()) {
      toast({
        title: 'Content required',
        description: 'Please enter the content for your post',
        variant: 'destructive',
      });
      return;
    }

    if (!scheduledDate) {
      toast({
        title: 'Date required',
        description: 'Please select a scheduled date',
        variant: 'destructive',
      });
      return;
    }

    if (!scheduledTime) {
      toast({
        title: 'Time required',
        description: 'Please select a scheduled time',
        variant: 'destructive',
      });
      return;
    }

    // Combine date and time
    const [hours, minutes] = scheduledTime.split(':').map(Number);
    const scheduledAt = new Date(scheduledDate);
    scheduledAt.setHours(hours, minutes, 0, 0);

    // Check if scheduled time is in the future
    if (scheduledAt <= new Date()) {
      toast({
        title: 'Invalid time',
        description: 'Scheduled time must be in the future',
        variant: 'destructive',
      });
      return;
    }

    createScheduledPost({
      content: content.trim(),
      scheduledAt,
      postKind: parseInt(postKind),
      title: title.trim() || undefined,
      images: images.length > 0 ? images : undefined,
    }, {
      onSuccess: () => {
        toast({
          title: 'Post scheduled!',
          description: `Your post will be published on ${format(scheduledAt, 'PPP')} at ${format(scheduledAt, 'p')}`,
        });
        
        // Reset form
        setContent('');
        setTitle('');
        setScheduledDate(undefined);
        setScheduledTime('');
        setPostKind('1');
        setImages([]);
        
        onSuccess?.();
      },
      onError: (error) => {
        toast({
          title: 'Failed to schedule post',
          description: error.message,
          variant: 'destructive',
        });
      },
    });
  };

  if (!user) {
    return (
      <Card className={className}>
        <CardContent className="py-12 px-8 text-center">
          <p className="text-muted-foreground">Please log in to schedule posts</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Schedule Post
        </CardTitle>
        <CardDescription>
          Create a post that will be automatically published at a future time
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="title">Title (Optional)</Label>
            <Input
              id="title"
              placeholder="Give your post a title for easy identification"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              This is just for your reference and won't be included in the post
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Post Content</Label>
            <Textarea
              id="content"
              placeholder="What's on your mind?"
              className="min-h-32"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={5000}
            />
            <p className="text-sm text-muted-foreground">
              {content.length}/5000 characters
            </p>
          </div>

          <ImageUpload
            images={images}
            onImagesChange={setImages}
            maxImages={4}
          />

          <div className="space-y-2">
            <Label htmlFor="postKind">Post Type</Label>
            <Select value={postKind} onValueChange={setPostKind}>
              <SelectTrigger>
                <SelectValue placeholder="Select post type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Text Note</SelectItem>
                <SelectItem value="30023">Long-form Article</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Choose the type of Nostr event to publish
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full pl-3 text-left font-normal',
                      !scheduledDate && 'text-muted-foreground'
                    )}
                  >
                    {scheduledDate ? (
                      format(scheduledDate, 'PPP')
                    ) : (
                      <span>Pick a date</span>
                    )}
                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={scheduledDate}
                    onSelect={setScheduledDate}
                    disabled={(date) =>
                      date < new Date(new Date().setHours(0, 0, 0, 0))
                    }
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="time">Time</Label>
              <Input
                id="time"
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
              />
            </div>
          </div>

          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? 'Scheduling...' : 'Schedule Post'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}