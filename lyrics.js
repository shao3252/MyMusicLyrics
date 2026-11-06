
/*
 * MY MUSIC LYRICS
 * FILE 05: lyrics.js
 *
 * Lyrics parsing, timestamps, synchronization,
 * highlighting, and manual editing helpers.
 */

// Convert seconds into LRC timestamp format.
export function formatTimestamp(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);

  const minutes = Math.floor(safeSeconds / 60);
  const remaining = (safeSeconds % 60).toFixed(2);

  return `[${String(minutes).padStart(2, "0")}:${remaining.padStart(5, "0")}]`;
}


// Convert LRC timestamp into seconds.
export function parseTimestamp(timestamp) {
  const match = String(timestamp).match(
    /^(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?$/
  );

  if (!match) return null;

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);

  const fraction = match[3]
    ? Number("0." + match[3])
    : 0;

  if (seconds >= 60) return null;

  return minutes * 60 + seconds + fraction;
}


// Parse an LRC file into timestamped lyric lines.
export function parseLRC(lrcText) {
  if (typeof lrcText !== "string") {
    throw new TypeError("Lyrics must be provided as text.");
  }

  const lines = [];
  const sourceLines = lrcText.split(/\r?\n/);

  const timestampPattern =
    /\[(\d{1,3}:\d{2}(?:\.\d{1,3})?)\]/g;

  for (const sourceLine of sourceLines) {
    const timestamps = [];
    let match;

    while ((match = timestampPattern.exec(sourceLine)) !== null) {
      const time = parseTimestamp(match[1]);

      if (time !== null) {
        timestamps.push(time);
      }
    }

    const text = sourceLine
      .replace(timestampPattern, "")
      .replace(/\[[a-zA-Z]+:[^\]]*\]/g, "")
      .trim();

    for (const time of timestamps) {
      lines.push({
        time,
        text,
        words: []
      });
    }
  }

  lines.sort((a, b) => a.time - b.time);

  return lines;
}


// Convert ordinary lyrics text into untimed lines.
export function parsePlainLyrics(text) {
  if (typeof text !== "string") {
    throw new TypeError("Lyrics must be text.");
  }

  return text
    .split(/\r?\n/)
    .map(line => ({
      time: null,
      text: line.trim(),
      words: []
    }))
    .filter(line => line.text.length > 0);
}


// Validate and normalize lyrics.
export function normalizeLyrics(lyrics) {
  if (!Array.isArray(lyrics)) {
    throw new TypeError("Lyrics must be an array.");
  }

  return lyrics
    .map(line => {
      const time =
        line.time === null || line.time === undefined
          ? null
          : Number(line.time);

      const words = Array.isArray(line.words)
        ? line.words
            .map(word => ({
              start: Number(word.start),
              end: Number(word.end),
              text: String(word.text || "")
            }))
            .filter(word =>
              Number.isFinite(word.start) &&
              Number.isFinite(word.end) &&
              word.start >= 0 &&
              word.end >= word.start &&
              word.text.length > 0
            )
        : [];

      return {
        time:
          time !== null && Number.isFinite(time) && time >= 0
            ? time
            : null,

        text: String(line.text || ""),
        words
      };
    })
    .filter(line => line.text.length > 0)
    .sort((a, b) => {
      if (a.time === null) return 1;
      if (b.time === null) return -1;
      return a.time - b.time;
    });
}


// Find the active lyric line using binary search.
export function getCurrentLineIndex(lyrics, currentTime) {
  if (!Array.isArray(lyrics) || lyrics.length === 0) {
    return -1;
  }

  const time = Number(currentTime);

  if (!Number.isFinite(time) || time < 0) {
    return -1;
  }

  let left = 0;
  let right = lyrics.length - 1;
  let result = -1;

  while (left <= right) {
    const middle = Math.floor((left + right) / 2);
    const lineTime = lyrics[middle].time;

    if (lineTime === null || lineTime === undefined) {
      right = middle - 1;
      continue;
    }

    if (lineTime <= time) {
      result = middle;
      left = middle + 1;
    } else {
      right = middle - 1;
    }
  }

  return result;
}


// Find the active word when accurate word timestamps exist.
export function getCurrentWordIndex(line, currentTime) {
  if (!line || !Array.isArray(line.words)) {
    return -1;
  }

  const time = Number(currentTime);

  return line.words.findIndex(word =>
    time >= word.start && time <= word.end
  );
}


// Create a safe lyrics display.
export function renderLyrics(container, lyrics, currentTime, options = {}) {
  if (!container) return -1;

  const normalized = normalizeLyrics(lyrics);

  const activeIndex = getCurrentLineIndex(
    normalized,
    currentTime
  );

  const autoScroll = options.autoScroll !== false;

  // Rebuild only when the lyrics data changes.
  if (container.dataset.lyricsReady !== "true") {
    container.replaceChildren();

    normalized.forEach((line, index) => {
      const element = document.createElement("div");

      element.className = "lyric-line";
      element.dataset.index = String(index);

      const textElement = document.createElement("span");
      textElement.className = "lyric-text";
      textElement.textContent = line.text;

      element.appendChild(textElement);

      container.appendChild(element);
    });

    container.dataset.lyricsReady = "true";
    container.dataset.activeIndex = "-1";
  }

  // Update highlighting.
  if (container.dataset.lyricsReady === "true") {
    const elements = container.querySelectorAll(".lyric-line");

    elements.forEach((element, index) => {
      const active = index === activeIndex;

      element.classList.toggle("active", active);
      element.classList.toggle("inactive", !active);

      if (active) {
        element.setAttribute("aria-current", "true");
      } else {
        element.removeAttribute("aria-current");
      }
    });
  }

  const previousIndex = Number(container.dataset.activeIndex);

  if (
    autoScroll &&
    activeIndex >= 0 &&
    activeIndex !== previousIndex
  ) {
    const activeElement = container.querySelector(
      `[data-index="${activeIndex}"]`
    );

    activeElement?.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }

  container.dataset.activeIndex = String(activeIndex);

  return activeIndex;
}


// Render accurate word-level timing when available.
export function renderWordLyrics(container, line, currentTime) {
  if (!container || !line) return;

  container.replaceChildren();

  if (!Array.isArray(line.words) || line.words.length === 0) {
    container.textContent = line.text || "";
    return;
  }

  const activeWord = getCurrentWordIndex(line, currentTime);

  line.words.forEach((word, index) => {
    const span = document.createElement("span");

    span.className = "lyric-word";
    span.textContent = word.text + " ";

    if (index === activeWord) {
      span.classList.add("active");
    }

    container.appendChild(span);
  });
}


// Convert timestamped lyrics back into LRC text.
export function exportLRC(lyrics) {
  const normalized = normalizeLyrics(lyrics);

  return normalized
    .filter(line => line.time !== null)
    .map(line =>
      `${formatTimestamp(line.time)}${line.text}`
    )
    .join("\n");
}


// Convert lyrics into ordinary editable text.
export function exportPlainLyrics(lyrics) {
  return normalizeLyrics(lyrics)
    .map(line => line.text)
    .join("\n");
}


// Update a lyric line's text.
export function updateLyricLine(lyrics, index, newText) {
  const normalized = normalizeLyrics(lyrics);

  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= normalized.length
  ) {
    throw new RangeError("Invalid lyric line index.");
  }

  normalized[index].text = String(newText);

  return normalized;
}


// Change a lyric line's timestamp.
export function updateLyricTimestamp(lyrics, index, newTime) {
  const normalized = normalizeLyrics(lyrics);

  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= normalized.length
  ) {
    throw new RangeError("Invalid lyric line index.");
  }

  const time = Number(newTime);

  if (!Number.isFinite(time) || time < 0) {
    throw new TypeError("Invalid timestamp.");
  }

  normalized[index].time = time;

  return normalized.sort((a, b) => {
    if (a.time === null) return 1;
    if (b.time === null) return -1;
    return a.time - b.time;
  });
}


// Create a lyric line at a selected playback time.
export function addLyricLine(lyrics, text, time = null) {
  const normalized = normalizeLyrics(lyrics);

  const newLine = {
    time:
      time === null
        ? null
        : Number(time),

    text: String(text || "").trim(),
    words: []
  };

  if (!newLine.text) {
    throw new TypeError("Lyric text cannot be empty.");
  }

  if (
    newLine.time !== null &&
    (!Number.isFinite(newLine.time) || newLine.time < 0)
  ) {
    throw new TypeError("Invalid lyric timestamp.");
  }

  normalized.push(newLine);

  return normalized.sort((a, b) => {
    if (a.time === null) return 1;
    if (b.time === null) return -1;
    return a.time - b.time;
  });
}


// Remove a lyric line.
export function deleteLyricLine(lyrics, index) {
  const normalized = normalizeLyrics(lyrics);

  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= normalized.length
  ) {
    throw new RangeError("Invalid lyric line index.");
  }

  normalized.splice(index, 1);

  return normalized;
}


// Reset the lyrics display so new lyrics can be rendered.
export function resetLyricsDisplay(container) {
  if (!container) return;

  container.replaceChildren();

  delete container.dataset.lyricsReady;
  delete container.dataset.activeIndex;
}


// Default lyrics utility object.
const lyricsEngine = {
  formatTimestamp,
  parseTimestamp,
  parseLRC,
  parsePlainLyrics,
  normalizeLyrics,
  getCurrentLineIndex,
  getCurrentWordIndex,
  renderLyrics,
  renderWordLyrics,
  exportLRC,
  exportPlainLyrics,
  updateLyricLine,
  updateLyricTimestamp,
  addLyricLine,
  deleteLyricLine,
  resetLyricsDisplay
};

export default lyricsEngine;
