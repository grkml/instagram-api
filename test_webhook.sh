#!/usr/bin/env bash

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print styled messages
info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if necessary tools are installed
if ! command -v ngrok &> /dev/null; then
    error "ngrok is not installed. Please install it first: https://ngrok.com/download"
    exit 1
fi

# Load environment variables
if [ -f .env ]; then
    info "Loading environment variables from .env file"
    export $(grep -v '^#' .env | xargs)
else
    error ".env file not found"
    exit 1
fi

# Check for required environment variables
if [ -z "$INSTAGRAM_APP_SECRET" ]; then
    error "INSTAGRAM_APP_SECRET is not set in .env file"
    exit 1
fi

if [ -z "$PORT" ]; then
    warn "PORT not set in .env file, using default port 3000"
    PORT=3000
fi

# Function to send test webhook payloads
send_test_payloads() {
    local ngrok_url=$1
    
    # Wait for ngrok to be fully initialized
    sleep 2
    
    info "Testing webhook verification endpoint..."
    curl -s -X GET "${ngrok_url}/webhook?hub.mode=subscribe&hub.verify_token=${INSTAGRAM_APP_SECRET}&hub.challenge=test_challenge"
    echo ""
    
    info "Testing webhook with comment payload..."
    curl -s -X POST "${ngrok_url}/webhook" \
      -H "Content-Type: application/json" \
      -H "X-Hub-Signature-256: sha256=anysignature" \
      -d @test_media_payload.json
    echo ""
    
    info "Testing webhook with mention payload..."
    curl -s -X POST "${ngrok_url}/webhook" \
      -H "Content-Type: application/json" \
      -H "X-Hub-Signature-256: sha256=anysignature" \
      -d @test_mention_payload.json
    echo ""
    
    info "Testing webhook with story payload..."
    curl -s -X POST "${ngrok_url}/webhook" \
      -H "Content-Type: application/json" \
      -H "X-Hub-Signature-256: sha256=anysignature" \
      -d @test_story_payload.json
    echo ""
    
    info "Testing webhook with malformed payload..."
    curl -s -X POST "${ngrok_url}/webhook" \
      -H "Content-Type: application/json" \
      -H "X-Hub-Signature-256: sha256=anysignature" \
      -d @test_malformed_payload.json
    echo ""
}

# Start ngrok in the background if it's not already running
start_ngrok() {
    info "Starting ngrok tunnel to port $PORT..."
    ngrok http $PORT > /dev/null &
    NGROK_PID=$!
    
    # Wait for ngrok to initialize
    sleep 3
    
    # Get the ngrok public URL
    NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | jq -r '.tunnels[0].public_url')
    
    if [ -z "$NGROK_URL" ] || [ "$NGROK_URL" == "null" ]; then
        error "Failed to get ngrok URL. Make sure ngrok is running properly."
        kill $NGROK_PID
        exit 1
    fi
    
    info "Ngrok tunnel established at: $NGROK_URL"
    
    # This URL should be registered with Instagram
    info "Use this URL in the Instagram Developer Dashboard:"
    echo "${NGROK_URL}/webhook"
    
    # Run test payloads against the ngrok URL
    send_test_payloads $NGROK_URL
    
    # Keep ngrok running until user interrupts
    info "Press Ctrl+C to stop the ngrok tunnel"
    trap "kill $NGROK_PID; exit" INT
    wait $NGROK_PID
}

# Function to sign a payload with the app secret
sign_payload() {
    local payload_file=$1
    local signature=$(cat $payload_file | openssl dgst -sha256 -hmac $INSTAGRAM_APP_SECRET | awk '{print $2}')
    echo "sha256=$signature"
}

# Check if the API server is running
check_api_running() {
    if ! curl -s http://localhost:$PORT > /dev/null; then
        error "API server is not running on port $PORT. Please start it first."
        exit 1
    else
        info "API server is running on port $PORT"
    fi
}

# Main execution
check_api_running
start_ngrok
