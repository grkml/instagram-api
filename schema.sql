-- Create instagram_events table
CREATE TABLE IF NOT EXISTS instagram_events (
  -- Primary key, auto-generated UUID
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Event type (e.g., 'feed_media_id', 'comment_created')
  event_type TEXT NOT NULL,
  
  -- Unix timestamp of when the event occurred
  timestamp BIGINT NOT NULL,
  
  -- IDs related to the event (all nullable since not every event will have all IDs)
  user_id TEXT,
  media_id TEXT,
  comment_id TEXT,
  message_id TEXT,
  
  -- Raw payload from Instagram webhook
  payload JSONB NOT NULL,
  
  -- Timestamp for when the record was created in our database
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on event_type for faster lookups by event type
CREATE INDEX IF NOT EXISTS idx_instagram_events_event_type ON instagram_events (event_type);

-- Create index on timestamp for faster time-based queries
CREATE INDEX IF NOT EXISTS idx_instagram_events_timestamp ON instagram_events (timestamp);

-- Create indexes on the various ID fields for faster lookups
CREATE INDEX IF NOT EXISTS idx_instagram_events_user_id ON instagram_events (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_instagram_events_media_id ON instagram_events (media_id) WHERE media_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_instagram_events_comment_id ON instagram_events (comment_id) WHERE comment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_instagram_events_message_id ON instagram_events (message_id) WHERE message_id IS NOT NULL;

-- Add comment to table
COMMENT ON TABLE instagram_events IS 'Stores events received from Instagram webhooks';

-- Create instagram_event_media table
CREATE TABLE IF NOT EXISTS instagram_event_media (
  -- Primary key, auto-generated UUID
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Foreign key to instagram_events table
  event_id UUID NOT NULL REFERENCES instagram_events(id) ON DELETE CASCADE,
  
  -- Media URL from Instagram
  media_url TEXT NOT NULL,
  
  -- Media type (e.g., 'image', 'video', 'carousel')
  media_type TEXT NOT NULL,
  
  -- Additional metadata about the media (optional)
  metadata JSONB,
  
  -- Timestamp for when the record was created in our database
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on event_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_instagram_event_media_event_id ON instagram_event_media (event_id);

-- Create index on media_type for filtering by type
CREATE INDEX IF NOT EXISTS idx_instagram_event_media_media_type ON instagram_event_media (media_type);

-- Add comment to table
COMMENT ON TABLE instagram_event_media IS 'Stores media information from Instagram webhook events';
