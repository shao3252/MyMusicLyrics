/**
 * Transcription Engine for My Music Lyrics
 * Supports: Whisper.cpp (local), External APIs, Manual LRC
 */

class TranscriptionEngine {
  constructor() {
    this.whisperWorker = null;
    this.isModelLoaded = false;
    this.modelSize = 'tiny';
    this.apiEndpoint = null;
    this.apiKey = null;
    this.progressCallback = null;
  }

  async initWhisper(modelSize = 'tiny') {
    return new Promise((resolve, reject) => {
      if (typeof Whisper === 'undefined') {
        reject(new Error('Whisper WASM not loaded.'));
        return;
      }

      this.modelSize = modelSize;
      
      if (this.progressCallback) {
        this.progressCallback({ status: 'loading', progress: 0, message: 'Downloading AI model...' });
      }

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

          const lines = [];
          const words = [];

          if (result.words) {
            result.words.forEach(w => {
              words.push({ start: w.start, end: w.end, word: w.word });
            });

            let currentLine = { start: 0, end: 0, text: '', words: [] };
            result.words.forEach((w) => {
              if (currentLine.words.length === 0) {
                currentLine.start = w.start;
              }
              currentLine.words.push(w);
              currentLine.text += w.word + ' ';
              currentLine.end = w.end;

              if (currentLine.words.length >= 8 || /[.!?]$/.test(w.word)) {
                lines.push({ ...currentLine });
                currentLine = { start: 0, end: 0, text: '', words: [] };
              }
            });
            if (currentLine.words.length > 0) {
              lines.push(currentLine);
            }
          } else if (result.segments) {
            result.segments.forEach(seg => {
              lines.push({ start: seg.start, end: seg.end, text: seg.text });
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

  async transcribeWithAPI(audioBlob) {
    if (!this.apiEndpoint || !this.apiKey) {
      throw new Error('API not configured.');
    }

    const formData = new FormData();
    formData.append('audio', audioBlob);
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'word');

    const response = await fetch(this.apiEndpoint, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
      body: formData
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const lines = [];
    const words = [];

    if (data.words) {
      data.words.forEach(w => words.push({ start: w.start, end: w.end, word: w.word }));
    }
    if (data.segments) {
      data.segments.forEach(seg => lines.push({ start: seg.start, end: seg.end, text: seg.text }));
    }

    return { lines, words, source: 'api' };
  }

  async transcribe(audioBlob, options = {}) {
    try {
      return await this.transcribeWithWhisper(audioBlob, options);
    } catch (error) {
      console.warn('Local transcription failed, trying API fallback:', error);
      if (this.apiKey) {
        return await this.transcribeWithAPI(audioBlob);
      } else {
        throw new Error('All transcription methods failed.');
      }
    }
  }

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
        lines.push({ start: time, end: time + 5, text: text });
      }
    }

    lines.sort((a, b) => a.start - b.start);

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

const transcriptionEngine = new TranscriptionEngine();
