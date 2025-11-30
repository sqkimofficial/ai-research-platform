# AI Research Platform - Chrome Extension

A Chrome extension to save text highlights from any webpage to your AI Research Platform project.

## Features

- **Text Selection**: Select any text on a webpage and save it as a highlight
- **Project Integration**: Highlights are linked to your projects and sessions
- **Offline Support**: Highlights are queued when offline and synced later
- **Beautiful UI**: Modern popup for configuration and status

## Installation

### Step 1: Convert Icons (Optional)
If you want custom icons, convert the SVG files in `icons/` to PNG:
- `icon16.svg` → `icon16.png` (16x16)
- `icon48.svg` → `icon48.png` (48x48)
- `icon128.svg` → `icon128.png` (128x128)

You can use any online SVG to PNG converter or tools like ImageMagick:
```bash
# Using ImageMagick (if installed)
convert -background none icons/icon16.svg icons/icon16.png
convert -background none icons/icon48.svg icons/icon48.png
convert -background none icons/icon128.svg icons/icon128.png
```

Then update `manifest.json` to add the icons:
```json
"icons": {
  "16": "icons/icon16.png",
  "48": "icons/icon48.png",
  "128": "icons/icon128.png"
},
"action": {
  "default_popup": "popup.html",
  "default_icon": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

### Step 2: Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the `chrome-extension/` folder
5. Extension should appear in your extensions list

### Step 3: Configure Extension

1. Click the extension icon in Chrome toolbar
2. Enter configuration:
   - **API URL**: `http://localhost:5001` (or your backend URL)
   - **Auth Token**: Your JWT token from the platform
   - **Project ID**: UUID of your project
3. Click **Save Configuration**
4. Click **Test Connection** to verify

## Usage

1. Visit any webpage
2. Select text with your mouse
3. Click the **Save Highlight** button that appears
4. Highlight is saved to your project!

## Getting Your JWT Token

1. Log in to the AI Research Platform
2. Open browser DevTools (F12)
3. Go to Application → Local Storage → your site
4. Copy the `token` value

## Getting Project ID

1. Create a project in the platform
2. The Project ID appears in the backend logs when you enter the project
3. Or find it via the API: `GET /api/project`

## API Endpoints Used

- `POST /api/highlights` - Save a highlight
- `GET /api/highlights?project_id=<id>` - Get highlights

## Troubleshooting

**Extension not working?**
- Check that Developer mode is enabled
- Reload the extension after changes
- Check browser console for errors

**Highlights not saving?**
- Verify your JWT token is valid
- Check that project_id and session_id are correct
- Ensure backend is running

**Offline mode?**
- Highlights are queued and will sync when connection is restored
- Click "Sync Now" in popup to manually sync

