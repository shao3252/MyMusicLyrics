/**
 * IndexedDB wrapper for My Music Lyrics
 * Handles: songs metadata, playlists, lyrics, settings, recent plays
 */

class MusicStorage {
  constructor() {
    this.dbName = 'MyMusicLyricsDB';
    this.version = 1;
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        if (!db.objectStoreNames.contains('songs')) {
          const songStore = db.createObjectStore('songs', { keyPath: 'id', autoIncrement: true });
          songStore.createIndex('title', 'title', { unique: false });
          songStore.createIndex('artist', 'artist', { unique: false });
          songStore.createIndex('lastPlayed', 'lastPlayed', { unique: false });
        }
        
        if (!db.objectStoreNames.contains('playlists')) {
          db.createObjectStore('playlists', { keyPath: 'id', autoIncrement: true });
        }
        
        if (!db.objectStoreNames.contains('lyrics')) {
          db.createObjectStore('lyrics', { keyPath: 'songId' });
        }
        
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
        
        if (!db.objectStoreNames.contains('recent')) {
          db.createObjectStore('recent', { keyPath: 'id', autoIncrement: true });
        }
      };
    });
  }

  async saveSong(songData) {
    const tx = this.db.transaction(['songs'], 'readwrite');
    const store = tx.objectStore('songs');
    const request = store.add(songData);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getSong(id) {
    const tx = this.db.transaction(['songs'], 'readonly');
    const store = tx.objectStore('songs');
    const request = store.get(id);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllSongs() {
    const tx = this.db.transaction(['songs'], 'readonly');
    const store = tx.objectStore('songs');
    const request = store.getAll();
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async updateSong(id, updates) {
    const song = await this.getSong(id);
    if (!song) throw new Error('Song not found');
    const updated = { ...song, ...updates };
    const tx = this.db.transaction(['songs'], 'readwrite');
    const store = tx.objectStore('songs');
    const request = store.put(updated);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteSong(id) {
    const tx = this.db.transaction(['songs'], 'readwrite');
    const store = tx.objectStore('songs');
    const request = store.delete(id);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async saveLyrics(songId, lyricsData) {
    const tx = this.db.transaction(['lyrics'], 'readwrite');
    const store = tx.objectStore('lyrics');
    const data = { songId, ...lyricsData, updated: Date.now() };
    const request = store.put(data);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getLyrics(songId) {
    const tx = this.db.transaction(['lyrics'], 'readonly');
    const store = tx.objectStore('lyrics');
    const request = store.get(songId);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async savePlaylist(playlist) {
    const tx = this.db.transaction(['playlists'], 'readwrite');
    const store = tx.objectStore('playlists');
    const request = store.put(playlist);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllPlaylists() {
    const tx = this.db.transaction(['playlists'], 'readonly');
    const store = tx.objectStore('playlists');
    const request = store.getAll();
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async addToRecent(songId) {
    const tx = this.db.transaction(['recent'], 'readwrite');
    const store = tx.objectStore('recent');
    const request = store.add({ songId, timestamp: Date.now() });
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getRecent(limit = 20) {
    const tx = this.db.transaction(['recent'], 'readonly');
    const store = tx.objectStore('recent');
    const request = store.getAll();
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const all = request.result || [];
        const sorted = all.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
        resolve(sorted);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async setSetting(key, value) {
    const tx = this.db.transaction(['settings'], 'readwrite');
    const store = tx.objectStore('settings');
    const request = store.put({ key, value });
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getSetting(key, defaultValue = null) {
    const tx = this.db.transaction(['settings'], 'readonly');
    const store = tx.objectStore('settings');
    const request = store.get(key);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result ? request.result.value : defaultValue);
      request.onerror = () => reject(request.error);
    });
  }
}

const storage = new MusicStorage();
