# Instagram API

A Bun-based API server for Instagram webhook integration using Hono and Supabase. This service handles Instagram webhook verification, receives webhook events, and stores them in a Supabase database.

## Features

- Instagram webhook verification
- HMAC-SHA256 signature verification for webhook payloads
- Event processing and storage in Supabase
- Media information extraction and storage
- Robust error handling and logging
- TypeScript type safety

## Setup

### Install dependencies

```bash
bun install
```

### Environment Variables

Copy the `.env.example` file to `.env` and update with your credentials:

```
SUPABASE_URL=your_supabase_url_here
SUPABASE_KEY=your_supabase_key_here
INSTAGRAM_APP_SECRET=your_instagram_app_secret_here
PORT=3000
```

The project uses Bun.env to automatically load environment variables from the `.env` file.

### Database Setup

Before running the server, make sure your Supabase database has the required tables. You can find the schema definitions in the `schema.sql` file.

### Run the server

```bash
bun run index.ts
```

## API Endpoints

### GET /

Status check endpoint that returns a simple JSON response indicating the server is running.

### GET /webhook

Handles the webhook verification process from Instagram. Instagram will send a GET request with the following query parameters:

- `hub.mode`: Should be 'subscribe'
- `hub.verify_token`: Should match your INSTAGRAM_APP_SECRET
- `hub.challenge`: A challenge string that must be echoed back

### POST /webhook

Receives webhook events from Instagram. The request will include:

- `X-Hub-Signature-256` header: HMAC signature of the payload
- JSON payload with event data

The endpoint verifies the signature, processes the event, and stores it in the database.

## Testing

### Using Local Test Payloads

Test JSON payloads are provided in the repository:

- `test_payload.json`: Basic feed event
- `test_media_payload.json`: Media with comment event
- `test_mention_payload.json`: Mention event
- `test_story_payload.json`: Story insights event
- `test_missing_fields_payload.json`: Event with missing fields
- `test_malformed_payload.json`: Event with malformed data

You can test the webhook with these payloads using curl:

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=anysignature" \
  -d @test_media_payload.json
```

### Using ngrok for External Testing

For testing with the actual Instagram API, use the provided test script which sets up an ngrok tunnel:

```bash
./test_webhook.sh
```

This script:
1. Starts an ngrok tunnel to your local server
2. Provides the public URL to use in the Instagram developer dashboard
3. Runs test requests against your webhook endpoints

## Supported Event Types

The API handles various Instagram webhook event types:

- Comment events: created, edited, deleted
- Mention events
- Media events: created, updated
- Story events: published, insights
- Message events

## Technologies

- [Bun](https://bun.sh): Fast JavaScript runtime
- [Hono](https://hono.dev): Lightweight web framework
- [Supabase](https://supabase.com): Open Source Firebase alternative
- [TypeScript](https://www.typescriptlang.org/): Type-safe JavaScript

This project was created using `bun init` in bun v1.2.5.
