
/* =========================================
   MY MUSIC LYRICS
   FILE: storage.js
   IndexedDB Storage Engine
========================================= */

const DB_NAME = "MyMusicLyricsDB";
const DB_VERSION = 2;

let database = null;

/* =========================================
   DATABASE INITIALIZATION
========================================= */

export function initializeStorage() {

    return new Promise((resolve, reject) => {

        if (database) {
            resolve(database);
            return;
        }

        if (!("indexedDB" in window)) {
            reject(new Error("IndexedDB is not supported by this browser."));
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {

            const db = event.target.result;

            // Upgrade safely: add missing stores/indexes without deleting saved data.
            let songs;

            if (!db.objectStoreNames.contains("songs")) {
                songs = db.createObjectStore("songs", { keyPath: "id" });
            } else {
                songs = event.target.transaction.objectStore("songs");
            }

            if (!songs.indexNames.contains("title")) {
                songs.createIndex("title", "title", { unique: false });
            }

            if (!songs.indexNames.contains("artist")) {
                songs.createIndex("artist", "artist", { unique: false });
            }

            if (!db.objectStoreNames.contains("playlists")) {

                db.createObjectStore(
                    "playlists",
                    { keyPath: "id" }
                );
            }

            if (!db.objectStoreNames.contains("lyrics")) {

                db.createObjectStore(
                    "lyrics",
                    { keyPath: "songId" }
                );
            }

            if (!db.objectStoreNames.contains("history")) {

                db.createObjectStore(
                    "history",
                    { keyPath: "songId" }
                );
            }

            if (!db.objectStoreNames.contains("settings")) {

                db.createObjectStore(
                    "settings",
                    { keyPath: "key" }
                );
            }

        };

        request.onsuccess = () => {

            database = request.result;

            database.onversionchange = () => {
                database.close();
                database = null;
            };

            resolve(database);

        };

        request.onerror = () => {

            reject(
                request.error ||
                new Error("Could not initialize music database.")
            );

        };

        request.onblocked = () => {

            reject(
                new Error("Database upgrade blocked. Close other app tabs.")
            );

        };

    });

}


/* =========================================
   DATABASE TRANSACTION HELPER
========================================= */

async function executeTransaction(
    storeName,
    mode,
    operation
) {

    const db = await initializeStorage();

    return new Promise((resolve, reject) => {

        let transaction;

        try {

            transaction = db.transaction(
                storeName,
                mode
            );

        } catch (error) {

            reject(error);
            return;

        }

        const store = transaction.objectStore(storeName);

        let result;

        try {

            result = operation(store);

        } catch (error) {

            try {
                transaction.abort();
            } catch (_) {}

            reject(error);
            return;

        }

        transaction.oncomplete = () => {
            resolve(result);
        };

        transaction.onerror = () => {

            reject(
                transaction.error ||
                new Error("Database transaction failed.")
            );

        };

        transaction.onabort = () => {

            reject(
                transaction.error ||
                new Error("Database transaction was aborted.")
            );

        };

    });

}


/* =========================================
   GENERIC DATABASE HELPERS
========================================= */

async function getAll(storeName) {

    const db = await initializeStorage();

    return new Promise((resolve, reject) => {

        const transaction = db.transaction(
            storeName,
            "readonly"
        );

        const request = transaction
            .objectStore(storeName)
            .getAll();

        request.onsuccess = () => {
            resolve(request.result || []);
        };

        request.onerror = () => {
            reject(request.error);
        };

    });

}


async function getRecord(storeName, key) {

    const db = await initializeStorage();

    return new Promise((resolve, reject) => {

        const transaction = db.transaction(
            storeName,
            "readonly"
        );

        const request = transaction
            .objectStore(storeName)
            .get(key);

        request.onsuccess = () => {
            resolve(request.result || null);
        };

        request.onerror = () => {
            reject(request.error);
        };

    });

}


async function deleteRecord(storeName, key) {

    return executeTransaction(
        storeName,
        "readwrite",
        store => store.delete(key)
    );

}


/* =========================================
   SONG LIBRARY
========================================= */

export async function saveSong(song) {

    if (!song || !song.id) {

        throw new Error("A valid song ID is required.");

    }

    const record = {
        ...song,
        updatedAt: Date.now()
    };

    return executeTransaction(
        "songs",
        "readwrite",
        store => store.put(record)
    );

}


export async function getSong(songId) {

    return getRecord("songs", songId);

}


export async function getAllSongs() {

    const songs = await getAll("songs");

    return songs.sort((a, b) => {

        return (a.title || "").localeCompare(
            b.title || ""
        );

    });

}


export async function deleteSong(songId) {

    const db = await initializeStorage();

    return new Promise((resolve, reject) => {

        const transaction = db.transaction(
            ["songs", "lyrics", "history"],
            "readwrite"
        );

        transaction.objectStore("songs").delete(songId);

        transaction.objectStore("lyrics").delete(songId);

        transaction.objectStore("history").delete(songId);

        transaction.oncomplete = resolve;

        transaction.onerror = () => {
            reject(transaction.error);
        };

    });

}


/* =========================================
   PLAYLIST MANAGEMENT
========================================= */

export async function savePlaylist(playlist) {

    if (!playlist || !playlist.id) {

        throw new Error("A valid playlist ID is required.");

    }

    const record = {

        ...playlist,

        name: playlist.name || "Untitled Playlist",

        songIds: Array.isArray(playlist.songIds)
            ? playlist.songIds
            : [],

        updatedAt: Date.now()

    };

    return executeTransaction(
        "playlists",
        "readwrite",
        store => store.put(record)
    );

}


export async function getAllPlaylists() {

    const playlists = await getAll("playlists");

    return playlists.sort((a, b) => {

        return (b.updatedAt || 0) -
               (a.updatedAt || 0);

    });

}


export async function getPlaylist(playlistId) {

    return getRecord("playlists", playlistId);

}


export async function deletePlaylist(playlistId) {

    return deleteRecord("playlists", playlistId);

}


export async function addSongToPlaylist(
    playlistId,
    songId
) {

    const playlist = await getPlaylist(playlistId);

    if (!playlist) {

        throw new Error("Playlist not found.");

    }

    if (!playlist.songIds.includes(songId)) {

        playlist.songIds.push(songId);

        await savePlaylist(playlist);

    }

    return playlist;

}


export async function removeSongFromPlaylist(
    playlistId,
    songId
) {

    const playlist = await getPlaylist(playlistId);

    if (!playlist) {

        throw new Error("Playlist not found.");

    }

    playlist.songIds = playlist.songIds.filter(
        id => id !== songId
    );

    await savePlaylist(playlist);

    return playlist;

}


/* =========================================
   LYRICS STORAGE
========================================= */

export async function saveLyrics(songId, lyrics) {

    if (!songId) {
        throw new Error("A song must be selected before saving lyrics.");
    }

    // Accept both the original array format and the app's { lines, source } format.
    const lines = Array.isArray(lyrics)
        ? lyrics
        : (lyrics && Array.isArray(lyrics.lines) ? lyrics.lines : null);

    if (!lines) {
        throw new Error("Lyrics must contain a valid lines array.");
    }

    const record = {
        songId,
        lines,
        source: Array.isArray(lyrics) ? "manual" : (lyrics.source || "manual"),
        updatedAt: Date.now()
    };

    return executeTransaction(
        "lyrics",
        "readwrite",
        store => store.put(record)
    );

}

export async function getLyrics(songId) {

    // Return the full record so the app can preserve the lyrics source
    // (manual, imported LRC, transcription, or automatic provider).
    return getRecord("lyrics", songId);

}


export async function deleteLyrics(songId) {

    return deleteRecord("lyrics", songId);

}


/* =========================================
   RECENTLY PLAYED HISTORY
========================================= */

export async function addToHistory(songId) {

    if (!songId) {
        return;
    }

    const record = {

        songId,

        playedAt: Date.now()

    };

    return executeTransaction(
        "history",
        "readwrite",
        store => store.put(record)
    );

}


export async function getRecentlyPlayed(limit = 20) {

    const history = await getAll("history");

    return history
        .sort((a, b) => b.playedAt - a.playedAt)
        .slice(0, Math.max(0, limit));

}


export async function clearHistory() {

    return executeTransaction(
        "history",
        "readwrite",
        store => store.clear()
    );

}


/* =========================================
   FAVORITES
========================================= */

export async function setFavorite(songId, favorite) {

    const song = await getSong(songId);

    if (!song) {

        throw new Error("Song not found.");

    }

    song.favorite = Boolean(favorite);

    await saveSong(song);

    return song;

}


export async function getFavorites() {

    const songs = await getAllSongs();

    return songs.filter(song => song.favorite === true);

}


/* =========================================
   APPLICATION SETTINGS
========================================= */

export async function saveSetting(key, value) {

    if (!key) {

        throw new Error("Setting key is required.");

    }

    const record = {

        key,

        value,

        updatedAt: Date.now()

    };

    return executeTransaction(
        "settings",
        "readwrite",
        store => store.put(record)
    );

}


export async function getSetting(key, defaultValue = null) {

    const record = await getRecord(
        "settings",
        key
    );

    return record ? record.value : defaultValue;

}


/* =========================================
   DATABASE STATISTICS
========================================= */

export async function getStorageStatistics() {

    const [
        songs,
        playlists,
        lyrics,
        history
    ] = await Promise.all([

        getAll("songs"),

        getAll("playlists"),

        getAll("lyrics"),

        getAll("history")

    ]);

    return {

        totalSongs: songs.length,

        totalPlaylists: playlists.length,

        totalLyrics: lyrics.length,

        recentlyPlayed: history.length

    };

}


/* =========================================
   EXPORT USER DATA
========================================= */

export async function exportLibrary() {

    const [

        songs,
        playlists,
        lyrics,
        history

    ] = await Promise.all([

        getAll("songs"),

        getAll("playlists"),

        getAll("lyrics"),

        getAll("history")

    ]);

    return {

        application: "My Music Lyrics",

        version: 1,

        exportedAt: new Date().toISOString(),

        songs,

        playlists,

        lyrics,

        history

    };

}


/* =========================================
   IMPORT USER DATA
========================================= */

export async function importLibrary(data) {

    if (!data || data.application !== "My Music Lyrics") {

        throw new Error("Invalid My Music Lyrics backup.");

    }

    const collections = [

        ["songs", data.songs],

        ["playlists", data.playlists],

        ["lyrics", data.lyrics],

        ["history", data.history]

    ];

    const db = await initializeStorage();

    return new Promise((resolve, reject) => {

        const transaction = db.transaction(

            collections.map(item => item[0]),

            "readwrite"

        );

        for (const [storeName, records] of collections) {

            if (!Array.isArray(records)) {
                continue;
            }

            const store = transaction.objectStore(storeName);

            for (const record of records) {

                try {

                    store.put(record);

                } catch (error) {

                    transaction.abort();

                    reject(error);

                    return;

                }

            }

        }

        transaction.oncomplete = resolve;

        transaction.onerror = () => {
            reject(transaction.error);
        };

        transaction.onabort = () => {
            reject(
                transaction.error ||
                new Error("Backup import failed.")
            );
        };

    });

}


/* =========================================
   CLOSE DATABASE
========================================= */

export function closeStorage() {

    if (database) {

        database.close();

        database = null;

    }

}
