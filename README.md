# Expandify

**No fuss text expansion app**

Expandify is a lightweight desktop application that allows you to create custom text snippets and expand them with a keyboard shortcut. Perfect for repetitive typing tasks, email templates, code snippets, and more.

## Features

- 🚀 Quick text expansion with customizable shortcuts
- 🎯 Works in supported applications (Chrome, Edge, Firefox, VS Code, Notepad, and more)
- ⚙️ Easy snippet management with a clean UI
- 💾 Local data storage - your snippets stay on your machine
- 🔧 Customizable settings
- 🎨 Minimal and intuitive interface

## Installation

1. Download the latest installer from the [Releases](https://github.com/rmonggi/Expandify/releases) page
2. Run `Expandify-1.0.0-Setup.exe`
3. Follow the installation wizard
4. Launch the app from your Start Menu or Desktop shortcut

## Usage

### Creating a Snippet

1. Open Expandify
2. Click the "+" button or go to File → New Snippet
3. Enter a **Snippet** (the text to expand)
4. Enter a **Shortcut** (the trigger key combination)
5. Click "Save"

### Expanding a Snippet

Simply type your shortcut in any supported application, and Expandify will automatically expand it to your full snippet.

### Supported Applications

- Google Chrome
- Microsoft Edge
- Firefox
- Brave Browser
- Opera Browser
- Notepad
- Visual Studio Code
- VMware

## System Requirements

- Windows 10 or later
- .NET Framework (included with Windows)

## Configuration

### Allowed Apps

Edit `allowed-apps.json` to add or remove applications where Expandify can expand snippets:

```json
[
  "chrome.exe",
  "msedge.exe",
  "firefox.exe",
  "notepad.exe",
  "code.exe"
]
```

## Development

### Prerequisites

- Node.js (v14 or higher)
- npm

### Setup

```bash
git clone https://github.com/rmonggi/Expandify.git
cd Expandify
npm install
```

### Running Locally

```bash
npm run start
```

### Building the Installer

```bash
npm run build:win
```

The installer will be created in the `dist/` folder.

## File Structure

```
Expandify/
├── main.js              # Electron main process
├── index.html           # UI/frontend
├── preload.js           # Preload script
├── package.json         # Project configuration
├── allowed-apps.json    # List of allowed applications
├── snippets.json        # User snippet storage
├── settings.json        # App settings
├── images/              # App icons and assets
└── README.md           # This file
```

## License

This project is licensed under the MIT License - see the [LICENSE.txt](LICENSE.txt) file for details.

## Author

**Raymond Maraya**

## Support

For bug reports and feature requests, please visit the [GitHub Issues](https://github.com/rmonggi/Expandify/issues) page.

---

Made with ❤️ by [Raymond Maraya](https://github.com/rmonggi)
