# Instagram Webhook Event Types Reference

This document provides a reference for the different types of events that can be received from Instagram webhooks and how they are handled by our system.

## Instagram Webhook Format

Instagram webhook payloads follow this general structure:

```json
{
  "object": "instagram",
  "entry": [
    {
      "time": 1517349021,
      "id": "123456789",
      "changes": [
        {
          "field": "comments",
          "value": { ... }
        }
      ]
    }
  ]
}
```

## Event Types and Fields

### Comments Events

#### New Comment
- **Field**: `comments`
- **Event Type**: `comment_created`
- **Key Value Properties**:
  - `id`: The comment ID
  - `media_id`: The media ID being commented on
  - `from`: Object containing the commenter info
  - `text`: The comment text
  - `timestamp`: When the comment was created

```json
{
  "field": "comments",
  "value": {
    "id": "17895695074163572",
    "media_id": "17851537767246649",
    "from": {
      "id": "17841405309211111",
      "username": "username"
    },
    "text": "This is a comment",
    "timestamp": "2020-11-30T12:34:56+0000"
  }
}
```

#### Comment Reply
- **Field**: `comments`
- **Event Type**: `comment_reply`
- **Key Value Properties**:
  - `id`: The comment ID
  - `media_id`: The media ID
  - `parent_id`: The ID of the comment being replied to
  - `from`: Object containing the commenter info
  - `text`: The comment text

### Mentions Events

#### User Mentioned
- **Field**: `mentions`
- **Event Type**: `mention_received`
- **Key Value Properties**:
  - `media_id`: The media ID where the mention occurred
  - `comment_id`: (Optional) If mentioned in a comment
  - `media_type`: The type of media
  - `text`: Text containing the mention
  - `timestamp`: When the mention occurred

```json
{
  "field": "mentions",
  "value": {
    "media_id": "17895695074163572",
    "comment_id": "17849988089090999",
    "media_type": "IMAGE",
    "text": "Look at this @testaccount!",
    "timestamp": "2021-04-03T10:52:25+0000"
  }
}
```

### Media Events

#### New Media
- **Field**: `feed`
- **Event Type**: `media_created`
- **Key Value Properties**:
  - `media_id`: The media ID
  - `media_product_type`: Type of media (FEED, STORY, REELS)
  - `permalink`: URL to the media

```json
{
  "field": "feed",
  "value": {
    "media_id": "17895695074163572",
    "media_product_type": "FEED",
    "permalink": "https://www.instagram.com/p/abc123/"
  }
}
```

### Story Events

#### Story Insights
- **Field**: `story_insights`
- **Event Type**: `story_insights_media_id`
- **Key Value Properties**:
  - `media_id`: The story ID
  - `media_product_type`: "STORY"
  - `impressions`: Number of impressions
  - `reach`: Number of unique accounts that viewed
  - `taps_forward`: Number of taps to see the next story
  - `taps_back`: Number of taps to see the previous story
  - `exits`: Number of exits from the story

```json
{
  "field": "story_insights",
  "value": {
    "media_id": "17895695074555555",
    "media_product_type": "STORY",
    "impressions": 12345,
    "reach": 10000,
    "taps_forward": 5000,
    "taps_back": 2000,
    "replies": 150,
    "exits": 1000
  }
}
```

### Messages Events

#### Direct Message
- **Field**: `messages`
- **Event Type**: `message_received`
- **Key Value Properties**:
  - `sender`: Object containing sender info
  - `message_id`: The message ID
  - `text`: The message text
  - `timestamp`: When the message was sent

## How Our System Processes Events

1. **Event Type Classification**: The `parseEventType` function analyzes the field and value properties to determine a standardized event type.

2. **Database Storage**: 
   - Each event is stored in the `instagram_events` table with:
     - `event_type`: A standardized type (e.g., "comment_created")
     - `timestamp`: When the event occurred
     - `user_id`: Associated Instagram user ID
     - `media_id`: Associated media ID (if applicable)
     - `comment_id`: Associated comment ID (if applicable)
     - `message_id`: Associated message ID (if applicable)
     - `payload`: Complete JSON payload for reference

3. **Media Extraction**:
   - For events containing media information, additional data is stored in `instagram_event_media`:
     - `event_id`: References the parent event
     - `media_url`: URL to the media
     - `media_type`: Type of media
     - `metadata`: Additional media metadata

## Error Handling

Our system includes robust error handling for various scenarios:

- **Malformed Payloads**: Values are validated before processing
- **Missing Fields**: Default values or fallbacks are used when safe
- **Invalid Timestamps**: Current time is used as a fallback
- **Missing Media Information**: Logged and skipped gracefully

## Testing with Sample Payloads

Use the provided test JSON files to simulate different webhook events:

- `test_payload.json`: Basic feed event
- `test_media_payload.json`: Media with comment event
- `test_mention_payload.json`: Mention event
- `test_story_payload.json`: Story insights event
- `test_missing_fields_payload.json`: Event with missing fields
- `test_malformed_payload.json`: Event with malformed data
