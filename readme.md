# Expandify - No Fuss Text Expansion App

A TextExpander-like application that automatically expands text shortcuts in your browser.

## Features

✅ Global keyboard listener (works in Chrome, Edge, Firefox, Brave, Opera)  
✅ Rich text support (HTML) and plain text  
✅ System tray integration  
✅ Easy snippet management UI  
✅ JSON-based storage  
✅ Automatic trigger replacement  

## Prerequisites

Before installation, ensure you have:

1. **Node.js v20 LTS** installed
2. **Python 3.x** installed
3. **Windows Build Tools** installed (see below)

### Install Windows Build Tools

Open PowerShell as Administrator and run:

```powershell
npm install --global windows-build-tools
```

Or if you have Visual Studio installed, make sure "Desktop development with C++" is enabled.

## Installation

1. **Create project folder and navigate to it:**
   ```bash
   mkdir text-expander
   cd text-expander
   ```

2. **Copy all files** (package.json, main.js, index.html, snippets.json) to this folder

3. **Install dependencies:**
   ```bash
   npm install
   ```

   **Note:** This may take several minutes as it compiles native modules (robotjs, node-global-key-listener).

4. **Create a placeholder icon** (optional):
   - Create a simple PNG file named `icon.png` (256x256px) in the project root
   - Or the app will work without it (just won't show an icon in tray)

## Running the Application

```bash
npm start
```

Or directly with Electron:

```bash
npx electron main.js
```

## Usage

1. **Launch the app** - A window will open showing your snippets
2. **Add snippets:**
   - Enter a name (e.g., "Email Signature")
   - Enter a trigger (e.g., ";sig")
   - Enter the content you want to expand
   - Check "Rich Text" if you want HTML formatting
   - Click "Add Snippet"

3. **Use snippets in browsers:**
   - Open Chrome, Edge, Firefox, Brave, or Opera
   - Type your trigger (e.g., ";sig")
   - The trigger will be automatically replaced with your snippet content

4. **System tray:**
   - The app minimizes to system tray when you close the window
   - Right-click tray icon to:
     - Show snippets window
     - Reload snippets from file
     - Quit application

## How It Works

1. **Global Keyboard Listener** - Monitors all keystrokes
2. **Active Window Detection** - Only activates in allowed browsers
3. **Pattern Matching** - Detects when you type a trigger
4. **Auto-Replacement:**
   - Backspaces to erase the trigger
   - Types/pastes the snippet content
5. **Rich Text** - Uses clipboard for HTML content

## Snippets File

Snippets are stored in `snippets.json`:

```json
[
  {
    "name": "Email Signature",
    "trigger": ";sig",
    "content": "Best regards,\nJohn Doe",
    "richText": false
  }
]
```

You can edit this file directly or use the UI.

## Troubleshooting

### Installation Issues

**Problem:** `npm install` fails with robotjs or native module errors

**Solution:**
1. Make sure Python is in your PATH: `python --version`
2. Install build tools: `npm install --global windows-build-tools`
3. If still failing, try installing without robotjs:
   - Remove robotjs from package.json dependencies
   - The app will still work but may have issues with some special characters

**Problem:** Windows Defender blocks the app

**Solution:**
- This is normal for apps that monitor keyboard globally
- Add an exception in Windows Security for the project folder

### Runtime Issues

**Problem:** Snippets don't expand

**Solution:**
1. Check you're in an allowed browser (Chrome, Edge, Firefox, Brave, Opera)
2. Make sure the app is running (check system tray)
3. Try right-clicking tray icon → "Reload Snippets"

**Problem:** App won't start

**Solution:**
1. Check terminal for error messages
2. Make sure all dependencies installed: `npm install`
3. Try deleting `node_modules` and running `npm install` again

## Customization

### Add More Allowed Apps

Edit `main.js`, line 9:

```javascript
const ALLOWED_APPS = ['chrome.exe', 'msedge.exe', 'firefox.exe', 'brave.exe', 'opera.exe', 'yourapp.exe'];
```

### Change Snippet Storage Location

Edit `main.js`, line 8:

```javascript
const SNIPPETS_FILE = path.join(__dirname, 'my-snippets.json');
```

## Building Executable

To create a standalone .exe:

```bash
npm run build
```

The executable will be in the `dist` folder.

## Security & Privacy

- **No internet connection required** - Everything runs locally
- **No telemetry** - Your snippets never leave your computer
- **Open source** - You can inspect all the code

## Known Limitations

- Only works in browsers (by design, for safety)
- Rich text uses clipboard (temporarily overwrites clipboard content)
- May require running as administrator on some systems
- Windows Defender may flag it (normal for keyboard listeners)

## License

MIT License - Free to use and modify

## Support

For issues or questions, check the code comments in `main.js` for detailed explanations of how each part works.