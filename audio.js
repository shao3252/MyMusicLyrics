/**
 * Audio Engine for My Music Lyrics
 * Handles playback, Media Session API, and Web Audio API Visualizer
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
    this.repeatMode = 'none';
    this.volume = 1.0;
    
    // Web Audio Visualizer properties
    this.audioCtx = null;
    this.analyser = null;
    this.sourceNode = null;
    this.isVisualizerInitialized = false;
    
    this.init();
  }

  init() {
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

    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => this.play());
      navigator.mediaSession.setActionHandler('pause', () => this.pause());
      navigator.mediaSession.setActionHandler('previoustrack', () => this.previous());
      navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
    }
  }

  initVisualizer(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContext();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 64;

      try {
        this.sourceNode = this.audioCtx.createMediaElementSource(this.audio);
        this.sourceNode.connect(this.analyser);
        this.analyser.connect(this.audioCtx.destination);
      } catch (e) {
        console.error('Visualizer connection error:', e);
      }
    }

    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!this.isPlaying) {
        requestAnimationFrame(draw);
        return;
      }
      requestAnimationFrame(draw);
      this.analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 1.4;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;

        const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
        gradient.addColorStop(0, '#3700b3');
        gradient.addColorStop(0.5, '#bb86fc');
        gradient.addColorStop(1, '#03dac6');

        ctx.fillStyle = gradient;
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#bb86fc';

        ctx.fillRect(x, canvas.height - barHeight, barWidth - 2, barHeight);
        x += barWidth;
      }
    };

    if (!this.isVisualizerInitialized) {
      this.isVisualizerInitialized = true;
      draw();
    }
  }

  async loadSong(song, autoplay = true) {
    try {
      this.currentSong = song;
      
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

      await storage.addToRecent(song.id);
      this.updateNowPlayingUI();
    } catch (error) {
      console.error('Error loading song:', error);
      this.handleError(error);
    }
  }

  async play() {
    try {
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }
      await this.audio.play();
      this.isPlaying = true;
      this.updateMediaSessionPlaybackState('playing');
      this.updatePlayButton();
    } catch (error) {
      console.error('Play error:', error);
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
    let nextIndex = this.isShuffled ? Math.floor(Math.random() * this.playlist.length) : (this.currentIndex + 1) % this.playlist.length;
    this.currentIndex = nextIndex;
    this.loadSong(this.playlist[nextIndex]);
  }

  previous() {
    if (this.playlist.length === 0) return;
    if (this.audio.currentTime > 3) {
      this.seek(0);
      return;
    }
    let prevIndex = this.isShuffled ? Math.floor(Math.random() * this.playlist.length) : (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
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
    this.repeatMode = modes[(modes.indexOf(this.repeatMode) + 1) % modes.length];
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
      title: this.currentSong.title || 'Unknown',
      artist: this.currentSong.artist || 'Unknown',
      album: this.currentSong.album || 'Unknown'
    });
  }

  updateMediaSessionPlaybackState(state) {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = state;
    }
  }

  updateNowPlayingUI() {
    document.dispatchEvent(new CustomEvent('songchange', { detail: this.currentSong }));
  }

  updatePlayButton() {
    document.dispatchEvent(new CustomEvent('playbackstate', { detail: { isPlaying: this.isPlaying } }));
  }

  handleError(error) {
    document.dispatchEvent(new CustomEvent('audioerror', { detail: { error } }));
  }

  formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  getCurrentTime() { return this.audio.currentTime; }
  getDuration() { return this.audio.duration || 0; }
}

const audioEngine = new AudioEngine();
