
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


function setupNavigation() {
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

  for (const file of Array.from(files)) {
    if (!file.type.startsWith("audio/")) {
      continue;
    }

    const alreadyExists = state.songs.some(song =>
      song.name === file.name &&
      song.size === file.size
    );

    if (alreadyExists) continue;

    const title = file.name.replace(/\.[^/.]+$/, "");

    const song = {
      id: makeId(),
      title,
      artist: "Unknown Artist",
      album: "Unknown Album",
      name: file.name,
      type: file.type,
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
      console.error("Could not save song:", error);
      showToast("Storage error while importing music.");
    }
  }

  if (imported > 0) {
    showToast(`${imported} song(s) added successfully.`);
  } else {
    showToast("No new supported audio files were added.");
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

function setupAudioEvents() {
  audioEngine.on("loadedmetadata", () => {
    updateProgress();
  });

  audioEngine.on("timeupdate", () => {
    updateProgress();
  });

  audioEngine.on("play", updatePlayButtons);

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

async function loadCurrentSongLyrics() {
  const song = state.currentSong;

  if (!song) return;

  try {
    const saved = await getLyrics(song.id);

    state.currentLyrics = normalizeLyrics(getLyricsArray(saved));

    state.currentLyricsSource = saved?.source || "saved";

    displayCurrentLyrics();

  } catch (error) {
    console.error("Lyrics loading error:", error);
    state.currentLyrics = [];
    displayCurrentLyrics();
  }
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

    state.currentLyrics = result.lyrics;
    state.currentLyricsSource = "ai-transcription";

    await saveLyrics(song.id, {
      lines: result.lyrics,
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
