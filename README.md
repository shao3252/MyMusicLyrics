
# MY MUSIC LYRICS 🎵

A personal Android-first music player with synchronized lyrics, playlists, favorites, and AI transcription support.

## PROJECT FEATURES

- Local music library.
- Audio playback.
- Play, pause, previous and next.
- Shuffle and repeat.
- Seek and volume controls.
- Recently played songs.
- Favorite songs.
- Playlists.
- LRC lyrics import.
- Manual lyrics editing.
- Timestamped lyric highlighting.
- Word-level highlighting when accurate timestamps are available.
- AI transcription backend integration.
- IndexedDB storage.
- Progressive Web App support.
- Offline application shell.
- Media Session API support.

## PROJECT FILES

MyMusicLyrics/

- index.html
- style.css
- app.js
- lyrics.js
- audio.js
- storage.js
- transcription.js
- manifest.json
- sw.js
- README.md

## REQUIREMENTS

- Android phone or computer.
- Modern browser.
- Internet connection for initial hosting and AI transcription.
- HTTPS hosting for PWA installation and service workers.
- TrebEdit for editing the project.

## RUNNING THE APP

1. Put all project files inside the same folder.
2. Check that every filename is correct.
3. Upload the project to a static HTTPS hosting service.
4. Open the hosted website using Chrome.
5. Add music using the music selection button.
6. Select a song to start playing.
7. Import an LRC file or edit lyrics manually.

## MUSIC STORAGE

Imported music is intended to be stored in IndexedDB.

Browser storage has limits. Users should avoid clearing browser data if they want to retain their saved music and lyrics.

Always keep backup copies of important audio files and lyrics.

## LYRICS

The app supports:

- LRC timestamped lyrics.
- Plain text lyrics.
- Manual lyric editing.
- Automatic line highlighting.
- Word-level timestamps when provided by the transcription server.

The app does not invent missing lyrics or accurate word timestamps.

## AI TRANSCRIPTION

Automatic singing transcription requires a real transcription backend.

The backend should:

1. Accept an audio file using multipart/form-data.
2. Receive the audio under the field name `audio`.
3. Process the recording using an actual transcription model.
4. Return timestamped segments as JSON.

Expected response:

{
  "segments": [
    {
      "start": 1.2,
      "end": 3.5,
      "text": "Example lyric",
      "words": [
        {
          "start": 1.2,
          "end": 1.8,
          "text": "Example"
        }
      ]
    }
  ]
}

The endpoint must use HTTPS in production.

Never expose private API keys in frontend JavaScript.

Singing transcription accuracy depends on the recording, language, background music, and transcription model.

## OFFLINE SUPPORT

The Service Worker caches the application shell.

Previously imported music and saved lyrics may remain available through IndexedDB.

AI transcription requires a working backend and internet connection.

Offline background playback and continued access to local files depend on browser and Android support.

## MEDIA SESSION

The app uses the Media Session API where supported.

Available features may include:

- Lock-screen playback controls.
- Notification controls.
- Track information.
- Previous and next actions.

Actual background playback depends on browser and operating-system behavior.

## TROUBLESHOOTING

### App does not open

- Check that index.html exists.
- Check that all JavaScript filenames match.
- Check the browser console for errors.

### Music does not play

- Check the selected file.
- Try a browser-supported audio format.
- Check that the audio file is not damaged.

### Lyrics do not synchronize

- Make sure the LRC timestamps are correct.
- Check that the timestamps match the audio.
- Try importing the LRC file again.

### AI transcription fails

- Check the transcription endpoint.
- Check your internet connection.
- Confirm that the backend accepts multipart/form-data.
- Confirm that the backend returns the expected JSON structure.

### App cannot install

- Use HTTPS hosting.
- Open the app in a supported browser.
- Check the manifest and Service Worker.

## PRIVACY

Music and lyrics are intended to remain in browser storage.

When using AI transcription, the selected audio is uploaded to the configured transcription server. Only use a server you trust.

## PROJECT

Name: My Music Lyrics

Platform: Android-first PWA

Technology:

- HTML5
- CSS3
- JavaScript
- Web Audio API
- Media Session API
- IndexedDB
- Service Workers

Version: 1.0.0

Status: Initial development
