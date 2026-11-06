/**
 * Main Application Logic for My Music Lyrics
 * UI management, navigation, playlists
 */

class MusicApp {
  constructor() {
    this.currentScreen = 'home';
    this.songs = [];
    this.playlists = [];
    this.currentPlaylist = null;
    
    this.init();
  }

  async init() {
    await storage.init();
    this.audio = audioEngine;
    
    this.setupNavigation();
    this.setupFileInput();
    this.setupPlaybackControls();
    this.setupSearch();
    this.setupPlaylistManagement();
    
    await this.loadSongs();
    await this.loadPlaylists();
    await this.loadRecent();
    
    lyricsEngine.setContainer(document.getElementById('lyrics-container'));
    
    transcriptionEngine.setProgressCallback((progress) => {
      const msgEl = document.getElementById('transcription-message');
      if (msgEl) {
        msgEl.textContent = progress.message;
      }
    });
    
    this.registerServiceWorker();
    this.setupPWAInstall();
  }

  setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        const screen = item.dataset.screen;
        this.navigateTo(screen);
      });
    });

    window.addEventListener('popstate', (e) => {
      if (e.state && e.state.screen) {
        this.navigateTo(e.state.screen, false);
      }
    });
  }

  navigateTo(screen, pushState = true) {
    document.querySelectorAll('.screen').forEach(s => {
      s.classList.remove('active');
    });
    
    const targetScreen = document.getElementById(`screen-${screen}`);
    if (targetScreen) {
      targetScreen.classList.add('active');
      this.currentScreen = screen;
      
      document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.screen === screen);
      });
      
      if (pushState) {
        history.pushState({ screen }, '', `#${screen}`);
      }
      
      if (screen === 'now-playing') {
        this.updateNowPlayingDisplay();
        this.audio.initVisualizer('audio-visualizer');
      } else if (screen === 'lyrics') {
        lyricsEngine.display();
      }
    }
  }

  setupFileInput() {
    const fileInput = document.getElementById('file-input');
    const addButton = document.getElementById('add-music-btn');
    
    addButton.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      await this.importFiles(files);
    });

    const dropZone = document.getElementById('drop-zone');
    if (dropZone) {
      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
      });

      dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
      });

      dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const files = Array.from(e.dataTransfer.files);
        await this.importFiles(files);
      });
    }
  }

  async importFiles(files) {
    const audioFiles = files.filter(f => 
      f.type.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|flac|aac)$/i.test(f.name)
    );

    if (audioFiles.length === 0) {
      alert('No valid audio files selected');
      return;
    }

    for (const file of audioFiles) {
      try {
        const metadata = await this.extractMetadata(file);
        const song = {
          title: metadata.title || file.name.replace(/\.[^/.]+$/, ''),
          artist: metadata.artist || 'Unknown Artist',
          album: metadata.album || 'Unknown Album',
          duration: metadata.duration || 0,
          file: file,
          artwork: metadata.artwork || null,
          dateAdded: Date.now()
        };

        const id = await storage.saveSong(song);
        song.id = id;
        this.songs.push(song);
      } catch (error) {
        console.error('Error importing file:', error);
      }
    }

    await this.refreshSongList();
    alert(`Successfully imported ${audioFiles.length} song(s)`);
  }

  async extractMetadata(file) {
    return new Promise((resolve) => {
      const audio = new Audio();
      const url = URL.createObjectURL(file);
      
      audio.addEventListener('loadedmetadata', () => {
        resolve({ duration: audio.duration, title: null, artist: null, album: null });
        URL.revokeObjectURL(url);
      });

      audio.addEventListener('error', () => {
        resolve({
          duration: 0,
          title: file.name.replace(/\.[^/.]+$/, ''),
          artist: 'Unknown Artist',
          album: 'Unknown Album'
        });
        URL.revokeObjectURL(url);
      });

      audio.src = url;
    });
  }

  async loadSongs() {
    this.songs = await storage.getAllSongs();
    await this.refreshSongList();
  }

  async refreshSongList() {
    const container = document.getElementById('songs-list');
    if (!container) return;

    container.innerHTML = '';

    if (this.songs.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>No music yet. Add your first song!</p>
          <button class="btn-primary" onclick="document.getElementById('file-input').click()" style="margin-top: 16px;">
            Add Music
          </button>
        </div>
      `;
      return;
    }

    this.songs.forEach((song, index) => {
      const item = this.createSongItem(song, index);
      container.appendChild(item);
    });
  }

  createSongItem(song, index) {
    const div = document.createElement('div');
    div.className = 'song-item';
    div.innerHTML = `
      <div class="song-artwork">
        ${song.artwork ? `<img src="${song.artwork}" alt="">` : '<span class="music-icon">🎵</span>'}
      </div>
      <div class="song-info">
        <div class="song-title">${this.escapeHtml(song.title)}</div>
        <div class="song-artist">${this.escapeHtml(song.artist)}</div>
      </div>
      <div class="song-duration">${this.audio.formatTime(song.duration)}</div>
      <button class="song-menu-btn" data-index="${index}" title="Options">⋮</button>
    `;

    div.addEventListener('click', (e) => {
      if (!e.target.classList.contains('song-menu-btn')) {
        this.playSong(index);
      }
    });

    const menuBtn = div.querySelector('.song-menu-btn');
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showSongMenu(song, index);
    });

    return div;
  }

  playSong(index) {
    if (index < 0 || index >= this.songs.length) return;
    
    this.audio.playlist = this.songs;
    this.audio.currentIndex = index;
    this.audio.loadSong(this.songs[index]);
    this.navigateTo('now-playing');
  }

  setupPlaybackControls() {
    const playBtn = document.getElementById('play-btn');
    playBtn.addEventListener('click', () => this.audio.toggle());

    document.getElementById('prev-btn').addEventListener('click', () => this.audio.previous());
    document.getElementById('next-btn').addEventListener('click', () => this.audio.next());

    const seekBar = document.getElementById('seek-bar');
    seekBar.addEventListener('input', (e) => {
      const percent = e.target.value / 100;
      const time = percent * this.audio.getDuration();
      this.audio.seek(time);
    });

    const volumeSlider = document.getElementById('volume-slider');
    volumeSlider.addEventListener('input', (e) => {
      this.audio.setVolume(e.target.value / 100);
    });

    document.getElementById('shuffle-btn').addEventListener('click', (e) => {
      const isShuffled = this.audio.toggleShuffle();
      e.currentTarget.classList.toggle('active', isShuffled);
    });

    document.getElementById('repeat-btn').addEventListener('click', (e) => {
      const mode = this.audio.cycleRepeat();
      e.currentTarget.classList.toggle('active', mode !== 'none');
      e.currentTarget.dataset.mode = mode;
    });

    this.audio.audio.addEventListener('timeupdate', () => {
      const current = this.audio.getCurrentTime();
      const duration = this.audio.getDuration();
      const percent = (current / duration) * 100 || 0;
      
      seekBar.value = percent;
      document.getElementById('current-time').textContent = this.audio.formatTime(current);
      document.getElementById('total-time').textContent = this.audio.formatTime(duration);
    });

    document.addEventListener('playbackstate', (e) => {
      const icon = playBtn.querySelector('span');
      icon.textContent = e.detail.isPlaying ? '⏸' : '▶';
    });

    document.addEventListener('songchange', () => {
      this.updateNowPlayingDisplay();
    });
  }

  updateNowPlayingDisplay() {
    const song = this.audio.currentSong;
    if (!song) return;

    document.getElementById('np-title').textContent = song.title;
    document.getElementById('np-artist').textContent = song.artist;
    
    const artwork = document.getElementById('np-artwork');
    if (song.artwork) {
      artwork.innerHTML = `<img src="${song.artwork}" alt="">`;
    } else {
      artwork.innerHTML = '<span class="music-icon large">🎵</span>';
    }

    document.getElementById('mini-player-title').textContent = song.title;
    document.getElementById('mini-player-artist').textContent = song.artist;
  }

  setupSearch() {
    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      this.filterSongs(query);
    });
  }

  filterSongs(query) {
    const container = document.getElementById('songs-list');
    const items = container.querySelectorAll('.song-item');
    
    items.forEach(item => {
      const title = item.querySelector('.song-title').textContent.toLowerCase();
      const artist = item.querySelector('.song-artist').textContent.toLowerCase();
      const visible = title.includes(query) || artist.includes(query);
      item.style.display = visible ? 'flex' : 'none';
    });
  }

  setupPlaylistManagement() {
    document.getElementById('create-playlist-btn').addEventListener('click', () => {
      this.showCreatePlaylistDialog();
    });
  }

  async loadPlaylists() {
    this.playlists = await storage.getAllPlaylists();
    this.renderPlaylists();
  }

  renderPlaylists() {
    const container = document.getElementById('playlists-list');
    if (!container) return;

    container.innerHTML = '';

    if (this.playlists.length === 0) {
      container.innerHTML = '<p class="empty-state">No playlists yet</p>';
      return;
    }

    this.playlists.forEach(playlist => {
      const div = document.createElement('div');
      div.className = 'playlist-item';
      div.innerHTML = `
        <div class="playlist-icon">📋</div>
        <div class="song-info">
          <div class="playlist-name">${this.escapeHtml(playlist.name)}</div>
          <div class="playlist-count">${playlist.songs ? playlist.songs.length : 0} songs</div>
        </div>
      `;
      
      div.addEventListener('click', () => alert(`Playlist: ${playlist.name}`));
      container.appendChild(div);
    });
  }

  showCreatePlaylistDialog() {
    const name = prompt('Enter playlist name:');
    if (!name) return;

    const playlist = { name, songs: [], created: Date.now() };
    storage.savePlaylist(playlist).then(id => {
      playlist.id = id;
      this.playlists.push(playlist);
      this.renderPlaylists();
    });
  }

  async loadRecent() {
    const recent = await storage.getRecent(10);
    const container = document.getElementById('recent-list');
    if (!container) return;

    container.innerHTML = '';

    for (const item of recent) {
      const song = await storage.getSong(item.songId);
      if (song) {
        const div = document.createElement('div');
        div.className = 'recent-item';
        div.innerHTML = `
          <div class="song-artwork small">
            ${song.artwork ? `<img src="${song.artwork}" alt="">` : '<span class="music-icon">🎵</span>'}
          </div>
          <div class="song-info">
            <div class="song-title">${this.escapeHtml(song.title)}</div>
            <div class="song-artist">${this.escapeHtml(song.artist)}</div>
          </div>
        `;
        div.addEventListener('click', () => {
          const index = this.songs.findIndex(s => s.id === song.id);
          if (index >= 0) this.playSong(index);
        });
        container.appendChild(div);
      }
    }
  }

  showSongMenu(song, index) {
    const choice = prompt(`Options for "${song.title}":\n1. Play\n2. Add to Playlist\n3. Edit Info\n4. Delete\n\nEnter number:`);
    
    if (choice === '1') this.playSong(index);
    else if (choice === '2') this.addToPlaylist(song);
    else if (choice === '3') this.editSongInfo(song);
    else if (choice === '4') this.deleteSong(song, index);
  }

  async addToPlaylist(song) {
    if (this.playlists.length === 0) {
      alert('Create a playlist first!');
      return;
    }

    const list = this.playlists.map((p, i) => `${i + 1}. ${p.name}`).join('\n');
    const choice = prompt(`Add to playlist:\n${list}\n\nEnter number:`);
    
    if (choice) {
      const index = parseInt(choice) - 1;
      if (index >= 0 && index < this.playlists.length) {
        const playlist = this.playlists[index];
        if (!playlist.songs) playlist.songs = [];
        playlist.songs.push(song.id);
        await storage.savePlaylist(playlist);
        alert(`Added to ${playlist.name}`);
      }
    }
  }

  async editSongInfo(song) {
    const newTitle = prompt('Title:', song.title);
    const newArtist = prompt('Artist:', song.artist);
    
    if (newTitle !== null) song.title = newTitle;
    if (newArtist !== null) song.artist = newArtist;
    
    await storage.updateSong(song.id, { title: song.title, artist: song.artist });
    await this.refreshSongList();
  }

  async deleteSong(song, index) {
    if (!confirm(`Delete "${song.title}"?`)) return;
    await storage.deleteSong(song.id);
    this.songs.splice(index, 1);
    await this.refreshSongList();
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(err => console.error('SW error:', err));
    }
  }

  setupPWAInstall() {
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      const installBtn = document.getElementById('install-btn');
      if (installBtn) {
        installBtn.style.display = 'block';
        installBtn.addEventListener('click', async () => {
          deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;
          if (outcome === 'accepted') {
            deferredPrompt = null;
            installBtn.style.display = 'none';
          }
        });
      }
    });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.musicApp = new MusicApp();
});
