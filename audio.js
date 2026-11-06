/**
 * Audio Engine for My Music Lyrics
 * Handles playback, Media Session API, and audio graph
 */

class AudioEngine {
  constructor() {
    this.audio = new Audio();
    this.audio.crossOrigin = 'anonymous';
    this.currentSong = null;
    this.playlist = [];
    this.currentIndex = 0;
    this.isPlaying = false;
    this.isShuffled = false;
    this.repeatMode = 'none'; // 'none', 'one', 'all'
    this.volume = 1.0;
    this.audioContext = null;
    this.sourceNode = null;
    this.analyser = null;
    
    this.init();
  }

  init() {
    // Audio Context for visualization (optional)
    this.audio.addEventListener('loadedmetadata', () => {
      this.updateMediaSession();
    });

    this.audio.addEventListener('ended', () => {
      this.handleSongEnd();
    });

    this.audio.addEventListener('error', (e) => {
      console.error('Audio error:', e);
      this.handleError(e);
    });

    // Media Session API
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => this.play());
      navigator.mediaSession.setActionHandler('pause', () => this.pause());
      navigator.mediaSession.setActionHandler('previoustrack', () => this.previous());
      navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        this.seek(Math.max(0, this.audio.currentTime - (details.seekOffset || 10)));
      });
      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        this.seek(Math.min(this.audio.duration, this.audio.currentTime + (details.seekOffset || 10)));
      });
    }
  }

  async loadSong(song, autoplay = true) {
    try {
      this.currentSong = song;
      
      // Create object URL if file exists
      if (song.file) {
        this.audio.src = URL.createObjectURL(song.file);
      } else if (song.url) {
        this.audio.src = song.url;
      } else {
        throw new Error('No audio source available');
      }

      this.audio.load();
      
      if (autoplay) {
        await this.play();
      }

      // Save to recent
      await storage.addToRecent(song.id);
      
      // Update UI
      this.updateNowPlayingUI();
      
    } catch (error) {
      console.error('Error loading song:', error);
      this.handleError(error);
    }
  }

  async play() {
    try {
      await this.audio.play();
      this.isPlaying = true;
      this.updateMediaSessionPlaybackState('playing');
      this.updatePlayButton();
    } catch (error) {
      console.error('Play error:', error);
      // Handle autoplay restrictions
      if (error.name === 'NotAllowedError') {
        this.showNotification('Tap play to start audio (browser autoplay policy)');
      }
    }
  }

  pause() {
    this.audio.pause();
    this.isPlaying = false;
    this.updateMediaSessionPlaybackState('paused');
    this.updatePlayButton();
  }

  toggle() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  next() {
    if (this.playlist.length === 0) return;
    
    let nextIndex;
    if (this.isShuffled) {
      nextIndex = Math.floor(Math.random() * this.playlist.length);
    } else {
      nextIndex = (this.currentIndex + 1) % this.playlist.length;
    }
    
    this.currentIndex = nextIndex;
    this.loadSong(this.playlist[nextIndex]);
  }

  previous() {
    if (this.playlist.length === 0) return;
    
    // If more than 3 seconds in, restart song
    if (this.audio.currentTime > 3) {
      this.seek(0);
      return;
    }
    
    let prevIndex;
    if (this.isShuffled) {
      prevIndex = Math.floor(Math.random() * this.playlist.length);
    } else {
      prevIndex = (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
    }
    
    this.currentIndex = prevIndex;
    this.loadSong(this.playlist[prevIndex]);
  }

  seek(time) {
    if (this.audio.duration) {
      this.audio.currentTime = time;
    }
  }

  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    this.audio.volume = this.volume;
  }

  toggleShuffle() {
    this.isShuffled = !this.isShuffled;
    return this.isShuffled;
  }

  cycleRepeat() {
    const modes = ['none', 'all', 'one'];
    const currentIndex = modes.indexOf(this.repeatMode);
    this.repeatMode = modes[(currentIndex + 1) % modes.length];
    return this.repeatMode;
  }

  handleSongEnd() {
    if (this.repeatMode === 'one') {
      this.seek(0);
      this.play();
    } else if (this.repeatMode === 'all' || this.currentIndex < this.playlist.length - 1) {
      this.next();
    } else {
      this.pause();
    }
  }

  updateMediaSession() {
    if (!('mediaSession' in navigator) || !this.currentSong) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: this.currentSong.title || 'Unknown Title',
      artist: this.currentSong.artist || 'Unknown Artist',
      album: this.currentSong.album || 'Unknown Album',
      artwork: this.currentSong.artwork ? [
        { src: this.currentSong.artwork, sizes: '512x512', type: 'image/png' }
      ] : undefined
    });
  }

  updateMediaSessionPlaybackState(state) {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = state;
    }
  }

  updateNowPlayingUI() {
    // Dispatch event for UI update
    const event = new CustomEvent('songchange', { detail: this.currentSong });
    document.dispatchEvent(event);
  }

  updatePlayButton() {
    const event = new CustomEvent('playbackstate', { detail: { isPlaying: this.isPlaying } });
    document.dispatchEvent(event);
  }

  handleError(error) {
    const event = new CustomEvent('audioerror', { detail: { error } });
    document.dispatchEvent(event);
  }

  showNotification(message) {
    // Simple toast notification
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  getCurrentTime() {
    return this.audio.currentTime;
  }

  getDuration() {
    return this.audio.duration || 0;
  }
}

// Singleton
const audioEngine = new AudioEngine();
