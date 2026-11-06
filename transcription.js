
/*
 * MY MUSIC LYRICS
 * FILE 06: transcription.js
 *
 * Connects the app to a real transcription backend.
 *
 * Expected backend response:
 *
 * {
 *   "segments": [
 *     {
 *       "start": 1.2,
 *       "end": 3.5,
 *       "text": "Example lyric",
 *       "words": [
 *         {
 *           "start": 1.2,
 *           "end": 1.8,
 *           "text": "Example"
 *         },
 *         {
 *           "start": 1.9,
 *           "end": 3.5,
 *           "text": "lyric"
 *         }
 *       ]
 *     }
 *   ]
 * }
 */

const DEFAULT_TIMEOUT = 180000;
const MAX_AUDIO_SIZE = 100 * 1024 * 1024;


// Validate the transcription endpoint.
export function validateEndpoint(endpoint) {
  if (!endpoint || typeof endpoint !== "string") {
    throw new Error("Enter your transcription server URL in Settings.");
  }

  let parsed;

  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error("The transcription server URL is invalid.");
  }

  const isLocalhost =
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1";

  if (parsed.protocol !== "https:" && !isLocalhost) {
    throw new Error(
      "For security, the transcription server must use HTTPS."
    );
  }

  if (parsed.username || parsed.password) {
    throw new Error(
      "Do not put usernames or passwords inside the server URL."
    );
  }

  return parsed.href;
}


// Convert seconds or milliseconds into seconds.
function normalizeTime(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    return null;
  }

  // Supports common millisecond timestamp responses.
  return number > 100000 ? number / 1000 : number;
}


// Normalize word timestamps.
function normalizeWords(words) {
  if (!Array.isArray(words)) return [];

  return words
    .map(word => {
      const start = normalizeTime(word.start);
      const end = normalizeTime(word.end);

      return {
        start,
        end,
        text: String(word.text || word.word || "").trim()
      };
    })
    .filter(word =>
      word.start !== null &&
      word.end !== null &&
      word.end >= word.start &&
      word.text.length > 0
    );
}


// Normalize transcription segments.
function normalizeSegments(response) {
  const source = Array.isArray(response)
    ? response
    : response.segments || response.lines || [];

  if (!Array.isArray(source)) {
    throw new Error("The server returned an unsupported response.");
  }

  const segments = source
    .map(segment => {
      const start = normalizeTime(
        segment.start ?? segment.start_time
      );

      const end = normalizeTime(
        segment.end ?? segment.end_time
      );

      return {
        time: start,
        end,
        text: String(segment.text || "").trim(),
        words: normalizeWords(segment.words)
      };
    })
    .filter(segment =>
      segment.time !== null &&
      segment.text.length > 0 &&
      (
        segment.end === null ||
        segment.end >= segment.time
      )
    )
    .sort((a, b) => a.time - b.time);

  if (segments.length === 0) {
    throw new Error(
      "No timestamped lyrics were returned. Check the audio and server."
    );
  }

  return segments;
}


// Main transcription function.
export async function transcribeAudio(
  audioFile,
  endpoint,
  options = {}
) {
  if (!(audioFile instanceof Blob)) {
    throw new TypeError("Please select a valid audio file.");
  }

  if (audioFile.size === 0) {
    throw new Error("The selected audio file is empty.");
  }

  if (audioFile.size > MAX_AUDIO_SIZE) {
    throw new Error("Audio file is too large. Maximum size is 100 MB.");
  }

  const serverURL = validateEndpoint(endpoint);

  const timeout = Number(options.timeout) || DEFAULT_TIMEOUT;

  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeout);

  const formData = new FormData();

  const filename = options.filename || "music-audio";

  formData.append("audio", audioFile, filename);

  if (options.language) {
    formData.append("language", options.language);
  }

  formData.append("timestamps", "true");
  formData.append("word_timestamps", "true");

  try {
    const response = await fetch(serverURL, {
      method: "POST",
      body: formData,
      signal: controller.signal,
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      let message = `Transcription server error: ${response.status}`;

      try {
        const errorData = await response.json();

        if (errorData.error || errorData.message) {
          message = errorData.error || errorData.message;
        }
      } catch {
        // Keep the original error message.
      }

      throw new Error(message);
    }

    const contentType =
      response.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      throw new Error(
        "The transcription server did not return JSON."
      );
    }

    const result = await response.json();

    if (result.error) {
      throw new Error(String(result.error));
    }

    return {
      lyrics: normalizeSegments(result),
      source: "ai-transcription",
      wordTimestampsAvailable: (
        result.segments || result.lines || []
      ).some(segment =>
        Array.isArray(segment.words) &&
        segment.words.length > 0
      ),
      language: result.language || null,
      model: result.model || null
    };

  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(
        "Transcription timed out. Try again or use a smaller audio file."
      );
    }

    if (error instanceof TypeError) {
      throw new Error(
        "Cannot reach the transcription server. Check your internet connection and server URL."
      );
    }

    throw error;

  } finally {
    clearTimeout(timeoutId);
  }
}


// Check whether a transcription server is reachable.
export async function checkTranscriptionServer(endpoint) {
  const serverURL = validateEndpoint(endpoint);

  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 10000);

  try {
    const response = await fetch(serverURL, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json"
      }
    });

    return {
      connected: response.ok,
      status: response.status,
      message: response.ok
        ? "Transcription server is reachable."
        : "Server responded but returned an error."
    };

  } catch (error) {
    return {
      connected: false,
      status: null,
      message: error.name === "AbortError"
        ? "Connection timed out."
        : "Could not connect to the transcription server."
    };

  } finally {
    clearTimeout(timeoutId);
  }
}


// Default export.
const transcriptionEngine = {
  validateEndpoint,
  transcribeAudio,
  checkTranscriptionServer
};

export default transcriptionEngine;
