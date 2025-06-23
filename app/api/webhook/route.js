import {
  NextResponse
}
from "next/server";
const md5 = require("crypto-js/md5");

/**
 * Generates a securely signed payload for Last.fm API requests.
 * @param {string} track - The title of the track.
 * @param {string} artist - The name of the artist.
 * @param {string} album - The name of the album.
 * @param {string} method - The Last.fm API method to call (e.g., "track.updateNowPlaying", "track.scrobble").
 * @returns {URLSearchParams} A URLSearchParams object containing the signed payload.
 */
function generateSecurePayload(track, artist, album, method) {
  const timestamp = Math.floor(Date.now() / 1000); // Current Unix timestamp
  // Parameters for the Last.fm API request
  const params = {
    method: method,
    artist: artist,
    track: track,
    album: album,
    timestamp: timestamp,
    api_key: process.env.LAST_FM_API,
    sk: process.env.LAST_FM_SK,
    // Session key
  };

  // Create the signature string by concatenating sorted parameter keys and values
  // followed by the Last.fm secret.
  const signatureString = Object.keys(params).sort().map((key) = >key + params[key]).join("");

  // Generate MD5 hash of the signature string and Last.fm secret
  const signature = md5(signatureString + process.env.LAST_FM_SECRET).toString();

  // Return URLSearchParams with all parameters, including the generated signature and desired format.
  return new URLSearchParams({...params,
    api_sig: signature,
    format: "json"
  });
}

/**
 * A simple sleep function to pause execution for a given number of milliseconds.
 * @param {number} ms - The number of milliseconds to sleep.
 * @returns {Promise<void>} A promise that resolves after the specified time.
 */
function sleep(ms) {
  return new Promise((resolve) = >setTimeout(resolve, ms));
}

/**
 * Sends a request to the Last.fm API to update now playing status or scrobble a track.
 * Includes retry logic for certain Last.fm API errors.
 * @param {string} track - The title of the track.
 * @param {string} artist - The name of the artist.
 * @param {string} album - The name of the album.
 * @param {string} method - The Last.fm API method to call.
 * @param {number} [tries=1] - The current attempt number (for retry logic).
 * @returns {Promise<number>} A promise that resolves to 1 upon (likely) success.
 */
async
function lastFmHook(track, artist, album, method, tries = 1) {
  const apiUrl = "https://ws.audioscrobbler.com/2.0/";
  const payload = generateSecurePayload(track, artist, album, method);

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: payload.toString(),
    });

    try {
      const responseText = await response.text();
      const jsonResponse = JSON.parse(responseText);

      // Check if the HTTP response was not OK
      if (!response.ok) {
        // Handle cases where Last.fm explicitly ignored scrobbles
        if (jsonResponse && jsonResponse.scrobbles && jsonResponse.scrobbles["@attr"] && jsonResponse.scrobbles["@attr"]["ignored"] > 0) {
          console.error("LastFM Ignored > 0 scrobbles, check response?", jsonResponse, "Status: ", response.status);
        }

        // Handle specific Last.fm error codes (e.g., service outages, temporary issues)
        if (jsonResponse.error === 11 || jsonResponse.error === 16) {
          if (tries <= 5) {
            console.warn("Trying again in 2s for ", method, " attempt number: ", tries);
            await sleep(2000); // Wait for 2 seconds before retrying
            return lastFmHook(track, artist, album, method, tries + 1); // Recurse for retry, incrementing tries
          } else {
            console.error("Max retries reached. Error: ", jsonResponse.message || "No error message provided.")
          }
        } else {
          // General error handling for non-OK responses
          console.warn("failed, Last.fm error: ", jsonResponse.message || "No error message provided.");
          throw {error: jsonResponse}; // Re-throw to be caught by the outer try-catch
        }
      } else {
        // Log success for OK responses
        console.log(`$ {
          method
        }
        was likely successful.Track: $ {
          artist
        } - $ {
          track
        }`);
      }
    } catch(parseError) {
      // Catch errors during response text parsing or JSON parsing
      console.error("Error parsing Last.fm API response: ", parseError);
    }
  } catch(fetchError) {
    // Catch errors during the fetch operation itself (e.g., network issues)
    console.error("Error fetching Last.fm API URL: ", fetchError);
  }
  return 1; // Indicate completion (success or handled failure)
}

/**
 * Main handler for the webhook API route.
 * Processes incoming POST requests, validates them, and dispatches Last.fm actions.
 * @param {Request} request - The incoming Next.js API request object.
 * @returns {NextResponse} The response to send back to the client.
 */
export async function POST(request) {
  const { searchParams } = request.nextUrl;
  const apiKey = searchParams.get("apikey");
  if (!apiKey || apiKey != process.env.API_KEY) { return NextResponse.json({body: "Unauthorized", status: 401}); } // 401 Unauthorized

  try {
    // Prepare data
    const rawPayload = await request.json(); console.error(rawPayload);

    // If empty payload
    if (!rawPayload) { return NextResponse.json({body: "Webhook payload is missing from form data.", status: 400}); }
    
    // Parse JSON
    const event = JSON.parse(rawPayload); console.error(event);

    // Only process 'track' type metadata, not movies / etc.
    if (event.Metadata.type !== "track") { return NextResponse.json({status: 204}); }
    
    // Handle different media events and dispatch to Last.fm.
    switch (event.event) {
    case "media.play":
    case "media.resume":
      await lastFmHook(event.Metadata.title, event.Metadata.grandparentTitle, event.Metadata.parentTitle, "track.updateNowPlaying");
      break;
    case "media.scrobble":
      await lastFmHook(event.Metadata.title, event.Metadata.grandparentTitle, event.Metadata.parentTitle, "track.scrobble");
      break;
    case "media.pause":
    case "media.stop":
      return NextResponse.json({status:204});
      break;
    default:
      console.warn("Unhandled Plex event type: ", event.event);
      return NextResponse.json({status:204});
      break;
      return NextResponse.json({received: true, event: event.event, status: 200});
    }
  } catch(Exception) { console.error(" processing Plex webhook:", Exception);
      return NextResponse.json({body: "Internal Server error", status: 500});}
}

export async function GET(request) {
  return NextResponse.json({body: "Invalid Method", status: 405 }); // 405 Invalid method
}
