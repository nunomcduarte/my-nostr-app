# Social Media Scheduler for Nostr

## Abstract

This NIP defines a custom kind for scheduling social media posts on Nostr. It provides a way to create, manage, and automatically publish scheduled posts.

## Specification

### Scheduled Post Event

A scheduled post is represented by an addressable event of `kind:36611`.

The `.content` contains the NIP-44 encrypted JSON of the draft post that will be published at the scheduled time.

Required tags:
- `d` - unique identifier for the scheduled post
- `scheduled_at` - unix timestamp when the post should be published
- `post_kind` - the kind of event that will be published (e.g., "1" for text note)

Optional tags:
- `title` - title/description of the scheduled post
- `status` - current status: "scheduled", "published", "failed", "cancelled"
- `published_event_id` - event ID of the published post (set after successful publishing)
- `client` - client application name

### Example

```json
{
  "kind": 36611,
  "content": "<nip44-encrypted-draft-post>",
  "tags": [
    ["d", "schedule-123456789"],
    ["scheduled_at", "1700000000"],
    ["post_kind", "1"],
    ["title", "Morning motivation post"],
    ["status", "scheduled"],
    ["client", "nostr-scheduler", "wss://relay.example.com"]
  ]
}
```

### Status Values

- `scheduled` - Post is scheduled and waiting to be published
- `published` - Post has been successfully published
- `failed` - Publishing failed, post needs attention
- `cancelled` - Post was cancelled by user

### Client Behavior

Clients implementing this NIP should:
1. Encrypt the draft post content using NIP-44 to the author's public key
2. Monitor scheduled posts and publish them at the specified time
3. Update the status tag after publishing attempts
4. Allow users to edit, cancel, or reschedule posts

### Security Considerations

- Draft content is encrypted to prevent unauthorized access
- Only the author can decrypt and publish their scheduled posts
- Clients should validate the scheduled time is in the future