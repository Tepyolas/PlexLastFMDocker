import { NextResponse } from "next/server";
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
    sk: process.env.LAST_FM_SK, // Session key
  };

  // Create the signature string by concatenating sorted parameter keys and values
  // followed by the Last.fm secret.
  const signatureString = Object.keys(params)
    .sort()
    .map((key) => key + params[key])
    .join("");

  // Generate MD5 hash of the signature string and Last.fm secret
  const signature = md5(signatureString + process.env.LAST_FM_SECRET).toString();

  // Return URLSearchParams with all parameters, including the generated signature and desired format.
  return new URLSearchParams({ ...params, api_sig: signature, format: "json" });
}

/**
 * A simple sleep function to pause execution for a given number of milliseconds.
 * @param {number} ms - The number of milliseconds to sleep.
 * @returns {Promise<void>} A promise that resolves after the specified time.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
async function lastFmHook(track, artist, album, method, tries = 1) {
  const apiUrl = "https://ws.audioscrobbler.com/2.0/";
  const payload = generateSecurePayload(track, artist, album, method);

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: payload.toString(),
    });

    try {
      const responseText = await response.text();
      const jsonResponse = JSON.parse(responseText);

      // Check if the HTTP response was not OK
      if (!response.ok) {
        // Handle cases where Last.fm explicitly ignored scrobbles
        if (jsonResponse && jsonResponse.scrobbles && jsonResponse.scrobbles["@attr"] && jsonResponse.scrobbles["@attr"]["ignored"] > 0 ) 
        {
          console.error("LastFM Ignored > 0 scrobbles, check response?", jsonResponse,"Status: ", response.status);
        }

        // Handle specific Last.fm error codes (e.g., service outages, temporary issues)
        if (jsonResponse.error === 11 || jsonResponse.error === 16) {
          if (tries <= 5) {
            console.warn(
              `Trying again in 2s for ${method}, error: ${jsonResponse.message}. Attempts: ${tries}`
            );
            await sleep(2000); // Wait for 2 seconds before retrying
            return lastFmHook(track, artist, album, method, tries + 1); // Recurse for retry, incrementing tries
          } else {
            console.error(
              `Max retries reached for ${method}. Last error: ${jsonResponse.message}`
            );
          }
        } else {
          // General error handling for non-OK responses
          console.warn(
            `${method} failed, Last.fm error:`,
            jsonResponse.message || "No error message provided."
          );
          throw { error: jsonResponse }; // Re-throw to be caught by the outer try-catch
        }
      } else {
        // Log success for OK responses
        console.log(
          `${method} was likely successful. Track: ${artist} - ${track}`
        );
      }
    } catch (parseError) {
      // Catch errors during response text parsing or JSON parsing
      console.error("Error parsing Last.fm API response: ", parseError);
    }
  } catch (fetchError) {
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
export default async function handler(request) {
  // Method validation: Only allow POST requests.
  if (request.method !== "POST") {
    return new NextResponse.json("Method Not Allowed", { status: 405 }); // 405 Not allowed
  }

  // API Key validation: Ensure apikey param matches env.API_KEY
  const url = new URL(request.url);
  const apiKey = url.searchParams.get("apikey");
  if (!apiKey || apiKey != process.env.API_KEY) {
    return NextResponse.json("Unauthorized", { status: 401 }); // 401 Unauthorized
  }

  try {
    // Prepare data
    const formData = await request.formData();
    const rawPayload = formData.get("payload");

    // Empty payload
    if (!rawPayload) {
      return NextResponse.json("Webhook payload is missing from form data.", { status: 400 }); 
    }

    const event = JSON.parse(rawPayload);

    // Only process 'track' type metadata, not movies / etc.
    if (event.Metadata.type !== "track") {
      return NextResponse.json("Not a track. Skipping", { status: 400 });
    }

    // Handle different media events and dispatch to Last.fm.
    switch (event.event) {
      case "media.play":
      case "media.resume":
        // Title, Artist, Album, method (track.updateNowPlaying)
        await lastFmHook(event.Metadata.title, event.Metadata.grandparentTitle, event.Metadata.parentTitle, "track.updateNowPlaying");
        break;
      case "media.scrobble":
        // Title, Artist, Album, method (track.scrobble)
        await lastFmHook(event.Metadata.title, event.Metadata.grandparentTitle, event.Metadata.parentTitle, "track.scrobble");
        break;
      case "media.pause":
      case "media.stop":
        return new NextResponse(null, {status: 204});
        break;
      default:
        console.warn(`Unhandled Plex event type: ${event.event}`);
        return new NextResponse(null, {status: 204});
        break;
    }

    // 6. Respond indicating successful receipt and processing.
    return NextResponse.json(
      { received: true, event: event.event },
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    // 7. Global error handling for any unexpected issues during processing.
    console.error("Error processing Plex webhook:", error);
    return NextResponse.json("Internal Server Error", { status: 500 }); // 500 Internal Server Error
  }
}
