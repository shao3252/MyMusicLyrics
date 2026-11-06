
/* =========================================
   MY MUSIC LYRICS
   FILE: audio.js
   AUDIO PLAYBACK ENGINE
========================================= */

import {
    addToHistory
} from "./storage.js";


/* =========================================
   AUDIO ENGINE
========================================= */

class MusicAudioEngine {

    constructor() {

        this.audio = new Audio();

        this.audio.preload = "metadata";

        this.audio.volume = 1;

        this.playlist = [];

        this.currentIndex = -1;

        this.shuffle = false;

        this.repeat = "off";

        this.objectURLs = new Map();

        this.currentSong = null;

        this.listeners = new Map();

        this.isSeeking = false;

        this.destroyed = false;

        this.setupAudioEvents();

        this.setupMediaSession();

    }


    /* =====================================
       EVENT SYSTEM
    ===================================== */

    on(eventName, callback) {

        if (typeof callback !== "function") {
            return () => {};
        }

        if (!this.listeners.has(eventName)) {

            this.listeners.set(eventName, new Set());

        }

        this.listeners.get(eventName).add(callback);

        return () => {

            this.listeners.get(eventName)?.delete(callback);

        };

    }


    emit(eventName, data = {}) {

        const callbacks = this.listeners.get(eventName);

        if (!callbacks) {
            return;
        }

        callbacks.forEach(callback => {

            try {

                callback(data);

            } catch (error) {

                console.error(
                    "Audio event error:",
                    eventName,
                    error
                );

            }

        });

    }


    /* =====================================
       AUDIO EVENT LISTENERS
    ===================================== */

    setupAudioEvents() {

        this.audio.addEventListener(
            "loadedmetadata",
            () => {

                this.emit("loadedmetadata", {

                    duration: this.getDuration()

                });

                this.updatePositionState();

            }
        );


        this.audio.addEventListener(
            "timeupdate",
            () => {

                this.emit("timeupdate", {

                    currentTime: this.getCurrentTime(),

                    duration: this.getDuration()

                });

                this.updatePositionState();

            }
        );


        this.audio.addEventListener(
            "play",
            () => {

                this.emit("play", {

                    song: this.currentSong

                });

                this.updateMediaPlaybackState();

            }
        );


        this.audio.addEventListener(
            "pause",
            () => {

                this.emit("pause", {

                    song: this.currentSong

                });

                this.updateMediaPlaybackState();

            }
        );


        this.audio.addEventListener(
            "ended",
            () => {

                this.handleSongEnded();

            }
        );


        this.audio.addEventListener(
            "waiting",
            () => {

                this.emit("waiting");

            }
        );


        this.audio.addEventListener(
            "playing",
            () => {

                this.emit("playing");

            }
        );


        this.audio.addEventListener(
            "error",
            () => {

                const error = this.audio.error;

                this.emit("error", {

                    code: error?.code || 0,

                    message: error?.message ||
                        "Audio playback failed."

                });

            }
        );


        this.audio.addEventListener(
            "volumechange",
            () => {

                this.emit("volumechange", {

                    volume: this.audio.volume,

                    muted: this.audio.muted

                });

            }
        );

    }


    /* =====================================
       PLAYLIST MANAGEMENT
    ===================================== */

    setPlaylist(songs, startIndex = 0) {

        if (!Array.isArray(songs)) {

            throw new Error("Playlist must be an array.");

        }

        this.playlist = songs.filter(song => {

            return song &&
                (song.file || song.url || song.handle);

        });

        if (this.playlist.length === 0) {

            this.currentIndex = -1;

            this.currentSong = null;

            this.audio.pause();

            this.audio.removeAttribute("src");

            this.emit("playlistchange", {

                songs: []

            });

            return false;

        }

        this.currentIndex = Math.max(

            0,

            Math.min(

                startIndex,

                this.playlist.length - 1

            )

        );

        this.emit("playlistchange", {

            songs: this.playlist

        });

        return true;

    }


    addToPlaylist(song) {

        if (!song || !(song.file || song.url || song.handle)) {

            throw new Error("Invalid audio file.");

        }

        this.playlist.push(song);

        this.emit("playlistchange", {

            songs: this.playlist

        });

    }


    getPlaylist() {

        return [...this.playlist];

    }


    getCurrentSong() {

        return this.currentSong;

    }


    getCurrentIndex() {

        return this.currentIndex;

    }


    /* =====================================
       AUDIO SOURCE MANAGEMENT
    ===================================== */

    async getAudioURL(song) {

        if (song.url) {

            return song.url;

        }

        if (song.handle) {

            const file = await song.handle.getFile();

            return this.createObjectURL(
                song.id,
                file
            );

        }

        if (song.file instanceof Blob) {

            return this.createObjectURL(
                song.id,
                song.file
            );

        }

        throw new Error(
            "Audio file is unavailable. Please select the song again."
        );

    }


    createObjectURL(id, file) {

        if (this.objectURLs.has(id)) {

            URL.revokeObjectURL(
                this.objectURLs.get(id)
            );

        }

        const url = URL.createObjectURL(file);

        this.objectURLs.set(id, url);

        return url;

    }


    async loadSong(index, autoplay = false) {

        if (index < 0 || index >= this.playlist.length) {

            return false;

        }

        const song = this.playlist[index];

        this.audio.pause();

        this.currentIndex = index;

        this.currentSong = song;

        try {

            const url = await this.getAudioURL(song);

            if (this.destroyed || this.currentSong !== song) {
                return false;
            }

            this.audio.src = url;

            this.audio.load();

            this.emit("songchange", {

                song,

                index,

                total: this.playlist.length

            });

            this.updateMediaMetadata(song);

            if (autoplay) {

                await this.play();

            }

            return true;

        } catch (error) {

            this.emit("error", {

                message: error.message

            });

            return false;

        }

    }


    /* =====================================
       PLAYBACK CONTROLS
    ===================================== */

    async play() {

        if (!this.currentSong) {

            if (this.playlist.length === 0) {

                this.emit("error", {

                    message: "Add music before playing."

                });

                return false;

            }

            await this.loadSong(

                Math.max(0, this.currentIndex),

                false

            );

        }

        try {

            await this.audio.play();

            if (this.currentSong?.id) {

                try {

                    await addToHistory(
                        this.currentSong.id
                    );

                } catch (error) {

                    console.warn(
                        "Could not save listening history:",
                        error
                    );

                }

            }

            return true;

        } catch (error) {

            this.emit("error", {

                message: error.name === "NotAllowedError"

                    ? "Playback needs user interaction."

                    : error.message

            });

            return false;

        }

    }


    pause() {

        this.audio.pause();

    }


    async togglePlay() {

        if (this.audio.paused) {

            return this.play();

        }

        this.pause();

        return true;

    }


    async next() {

        if (this.playlist.length === 0) {
            return false;
        }

        let nextIndex;

        if (this.shuffle && this.playlist.length > 1) {

            do {

                nextIndex = Math.floor(
                    Math.random() * this.playlist.length
                );

            } while (nextIndex === this.currentIndex);

        } else {

            nextIndex = this.currentIndex + 1;

        }

        if (nextIndex >= this.playlist.length) {

            if (this.repeat === "all") {

                nextIndex = 0;

            } else {

                this.pause();

                this.audio.currentTime = 0;

                this.emit("playlistended");

                return false;

            }

        }

        return this.loadSong(nextIndex, true);

    }


    async previous() {

        if (this.playlist.length === 0) {
            return false;
        }

        if (this.audio.currentTime > 3) {

            this.audio.currentTime = 0;

            return true;

        }

        let previousIndex = this.currentIndex - 1;

        if (previousIndex < 0) {

            if (this.repeat === "all") {

                previousIndex = this.playlist.length - 1;

            } else {

                previousIndex = 0;

            }

        }

        return this.loadSong(previousIndex, true);

    }


    /* =====================================
       END OF SONG
    ===================================== */

    async handleSongEnded() {

        if (this.repeat === "one") {

            this.audio.currentTime = 0;

            await this.play();

            return;

        }

        await this.next();

    }


    /* =====================================
       SHUFFLE
    ===================================== */

    setShuffle(enabled) {

        this.shuffle = Boolean(enabled);

        this.emit("shufflechange", {

            enabled: this.shuffle

        });

        return this.shuffle;

    }


    toggleShuffle() {

        return this.setShuffle(!this.shuffle);

    }


    /* =====================================
       REPEAT
    ===================================== */

    setRepeat(mode) {

        const modes = ["off", "all", "one"];

        if (!modes.includes(mode)) {

            throw new Error("Invalid repeat mode.");

        }

        this.repeat = mode;

        this.emit("repeatchange", {

            mode

        });

        return mode;

    }


    cycleRepeat() {

        const modes = ["off", "all", "one"];

        const index = modes.indexOf(this.repeat);

        const nextMode = modes[
            (index + 1) % modes.length
        ];

        return this.setRepeat(nextMode);

    }


    /* =====================================
       SEEKING
    ===================================== */

    seek(time) {

        const duration = this.getDuration();

        if (!Number.isFinite(duration) || duration <= 0) {

            return false;

        }

        const target = Math.max(

            0,

            Math.min(Number(time) || 0, duration)

        );

        this.audio.currentTime = target;

        this.updatePositionState();

        this.emit("seek", {

            currentTime: target

        });

        return true;

    }


    seekBy(seconds) {

        return this.seek(
            this.audio.currentTime + seconds
        );

    }


    getCurrentTime() {

        return Number.isFinite(this.audio.currentTime)

            ? this.audio.currentTime

            : 0;

    }


    getDuration() {

        return Number.isFinite(this.audio.duration)

            ? this.audio.duration

            : 0;

    }


    /* =====================================
       VOLUME
    ===================================== */

    setVolume(value) {

        const volume = Math.max(

            0,

            Math.min(Number(value), 1)

        );

        this.audio.volume = volume;

        return volume;

    }


    getVolume() {

        return this.audio.volume;

    }


    setMuted(muted) {

        this.audio.muted = Boolean(muted);

    }


    /* =====================================
       MEDIA SESSION API
    ===================================== */

    setupMediaSession() {

        if (!("mediaSession" in navigator)) {

            return;

        }

        const session = navigator.mediaSession;

        const actions = {

            play: () => this.play(),

            pause: () => this.pause(),

            nexttrack: () => this.next(),

            previoustrack: () => this.previous(),

            seekbackward: details => {

                this.seekBy(
                    -(details.seekOffset || 10)
                );

            },

            seekforward: details => {

                this.seekBy(
                    details.seekOffset || 10
                );

            },

            seekto: details => {

                if (Number.isFinite(details.seekTime)) {

                    this.seek(details.seekTime);

                }

            }

        };

        for (const [action, handler] of Object.entries(actions)) {

            try {

                session.setActionHandler(
                    action,
                    handler
                );

            } catch (_) {

                // Unsupported action on this browser.

            }

        }

    }


    updateMediaMetadata(song) {

        if (!("mediaSession" in navigator)) {
            return;
        }

        if (typeof MediaMetadata === "undefined") {
            return;
        }

        try {

            navigator.mediaSession.metadata = new MediaMetadata({

                title: song.title || "Unknown Song",

                artist: song.artist || "Unknown Artist",

                album: song.album || "My Music Lyrics",

                artwork: Array.isArray(song.artwork)

                    ? song.artwork

                    : []

            });

        } catch (error) {

            console.warn(
                "Media metadata unavailable:",
                error
            );

        }

    }


    updateMediaPlaybackState() {

        if (!("mediaSession" in navigator)) {
            return;
        }

        navigator.mediaSession.playbackState =

            this.audio.paused

                ? "paused"

                : "playing";

    }


    updatePositionState() {

        if (!("mediaSession" in navigator)) {
            return;
        }

        if (typeof navigator.mediaSession.setPositionState !== "function") {
            return;
        }

        const duration = this.getDuration();

        if (duration <= 0) {
            return;
        }

        try {

            navigator.mediaSession.setPositionState({

                duration,

                playbackRate: this.audio.playbackRate,

                position: Math.min(
                    this.getCurrentTime(),
                    duration
                )

            });

        } catch (_) {

            // Browser may not support position updates.

        }

    }


    /* =====================================
       PLAYBACK STATE
    ===================================== */

    isPlaying() {

        return !this.audio.paused;

    }


    getState() {

        return {

            song: this.currentSong,

            index: this.currentIndex,

            playing: this.isPlaying(),

            currentTime: this.getCurrentTime(),

            duration: this.getDuration(),

            volume: this.getVolume(),

            shuffle: this.shuffle,

            repeat: this.repeat

        };

    }


    /* =====================================
       CLEANUP
    ===================================== */

    destroy() {

        this.destroyed = true;

        this.audio.pause();

        this.audio.removeAttribute("src");

        this.audio.load();

        this.objectURLs.forEach(url => {

            URL.revokeObjectURL(url);

        });

        this.objectURLs.clear();

        this.listeners.clear();

        this.playlist = [];

        this.currentSong = null;

        this.currentIndex = -1;

    }

}


/* =========================================
   EXPORT AUDIO ENGINE
========================================= */

const audioEngine = new MusicAudioEngine();

export default audioEngine;

export {
    MusicAudioEngine
};
