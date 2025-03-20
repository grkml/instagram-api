import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Define type for the instagram_events table based on schema.sql
type InstagramEvent = {
  id?: string;               // UUID, auto-generated
  event_type: string;        // Type of event (e.g., 'feed_media_id')
  timestamp: number;         // Unix timestamp when the event occurred
  user_id?: string;         // Instagram user ID (nullable)
  media_id?: string;        // Media ID if event is related to media (nullable)
  comment_id?: string;      // Comment ID if event is related to a comment (nullable)
  message_id?: string;      // Message ID if event is related to a message (nullable)
  payload: any;             // Raw payload JSON from Instagram webhook
  created_at?: string;      // Auto-generated timestamp in the database
}

// Define type for the instagram_event_media table based on schema.sql
type InstagramEventMedia = {
  id?: string;               // UUID, auto-generated
  event_id: string;          // Foreign key to instagram_events table
  media_url: string;         // URL of the media
  media_type: string;        // Type of media (e.g., 'image', 'video', 'carousel')
  metadata?: any;            // Additional metadata about the media (optional)
  created_at?: string;       // Auto-generated timestamp in the database
}

// Define type for Instagram webhook payload
type InstagramWebhookPayload = {
  object: string;
  entry: Array<{
    time: number;
    id: string;
    changes: Array<{
      field: string;
      value: any;
    }>;
  }>;
}

// Using Bun.env to load environment variables (Bun loads .env files natively)
const supabaseUrl = Bun.env.SUPABASE_URL as string;
const supabaseKey = Bun.env.SUPABASE_KEY as string;
const instagramAppSecret = Bun.env.INSTAGRAM_APP_SECRET as string;
const port = Number(Bun.env.PORT) || 3000; // Default to 3000 if PORT is not set

// Initialize Supabase client
const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);

// --------------------------
// Database Operations Module
// --------------------------

/**
 * Insert an Instagram event into the Supabase database
 * @param event The Instagram event to insert
 * @returns Promise with the result of the insert operation
 */
async function insertInstagramEvent(event: InstagramEvent): Promise<any> {
  try {
    const { data, error } = await supabase
      .from('instagram_events')
      .insert(event)
      .select();
    
    if (error) {
      console.error('❌ Error inserting event into Supabase:', error);
      throw error;
    }
    
    console.log('✅ Successfully inserted event:', event.event_type);
    return data;
  } catch (error) {
    console.error('❌ Database operation failed (insertInstagramEvent):', error);
    throw error;
  }
}

/**
 * Insert media information into the instagram_event_media table
 * @param mediaInfo The media information to insert
 * @returns Promise with the result of the insert operation
 */
async function insertMediaInfo(mediaInfo: InstagramEventMedia): Promise<any> {
  try {
    const { data, error } = await supabase
      .from('instagram_event_media')
      .insert(mediaInfo);
    
    if (error) {
      console.error('❌ Error inserting media info into Supabase:', error);
      throw error;
    }
    
    console.log('✅ Successfully added media to database:', mediaInfo.media_type, mediaInfo.media_url);
    return data;
  } catch (error) {
    console.error('❌ Database operation failed (insertMediaInfo):', error);
    throw error;
  }
}

// --------------------------
// Payload Processing Module
// --------------------------

/**
 * Parse the event type from field and value
 * 
 * Instagram webhooks use a combination of 'field' and properties in the 'value' object
 * to describe the type of event that occurred. This function standardizes these
 * various combinations into consistent event types that we can use for processing.
 * 
 * Supported event types include:
 * - comment_created: New comment on a post
 * - comment_reply: Reply to a comment
 * - comment_edited: Comment was edited
 * - comment_deleted: Comment was deleted
 * - mention_created: User was mentioned in a post or comment
 * - message_received: Direct message received
 * - story_published: New story published
 * - story_insight: Story engagement metrics
 * - media_created: New media posted
 * - media_updated: Media was updated
 * 
 * @param field The event field (e.g., 'feed', 'comments', 'mentions')
 * @param value The event value object containing details
 * @returns Standardized event type string
 */
function parseEventType(field: string, value: any): string {
  try {
    if (!value || typeof value !== 'object') {
      return `${field}_unknown`;
    }
    
    // Extract first key or handle special cases
    const valueKeys = Object.keys(value);
    
    // Special case handling based on field type
    switch (field) {
      case 'feed':
        if (value.media_type) {
          return `${field}_${value.media_type}`;
        }
        break;
      case 'comments':
        return 'comment_created';
      case 'mentions':
        return 'mention_received';
      case 'stories':
        return 'story_published';
    }
    
    // Default case: append first key
    return `${field}_${valueKeys.length > 0 ? valueKeys[0] : 'unknown'}`;
  } catch (error) {
    console.error('❌ Error parsing event type:', error);
    return `${field}_error`;
  }
}

/**
 * Extract media information from the Instagram webhook payload
 * @param eventId The ID of the parent event
 * @param payload The Instagram event payload
 * @returns Array of InstagramEventMedia objects or empty array if no media found
 */
function extractMediaInfo(eventId: string, payload: any): InstagramEventMedia[] {
  const mediaItems: InstagramEventMedia[] = [];
  
  try {
    // Handle different payload structures based on event type
    
    // Case 1: Direct media_url in the payload
    if (payload.media_url && typeof payload.media_url === 'string') {
      mediaItems.push({
        event_id: eventId,
        media_url: payload.media_url,
        media_type: payload.media_type || 'unknown',
        metadata: {
          caption: payload.caption,
          permalink: payload.permalink
        }
      });
    }
    
    // Case 2: Media in children array (carousel albums)
    if (payload.children && Array.isArray(payload.children) && payload.children.length > 0) {
      for (const child of payload.children) {
        if (child.media_url && typeof child.media_url === 'string') {
          mediaItems.push({
            event_id: eventId,
            media_url: child.media_url,
            media_type: child.media_type || 'unknown',
            metadata: { parent_id: payload.id }
          });
        }
      }
    }
    
    // Case 3: Media in carousel_media array
    if (payload.carousel_media && Array.isArray(payload.carousel_media) && payload.carousel_media.length > 0) {
      for (const item of payload.carousel_media) {
        if (item.media_url && typeof item.media_url === 'string') {
          mediaItems.push({
            event_id: eventId,
            media_url: item.media_url,
            media_type: item.media_type || 'carousel_item',
            metadata: { position: item.position }
          });
        }
      }
    }
    
    // Case 4: Images object with standard_resolution
    if (payload.images && payload.images.standard_resolution && payload.images.standard_resolution.url) {
      mediaItems.push({
        event_id: eventId,
        media_url: payload.images.standard_resolution.url,
        media_type: 'image',
        metadata: { width: payload.images.standard_resolution.width, height: payload.images.standard_resolution.height }
      });
    }
    
    // Case 5: Videos object with standard_resolution
    if (payload.videos && payload.videos.standard_resolution && payload.videos.standard_resolution.url) {
      mediaItems.push({
        event_id: eventId,
        media_url: payload.videos.standard_resolution.url,
        media_type: 'video',
        metadata: { width: payload.videos.standard_resolution.width, height: payload.videos.standard_resolution.height }
      });
    }
    
    // Case 6: Media information in 'media' object (for comments)
    if (payload.media && payload.media.id) {
      // Try to extract the permalink if available
      if (payload.media.permalink || payload.media.link) {
        mediaItems.push({
          event_id: eventId,
          media_url: payload.media.permalink || payload.media.link,
          media_type: payload.media.media_product_type?.toLowerCase() || 'unknown',
          metadata: { media_id: payload.media.id }
        });
      }
    }
    
    return mediaItems;
  } catch (error) {
    console.error('❌ Error extracting media info:', error);
    return [];
  }
}

/**
 * Process an Instagram webhook payload and store events in the database
 * @param payload The payload received from Instagram's webhook
 * @returns Array of processed events
 */
async function processInstagramWebhook(payload: InstagramWebhookPayload): Promise<InstagramEvent[]> {
  const events: InstagramEvent[] = [];
  
  try {
    console.log('📊 Processing webhook with:', {
      object: payload.object,
      entryCount: payload.entry.length
    });

    // Validate payload format
    if (!payload.entry || !Array.isArray(payload.entry)) {
      console.error('❌ Invalid payload format: entry field is missing or not an array');
      return [];
    }
    
    // Process each entry in the payload
    for (const entry of payload.entry) {
      console.log('🔄 Processing entry:', {
        id: entry.id,
        time: entry.time,
        changesCount: entry.changes?.length || 0
      });
      
      // Validate entry format
      if (!entry.changes || !Array.isArray(entry.changes)) {
        console.warn('⚠️ Invalid entry format: changes field is missing or not an array, skipping entry');
        continue;
      }
      
      // Check if timestamp is valid
      if (typeof entry.time !== 'number') {
        console.warn(`⚠️ Malformed timestamp in entry ${entry.id}: ${entry.time}, using current time`);
        // Use current time as fallback
        entry.time = Math.floor(Date.now() / 1000);
      }

      for (const change of entry.changes) {
        // Validate change format
        if (!change.field || !change.value) {
          console.warn('⚠️ Invalid change format: field or value is missing, skipping change');
          continue;
        }

        console.log(`🔍 Processing ${change.field} change:`, {
          field: change.field,
          hasValue: !!change.value,
          valueType: typeof change.value
        });
        
        // Handle null or invalid values
        if (!change.value || typeof change.value !== 'object') {
          console.warn(`⚠️ Change value is null or not an object for field ${change.field}, skipping change`);
          continue;
        }

        // Parse event type using the dedicated function
        const eventType = parseEventType(change.field, change.value);
        console.log(`🏷️ Determined event type: ${eventType}`);
        
        // Create event object with data from the webhook
        // Only set fields if they exist in the payload to maintain data integrity
        const event: InstagramEvent = {
          event_type: eventType,
          timestamp: entry.time,
          user_id: entry.id,
          media_id: change.value.media_id,
          comment_id: change.value.comment_id || (change.value.id && change.field === 'comments' ? change.value.id : undefined),
          message_id: change.value.message_id,
          // Store the complete value object as the payload for future reference
          payload: change.value
        };
        
        console.log('📝 Created event object:', {
          event_type: event.event_type,
          timestamp: event.timestamp,
          user_id: event.user_id,
          media_id: event.media_id || 'N/A',
          comment_id: event.comment_id || 'N/A',
          message_id: event.message_id || 'N/A'
        });
        
        // Insert event into database and get the returned data which includes the ID
        try {
          const insertedEvents = await insertInstagramEvent(event);
          if (insertedEvents && insertedEvents.length > 0) {
            const insertedEvent = insertedEvents[0];
            console.log(`✅ Successfully inserted event: ${insertedEvent.event_type} with ID: ${insertedEvent.id}`);
            events.push(insertedEvent);
            
            // Extract and store media information if available
            try {
              const mediaItems = extractMediaInfo(insertedEvent.id, change.value);
              if (mediaItems.length > 0) {
                console.log(`📸 Found ${mediaItems.length} media items to store:`, mediaItems.map(m => ({ type: m.media_type, url: m.media_url.substring(0, 30) + '...' })));
                for (const mediaItem of mediaItems) {
                  await insertMediaInfo(mediaItem);
                  console.log(`📸 Stored media item: ${mediaItem.media_type} for event: ${insertedEvent.id}`);
                }
              } else {
                console.log(`ℹ️ No media information found for event: ${insertedEvent.id}`);
              }
            } catch (mediaError) {
              console.error(`❌ Error processing media for event ${insertedEvent.id}:`, mediaError);
              // Continue processing other events even if media extraction fails
            }
          } else {
            console.warn('⚠️ Event insertion returned no data, skipping media processing');
          }
        } catch (dbError) {
          console.error(`❌ Database error during event insertion:`, dbError);
          // Continue with next change even if this one failed
        }
      }
    }
    
    return events;
  } catch (error) {
    console.error('❌ Error processing webhook payload:', error);
    throw error;
  }
}

// Initialize Hono app
const app = new Hono();

// Add logger middleware for HTTP request/response logging
app.use('*', logger());

// Add custom middleware for enhanced logging
app.use('*', async (c, next) => {
  // Create a unique request ID for tracing
  const requestId = crypto.randomUUID().substring(0, 8);
  console.log(`🔑 [${requestId}] New request: ${c.req.method} ${c.req.url}`);
  
  // Track timing
  const startTime = Date.now();
  await next();
  const duration = Date.now() - startTime;
  
  // Log response data
  console.log(`⏱️ [${requestId}] Request completed in ${duration}ms with status ${c.res.status}`);
});

// Global error handler middleware
app.onError((err, c) => {
  console.error('💥 Unhandled server error:', err);
  return c.json({
    success: false,
    error: 'Internal server error',
    message: Bun.env.NODE_ENV === 'production' ? undefined : err.message
  }, 500);
});

// --------------------------
// Signature Verification Module
// --------------------------

/**
 * Verify the signature of an Instagram webhook request
 * 
 * Instagram signs webhook payloads with HMAC-SHA256 using your app secret as the key.
 * This function verifies that the signature in the X-Hub-Signature-256 header
 * matches the signature we compute locally, ensuring the payload is authentic.
 * 
 * In production, we reject requests with invalid signatures.
 * In development/testing, we log a warning but still process the request.
 * 
 * @param signature The X-Hub-Signature-256 header value (format: "sha256=SIGNATURE")
 * @param rawBody The raw request body as a string
 * @returns Object with success flag and error message if applicable
 */
function verifySignature(signature: string | undefined | null, rawBody: string): { success: boolean; message?: string } {
  try {
    // Check if signature is present in the request
    if (!signature) {
      return { success: false, message: 'Missing X-Hub-Signature-256 header' };
    }
    
    // Parse signature header - format should be "sha256=HEXDIGEST"
    const signatureParts = signature.split('=');
    if (signatureParts.length !== 2 || signatureParts[0] !== 'sha256') {
      return { success: false, message: 'Invalid signature format' };
    }
    
    const receivedSignature = signatureParts[1];
    
    // Compute the HMAC-SHA256 digest using the app secret as the key
    // This creates the same signature Instagram would create if the payload is authentic
    const hmac = crypto.createHmac('sha256', instagramAppSecret);
    hmac.update(rawBody);
    const computedSignature = hmac.digest('hex');
    
    // Compare our computed signature with the received signature
    if (computedSignature !== receivedSignature) {
      // Determine if we should reject based on environment
      const isProd = Bun.env.NODE_ENV === 'production';
      
      // Log the signature mismatch details for debugging
      console.log(`${isProd ? '❌' : '⚠️'} Signature verification ${isProd ? 'failed' : 'warning'}:`);
      if (receivedSignature) {
        console.log(`  Received: ${receivedSignature.substring(0, 12)}...${receivedSignature.substring(receivedSignature.length - 12)}`);
        console.log(`  Computed: ${computedSignature.substring(0, 12)}...${computedSignature.substring(computedSignature.length - 12)}`);
        console.log(`  Body length: ${rawBody.length} bytes`);
      } else {
        console.log(`  Received: undefined`);
        console.log(`  Computed: ${computedSignature}`);
        console.log(`  Body length: ${rawBody.length} bytes`);
      }
      
      // In production, reject requests with invalid signatures
      if (isProd) {
        return { success: false, message: 'Invalid signature' };
      } else {
        // In development/testing, log a warning but continue processing
        console.log('⚠️ DEVELOPMENT MODE: Proceeding despite signature mismatch');
      }
    }
    
    return { success: true };
  } catch (error) {
    console.error('❌ Error during signature verification:', error);
    return { success: false, message: 'Error verifying signature' };
  }
}

/**
 * Parse JSON payload from raw body and validate basic structure
 * 
 * This function parses the raw request body as JSON and performs basic validation
 * on the payload structure to ensure it has the required fields for an Instagram webhook.
 * 
 * Instagram webhook payloads should have the following structure:
 * {
 *   "object": "instagram",
 *   "entry": [
 *     {
 *       "time": 1517349021,
 *       "id": "123456789",
 *       "changes": [
 *         {
 *           "field": "comments", // or other field types
 *           "value": { ... }
 *         }
 *       ]
 *     }
 *   ]
 * }
 * 
 * @param rawBody The raw request body as a string
 * @returns Object with success flag, parsed payload (if successful), and error message (if failed)
 */
function parsePayload(rawBody: string): { success: boolean; payload?: any; message?: string } {
  try {
    // Parse the raw body as JSON
    const payload = JSON.parse(rawBody);
    
    // Validate that the payload has the basic structure we expect
    if (!payload) {
      return { success: false, message: 'Empty payload' };
    }
    
    // Verify that object field is present and is "instagram"
    if (!payload.object) {
      return { success: false, message: 'Missing object field in payload' };
    }
    
    if (payload.object !== 'instagram') {
      return { success: false, message: `Unexpected object type: ${payload.object}` };
    }
    
    // Verify that entry is present and is an array
    if (!payload.entry || !Array.isArray(payload.entry)) {
      return { success: false, message: 'Missing or invalid entry field in payload' };
    }
    
    // Basic validation passed
    return { success: true, payload };
  } catch (error) {
    console.error('❌ Error parsing webhook payload:', error);
    // If the body starts with { but isn't valid JSON, include a snippet to help debugging
    if (rawBody.trim().startsWith('{')) {
      const snippet = rawBody.slice(0, 30) + '...';
      return { success: false, message: `Invalid JSON payload (starts with: ${snippet})` };
    }
    return { success: false, message: 'Invalid JSON payload' };
  }
}

// --------------------------
// Route Handlers
// --------------------------

// Home route
app.get('/', (c) => {
  return c.json({ 
    message: 'Instagram API server is running'
  });
});

/**
 * Instagram Webhook GET endpoint for verification
 * This endpoint handles the webhook verification process from Instagram.
 * Instagram will send a GET request with hub.mode, hub.verify_token, and hub.challenge parameters.
 * If the mode is 'subscribe' and the token matches our app secret, we respond with the challenge.
 */
app.get('/webhook', (c) => {
  try {
    // Extract query parameters sent by Instagram
    const query = c.req.query();
    const mode = query['hub.mode'];       // Should be 'subscribe'
    const token = query['hub.verify_token']; // Should match our app secret
    const challenge = query['hub.challenge']; // The challenge we need to echo back
    
    // Log the verification attempt with all relevant parameters
    console.log('📡 Webhook verification request received:', {
      mode: mode || 'missing',
      tokenProvided: !!token,
      challengeProvided: !!challenge,
      requestIP: c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || 'unknown'
    });
    
    // Verify that all required parameters are present
    if (!mode || !token || !challenge) {
      console.log('❌ Webhook verification failed: Missing required parameters');
      return c.text('Missing required parameters', 400);
    }
    
    // Verify that mode is 'subscribe' and token matches INSTAGRAM_APP_SECRET
    // Both conditions must be met for successful verification
    if (mode !== 'subscribe') {
      console.log(`❌ Webhook verification failed: Invalid mode '${mode}', expected 'subscribe'`);
      return c.text('Invalid hub.mode - expected subscribe', 403);
    }
    
    if (token !== instagramAppSecret) {
      console.log('❌ Webhook verification failed: Invalid verification token');
      return c.text('Invalid hub.verify_token', 403);
    }
    
    // If verification succeeds, return the challenge string exactly as received
    console.log('✅ Webhook verification successful, responding with challenge');
    return c.text(challenge);
  } catch (error) {
    // Unexpected errors should be logged and reported
    console.error('❌ Unhandled error in verification endpoint:', error);
    return c.text('Internal server error', 500);
  }
});

/**
 * Instagram Webhook POST endpoint for receiving updates
 * This endpoint handles incoming webhook notifications from Instagram.
 * Instagram sends a POST request with a signature header and JSON payload.
 * We verify the signature, parse the payload, and process the events.
 * 
 * Instagram's webhook notifications can include various event types:
 * - New comments, replies
 * - Mentions in comments or captions
 * - New media posts
 * - Story insights
 * - Direct messages (if enabled)
 * 
 * Note: Instagram expects a 200 OK response, even if processing fails.
 * Otherwise, they will retry the webhook notification.
 */
app.post('/webhook', async (c) => {
  // Create a unique request ID for tracing this webhook through logs
  const webhookId = crypto.randomUUID().substring(0, 8);
  console.log(`📩 [${webhookId}] Received webhook notification from IP: ${c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || 'unknown'}`);
  
  try {
    // Get the signature from X-Hub-Signature-256 header and raw request body
    const signature = c.req.header('X-Hub-Signature-256');
    const rawBody = await c.req.text();
    
    console.log(`🔒 [${webhookId}] Verifying signature: ${signature ? signature.substring(0, 15) + '...' : 'missing'}`);
    console.log(`📦 [${webhookId}] Raw body size: ${rawBody.length} bytes`);
    
    // Verify signature using HMAC with app secret
    const signatureResult = verifySignature(signature, rawBody);
    if (!signatureResult.success) {
      console.log(`❌ [${webhookId}] Webhook signature verification failed: ${signatureResult.message}`);
      return c.text(signatureResult.message || 'Signature verification failed', 400);
    }
    
    console.log(`✅ [${webhookId}] Webhook signature verification successful`);
    
    // Parse the JSON payload from raw body
    const payloadResult = parsePayload(rawBody);
    if (!payloadResult.success) {
      console.log(`❌ [${webhookId}] Webhook payload parsing failed: ${payloadResult.message}`);
      return c.text(payloadResult.message || 'Payload parsing failed', 400);
    }
    
    // Log basic payload info without exposing sensitive data
    const payload = payloadResult.payload;
    console.log(`📥 [${webhookId}] Received webhook payload:`, {
      object: payload.object,
      entryCount: payload.entry?.length || 0
    });
    
    try {
      // Process and store the events from the webhook payload
      // This function handles the main logic for event processing and database storage
      console.time(`webhook-processing-${webhookId}`);
      const events = await processInstagramWebhook(payload as InstagramWebhookPayload);
      console.timeEnd(`webhook-processing-${webhookId}`);
      
      console.log(`✅ [${webhookId}] Successfully processed ${events.length} events from webhook payload`);
      
      // Return a 200 OK response to acknowledge receipt
      // Include useful information about the processed events
      return c.json({
        success: true,
        message: `Processed ${events.length} events`,
        event_count: events.length,
        webhook_id: webhookId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error(`❌ [${webhookId}] Error processing webhook:`, error);
      
      // Always return 200 OK status code to Instagram so they don't retry
      // A non-200 response will cause Instagram to retry the webhook notification
      return c.json({
        success: false,
        message: 'Error processing webhook payload',
        webhook_id: webhookId,
        error: Bun.env.NODE_ENV === 'production' ? 'Internal server error' : String(error),
        timestamp: new Date().toISOString()
      }, 200);
    }
  } catch (error) {
    console.error(`❌ [${webhookId}] Unhandled error in webhook endpoint:`, error);
    
    // Even for unhandled errors, return 200 OK to prevent Instagram retries
    return c.json({
      success: false,
      message: 'Internal server error',
      webhook_id: webhookId,
      timestamp: new Date().toISOString()
    }, 200);  // Return 200 for Instagram
  }
});

console.log(`🚀 Instagram API server starting on port ${port}...`);

// Export the app configuration to be used by Bun.serve
export default {
  port,
  fetch: app.fetch
};