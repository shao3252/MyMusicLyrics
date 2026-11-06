# My Music Lyrics - Advanced Music Player PWA

A mobile-first, offline-capable music player with automatic lyric synchronization.

## Features

- 🎵 Local music playback (MP3, WAV, M4A, OGG)
- 🎤 Automatic lyric transcription (Whisper AI)
- ⏱️ Word-level timestamp synchronization
- 📱 PWA installable (works offline)
- 🎨 AMOLED dark theme
- 📋 Playlist management
- 🔍 Search functionality
- ⏯️ Background playback (with PWA install)

## Installation

1. **Using TrebEdit on Android:**
   - Create new project "MyMusicLyrics"
   - Copy all files into project folder
   - Open `index.html` in preview
   - Use "Run" to test in browser

2. **As PWA:**
   - Host files on HTTPS (GitHub Pages, Netlify, Vercel)
   - Open in Chrome on Android
   - Tap "Add to Home Screen"
   - App will work offline

## Transcription Setup

### Option 1: Local Whisper (Recommended)
- Downloads automatically on first use (~75MB)
- Works offline after download
- Slower on mobile devices

### Option 2: External API
1. Get API key from:
   - [AssemblyAI](https://www.assemblyai.com/)
   - [Deepgram](https://deepgram.com/)
   - [OpenAI Whisper API](https://openai.com/whisper)

2. Open Settings in app
3. Enter API endpoint and key
4. Save

## Browser Limitations

| Feature | Limitation |
|---------|-----------|
| **File Access** | Cannot access full filesystem. Must select files each time or use File System Access API (Chrome only) |
| **Background Playback** | Requires PWA installation + Media Session API support |
| **Transcription** | Requires internet for model download OR API access |
| **Singing Recognition** | Less accurate than speech. May require manual correction |

## File Structure

