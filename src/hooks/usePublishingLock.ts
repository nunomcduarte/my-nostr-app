/**
 * A robust publishing lock system that prevents duplicate publishing
 * across tabs, browser sessions, and race conditions
 */

const PUBLISHING_LOCK_KEY = 'nostr:publishing-locks';
const LOCK_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const PUBLISHED_POSTS_KEY = 'nostr:published-posts';

interface PublishingLock {
  postId: string;
  timestamp: number;
  sessionId: string;
  pubkey: string;
}

interface PublishedPost {
  postId: string;
  publishedEventId: string;
  timestamp: number;
  pubkey: string;
}

class PublishingLockManager {
  private sessionId: string;

  constructor() {
    this.sessionId = Math.random().toString(36).substring(2, 15);
  }

  private getLocks(): PublishingLock[] {
    try {
      const stored = localStorage.getItem(PUBLISHING_LOCK_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  private setLocks(locks: PublishingLock[]): void {
    try {
      localStorage.setItem(PUBLISHING_LOCK_KEY, JSON.stringify(locks));
    } catch {
      // Ignore storage errors
    }
  }

  private getPublishedPosts(): PublishedPost[] {
    try {
      const stored = localStorage.getItem(PUBLISHED_POSTS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  private setPublishedPosts(posts: PublishedPost[]): void {
    try {
      localStorage.setItem(PUBLISHED_POSTS_KEY, JSON.stringify(posts));
    } catch {
      // Ignore storage errors
    }
  }

  /**
   * Check if a post has already been published
   */
  isAlreadyPublished(postId: string, pubkey: string): string | null {
    const publishedPosts = this.getPublishedPosts();
    const published = publishedPosts.find(p => p.postId === postId && p.pubkey === pubkey);
    
    if (published) {
      console.log(`📋 Post ${postId} was already published as event ${published.publishedEventId}`);
      return published.publishedEventId;
    }
    
    return null;
  }

  /**
   * Mark a post as published
   */
  markAsPublished(postId: string, publishedEventId: string, pubkey: string): void {
    const publishedPosts = this.getPublishedPosts();
    
    // Remove any existing entry for this post
    const filtered = publishedPosts.filter(p => !(p.postId === postId && p.pubkey === pubkey));
    
    // Add the new entry
    filtered.push({
      postId,
      publishedEventId,
      timestamp: Date.now(),
      pubkey
    });

    // Keep only the last 1000 published posts to prevent storage bloat
    if (filtered.length > 1000) {
      filtered.sort((a, b) => b.timestamp - a.timestamp);
      filtered.splice(1000);
    }

    this.setPublishedPosts(filtered);
    console.log(`📝 Marked post ${postId} as published (event: ${publishedEventId})`);
  }

  /**
   * Try to acquire a publishing lock for a post
   */
  acquireLock(postId: string, pubkey: string): boolean {
    const now = Date.now();
    const locks = this.getLocks();

    // Clean up expired locks
    const validLocks = locks.filter(lock => {
      const isExpired = now - lock.timestamp > LOCK_TIMEOUT;
      return !isExpired;
    });

    // Check if post is already locked by another session
    const existingLock = validLocks.find(lock => 
      lock.postId === postId && 
      lock.pubkey === pubkey && 
      lock.sessionId !== this.sessionId
    );

    if (existingLock) {
      console.log(`🔒 Post ${postId} is locked by session ${existingLock.sessionId}`);
      return false;
    }

    // Acquire the lock
    const newLock: PublishingLock = {
      postId,
      timestamp: now,
      sessionId: this.sessionId,
      pubkey
    };

    // Remove any existing lock for this post from this session
    const filteredLocks = validLocks.filter(lock => 
      !(lock.postId === postId && lock.pubkey === pubkey && lock.sessionId === this.sessionId)
    );

    filteredLocks.push(newLock);
    this.setLocks(filteredLocks);

    console.log(`🔓 Acquired lock for post ${postId} (session: ${this.sessionId})`);
    return true;
  }

  /**
   * Release a publishing lock for a post
   */
  releaseLock(postId: string, pubkey: string): void {
    const locks = this.getLocks();
    const filteredLocks = locks.filter(lock => 
      !(lock.postId === postId && lock.pubkey === pubkey && lock.sessionId === this.sessionId)
    );

    this.setLocks(filteredLocks);
    console.log(`🔓 Released lock for post ${postId} (session: ${this.sessionId})`);
  }

  /**
   * Check if this session owns the lock for a post
   */
  ownsLock(postId: string, pubkey: string): boolean {
    const locks = this.getLocks();
    const lock = locks.find(lock => 
      lock.postId === postId && 
      lock.pubkey === pubkey && 
      lock.sessionId === this.sessionId
    );

    if (!lock) return false;

    // Check if lock is still valid
    if (Date.now() - lock.timestamp > LOCK_TIMEOUT) {
      this.releaseLock(postId, pubkey);
      return false;
    }

    return true;
  }

  /**
   * Clean up expired locks and old published posts
   */
  cleanup(): void {
    const now = Date.now();
    
    // Clean up locks
    const locks = this.getLocks();
    const validLocks = locks.filter(lock => now - lock.timestamp <= LOCK_TIMEOUT);
    this.setLocks(validLocks);

    // Clean up old published posts (keep for 24 hours)
    const publishedPosts = this.getPublishedPosts();
    const validPublished = publishedPosts.filter(post => now - post.timestamp <= 24 * 60 * 60 * 1000);
    this.setPublishedPosts(validPublished);
  }

  /**
   * Get debug information
   */
  getDebugInfo(): { locks: PublishingLock[]; publishedPosts: PublishedPost[]; sessionId: string } {
    return {
      locks: this.getLocks(),
      publishedPosts: this.getPublishedPosts(),
      sessionId: this.sessionId
    };
  }
}

// Singleton instance
let lockManager: PublishingLockManager | null = null;

export function usePublishingLock() {
  if (!lockManager) {
    lockManager = new PublishingLockManager();
  }
  return lockManager;
}