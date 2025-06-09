import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { Calendar, Clock, User, Image as ImageIcon } from 'lucide-react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { NoteContent } from '@/components/NoteContent';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { genUserName } from '@/lib/genUserName';
import type { ScheduledPost } from '@/hooks/useScheduledPosts';

interface PostPreviewProps {
  post: ScheduledPost;
  showAuthor?: boolean;
  compact?: boolean;
}

export function PostPreview({ post, showAuthor = true, compact = false }: PostPreviewProps) {
  const [decryptedContent, setDecryptedContent] = useState<string | null>(null);
  const [decryptedImages, setDecryptedImages] = useState<Array<{url: string; alt?: string}>>([]);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const { user } = useCurrentUser();
  const author = useAuthor(post.pubkey);

  const decryptContent = useCallback(async () => {
    if (!user?.signer?.nip44 || decryptedContent || isDecrypting) return;

    setIsDecrypting(true);
    try {
      const decrypted = await user.signer.nip44.decrypt(user.pubkey, post.content);
      const draftPost = JSON.parse(decrypted);
      setDecryptedContent(draftPost.content || '');
      
      if (draftPost.images && draftPost.images.length > 0) {
        setDecryptedImages(draftPost.images);
      }
    } catch (error) {
      console.warn('Failed to decrypt post content:', error);
      setDecryptedContent('[Unable to decrypt content]');
    } finally {
      setIsDecrypting(false);
    }
  }, [user, post.content, decryptedContent, isDecrypting]);

  useEffect(() => {
    if (user?.signer?.nip44 && user.pubkey === post.pubkey) {
      decryptContent();
    }
  }, [user, post, decryptContent]);

  const metadata = author.data?.metadata;
  const displayName = metadata?.name || genUserName(post.pubkey);
  const profileImage = metadata?.picture;

  // Create a mock event for NoteContent
  const mockEvent = {
    id: '',
    pubkey: post.pubkey,
    created_at: Math.floor(post.createdAt.getTime() / 1000),
    kind: post.postKind,
    tags: [],
    content: decryptedContent || '',
    sig: '',
  };

  if (compact) {
    return (
      <div className="border rounded-lg p-3 bg-card">
        <div className="flex items-start gap-3">
          {showAuthor && (
            <Avatar className="h-8 w-8">
              <AvatarImage src={profileImage} alt={displayName} />
              <AvatarFallback className="text-xs">
                {displayName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          )}
          <div className="flex-1 min-w-0">
            {showAuthor && (
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-sm">{displayName}</span>
                <span className="text-xs text-muted-foreground">
                  {format(post.scheduledAt, 'MMM d, h:mm a')}
                </span>
              </div>
            )}
            <div className="text-sm">
              {isDecrypting ? (
                <Skeleton className="h-4 w-full" />
              ) : decryptedContent ? (
                <div className="line-clamp-2">
                  <NoteContent event={mockEvent} className="text-sm" />
                </div>
              ) : (
                <span className="text-muted-foreground italic">Encrypted content</span>
              )}
            </div>
            {decryptedImages.length > 0 && (
              <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                <ImageIcon className="h-3 w-3" />
                <span>{decryptedImages.length} image{decryptedImages.length > 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card className="overflow-hidden">
      {showAuthor && (
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={profileImage} alt={displayName} />
              <AvatarFallback>
                {displayName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{displayName}</span>
                <Badge variant="outline" className="text-xs">
                  Kind {post.postKind}
                </Badge>
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {format(post.scheduledAt, 'MMM d, yyyy')}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {format(post.scheduledAt, 'h:mm a')}
                </span>
              </div>
            </div>
          </div>
        </CardHeader>
      )}
      
      <CardContent className={showAuthor ? "pt-0" : "pt-6"}>
        <div className="space-y-4">
          {/* Post Content */}
          <div className="prose prose-sm max-w-none">
            {isDecrypting ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-3/5" />
              </div>
            ) : decryptedContent ? (
              <div className="whitespace-pre-wrap break-words">
                <NoteContent event={mockEvent} className="text-sm leading-relaxed" />
              </div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground italic">
                <User className="h-4 w-4" />
                <span>Encrypted content - sign in as author to view</span>
              </div>
            )}
          </div>

          {/* Images */}
          {decryptedImages.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ImageIcon className="h-4 w-4" />
                <span>Attached Images ({decryptedImages.length})</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {decryptedImages.map((image, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={image.url}
                      alt={image.alt || `Image ${index + 1}`}
                      className="w-full h-24 sm:h-32 object-cover rounded-md border"
                      loading="lazy"
                    />
                    {image.alt && (
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-md flex items-center justify-center">
                        <span className="text-white text-xs text-center px-2">{image.alt}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-3">
            <div className="flex items-center gap-4">
              <span>Created {format(post.createdAt, 'MMM d, h:mm a')}</span>
              {post.publishedEventId && (
                <span className="font-mono">
                  Event: {post.publishedEventId.slice(0, 8)}...
                </span>
              )}
            </div>
            <Badge variant="outline" className="text-xs">
              {post.status}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}