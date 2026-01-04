# Troubleshooting Chrome Extension

## Error: "Cannot read properties of undefined (reading 'getRedirectURL')"

This error means the `chrome.identity` API is not available. Here's how to fix it:

### Solution 1: Reload the Extension
After adding `identity` permissions to `manifest.json`, you MUST reload the extension:

1. Go to `chrome://extensions/`
2. Find your extension
3. Click the **reload icon** (circular arrow) on the extension card
4. The extension will reload with the new permissions

### Solution 2: Check Manifest Permissions
Make sure `manifest.json` includes:
```json
{
  "permissions": [
    "identity",
    "identity.email"
  ]
}
```

### Solution 3: Verify Extension Context
- The `chrome.identity` API only works in:
  - Background scripts (service workers)
  - Extension popups
  - Extension options pages
- It does NOT work in:
  - Content scripts
  - Regular web pages
  - Browser console on regular pages

### Solution 4: Get Redirect URI Manually
If you still can't get it from the popup:

1. Go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right)
3. Find your extension and note the **Extension ID** (shown on the card)
4. Your redirect URI is: `https://<EXTENSION-ID>.chromiumapp.org/`

Example: If Extension ID is `abcdefghijklmnopqrstuvwxyz123456`, the redirect URI is:
```
https://abcdefghijklmnopqrstuvwxyz123456.chromiumapp.org/
```

## Other Common Issues

### Google Sign-In Popup Doesn't Open
- Check that `identity` permission is in manifest.json
- Reload the extension
- Check browser console for errors

### "redirect_uri_mismatch" Error
- Make sure the exact redirect URI is added to Auth0 (including trailing slash)
- Check that Extension ID matches between extension and Auth0 config

### Extension ID Changed After Reload
- Unpacked extensions can change IDs if removed/reloaded
- For production, publish to Chrome Web Store for a permanent ID
- Or use a fixed Extension ID via `key` field in manifest.json

