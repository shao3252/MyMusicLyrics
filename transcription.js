/**
 * Transcription Engine for My Music Lyrics
 * Supports: Whisper.cpp (local), External APIs, Manual LRC
 * 
 * IMPORTANT: Singing recognition requires specialized models.
 * This implementation uses Whisper.cpp via WASM for local processing,
 * or external APIs when configured.
 */

class TranscriptionEngine {
  constructor() {
    this.whisperWorker = null;
    this.isModelLoaded = false;
    this.modelSize = 'tiny'; // tiny, base, small, medium, large
    this.apiEndpoint = null;
    this.apiKey = null;
    this.progressCallback = null;
  }

  /**
   * Initialize Whisper.cpp (WebAssembly)
   * Downloads model on first use (~75MB for 'tiny')
   */
  async initWhisper(modelSize = 'tiny') {
    return new Promise((resolve, reject) => {
      if (typeof Whisper === 'undefined') {
        reject(new Error('Whisper WASM not loaded. Add whisper.js to your project.'));
        return;
      }

      this.modelSize = modelSize;
      
      // Show progress
      if (this.progressCallback) {
        this.progressCallback({ status: 'loading', progress: 0, message: 'Downloading AI model...' });
      }

      // Initialize Whisper with model
      Whisper.init({
        model: modelSize,
        onProgress: (progress) => {
          if (this.progressCallback) {
            this.progressCallback({ 
              status: 'loading', 
              progress: progress, 
              message: `Loading model: ${Math.round(progress * 100)}%` 
            });
          }
        }
      }).then((instance) => {
        this.whisperWorker = instance;
        this.isModelLoaded = true;
        if (this.progressCallback) {
          this.progressCallback({ status: 'ready', progress: 1, message: 'Model ready' });
        }
        resolve(instance);
      }).catch(reject);
    });
  }

  /**
   * Transcribe audio using Whisper.cpp
   * @param {Blob} audioBlob - Audio file blob
   * @param {Object} options - Transcription options
   * @returns {Object} - { lines: [{start, end, text}], words: [{start, end, word}] }
   */
  async transcribeWithWhisper(audioBlob, options = {}) {
    if (!this.isModelLoaded) {
      await this.initWhisper(options.modelSize || 'tiny');
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const audioData = new Uint8Array(e.target.result);
          
          if (this.progressCallback) {
            this.progressCallback({ status: 'transcribing', progress: 0, message: 'Transcribing audio...' });
          }

          const result = await this.whisperWorker.transcribe(audioData, {
            language: options.language || 'auto',
            wordTimestamps: true,
            onProgress: (progress) => {
              if (this.progressCallback) {
                this.progressCallback({ 
                  status: 'transcribing', 
                  progress: progress, 
                  message: `Transcribing: ${Math.round(progress * 100)}%` 
                });
              }
            }
          });

          // Convert to our format
          const lines = [];
          const words = [];

          if (result.words) {
            // Word-level timestamps available
            result.words.forEach(w => {
              words.push({
                start: w.start,
                end: w.end,
                word: w.word
              });
            });

            // Group words into lines (approximate)
            let currentLine = { start: 0, end: 0, text: '', words: [] };
            result.words.forEach((w, i) => {
              if (currentLine.words.length === 0) {
                currentLine.start = w.start;
              }
              currentLine.words.push(w);
              currentLine.text += w.word + ' ';
              currentLine.end = w.end;

              // New line every ~8 words or on punctuation
              if (currentLine.words.length >= 8 || /[.!?]$/.test(w.word)) {
                lines.push({ ...currentLine });
                currentLine = { start: 0, end: 0, text: '', words: [] };
              }
            });
            if (currentLine.words.length > 0) {
              lines.push(currentLine);
            }
          } else if (result.segments) {
            // Segment-level only
            result.segments.forEach(seg => {
              lines.push({
                start: seg.start,
                end: seg.end,
                text: seg.text
              });
            });
          }

          resolve({ lines, words, source: 'whisper' });
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(audioBlob);
    });
  }

  /**
   * Transcribe using external API (requires internet + API key)
   * Supported: AssemblyAI, Deepgram, OpenAI Whisper API
   */
  async transcribeWithAPI(audioBlob, options = {}) {
    if (!this.apiEndpoint || !this.apiKey) {
      throw new Error('API not configured. Add your API key in Settings.');
    }

    const formData = new FormData();
    formData.append('audio', audioBlob);
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'word');

    try {
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      
      // Parse response
      const lines = [];
      const words = [];

      if (data.words) {
        data.words.forEach(w => {
          words.push({
            start: w.start,
            end: w.end,
            word: w.word
          });
        });
      }

      if (data.segments) {
        data.segments.forEach(seg => {
          lines.push({
            start: seg.start,
            end: seg.end,
            text: seg.text
          });
        });
      }

      return { lines, words, source: 'api' };
    } catch (error) {
      throw new Error(`Transcription failed: ${error.message}`);
    }
  }

  /**
   * Main transcription method - tries local first, falls back to API
   */
  async transcribe(audioBlob, options = {}) {
    // Try local Whisper first
    try {
      return await this.transcribeWithWhisper(audioBlob, options);
    } catch (error) {
      console.warn('Local transcription failed:', error);
      
      // Fallback to API if configured
      if (this.apiKey) {
        try {
          return await this.transcribeWithAPI(audioBlob, options);
        } catch (apiError) {
          console.error('API transcription failed:', apiError);
          throw new Error('All transcription methods failed');
        }
      } else {
        throw new Error('No transcription method available. Configure API in Settings or download Whisper model.');
      }
    }
  }

  /**
   * Parse LRC file content
   */
  parseLRC(lrcContent) {
    const lines = [];
    const regex = /\[(\d+):(\d+)(?:\.(\d+))?\](.*)/g;
    let match;

    while ((match = regex.exec(lrcContent)) !== null) {
      const minutes = parseInt(match[1]);
      const seconds = parseInt(match[2]);
      const hundredths = match[3] ? parseInt(match[3]) : 0;
      const text = match[4].trim();
      
      const time = minutes * 60 + seconds + hundredths / 100;
      
      if (text) {
        lines.push({
          start: time,
          end: time + 5, // Will be updated to next line's start
          text: text
        });
      }
    }

    // Sort by start time
    lines.sort((a, b) => a.start - b.start);

    // Update end times
    for (let i = 0; i < lines.length - 1; i++) {
      lines[i].end = lines[i + 1].start;
    }

    return { lines, words: [], source: 'lrc' };
  }

  setProgressCallback(callback) {
    this.progressCallback = callback;
  }

  configureAPI(endpoint, key) {
    this.apiEndpoint = endpoint;
    this.apiKey = key;
  }
}

// Singleton
const transcriptionEngine = new TranscriptionEngine();
