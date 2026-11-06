/**
 * Lyrics Engine for My Music Lyrics
 * Handles synchronization, display, and editing
 */

class LyricsEngine {
  constructor() {
    this.currentLyrics = null;
    this.currentLineIndex = -1;
    this.container = null;
    this.isEditMode = false;
    this.audioElement = null;
    
    this.init();
  }

  init() {
    // Get audio element reference
    this.audioElement = audioEngine.audio;
    
    // Update on time change
    this.audioElement.addEventListener('timeupdate', () => {
      this.update();
    });

    // Load lyrics when song changes
    document.addEventListener('songchange', async (e) => {
      await this.loadLyricsForSong(e.detail);
    });
  }

  async loadLyricsForSong(song) {
    if (!song) return;

    try {
      // Try to load saved lyrics from IndexedDB
      const saved = await storage.getLyrics(song.id);
      
      if (saved) {
        this.currentLyrics = saved;
        this.display();
      } else {
        // No lyrics found - show placeholder
        this.showNoLyrics();
      }
    } catch (error) {
      console.error('Error loading lyrics:', error);
      this.showError();
    }
  }

  async generateLyrics(song, method = 'auto') {
    if (!song || !song.file) {
      throw new Error('No audio file available for transcription');
    }

    try {
      let result;

      if (method === 'lrc' && song.lrcContent) {
        // Parse provided LRC
        result = transcriptionEngine.parseLRC(song.lrcContent);
      } else {
        // Transcribe
        showTranscriptionProgress('Starting transcription...');
        
        result = await transcriptionEngine.transcribe(song.file, {
          language: 'auto',
          modelSize: 'tiny'
        });
      }

      // Save to storage
      await storage.saveLyrics(song.id, {
        lines: result.lines,
        words: result.words,
        source: result.source,
        songTitle: song.title,
        artist: song.artist
      });

      this.currentLyrics = result;
      this.display();
      
      hideTranscriptionProgress();
      return result;
    } catch (error) {
      hideTranscriptionProgress();
      throw error;
    }
  }

  display() {
    if (!this.container) return;

    if (!this.currentLyrics || !this.currentLyrics.lines || this.currentLyrics.lines.length === 0) {
      this.showNoLyrics();
      return;
    }

    this.container.innerHTML = '';
    this.currentLineIndex = -1;

    this.currentLyrics.lines.forEach((line, index) => {
      const lineEl = document.createElement('div');
      lineEl.className = 'lyric-line';
      lineEl.dataset.index = index;
      lineEl.dataset.start = line.start;
      lineEl.dataset.end = line.end;
      
      const textEl = document.createElement('span');
      textEl.className = 'lyric-text';
      textEl.textContent = line.text;
      
      lineEl.appendChild(textEl);
      
      // Click to seek
      lineEl.addEventListener('click', () => {
        if (!this.isEditMode) {
          audioEngine.seek(line.start + 0.1);
        }
      });
      
      // Edit mode
      if (this.isEditMode) {
        textEl.contentEditable = true;
        textEl.addEventListener('blur', async () => {
          await this.updateLineText(index, textEl.textContent);
        });
      }

      this.container.appendChild(lineEl);
    });
  }

  update() {
    if (!this.currentLyrics || !this.currentLyrics.lines || this.currentLyrics.lines.length === 0) {
      return;
    }

    const currentTime = this.audioElement.currentTime;
    const lines = this.currentLyrics.lines;
    
    // Find current line
    let newIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (currentTime >= lines[i].start && currentTime < lines[i].end) {
        newIndex = i;
        break;
      }
      if (currentTime < lines[i].start) {
        break;
      }
      newIndex = i; // Keep last line if past end
    }

    // Update display if line changed
    if (newIndex !== this.currentLineIndex) {
      // Remove old active class
      if (this.currentLineIndex >= 0) {
        const oldEl = this.container.querySelector(`[data-index="${this.currentLineIndex}"]`);
        if (oldEl) oldEl.classList.remove('active');
      }

      // Add new active class
      if (newIndex >= 0) {
        const newEl = this.container.querySelector(`[data-index="${newIndex}"]`);
        if (newEl) {
          newEl.classList.add('active');
          this.scrollToLine(newEl);
        }
      }

      this.currentLineIndex = newIndex;
    }
  }

  scrollToLine(lineEl) {
    if (!lineEl || !this.container) return;

    const containerRect = this.container.getBoundingClientRect();
    const lineRect = lineEl.getBoundingClientRect();
    
    const scrollTop = this.container.scrollTop + (lineRect.top - containerRect.top) - (containerRect.height / 2) + (lineRect.height / 2);
    
    this.container.scrollTo({
      top: scrollTop,
      behavior: 'smooth'
    });
  }

  async updateLineText(index, newText) {
    if (!this.currentLyrics || !this.currentLyrics.lines[index]) return;

    this.currentLyrics.lines[index].text = newText;
    
    // Save to storage
    const song = audioEngine.currentSong;
    if (song) {
      await storage.saveLyrics(song.id, this.currentLyrics);
    }
  }

  async adjustLineTime(index, newStart) {
    if (!this.currentLyrics || !this.currentLyrics.lines[index]) return;

    this.currentLyrics.lines[index].start = newStart;
    
    // Update end time of previous line
    if (index > 0) {
      this.currentLyrics.lines[index - 1].end = newStart;
    }

    // Save
    const song = audioEngine.currentSong;
    if (song) {
      await storage.saveLyrics(song.id, this.currentLyrics);
    }

    this.display();
  }

  toggleEditMode() {
    this.isEditMode = !this.isEditMode;
    this.display();
    return this.isEditMode;
  }

  showNoLyrics() {
    if (!this.container) return;
    
    this.container.innerHTML = `
      <div class="no-lyrics">
        <div class="no-lyrics-icon">🎵</div>
        <p>No lyrics available for this song</p>
        <button class="btn-primary" onclick="generateLyrics()">Generate Lyrics</button>
        <button class="btn-secondary" onclick="importLRC()">Import LRC File</button>
      </div>
    `;
  }

  showError() {
    if (!this.container) return;
    
    this.container.innerHTML = `
      <div class="error-message">
        <p>Error loading lyrics</p>
      </div>
    `;
  }

  setContainer(element) {
    this.container = element;
  }

  getCurrentLine() {
    if (this.currentLineIndex >= 0 && this.currentLyrics) {
      return this.currentLyrics.lines[this.currentLineIndex];
    }
    return null;
  }
}

// Helper functions for UI
function showTranscriptionProgress(message) {
  const overlay = document.getElementById('transcription-overlay');
  const msgEl = document.getElementById('transcription-message');
  if (overlay && msgEl) {
    overlay.style.display = 'flex';
    msgEl.textContent = message;
  }
}

function hideTranscriptionProgress() {
  const overlay = document.getElementById('transcription-overlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

async function generateLyrics() {
  const song = audioEngine.currentSong;
  if (!song) return;

  try {
    await lyricsEngine.generateLyrics(song, 'auto');
  } catch (error) {
    alert('Transcription failed: ' + error.message + '\n\nTry importing an LRC file instead.');
  }
}

function importLRC() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.lrc,.txt';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const text = await file.text();
    const song = audioEngine.currentSong;
    if (song) {
      song.lrcContent = text;
      await lyricsEngine.generateLyrics(song, 'lrc');
    }
  };
  input.click();
}

// Singleton
const lyricsEngine = new LyricsEngine();
