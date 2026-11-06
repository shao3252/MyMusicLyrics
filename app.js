
/*
 * MY MUSIC LYRICS
 * FILE 07: app.js
 *
 * Main application controller.
 */

import audioEngine from "./audio.js";

import {
  initializeStorage,
  saveSong,
  getAllSongs,
  deleteSong,
  savePlaylist,
  getAllPlaylists,
  deletePlaylist,
  addSongToPlaylist,
  saveLyrics,
  getLyrics,
  addToHistory,
  getRecentlyPlayed,
  clearHistory,
  setFavorite,
  getFavorites,
  saveSetting,
  getSetting
} from "./storage.js";

import {
  parseLRC,
  parsePlainLyrics,
  normalizeLyrics,
  renderLyrics,
  resetLyricsDisplay,
  exportLRC
} from "./lyrics.js";

import {
  transcribeAudio,
  checkTranscriptionServer
} from "./transcription.js";


// --------------------------------------------------
// APPLICATION STATE
// --------------------------------------------------

const state = {
  songs: [],
  playlists: [],
  favorites: [],
  recentSongs: [],
  currentSong: null,
  currentLyrics: [],
  currentLyricsSource: "none",
  deferredInstallPrompt: null,
  editingLyrics: false,
  shuffle: false,
  repeat: "off",
  autoScrollLyrics: true
};


// --------------------------------------------------
// DOM HELPERS
// --------------------------------------------------

const $ = id => document.getElementById(id);

function createElement(tag, className, text = "") {
  const element = document.createElement(tag);

  if (className) {
    element.className = className;
  }

  if (text !== undefined && text !== null) {
    element.textContent = String(text);
  }

  return element;
}


function showToast(message, duration = 2500) {
  const toast = $("toast");

  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast.timeout);

  showToast.timeout = setTimeout(() => {
    toast.classList.remove("show");
  }, duration);
}


function makeId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return "song-" + Date.now() + "-" +
    Math.random().toString(36).slice(2);
}


function formatTime(seconds) {
  const value = Number(seconds) || 0;

  const minutes = Math.floor(value / 60);
  const remaining = Math.floor(value % 60);

  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}


function getSongTitle(song) {
  return song?.title || "Unknown Song";
}


function getSongArtist(song) {
  return song?.artist || "Unknown Artist";
}


function getLyricsArray(saved) {
  if (Array.isArray(saved)) return saved;

  if (saved && Array.isArray(saved.lines)) {
    return saved.lines;
  }

  if (saved && Array.isArray(saved.lyrics)) {
    return saved.lyrics;
  }

  return [];
}


// --------------------------------------------------
// SCREEN NAVIGATION
// --------------------------------------------------

function showScreen(screenName) {
  const screens = [
    "home",
    "songs",
    "player",
    "lyrics",
    "playlists",
    "settings"
  ];

  if (!screens.includes(screenName)) return;

  screens.forEach(name => {
    const screen = $(name + "Screen");

    if (screen) {
      screen.classList.toggle(
        "active",
        name === screenName
      );
    }
  });

  document.querySelectorAll("[data-screen]").forEach(item => {
    item.classList.toggle(
      "active",
      item.dataset.screen === screenName
    );
  });

  if (screenName === "home") {
    renderHome();
  }

  if (screenName === "songs") {
    renderSongs();
  }

  if (screenName === "playlists") {
    renderPlaylists();
  }
}


function createMoreMenu(buttonId, actions) {
  const button = $(buttonId);
  if (!button) return;

  button.addEventListener("click", event => {
    event.stopPropagation();
    const existing = button.parentElement.querySelector(".more-menu");
    document.querySelectorAll(".more-menu").forEach(menu => menu.remove());
    if (existing) return;

    const menu = createElement("div", "more-menu");
    menu.setAttribute("role", "menu");

    actions.forEach(action => {
      const item = createElement("button", "more-menu-item", action.label);
      item.type = "button";
      item.setAttribute("role", "menuitem");
      item.addEventListener("click", async clickEvent => {
        clickEvent.stopPropagation();
        menu.remove();
        await action.run();
      });
      menu.appendChild(item);
    });

    button.parentElement.appendChild(menu);
  });
}

function setupMoreMenus() {
  createMoreMenu("playerMore", [
    {
      label: "Lyrics",
      run: () => showScreen("lyrics")
    },
    {
      label: "Add / remove favorite",
      run: async () => {
        if (!state.currentSong) {
          showToast("Play a song first.");
          return;
        }
        await toggleFavorite(state.currentSong);
      }
    },
    {
      label: "Song information",
      run: () => {
        const song = state.currentSong;
        if (!song) {
          showToast("No song is playing.");
          return;
        }
        showToast(getSongTitle(song) + " — " + getSongArtist(song), 4500);
      }
    }
  ]);

  createMoreMenu("lyricsOptions", [
    {
      label: "Generate lyrics",
      run: () => $("transcribeButton")?.click()
    },
    {
      label: "Load LRC file",
      run: () => $("loadLrcButton")?.click()
    },
    {
      label: "Add / edit text lyrics",
      run: () => $("editLyricsButton")?.click()
    }
  ]);

  document.addEventListener("click", () => {
    document.querySelectorAll(".more-menu").forEach(menu => menu.remove());
  });
}


function setupNavigation() {
  setupMoreMenus();
  document.querySelectorAll("[data-screen]").forEach(item => {
    item.addEventListener("click", () => {
      showScreen(item.dataset.screen);
    });
  });

  $("settingsShortcut")?.addEventListener("click", () => {
    showScreen("settings");
  });

  $("openAllSongs")?.addEventListener("click", () => {
    showScreen("songs");
  });

  $("playerBack")?.addEventListener("click", () => {
    showScreen("songs");
  });

  $("lyricsBack")?.addEventListener("click", () => {
    showScreen("player");
  });

  $("miniLyrics")?.addEventListener("click", () => {
    showScreen("lyrics");
  });
}


// --------------------------------------------------
// SONG INFORMATION
// --------------------------------------------------

function createSongCard(song, options = {}) {
  const card = createElement("div", "song-card");

  const artwork = createElement("div", "song-artwork", "♫");

  const information = createElement("div", "song-info");

  const title = createElement(
    "div",
    "song-title",
    getSongTitle(song)
  );

  const artist = createElement(
    "div",
    "song-artist",
    getSongArtist(song)
  );

  information.append(title, artist);

  const play = createElement("button", "song-play", "▶");
  play.type = "button";
  play.setAttribute("aria-label", "Play " + getSongTitle(song));

  play.addEventListener("click", event => {
    event.stopPropagation();
    playSong(song);
  });

  card.append(artwork, information, play);

  card.addEventListener("click", () => {
    playSong(song);
  });

  if (options.showFavorite) {
    const favorite = createElement(
      "button",
      "song-favorite",
      state.favorites.includes(song.id) ? "♥" : "♡"
    );

    favorite.type = "button";

    favorite.addEventListener("click", async event => {
      event.stopPropagation();
      await toggleFavorite(song);
    });

    card.appendChild(favorite);
  }

  return card;
}


// --------------------------------------------------
// HOME SCREEN
// --------------------------------------------------

async function renderHome() {
  const recentContainer = $("recentSongs");

  if (recentContainer) {
    recentContainer.replaceChildren();

    const recent = state.recentSongs
      .map(id => state.songs.find(song => song.id === id))
      .filter(Boolean)
      .slice(0, 6);

    if (recent.length === 0) {
      recentContainer.appendChild(
        createElement("p", "empty-message", "No recently played songs.")
      );
    } else {
      recent.forEach(song => {
        recentContainer.appendChild(createSongCard(song));
      });
    }
  }

  if ($("homeSongCount")) {
    $("homeSongCount").textContent = state.songs.length;
  }

  if ($("homePlaylistCount")) {
    $("homePlaylistCount").textContent = state.playlists.length;
  }
}


// --------------------------------------------------
// ALL SONGS
// --------------------------------------------------

function renderSongs(searchText = "") {
  const container = $("allSongsList");

  if (!container) return;

  container.replaceChildren();

  const query = searchText.toLowerCase().trim();

  const filtered = state.songs.filter(song => {
    const title = getSongTitle(song).toLowerCase();
    const artist = getSongArtist(song).toLowerCase();

    return title.includes(query) || artist.includes(query);
  });

  if ($("songCount")) {
    $("songCount").textContent = filtered.length;
  }

  if (filtered.length === 0) {
    container.appendChild(
      createElement(
        "p",
        "empty-message",
        state.songs.length
          ? "No songs match your search."
          : "Your music library is empty. Add your first song."
      )
    );

    return;
  }

  filtered.forEach(song => {
    container.appendChild(
      createSongCard(song, { showFavorite: true })
    );
  });
}


function setupSongSearch() {
  $("songSearch")?.addEventListener("input", event => {
    renderSongs(event.target.value);
  });
}


// --------------------------------------------------
// IMPORT MUSIC
// --------------------------------------------------

async function importMusicFiles(files) {
  if (!files || files.length === 0) return;

  let imported = 0;
  let refreshed = 0;
  let unsupported = 0;
  let failed = 0;

  const supportedExtensions = new Set([
    "mp3", "wav", "m4a", "aac", "ogg", "flac",
    "opus", "webm", "aiff", "wma", "mp4"
  ]);

  async function isSupportedAudioFile(file) {
    const cleanName = String(file.name || "")
      .trim()
      .split(/[\\/]/)
      .pop()
      .toLowerCase();
    const extension = cleanName.includes(".")
      ? cleanName.split(".").pop()
      : "";
    const mimeType = String(file.type || "").toLowerCase();

    // Trust a supported audio extension or browser audio MIME type.
    if (supportedExtensions.has(extension) || mimeType.startsWith("audio/")) {
      return true;
    }

    // Some desktop browsers report an empty or incorrect MIME type.
    // Check common audio file signatures instead.
    try {
      const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
      const ascii = (start, length) =>
        String.fromCharCode(...bytes.slice(start, start + length));

      // ID3-tagged MP3, MPEG audio frame sync, WAV, FLAC, OGG,
      // AIFF, MP4/M4A and AAC/ADTS.
      const hasID3 = ascii(0, 3) === "ID3";
      const hasMpegFrame = bytes.length >= 2 &&
        bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
      const isWav = ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE";
      const isFlac = ascii(0, 4) === "fLaC";
      const isOgg = ascii(0, 4) === "OggS";
      const isAiff = ascii(0, 4) === "FORM" &&
        ["AIFF", "AIFC"].includes(ascii(8, 4));
      const isMp4 = ascii(4, 4) === "ftyp";
      const isAac = ascii(0, 4) === "ADIF" ||
        (bytes.length >= 2 && bytes[0] === 0xff &&
          (bytes[1] & 0xf6) === 0xf0);

      return hasID3 || hasMpegFrame || isWav || isFlac ||
        isOgg || isAiff || isMp4 || isAac;
    } catch (error) {
      console.warn("Could not inspect audio file signature:", error);
      return false;
    }
  }

  for (const file of Array.from(files)) {
    const fileName = String(file.name || "").trim();
    const mimeType = String(file.type || "").toLowerCase();
    const isAudio = await isSupportedAudioFile(file);

    if (!isAudio) {
      unsupported++;
      console.warn("Rejected selected file:", {
        name: fileName,
        type: mimeType,
        size: file.size
      });
      continue;
    }

    // If a matching library entry already exists, refresh its stored file.
    // This repairs older entries that may have metadata but no playable audio Blob.
    const existingIndex = state.songs.findIndex(song =>
      song.name === fileName && Number(song.size) === Number(file.size)
    );

    if (existingIndex !== -1) {
      const existingSong = state.songs[existingIndex];
      const refreshedSong = {
        ...existingSong,
        file,
        type: mimeType || existingSong.type || "audio/mpeg",
        size: file.size,
        name: fileName
      };

      try {
        await saveSong(refreshedSong);
        state.songs[existingIndex] = refreshedSong;
        refreshed++;
      } catch (error) {
        failed++;
        console.error("Could not refresh stored music file:", fileName, error);
      }
      continue;
    }

    const title = fileName.replace(/\.[^/.]+$/, "");
    const song = {
      id: makeId(),
      title,
      artist: "Unknown Artist",
      album: "Unknown Album",
      name: fileName,
      type: mimeType || "audio/mpeg",
      size: file.size,
      duration: 0,
      file,
      favorite: false,
      addedAt: Date.now()
    };

    try {
      await saveSong(song);
      state.songs.push(song);
      imported++;
    } catch (error) {
      failed++;
      console.error("Could not save song:", fileName, error);
    }
  }

  if (imported > 0 || refreshed > 0) {
    const messages = [];
    if (imported > 0) messages.push(`${imported} new song(s) added`);
    if (refreshed > 0) messages.push(`${refreshed} existing song file(s) refreshed`);
    showToast(messages.join("; ") + ".");
  } else if (failed > 0) {
    showToast("Could not save music. Browser storage may be full or unavailable.");
  } else if (unsupported > 0) {
    showToast("The selected file is not a supported audio format. Choose MP3, WAV, M4A, or another supported audio file.");
  } else {
    showToast("No music files were selected.");
  }

  renderSongs();
  renderHome();
}


function openMusicPicker() {
  $("audioFileInput")?.click();
}


function setupMusicImport() {
  $("addMusicHome")?.addEventListener("click", openMusicPicker);
  $("addMusicSongs")?.addEventListener("click", openMusicPicker);
  $("settingsAddMusic")?.addEventListener("click", openMusicPicker);

  $("audioFileInput")?.addEventListener("change", async event => {
    await importMusicFiles(event.target.files);

    // Allow selecting the same file again.
    event.target.value = "";
  });
}


// --------------------------------------------------
// MUSIC PLAYER
// --------------------------------------------------

async function playSong(song) {
  if (!song) return;

  try {
    let playlist = state.songs;

    const index = playlist.findIndex(item => item.id === song.id);

    audioEngine.setPlaylist(playlist, Math.max(0, index));

    await audioEngine.loadSong(Math.max(0, index), true);

    state.currentSong = song;

    await addToHistory(song.id);

    await refreshRecentSongs();

    renderPlayer();
    await loadCurrentSongLyrics();
    showScreen("player");

  } catch (error) {
    console.error("Playback error:", error);
    showToast("Unable to play this song. Check the audio file.");
  }
}


function renderPlayer() {
  const song = state.currentSong || audioEngine.getCurrentSong();

  if (!song) return;

  state.currentSong = song;

  if ($("currentTitle")) {
    $("currentTitle").textContent = getSongTitle(song);
  }

  if ($("currentArtist")) {
    $("currentArtist").textContent = getSongArtist(song);
  }

  if ($("miniPlayerTitle")) {
    $("miniPlayerTitle").textContent = getSongTitle(song);
  }

  if ($("miniPlayerArtist")) {
    $("miniPlayerArtist").textContent = getSongArtist(song);
  }

  if ($("lyricsSongTitle")) {
    $("lyricsSongTitle").textContent = getSongTitle(song);
  }

  if ($("lyricsSongArtist")) {
    $("lyricsSongArtist").textContent = getSongArtist(song);
  }

  updateFavoriteButton();
  updatePlayButtons();
}


function updatePlayButtons() {
  const playing = audioEngine.isPlaying();

  if ($("playButton")) {
    $("playButton").textContent = playing ? "Ⅱ" : "▶";
  }

  if ($("miniPlayButton")) {
    $("miniPlayButton").textContent = playing ? "Ⅱ" : "▶";
  }
}


function updateProgress() {
  const current = audioEngine.getCurrentTime();
  const duration = audioEngine.getDuration();

  if ($("currentTime")) {
    $("currentTime").textContent = formatTime(current);
  }

  if ($("totalDuration")) {
    $("totalDuration").textContent = formatTime(duration);
  }

  if ($("seekBar") && duration > 0) {
    $("seekBar").value = (current / duration) * 100;
  }

  if (state.currentLyrics.length > 0 && $("lyricsDisplay")) {
    renderLyrics(
      $("lyricsDisplay"),
      state.currentLyrics,
      current,
      { autoScroll: state.autoScrollLyrics }
    );
  }

  updateMiniLyrics();
}


function setupPlayerControls() {
  $("playButton")?.addEventListener("click", async () => {
    await audioEngine.togglePlay();
    updatePlayButtons();
  });

  $("miniPlayButton")?.addEventListener("click", async () => {
    await audioEngine.togglePlay();
    updatePlayButtons();
  });

  $("previousButton")?.addEventListener("click", async () => {
    await audioEngine.previous();
    state.currentSong = audioEngine.getCurrentSong();
    renderPlayer();
    await loadCurrentSongLyrics();
  });

  $("nextButton")?.addEventListener("click", async () => {
    await audioEngine.next();
    state.currentSong = audioEngine.getCurrentSong();
    renderPlayer();
    await loadCurrentSongLyrics();
  });

  $("shuffleButton")?.addEventListener("click", () => {
    state.shuffle = !state.shuffle;
    audioEngine.setShuffle(state.shuffle);

    $("shuffleButton").classList.toggle("active", state.shuffle);
    showToast(state.shuffle ? "Shuffle enabled." : "Shuffle disabled.");
  });

  $("repeatButton")?.addEventListener("click", () => {
    state.repeat = audioEngine.cycleRepeat();

    $("repeatButton").classList.toggle(
      "active",
      state.repeat !== "off"
    );

    $("repeatButton").textContent =
      state.repeat === "one" ? "↻1" : "↻";

    showToast("Repeat: " + state.repeat);
  });

  $("seekBar")?.addEventListener("input", event => {
    const duration = audioEngine.getDuration();

    if (duration > 0) {
      const percentage = Number(event.target.value) / 100;

      audioEngine.seek(percentage * duration);
    }
  });

  $("volumeControl")?.addEventListener("input", event => {
    audioEngine.setVolume(Number(event.target.value));
  });

  $("favoriteButton")?.addEventListener("click", async () => {
    if (state.currentSong) {
      await toggleFavorite(state.currentSong);
    }
  });

  $("miniPlayer")?.addEventListener("click", event => {
    if (event.target.closest("button")) return;

    showScreen("player");
  });
}


// --------------------------------------------------
// AUDIO ENGINE EVENTS
// --------------------------------------------------

let spectrumContext = null;
let spectrumAnalyser = null;
let spectrumFrame = null;
let spectrumSource = null;
let lyricsExportRecorder = null;
let lyricsExportTimer = null;
let lyricsExportFrame = null;
let lyricsExportDestination = null;
let lyricsExportCanvasStream = null;
let lyricsExportEndHandler = null;


function setupSpectrum() {
  const bars = $("spectrumBars");
  const audio = audioEngine.audio;
  if (!bars || !audio) return;

  if (!bars.children.length) {
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < 36; i++) {
      const bar = document.createElement("span");
      bar.className = "spectrum-bar";
      fragment.appendChild(bar);
    }
    bars.appendChild(fragment);
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    $("spectrumStatus").textContent = "NOT SUPPORTED";
    return;
  }

  try {
    if (!spectrumContext) {
      spectrumContext = new AudioContextClass();
      spectrumAnalyser = spectrumContext.createAnalyser();
      spectrumAnalyser.fftSize = 128;
      spectrumAnalyser.smoothingTimeConstant = 0.78;
      spectrumSource = spectrumContext.createMediaElementSource(audio);
      spectrumSource.connect(spectrumAnalyser);
      spectrumAnalyser.connect(spectrumContext.destination);
    }

    const data = new Uint8Array(spectrumAnalyser.frequencyBinCount);
    const draw = () => {
      spectrumFrame = requestAnimationFrame(draw);
      spectrumAnalyser.getByteFrequencyData(data);
      const children = bars.children;
      for (let i = 0; i < children.length; i++) {
        const value = data[Math.floor(i * data.length / children.length)] || 0;
        children[i].style.height = Math.max(4, (value / 255) * 100) + "%";
      }
      if ($("spectrumStatus")) $("spectrumStatus").textContent =
        audioEngine.isPlaying() ? "ANALYZING" : "PAUSED";
    };
    if (spectrumContext.state === "suspended") spectrumContext.resume();
    if (spectrumFrame) cancelAnimationFrame(spectrumFrame);
    draw();
  } catch (error) {
    console.warn("Audio spectrum unavailable:", error);
    if ($("spectrumStatus")) $("spectrumStatus").textContent = "UNAVAILABLE";
  }
}


function setupAudioEvents() {
  audioEngine.on("loadedmetadata", () => {
    updateProgress();
  });

  audioEngine.on("timeupdate", () => {
    updateProgress();
  });

  audioEngine.on("play", () => { updatePlayButtons(); setupSpectrum(); });

  audioEngine.on("pause", updatePlayButtons);

  audioEngine.on("ended", () => {
    state.currentSong = audioEngine.getCurrentSong();
    renderPlayer();
  });

  audioEngine.on("waiting", () => {
    showToast("Loading audio...");
  });
}


// --------------------------------------------------
// FAVORITES
// --------------------------------------------------

async function toggleFavorite(song) {
  if (!song) return;

  const isFavorite = state.favorites.includes(song.id);

  await setFavorite(song.id, !isFavorite);

  if (isFavorite) {
    state.favorites = state.favorites.filter(id => id !== song.id);
    showToast("Removed from favorites.");
  } else {
    state.favorites.push(song.id);
    showToast("Added to favorites.");
  }

  updateFavoriteButton();
  renderSongs();
}


function updateFavoriteButton() {
  if (!$("favoriteButton") || !state.currentSong) return;

  const favorite = state.favorites.includes(state.currentSong.id);

  $("favoriteButton").textContent = favorite ? "♥" : "♡";
  $("favoriteButton").classList.toggle("active", favorite);
}


// --------------------------------------------------
// LYRICS
// --------------------------------------------------

let lyricsLookupRequestId = 0;

function normalizeTrackText(value) {
  return String(value || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isUnknownArtist(value) {
  const artist = normalizeTrackText(value);
  return !artist || artist === "unknown artist" || artist === "unknown";
}

function lyricsRecordMatchesSong(record, song, duration) {
  const wantedTitle = normalizeTrackText(song.title);
  const foundTitle = normalizeTrackText(record.trackName || record.name);
  if (!wantedTitle || foundTitle !== wantedTitle) return false;

  if (!isUnknownArtist(song.artist)) {
    const wantedArtist = normalizeTrackText(song.artist);
    const foundArtist = normalizeTrackText(record.artistName);
    if (!foundArtist || foundArtist !== wantedArtist) return false;
  }

  const recordDuration = Number(record.duration) || 0;
  if (duration > 0 && recordDuration > 0 &&
      Math.abs(duration - recordDuration) > 8) {
    return false;
  }

  return true;
}

async function requestLrclib(url) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Lrclib-Client": "MyMusicLyrics/1.0 (https://github.com/shao3252/MyMusicLyrics)",
      "Accept": "application/json"
    },
    cache: "no-store"
  });

  if (response.status === 404) return null;

  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After");
    throw new Error(
      "LRCLIB is busy. Please try again" +
      (retryAfter ? " in " + retryAfter + " seconds." : " later.")
    );
  }

  if (!response.ok) {
    throw new Error("Lyrics service returned HTTP " + response.status);
  }

  return response.json();
}

async function waitForSongDuration(song) {
  const currentDuration = Number(audioEngine.getDuration()) || 0;
  if (currentDuration > 0) return currentDuration;

  const audio = audioEngine.audio;
  if (!audio || audioEngine.getCurrentSong()?.id !== song.id) return 0;

  await new Promise(resolve => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      audio.removeEventListener("loadedmetadata", finish);
      clearTimeout(timeoutId);
      resolve();
    };

    audio.addEventListener("loadedmetadata", finish, { once: true });
    const timeoutId = setTimeout(finish, 2500);
  });

  return audioEngine.getCurrentSong()?.id === song.id
    ? Number(audioEngine.getDuration()) || 0
    : 0;
}

async function findAutomaticLyrics(song) {
  const title = String(song.title || "").trim();
  const artist = String(song.artist || "").trim();
  const duration = await waitForSongDuration(song);

  if (!title || normalizeTrackText(title) === "unknown song") return null;

  // Exact signature lookup is the safest match when artist metadata exists.
  if (!isUnknownArtist(artist)) {
    const params = new URLSearchParams({
      track_name: title,
      artist_name: artist
    });

    if (song.album && song.album !== "Unknown Album") {
      params.set("album_name", song.album);
    }
    if (duration > 0 && duration <= 3600) {
      params.set("duration", String(Math.round(duration)));
    }

    const exact = await requestLrclib(
      "https://lrclib.net/api/get?" + params.toString()
    );

    if (exact && lyricsRecordMatchesSong(exact, song, duration)) {
      return exact;
    }
  }

  // Search by title when the artist is missing or exact matching fails.
  const searchParams = new URLSearchParams({ track_name: title });
  if (!isUnknownArtist(artist)) {
    searchParams.set("artist_name", artist);
  }

  const results = await requestLrclib(
    "https://lrclib.net/api/search?" + searchParams.toString()
  );

  if (!Array.isArray(results)) return null;

  const matches = results.filter(record =>
    lyricsRecordMatchesSong(record, song, duration) &&
    (record.syncedLyrics || record.plainLyrics)
  );

  if (matches.length === 0) return null;

  // Do not guess between different artists when the file has no artist tag.
  if (isUnknownArtist(artist) && duration <= 0 && matches.length !== 1) {
    return null;
  }

  matches.sort((a, b) => {
    const aDiff = duration > 0 && Number(a.duration) > 0
      ? Math.abs(duration - Number(a.duration)) : 0;
    const bDiff = duration > 0 && Number(b.duration) > 0
      ? Math.abs(duration - Number(b.duration)) : 0;
    return aDiff - bDiff;
  });

  return matches[0];
}

async function loadCurrentSongLyrics() {
  const song = state.currentSong;
  if (!song) return;

  const requestId = ++lyricsLookupRequestId;

  try {
    const saved = await getLyrics(song.id);

    // Ignore a slow database response if the user has already changed songs.
    if (requestId !== lyricsLookupRequestId || state.currentSong?.id !== song.id) {
      return;
    }

    const savedLines = normalizeLyrics(getLyricsArray(saved));

    if (savedLines.length > 0) {
      state.currentLyrics = savedLines;
      state.currentLyricsSource = saved?.source || "saved";
      displayCurrentLyrics();
      return;
    }

    state.currentLyrics = [];
    state.currentLyricsSource = "searching";
    displayCurrentLyrics();

    if ($("lyricsStatus")) {
      $("lyricsStatus").textContent = "Searching free lyrics...";
    }

    const record = await findAutomaticLyrics(song);

    // Never attach a previous song's result to the newly selected song.
    if (requestId !== lyricsLookupRequestId || state.currentSong?.id !== song.id) {
      return;
    }

    if (!record || record.instrumental) {
      state.currentLyrics = [];
      state.currentLyricsSource = "none";
      displayCurrentLyrics();
      if ($("lyricsStatus")) {
        $("lyricsStatus").textContent = "No matching lyrics found";
      }
      return;
    }

    let lines = [];
    let source = "LRCLIB";

    if (record.syncedLyrics) {
      lines = parseLRC(record.syncedLyrics);
    }
    if (lines.length === 0 && record.plainLyrics) {
      lines = parsePlainLyrics(record.plainLyrics);
      source = "LRCLIB (untimed)";
    }

    if (lines.length === 0) {
      state.currentLyrics = [];
      state.currentLyricsSource = "none";
      displayCurrentLyrics();
      return;
    }

    state.currentLyrics = normalizeLyrics(lines);
    state.currentLyricsSource = source;

    await saveLyrics(song.id, {
      lines: state.currentLyrics,
      source: "LRCLIB",
      updatedAt: Date.now()
    });

    if (requestId !== lyricsLookupRequestId || state.currentSong?.id !== song.id) {
      return;
    }

    displayCurrentLyrics();
    if ($("lyricsStatus")) {
      $("lyricsStatus").textContent =
        source === "LRCLIB" ? "Free synced lyrics loaded" : "Free lyrics loaded (not timed)";
    }

  } catch (error) {
    if (requestId !== lyricsLookupRequestId || state.currentSong?.id !== song.id) {
      return;
    }

    console.warn("Automatic lyrics lookup failed:", error);
    state.currentLyrics = [];
    state.currentLyricsSource = "none";
    displayCurrentLyrics();

    if ($("lyricsStatus")) {
      $("lyricsStatus").textContent =
        error.message && error.message.startsWith("LRCLIB is busy")
          ? error.message
          : "Lyrics lookup unavailable. You can still import lyrics or transcribe.";
    }
  }
}


function updateMiniLyrics() {
  const container = $("miniLyrics");
  if (!container) return;

  if (!state.currentSong || state.currentLyrics.length === 0) {
    container.textContent = "Lyrics will appear here when available.";
    delete container.dataset.lyricsKey;
    return;
  }

  const timed = state.currentLyrics.every(line =>
    Number.isFinite(line.time) && line.time >= 0
  );

  if (!timed) {
    const key = "untimed:" + state.currentLyrics.map(line => line.text).join("|");
    if (container.dataset.lyricsKey === key) return;

    container.replaceChildren();
    const notice = document.createElement("p");
    notice.className = "mini-lyric-line";
    notice.textContent = "These lyrics have no timestamps, so live synchronization is unavailable.";
    container.appendChild(notice);

    state.currentLyrics.slice(0, 3).forEach(line => {
      const paragraph = document.createElement("p");
      paragraph.className = "mini-lyric-line";
      paragraph.textContent = line.text;
      container.appendChild(paragraph);
    });
    container.dataset.lyricsKey = key;
    return;
  }

  const currentTime = audioEngine.getCurrentTime();
  let active = 0;
  state.currentLyrics.forEach((line, index) => {
    if (line.time <= currentTime) active = index;
  });

  const visibleStart = Math.max(0, active - 1);
  const visible = state.currentLyrics.slice(visibleStart, active + 3);
  const key = "timed:" + active + ":" + visible.map(line => line.text).join("|");
  if (container.dataset.lyricsKey === key) return;

  container.replaceChildren();
  visible.forEach((line, offset) => {
    const index = visibleStart + offset;
    const paragraph = document.createElement("p");
    paragraph.className = "mini-lyric-line" + (index === active ? " active" : "");
    paragraph.textContent = line.text;
    container.appendChild(paragraph);
  });
  container.dataset.lyricsKey = key;
}

function displayCurrentLyrics() {
  const container = $("lyricsDisplay");

  if (!container) return;

  resetLyricsDisplay(container);

  if (state.currentLyrics.length === 0) {
    container.textContent = "No lyrics available for this song yet.";
  } else {
    renderLyrics(
      container,
      state.currentLyrics,
      audioEngine.getCurrentTime()
    );
  }

  if ($("lyricsStatus")) {
    $("lyricsStatus").textContent =
      state.currentLyrics.length > 0
        ? "Lyrics loaded"
        : "No lyrics available";
  }

  updateMiniLyrics();
}


async function importLRCFile(file) {
  if (!file || !state.currentSong) {
    showToast("Play a song before importing lyrics.");
    return;
  }

  try {
    const text = await file.text();

    const lyrics = parseLRC(text);

    if (lyrics.length === 0) {
      throw new Error("No valid LRC timestamps found.");
    }

    state.currentLyrics = lyrics;
    state.currentLyricsSource = "lrc";

    await saveLyrics(state.currentSong.id, {
      lines: lyrics,
      source: "lrc",
      updatedAt: Date.now()
    });

    displayCurrentLyrics();

    showToast("LRC lyrics imported successfully.");

  } catch (error) {
    console.error("LRC import error:", error);
    showToast(error.message || "Could not import LRC file.");
  }
}



const LYRICS_VIDEO_THEMES = {
  neon: { background: ["#090514", "#241044", "#070711"], accent: "#C99BFF", text: "#FFFFFF", muted: "#BFB0D6" },
  minimal: { background: ["#080B12", "#18202C", "#080B12"], accent: "#FFFFFF", text: "#FFFFFF", muted: "#AAB4C2" },
  sunset: { background: ["#210D20", "#6B2440", "#160D24"], accent: "#FFB17B", text: "#FFF4EA", muted: "#E5B7B0" },
  ocean: { background: ["#041521", "#073B55", "#06101F"], accent: "#65E4FF", text: "#F0FCFF", muted: "#A5D4E1" },
  karaoke: { background: ["#090914", "#19132D", "#080811"], accent: "#FFE66D", text: "#FFFFFF", muted: "#BDB8D0" }
};

function applyLyricsTheme(theme) {
  const allowed = Object.prototype.hasOwnProperty.call(LYRICS_VIDEO_THEMES, theme)
    ? theme
    : "neon";
  const display = $("lyricsDisplay");
  if (display) display.dataset.theme = allowed;
  return allowed;
}

function setupLyricsPresentation() {
  const themeSelect = $("lyricsThemeSelect");
  if (themeSelect) {
    themeSelect.addEventListener("change", async () => {
      const theme = applyLyricsTheme(themeSelect.value);
      await saveSetting("lyricsTheme", theme);
      showToast("Lyrics preview theme updated.");
    });
  }

  $("exportLyricsVideo")?.addEventListener("click", exportLyricsVideo);
  $("stopLyricsVideo")?.addEventListener("click", stopLyricsVideo);
}

function wrapCanvasText(context, text, maxWidth) {
  const words = String(text || "").split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? line + " " + word : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawLyricsVideoFrame(context, canvas, startedAt, themeName) {
  const theme = LYRICS_VIDEO_THEMES[themeName] || LYRICS_VIDEO_THEMES.neon;
  const width = canvas.width;
  const height = canvas.height;
  const elapsed = (performance.now() - startedAt) / 1000;
  const currentTime = audioEngine.getCurrentTime();
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, theme.background[0]);
  gradient.addColorStop(0.55, theme.background[1]);
  gradient.addColorStop(1, theme.background[2]);
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  const glow = context.createRadialGradient(width * 0.5, height * 0.43, 20, width * 0.5, height * 0.43, 560);
  glow.addColorStop(0, theme.accent + "35");
  glow.addColorStop(1, "transparent");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);

  const song = state.currentSong || audioEngine.getCurrentSong() || {};
  context.textAlign = "center";
  context.fillStyle = theme.accent;
  context.font = "700 24px Arial, sans-serif";
  context.fillText("MY MUSIC LYRICS", width / 2, 100);
  context.fillStyle = theme.text;
  context.font = "700 34px Arial, sans-serif";
  const titleLines = wrapCanvasText(context, getSongTitle(song), 590).slice(0, 2);
  titleLines.forEach((line, i) => context.fillText(line, width / 2, 165 + i * 43));
  context.fillStyle = theme.muted;
  context.font = "24px Arial, sans-serif";
  context.fillText(getSongArtist(song), width / 2, 265);

  const bars = 44;
  const barWidth = 8;
  const gap = 5;
  const totalWidth = bars * (barWidth + gap);
  const startX = (width - totalWidth) / 2;
  const frequency = spectrumAnalyser
    ? new Uint8Array(spectrumAnalyser.frequencyBinCount)
    : null;
  if (frequency) spectrumAnalyser.getByteFrequencyData(frequency);
  for (let i = 0; i < bars; i++) {
    const raw = frequency ? frequency[Math.floor(i * frequency.length / bars)] / 255 : 0.18;
    const wave = 0.12 + Math.abs(Math.sin(elapsed * 3.2 + i * 0.43)) * 0.2;
    const barHeight = 12 + (raw || wave) * 105;
    const x = startX + i * (barWidth + gap);
    context.globalAlpha = 0.8;
    context.fillStyle = theme.accent;
    context.beginPath();
    context.roundRect(x, 405 - barHeight / 2, barWidth, barHeight, 5);
    context.fill();
  }
  context.globalAlpha = 1;

  const lyrics = state.currentLyrics || [];
  let activeIndex = -1;
  if (lyrics.length && lyrics.some(line => Number.isFinite(line.time))) {
    lyrics.forEach((line, index) => {
      if (Number.isFinite(line.time) && line.time <= currentTime) activeIndex = index;
    });
    if (activeIndex < 0) activeIndex = 0;
  } else if (lyrics.length) {
    activeIndex = Math.min(lyrics.length - 1, Math.floor(elapsed / 3.5));
  }

  const activeLine = activeIndex >= 0 ? lyrics[activeIndex] : null;
  const previousLine = activeIndex > 0 ? lyrics[activeIndex - 1] : null;
  const nextLine = activeIndex >= 0 ? lyrics[activeIndex + 1] : null;

  context.textAlign = "center";
  if (previousLine) {
    context.fillStyle = theme.muted;
    context.globalAlpha = 0.65;
    context.font = "26px Arial, sans-serif";
    wrapCanvasText(context, previousLine.text, 590).slice(0, 2)
      .forEach((line, i) => context.fillText(line, width / 2, 620 + i * 38));
  }
  context.globalAlpha = 1;

  if (activeLine) {
    context.shadowColor = theme.accent;
    context.shadowBlur = 24;
    context.fillStyle = theme.text;
    context.font = "bold 43px Arial, sans-serif";
    const activeLines = wrapCanvasText(context, activeLine.text, 610).slice(0, 3);
    activeLines.forEach((line, i) => context.fillText(line, width / 2, 735 + i * 60));
    context.shadowBlur = 0;
  } else {
    context.fillStyle = theme.muted;
    context.font = "28px Arial, sans-serif";
    context.fillText("Your lyrics will appear here", width / 2, 720);
  }

  if (nextLine) {
    context.fillStyle = theme.muted;
    context.globalAlpha = 0.7;
    context.font = "25px Arial, sans-serif";
    wrapCanvasText(context, nextLine.text, 590).slice(0, 2)
      .forEach((line, i) => context.fillText(line, width / 2, 900 + i * 38));
  }
  context.globalAlpha = 1;

  context.fillStyle = theme.accent;
  context.font = "600 20px Arial, sans-serif";
  context.fillText("Listen • Read • Feel the music", width / 2, 1120);
  context.fillStyle = theme.muted;
  context.font = "18px Arial, sans-serif";
  context.fillText("Open My Music Lyrics", width / 2, 1160);
}

function stopLyricsVideo() {
  if (lyricsExportTimer) {
    clearTimeout(lyricsExportTimer);
    lyricsExportTimer = null;
  }
  if (lyricsExportFrame) {
    cancelAnimationFrame(lyricsExportFrame);
    lyricsExportFrame = null;
  }
  if (lyricsExportRecorder && lyricsExportRecorder.state !== "inactive") {
    lyricsExportRecorder.stop();
  }
}

async function exportLyricsVideo() {
  const song = state.currentSong || audioEngine.getCurrentSong();
  if (!song) {
    showToast("Play or select a song first.");
    return;
  }
  if (!state.currentLyrics.length) {
    showToast("Load or generate lyrics before creating a video.");
    return;
  }
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
    showToast("Video recording is not supported in this browser. Try Chrome.");
    return;
  }
  if (lyricsExportRecorder && lyricsExportRecorder.state !== "inactive") {
    showToast("A lyrics video is already recording.");
    return;
  }

  const button = $("exportLyricsVideo");
  const status = $("lyricsExportStatus");
  const stopButton = $("stopLyricsVideo");
  const themeName = applyLyricsTheme($("lyricsThemeSelect")?.value || "neon");
  const durationChoice = $("lyricsVideoDuration")?.value || "30";
  const clipDuration = durationChoice === "full" ? 0 : Math.max(5, Number(durationChoice) || 30);

  try {
    setupSpectrum();
    if (!spectrumContext || !spectrumSource) {
      throw new Error("Audio capture could not be initialized. Press Play once, then try again.");
    }
    await spectrumContext.resume();

    const canvas = document.createElement("canvas");
    canvas.width = 720;
    canvas.height = 1280;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create the video preview.");

    lyricsExportDestination = spectrumContext.createMediaStreamDestination();
    spectrumSource.connect(lyricsExportDestination);
    lyricsExportCanvasStream = canvas.captureStream(30);

    const tracks = [
      ...lyricsExportCanvasStream.getVideoTracks(),
      ...lyricsExportDestination.stream.getAudioTracks()
    ];
    const combinedStream = new MediaStream(tracks);
    const mimeTypes = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4"
    ];
    const mimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error("This browser does not support a compatible video format.");

    const chunks = [];
    lyricsExportRecorder = new MediaRecorder(combinedStream, { mimeType });
    const recorder = lyricsExportRecorder;
    const startedAt = performance.now();

    const draw = () => {
      drawLyricsVideoFrame(context, canvas, startedAt, themeName);
      lyricsExportFrame = requestAnimationFrame(draw);
    };
    draw();

    recorder.addEventListener("dataavailable", event => {
      if (event.data && event.data.size) chunks.push(event.data);
    });
    recorder.addEventListener("stop", () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
      combinedStream.getTracks().forEach(track => track.stop());
      lyricsExportCanvasStream = null;
      if (lyricsExportDestination) {
        lyricsExportDestination.stream.getTracks().forEach(track => track.stop());
        try { spectrumSource.disconnect(lyricsExportDestination); } catch (_) {}
        lyricsExportDestination = null;
      }
      if (lyricsExportEndHandler) {
        audioEngine.audio.removeEventListener("ended", lyricsExportEndHandler);
        lyricsExportEndHandler = null;
      }
      lyricsExportRecorder = null;
      if (stopButton) stopButton.hidden = true;
      if (button) {
        button.disabled = false;
        button.textContent = "⇩ Create Lyrics Video";
      }
      if (status) status.textContent = "Preparing your video...";
      if (blob.size) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const safeName = (getSongTitle(song) || "music").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "");
        link.href = url;
        link.download = "My-Music-Lyrics-" + (safeName || "video") + ".webm";
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        if (status) status.textContent = "Video created. Check your Downloads folder.";
        showToast("Lyrics video created.");
      } else {
        if (status) status.textContent = "No video data was recorded. Please try again.";
      }
    });

    recorder.start(250);
    if (!audioEngine.isPlaying()) {
      const played = await audioEngine.play();
      if (!played) throw new Error("Could not start the song for recording.");
    }
    if (button) {
      button.disabled = true;
      button.textContent = "Recording video...";
    }
    if (stopButton) stopButton.hidden = false;
    if (status) {
      status.textContent = clipDuration
        ? "Recording a " + clipDuration + "-second video with audio..."
        : "Recording until the song ends...";
    }

    if (clipDuration) {
      lyricsExportTimer = setTimeout(stopLyricsVideo, clipDuration * 1000);
    } else {
      lyricsExportEndHandler = stopLyricsVideo;
      audioEngine.audio.addEventListener("ended", lyricsExportEndHandler, { once: true });
    }
  } catch (error) {
    console.error("Lyrics video export failed:", error);
    stopLyricsVideo();
    if (button) {
      button.disabled = false;
      button.textContent = "⇩ Create Lyrics Video";
    }
    if (stopButton) stopButton.hidden = true;
    if (status) status.textContent = error.message || "Video export failed.";
    showToast(error.message || "Could not create video.", 5000);
  }
}

function setupLyricsImport() {
  $("loadLrcButton")?.addEventListener("click", () => {
    if (!state.currentSong) {
      showToast("Play a song first.");
      return;
    }

    $("lrcFileInput")?.click();
  });

  $("lrcFileInput")?.addEventListener("change", async event => {
    const file = event.target.files?.[0];

    if (file) {
      await importLRCFile(file);
    }

    event.target.value = "";
  });
}


// Turn a flat word-timestamp transcript into readable lyric lines.
function buildTimedLyricLines(segments) {
  const allWords = (Array.isArray(segments) ? segments : [])
    .flatMap(segment => Array.isArray(segment.words) ? segment.words : [])
    .filter(word =>
      Number.isFinite(Number(word.start)) &&
      Number.isFinite(Number(word.end)) &&
      Number(word.end) >= Number(word.start) &&
      String(word.text || "").trim()
    )
    .map(word => ({
      start: Number(word.start),
      end: Number(word.end),
      text: String(word.text).trim()
    }))
    .sort((a, b) => a.start - b.start);

  if (allWords.length === 0) {
    return (Array.isArray(segments) ? segments : []).map(segment => ({
      time: segment.time,
      end: segment.end,
      text: segment.text,
      words: Array.isArray(segment.words) ? segment.words : []
    }));
  }

  const lines = [];
  let group = [];

  const finishGroup = () => {
    if (!group.length) return;
    lines.push({
      time: group[0].start,
      end: group[group.length - 1].end,
      text: group.map(word => word.text).join(" "),
      words: group
    });
    group = [];
  };

  for (const word of allWords) {
    const previous = group[group.length - 1];
    const pause = previous ? word.start - previous.end : 0;
    const endsPhrase = /[.!?,;:]$/.test(word.text);

    if (group.length && (pause > 0.65 || group.length >= 7)) {
      finishGroup();
    }

    group.push(word);

    if (endsPhrase) finishGroup();
  }

  finishGroup();
  return lines;
}


// --------------------------------------------------
// AUTOMATIC TRANSCRIPTION
// --------------------------------------------------

async function runTranscription() {
  const song = state.currentSong;

  if (!song) {
    showToast("Play a song before transcription.");
    return;
  }

  if (!(song.file instanceof Blob)) {
    showToast("The original audio file is unavailable.");
    return;
  }

  const endpoint = $("transcriptionEndpoint")?.value.trim();

  if (!endpoint) {
    showToast("Enter your transcription server URL in Settings.");
    showScreen("settings");
    return;
  }

  const button = $("transcribeButton");

  if (button) {
    button.disabled = true;
    button.textContent = "Transcribing...";
  }

  if ($("lyricsStatus")) {
    $("lyricsStatus").textContent =
      "Sending audio to AI transcription server...";
  }

  try {
    const result = await transcribeAudio(
      song.file,
      endpoint,
      {
        filename: song.name || "music-audio"
      }
    );

    // Convert word-level timings into short, individually synchronized lyric lines.
    const timedLines = buildTimedLyricLines(result.lyrics);
    state.currentLyrics = normalizeLyrics(timedLines);
    state.currentLyricsSource = "ai-transcription";

    await saveLyrics(song.id, {
      lines: state.currentLyrics,
      source: "ai-transcription",
      language: result.language,
      model: result.model,
      wordTimestampsAvailable: result.wordTimestampsAvailable,
      updatedAt: Date.now()
    });

    displayCurrentLyrics();

    if ($("lyricsStatus")) {
      $("lyricsStatus").textContent =
        result.wordTimestampsAvailable
          ? "AI lyrics loaded · Word timestamps available"
          : "AI lyrics loaded · Line timestamps only";
    }

    showToast("Transcription completed.");

  } catch (error) {
    console.error("Transcription error:", error);

    if ($("lyricsStatus")) {
      $("lyricsStatus").textContent =
        "Transcription failed: " + error.message;
    }

    showToast(error.message || "Transcription failed.", 4000);

  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Transcribe";
    }
  }
}


function setupTranscription() {
  $("transcribeButton")?.addEventListener("click", runTranscription);
}


// --------------------------------------------------
// MANUAL LYRICS EDITOR
// --------------------------------------------------

function setupLyricsEditor() {
  $("editLyricsButton")?.addEventListener("click", () => {
    if (!$("lyricsTextarea")) return;

    $("lyricsTextarea").value =
      state.currentLyrics.length > 0
        ? state.currentLyrics
            .map(line => line.time === null
              ? line.text
              : `[${formatTimeForEditor(line.time)}]${line.text}`)
            .join("\n")
        : "";

    const editor = $("lyricsEditor");
    if (editor) {
      editor.hidden = false;
      editor.classList.add("active");
    }

    state.editingLyrics = true;
  });

  $("cancelLyricsEdit")?.addEventListener("click", () => {
    const editor = $("lyricsEditor");
    if (editor) {
      editor.classList.remove("active");
      editor.hidden = true;
    }
    state.editingLyrics = false;
  });

  $("applyLyricsButton")?.addEventListener("click", async () => {
    if (!state.currentSong) {
      showToast("Select a song before adding lyrics.");
      return;
    }

    const text = $("lyricsTextarea")?.value || "";
    if (!text.trim()) {
      showToast("Please type or paste your lyrics first.");
      return;
    }

    const hasTimestamps = /\[\d{1,3}:\d{2}(?:\.\d{1,3})?\]/.test(text);

    try {
      const parsedLyrics = hasTimestamps
        ? parseLRC(text)
        : parsePlainLyrics(text);

      const normalizedLyrics = normalizeLyrics(parsedLyrics);
      if (normalizedLyrics.length === 0) {
        showToast("No lyrics found. Check the text and try again.");
        return;
      }

      await saveLyrics(state.currentSong.id, {
        lines: normalizedLyrics,
        source: hasTimestamps ? "lrc" : "manual"
      });

      state.currentLyrics = normalizedLyrics;
      state.currentLyricsSource = hasTimestamps ? "lrc" : "manual";
      displayCurrentLyrics();

      const editor = $("lyricsEditor");
      if (editor) {
        editor.classList.remove("active");
        editor.hidden = true;
      }
      state.editingLyrics = false;

      showToast("Lyrics saved successfully.");
    } catch (error) {
      console.error("Could not save edited lyrics:", error);
      showToast("Could not save lyrics: " + (error.message || "Storage error"), 5000);
    }
  });

  $("saveLyricsButton")?.addEventListener("click", async () => {
    if (!state.currentSong) {
      showToast("No song selected.");
      return;
    }

    await saveLyrics(state.currentSong.id, {
      lines: state.currentLyrics,
      source: state.currentLyricsSource,
      updatedAt: Date.now()
    });

    showToast("Lyrics saved.");
  });
}


function formatTimeForEditor(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remaining = (seconds % 60).toFixed(2);

  return (
    String(minutes).padStart(2, "0") +
    ":" +
    String(remaining).padStart(5, "0")
  );
}


// --------------------------------------------------
// PLAYLISTS
// --------------------------------------------------

async function createNewPlaylist() {
  const name = prompt("Enter playlist name:");

  if (!name || !name.trim()) return;

  const playlist = {
    id: makeId(),
    name: name.trim(),
    songIds: [],
    createdAt: Date.now()
  };

  try {
    await savePlaylist(playlist);

    state.playlists.push(playlist);

    renderPlaylists();
    renderHome();

    showToast("Playlist created.");

  } catch (error) {
    console.error(error);
    showToast("Could not create playlist.");
  }
}


function renderPlaylists() {
  const container = $("playlistContainer");

  if (!container) return;

  container.replaceChildren();

  if (state.playlists.length === 0) {
    container.appendChild(
      createElement("p", "empty-message", "No playlists yet.")
    );

    return;
  }

  state.playlists.forEach(playlist => {
    const card = createElement("div", "playlist-card");

    const title = createElement(
      "h3",
      "playlist-title",
      playlist.name
    );

    const count = createElement(
      "p",
      "playlist-count",
      `${(playlist.songIds || []).length} songs`
    );

    const deleteButton = createElement(
      "button",
      "playlist-delete",
      "Delete"
    );

    deleteButton.type = "button";

    deleteButton.addEventListener("click", async () => {
      const confirmed = confirm(
        `Delete playlist "${playlist.name}"?`
      );

      if (!confirmed) return;

      await deletePlaylist(playlist.id);

      state.playlists = state.playlists.filter(
        item => item.id !== playlist.id
      );

      renderPlaylists();
      renderHome();

      showToast("Playlist deleted.");
    });

    const addButton = createElement(
      "button",
      "playlist-add",
      "Add current song"
    );

    addButton.type = "button";

    addButton.addEventListener("click", async () => {
      if (!state.currentSong) {
        showToast("Play a song first.");
        return;
      }

      await addSongToPlaylist(
        playlist.id,
        state.currentSong.id
      );

      const current = state.playlists.find(
        item => item.id === playlist.id
      );

      if (current) {
        current.songIds = current.songIds || [];

        if (!current.songIds.includes(state.currentSong.id)) {
          current.songIds.push(state.currentSong.id);
        }
      }

      renderPlaylists();
      showToast("Song added to playlist.");
    });

    card.append(title, count, addButton, deleteButton);

    container.appendChild(card);
  });
}


function setupPlaylists() {
  $("createPlaylistButton")?.addEventListener(
    "click",
    createNewPlaylist
  );
}


// --------------------------------------------------
// SETTINGS
// --------------------------------------------------

async function loadSettings() {
  const endpoint = await getSetting(
    "transcriptionEndpoint",
    ""
  );

  if ($("transcriptionEndpoint")) {
    $("transcriptionEndpoint").value = endpoint || "";
  }

  const savedLyricsTheme = await getSetting("lyricsTheme", "neon");
  const themeSelect = $("lyricsThemeSelect");
  if (themeSelect) themeSelect.value = savedLyricsTheme || "neon";
  applyLyricsTheme(savedLyricsTheme || "neon");

  const volume = await getSetting("volume", 1);

  audioEngine.setVolume(Number(volume));
  
  if ($("volumeControl")) {
    $("volumeControl").value = Number(volume);
  }
}


function setupSettings() {
  $("saveTranscriptionSettings")?.addEventListener(
    "click",
    async () => {
      const endpoint =
        $("transcriptionEndpoint")?.value.trim() || "";

      await saveSetting("transcriptionEndpoint", endpoint);

      showToast("Transcription settings saved.");
    }
  );

  $("transcriptionEndpoint")?.addEventListener(
    "change",
    async event => {
      await saveSetting(
        "transcriptionEndpoint",
        event.target.value.trim()
      );
    }
  );

  $("clearHistoryButton")?.addEventListener(
    "click",
    async () => {
      const confirmed = confirm(
        "Clear your recently played history?"
      );

      if (!confirmed) return;

      await clearHistory();

      state.recentSongs = [];

      renderHome();

      showToast("Listening history cleared.");
    }
  );

  $("installAppButton")?.addEventListener("click", installApp);
}


// --------------------------------------------------
// PWA INSTALLATION
// --------------------------------------------------

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();

  state.deferredInstallPrompt = event;

  if ($("installAppButton")) {
    $("installAppButton").disabled = false;
    $("installAppButton").textContent = "Install App";
  }
});


async function installApp() {
  if (!state.deferredInstallPrompt) {
    showToast(
      "Install option is unavailable. Use your browser menu and select Install App or Add to Home Screen."
    );

    return;
  }

  state.deferredInstallPrompt.prompt();

  await state.deferredInstallPrompt.userChoice;

  state.deferredInstallPrompt = null;
}


// --------------------------------------------------
// SERVICE WORKER
// --------------------------------------------------

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    console.log("Service workers are not supported.");
    return;
  }

  if (
    location.protocol !== "https:" &&
    location.hostname !== "localhost" &&
    location.hostname !== "127.0.0.1"
  ) {
    console.log("Service worker requires HTTPS or localhost.");
    return;
  }

  try {
    await navigator.serviceWorker.register("./sw.js");

    console.log("Service worker registered.");

  } catch (error) {
    console.error("Service worker registration failed:", error);
  }
}


// --------------------------------------------------
// DATA INITIALIZATION
// --------------------------------------------------

async function refreshRecentSongs() {
  const history = await getRecentlyPlayed(20);

  state.recentSongs = history.map(item =>
    typeof item === "string"
      ? item
      : item.songId || item.id
  ).filter(Boolean);
}


async function loadApplicationData() {
  state.songs = await getAllSongs();

  state.playlists = await getAllPlaylists();

  const favorites = await getFavorites();

  state.favorites = favorites.map(item =>
    typeof item === "string"
      ? item
      : item.id
  ).filter(Boolean);

  await refreshRecentSongs();

  renderSongs();
  renderHome();
  renderPlaylists();
}


// --------------------------------------------------
// APPLICATION STARTUP
// --------------------------------------------------

async function initializeApp() {
  try {
    await initializeStorage();

    await loadApplicationData();

    await loadSettings();

    setupNavigation();
    setupMusicImport();
    setupSongSearch();
    setupPlayerControls();
    setupAudioEvents();
    setupLyricsImport();
    setupLyricsPresentation();
    setupLyricsEditor();
    setupTranscription();
    setupPlaylists();
    setupSettings();

    await registerServiceWorker();

    showToast("My Music Lyrics is ready.");

    console.log("My Music Lyrics initialized successfully.");

  } catch (error) {
    console.error("Application initialization failed:", error);

   showToast(
  "Startup error: " + (error.message || String(error)),
  8000
   );

   console.error("Full startup error:", error);
  }
}


// Start the application.
document.addEventListener("DOMContentLoaded", initializeApp);
