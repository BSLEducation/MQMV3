# Matching Question Maker — PWA

This is a simple Progressive Web App for teachers to create matching-question sets and for students to play them.

Quick start (recommended):

1. Serve the folder on localhost (service worker requires secure context). Example using Python 3:

```bash
cd "c:\Users\Nasim\Desktop\MQMV2"
python -m http.server 8000
# Then open http://localhost:8000 in your browser
```

2. Use the Teacher tab to add pairs and save sets (persisted in localStorage). Export/import sets as JSON.
3. Switch to Student tab to select a set and play offline. The app caches assets via the service worker.

Notes:
- Service worker registration requires serving over `http://localhost` or `https`.
- The manifest includes small placeholder icons (data URIs). Replace them in `manifest.json` with production icons if desired.
