# Plex-LastFM
### Why?
- The usual intergration doesn't support track.updateNowPlaying; it only supports track.scrobble.
- This results in a delay of ~50-80% of the song played before it updates last.fm now playing.

### Designed to run as a vercel function. 
- Simply fork git and setup in Vercel to run from Git
- Add env variables (see below)
- Add a firewall rule for 0.0.0.0/0 then another above it for your Plex server IP 
  - *(blacklist all, whitelist plex server IP)*
 
### Receives Plex Webhook events
- Extracts artist, track name, album name
- Sends 'play' and 'resume' events as "track.updateNowPlaying"
- Sends 'scrobble' (>80% played) events as "track.scrobble"
- Minor error handling

## Requires Last.FM API Access
- env.LAST_FM_API
- env.LAST_FM_SK (secret key)
- env.LAST_FM_SECRET
- env.API_KEY (simply a string added to the URL call that's checked, an extra security step)

## Simple NPM commands (run locally)
```
npm install
npm run build
npm run start
```

## Setup Plex
- Add a webhook to *(URL)*/api/webhook?apiKey=*API_KEY*

### Bash script for getting a LastFM permanent session key (env.LAST_FM_SECRET)
- Create an app at https://www.last.fm/api/account/create
  - Change API_KEY to the created API_KEY (also to **env.LAST_FM_API**)
  - Change SHARED_KEY to the SHARED_KEY (also to **env.LAST_FM_SK**)
- Run the script
- When prompted, open the URL and authenticate
- Press Enter
- Add the outputted session key **env.LAST_FM_SECRET**

```
#!/bin/bash
API_KEY="YOUR_LASTFM_API_KEY"        # <--- REPLACE THIS
SHARED_SECRET="YOUR_LASTFM_SHARED_SECRET" # <--- REPLACE THIS

API_URL="http://ws.audioscrobbler.com/2.0/"

# --- Functions ---
# Function to calculate MD5 hash, cross-platform compatible
calculate_md5() {
    local input_string="$1"
    # Try md5sum (Linux)
    if command -v md5sum &> /dev/null; then
        echo -n "$input_string" | md5sum | awk '{print $1}'
    # Try openssl md5 (macOS/BSD)
    elif command -v openssl &> /dev/null; then
        echo -n "$input_string" | openssl md5 | awk '{print $NF}'
    else
        echo "Error: Neither 'md5sum' nor 'openssl' found. Cannot calculate MD5 signature." >&2
        exit 1
    fi
}

echo "--- Last.fm Session Key Acquisition ---"
echo "Step 1: Requesting a temporary authentication token..."
TOKEN_RESPONSE=$(curl -s -X GET "$API_URL" \
    -d "method=auth.getToken" \
    -d "api_key=$API_KEY" \
    -d "format=json")

TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.token') 
AUTH_URL="http://www.last.fm/api/auth/?api_key=$API_KEY&token=$TOKEN"

echo ""
echo "Step 2: User authorization required."
echo "Please open the following URL in your web browser, log in to Last.fm (if prompted),"
echo "and grant access to your application. Then, return here and press Enter."
echo ""
echo "URL: $AUTH_URL"
echo ""
read -p "Press Enter to continue after authorization..."

echo ""
echo "Step 3: Request the session key using auth.getSession..."
SIGNATURE_STRING="api_key${API_KEY}methodauth.getSessiontoken${TOKEN}${SHARED_SECRET}"
API_SIG=$(calculate_md5 "$SIGNATURE_STRING")

SESSION_RESPONSE=$(curl -s -X POST "$API_URL" \
    -d "method=auth.getSession" \
    -d "api_key=$API_KEY" \
    -d "token=$TOKEN" \
    -d "api_sig=$API_SIG" \
    -d "format=json")

echo "--- Success! Permanent Last.fm Session Key Obtained ---"
echo ""Session Key: $(echo "$SESSION_RESPONSE" | jq -r '.session.key')"
```
