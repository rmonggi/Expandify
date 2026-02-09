const { app, BrowserWindow, Tray, Menu, ipcMain, clipboard, globalShortcut, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { GlobalKeyboardListener } = require('node-global-key-listener');
const { spawn } = require('child_process');
const os = require('os');

// Hide console window in production (when app is built/installed)
if (!process.argv.includes('--show-logs')) {
  const hideConsole = () => {
    if (process.platform === 'win32') {
      const { execSync } = require('child_process');
      try {
        // Hide the console window using Windows API
        execSync('powershell -Command "Add-Type -Name Window -Namespace Console -MemberDefinition \'[DllImport(\"kernel32.dll\")] public static extern IntPtr GetConsoleWindow(); [DllImport(\"user32.dll\")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow); public static void Hide() { ShowWindow(GetConsoleWindow(), 0); }\' -PassThru | % { $_.Hide() }"', { stdio: 'ignore' });
      } catch (e) {
        // Fallback: just suppress console output
        console.log = () => {};
        console.error = () => {};
        console.warn = () => {};
      }
    }
  };
  
  // Delay slightly to ensure app is initialized
  setTimeout(hideConsole, 100);
}

// Configuration
const SNIPPETS_FILE = path.join(__dirname, 'snippets.json');
const ALLOWED_APPS_FILE = path.join(__dirname, 'allowed-apps.json');
const SETTINGS_FILE = path.join(__dirname, 'settings.json');
const IMAGES_DIR = path.join(__dirname, 'images');
let ALLOWED_APPS = ['chrome.exe', 'msedge.exe', 'firefox.exe', 'brave.exe', 'opera.exe', 'notepad.exe', 'code.exe'];
let settings = {
  startupOnBoot: false
};

// Create images directory if it doesn't exist
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  console.log('Created images directory');
}

let mainWindow = null;
let tray = null;
let snippets = [];
let typedBuffer = '';
let keyboardListener = null;
let activeWin = null;
let isExpanding = false;
let triggersDisabled = false;

// Load active-win dynamically (it's an ES module)
async function loadActiveWin() {
  try {
    const module = await import('active-win');
    activeWin = module.default;
    console.log('active-win loaded successfully');
  } catch (error) {
    console.error('Error loading active-win:', error);
    activeWin = null;
  }
}

// Get active window (wrapper for activeWin)
async function getActiveWindow() {
  try {
    if (!activeWin) return null;
    return await activeWin();
  } catch (error) {
    console.error('Error getting active window:', error);
    return null;
  }
}

// ============================================================================
// FEATURE 2: DETECT PASSWORD FIELDS
// ============================================================================
async function isPasswordField(windowInfo) {
  if (!windowInfo) return false;
  
  const passwordIndicators = [
    'password',
    'login',
    'sign in',
    'authenticate',
    '1password',
    'lastpass',
    'bitwarden',
    'vault'
  ];
  
  const titleLower = (windowInfo.title || '').toLowerCase();
  const pathLower = (windowInfo.owner?.path || '').toLowerCase();
  
  const isPassword = passwordIndicators.some(indicator => 
    titleLower.includes(indicator) || pathLower.includes(indicator)
  );
  
  if (isPassword) {
    console.log(`Password field detected: "${windowInfo.title}"`);
  }
  
  return isPassword;
}

// ============================================================================
// INPUT VALIDATION
// ============================================================================

function validateSnippet(snippet) {
  if (!snippet || typeof snippet !== 'object') {
    throw new Error('Invalid snippet: must be an object');
  }
  if (!snippet.trigger || typeof snippet.trigger !== 'string') {
    throw new Error('Invalid snippet: trigger must be a non-empty string');
  }
  if (!snippet.name || typeof snippet.name !== 'string') {
    throw new Error('Invalid snippet: name must be a non-empty string');
  }
  if (!snippet.content || typeof snippet.content !== 'string') {
    throw new Error('Invalid snippet: content must be a non-empty string');
  }
  if (snippet.trigger.length > 100) {
    throw new Error('Invalid snippet: trigger exceeds maximum length of 100 characters');
  }
  if (snippet.name.length > 200) {
    throw new Error('Invalid snippet: name exceeds maximum length of 200 characters');
  }
  if (snippet.content.length > 1000000) {
    throw new Error('Invalid snippet: content exceeds maximum size of 1MB');
  }
  return true;
}

function validateIndex(index) {
  if (!Number.isInteger(index) || index < 0 || index >= snippets.length) {
    throw new Error('Invalid snippet index');
  }
  return true;
}

// ============================================================================
// LOAD SNIPPETS AND ALLOWED APPS
// ============================================================================

function loadSnippets() {
  const backupFile = SNIPPETS_FILE + '.backup';
  try {
    if (fs.existsSync(SNIPPETS_FILE)) {
      const data = fs.readFileSync(SNIPPETS_FILE, 'utf-8');
      snippets = JSON.parse(data);
      
      // Ensure all snippets have new fields with defaults
      snippets = snippets.map(snippet => ({
        ...snippet,
        disabled: snippet.disabled || false,
        usage: snippet.usage || 0
      }));
      
      // Create backup on successful load
      try {
        fs.copyFileSync(SNIPPETS_FILE, backupFile);
      } catch (backupError) {
        console.warn('Failed to create backup:', backupError);
      }
      
      console.log(`Loaded ${snippets.length} snippets`);
    } else {
      snippets = [];
      saveSnippets();
    }
  } catch (error) {
    console.error('Error loading snippets:', error);
    
    // Try to restore from backup
    if (fs.existsSync(backupFile)) {
      try {
        const backupData = fs.readFileSync(backupFile, 'utf-8');
        snippets = JSON.parse(backupData);
        snippets = snippets.map(snippet => ({
          ...snippet,
          disabled: snippet.disabled || false,
          usage: snippet.usage || 0
        }));
        console.log('Restored snippets from backup');
        return;
      } catch (backupError) {
        console.error('Backup also corrupt:', backupError);
      }
    }
    
    snippets = [];
  }
}

// Save snippets to JSON file
function saveSnippets() {
  try {
    fs.writeFileSync(SNIPPETS_FILE, JSON.stringify(snippets, null, 2), 'utf-8');
    console.log('Snippets saved successfully');
    
    // Notify renderer that snippets were updated
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('snippets-updated');
    }
  } catch (error) {
    console.error('Error saving snippets:', error);
  }
}

// Load allowed apps from JSON file
function loadAllowedApps() {
  try {
    if (fs.existsSync(ALLOWED_APPS_FILE)) {
      const data = fs.readFileSync(ALLOWED_APPS_FILE, 'utf-8');
      ALLOWED_APPS = JSON.parse(data);
      console.log(`Loaded ${ALLOWED_APPS.length} allowed apps`);
    } else {
      // Initialize with default apps
      saveAllowedApps();
    }
  } catch (error) {
    console.error('Error loading allowed apps:', error);
    ALLOWED_APPS = ['chrome.exe', 'msedge.exe', 'firefox.exe', 'brave.exe', 'opera.exe', 'notepad.exe', 'code.exe'];
    saveAllowedApps();
  }
}

// Save allowed apps to JSON file
function saveAllowedApps() {
  try {
    fs.writeFileSync(ALLOWED_APPS_FILE, JSON.stringify(ALLOWED_APPS, null, 2), 'utf-8');
    console.log('Allowed apps saved successfully');
  } catch (error) {
    console.error('Error saving allowed apps:', error);
  }
}

// Load settings from JSON file
function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      const loadedSettings = JSON.parse(data);
      settings = { ...settings, ...loadedSettings };
      console.log(`Loaded settings: startupOnBoot = ${settings.startupOnBoot}`);
    } else {
      saveSettings();
    }
  } catch (error) {
    console.error('Error loading settings:', error);
    saveSettings();
  }
}

// Save settings to JSON file
function saveSettings() {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
    console.log('Settings saved successfully');
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

// Apply startup on boot setting
function applyStartupOnBoot() {
  try {
    if (settings.startupOnBoot) {
      app.setLoginItemSettings({
        openAtLogin: true,
        path: process.execPath,
        args: []
      });
      console.log('App set to start on boot');
    } else {
      app.setLoginItemSettings({
        openAtLogin: false
      });
      console.log('App removed from startup on boot');
    }
  } catch (error) {
    console.error('Error applying startup setting:', error);
  }
}

// Check if current active window is allowed
async function isAllowedApp() {
  try {
    if (!activeWin) {
      console.log('activeWin not loaded, allowing by default');
      return true;
    }
    
    const window = await activeWin();
    if (!window) {
      console.log('No active window detected');
      return false;
    }
    
    const appName = path.basename(window.owner.path).toLowerCase();
    console.log('Active app:', appName);
    
    const allowed = ALLOWED_APPS.some(allowedApp => appName.includes(allowedApp));
    return allowed;
  } catch (error) {
    console.error('Error checking active window:', error);
    return true;
  }
}

// Show notification
function showNotification(title, body) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('show-notification', { title, body });
  }
}

// Send keys using Windows SendKeys (PowerShell)
async function sendKeys(keys) {
  return new Promise((resolve, reject) => {
    const escapedKeys = keys.replace(/'/g, "''");
    
    const psScript = `
      Add-Type -AssemblyName System.Windows.Forms
      [System.Windows.Forms.SendKeys]::SendWait('${escapedKeys}')
    `;
    
    const ps = spawn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-NoLogo',
      '-Command',
      psScript
    ]);
    
    ps.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`PowerShell exited with code ${code}`));
      }
    });
    
    ps.on('error', reject);
  });
}

// Set clipboard with both HTML and plain text
function setClipboardContent(htmlContent, plainText) {
  clipboard.write({
    text: plainText || htmlContent.replace(/<[^>]*>/g, ''),
    html: htmlContent
  });
}

// Strip HTML tags to get plain text
function stripHtmlTags(html) {
  const tmp = html
    .replace(/<p>/gi, '')
    .replace(/<\/p>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  
  return tmp.trim();
}

// Expand snippet by replacing trigger with content
async function expandSnippet(snippet) {
  try {
    if (isExpanding) return;
    isExpanding = true;
    
    console.log(`\n=== EXPANDING SNIPPET ===`);
    console.log(`Trigger: "${snippet.trigger}"`);
    console.log(`Name: ${snippet.name}`);
    console.log(`Content length: ${snippet.content.length} chars`);
    console.log(`Rich Text: ${snippet.richText}`);
    
    // FEATURE 3: Send usage tracking event
    mainWindow.webContents.send('snippet-used', snippet.trigger);
    
    // Step 1: Erase the trigger text
    const triggerLength = snippet.trigger.length;
    console.log(`Erasing ${triggerLength} characters...`);
    
    const backspaces = '{BACKSPACE}'.repeat(triggerLength);
    await sendKeys(backspaces);
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Step 2: Insert the snippet content
    console.log('Preparing clipboard content...');
    
    let originalText = '';
    let originalHtml = '';
    try {
      originalText = clipboard.readText();
      originalHtml = clipboard.readHTML();
    } catch (error) {
      console.warn('Failed to read clipboard:', error);
      // Continue with empty values
    }
    
    if (snippet.richText) {
      const htmlWithImages = await loadImagesInHtml(snippet.content);
      
      console.log('Setting rich text (HTML) to clipboard...');
      
      clipboard.write({
        text: stripHtmlTags(htmlWithImages),
        html: htmlWithImages
      });
      
    } else {
      console.log('Setting plain text to clipboard...');
      clipboard.writeText(snippet.content);
    }
    
    await new Promise(resolve => setTimeout(resolve, 50));
    
    console.log('Pasting content...');
    await sendKeys('^v');
    
    setTimeout(() => {
      if (originalHtml) {
        clipboard.write({
          text: originalText,
          html: originalHtml
        });
      } else {
        clipboard.writeText(originalText || '');
      }
      console.log('Original clipboard restored');
    }, 1000);
    
    console.log('✓ Snippet expanded successfully!');
    
    showNotification('Snippet Expanded!', `"${snippet.trigger}" → ${snippet.name}`);
    
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.executeJavaScript(`
        console.log('%c✓ SNIPPET AUTO-REPLACED', 'color: green; font-weight: bold; font-size: 14px');
        console.log('Trigger: "${snippet.trigger}" → "${snippet.name}"');
        console.log('Rich Text: ${snippet.richText}');
      `);
    }
    
    setTimeout(() => {
      isExpanding = false;
    }, 500);
    
  } catch (error) {
    console.error('Error expanding snippet:', error);
    showNotification('Error', 'Failed to expand snippet: ' + error.message);
    isExpanding = false;
  }
}

// Start global keyboard listener
function startKeyboardListener() {
  if (keyboardListener) {
    console.log('Keyboard listener already running');
    return;
  }
  
  keyboardListener = new GlobalKeyboardListener();
  
  console.log('\n=== KEYBOARD LISTENER STARTED ===');
  console.log('Monitoring for triggers in allowed apps...');
  console.log('Allowed apps:', ALLOWED_APPS.join(', '));
  
  keyboardListener.addListener(async (e, down) => {
    try {
      // Only process key down events
      if (e.state !== 'DOWN') return;
      
      // Skip if we're currently expanding
      if (isExpanding) return;

      // FEATURE 5: Check if triggers are disabled
      if (triggersDisabled) {
        return;
      }

      // FEATURE 2: Check if we're in a password field
      const activeWindow = await getActiveWindow();
      if (await isPasswordField(activeWindow)) {
        return;
      }
      
      // Check if we're in an allowed app
      const allowed = await isAllowedApp();
      if (!allowed) {
        if (typedBuffer.length > 0) {
          console.log('Left allowed app, clearing buffer');
          typedBuffer = '';
        }
        return;
      }
      
      // Handle different key types
      if (e.name && e.name.length === 1) {
        typedBuffer += e.name;
        console.log(`Buffer: "${typedBuffer}"`);
      } else if (e.name === 'SPACE') {
        typedBuffer += ' ';
        console.log(`Buffer: "${typedBuffer}"`);
      } else if (e.name === 'SEMICOLON' || e.name === ';') {
        typedBuffer += ';';
        console.log(`Buffer: "${typedBuffer}"`);
      } else if (e.name === 'RETURN' || e.name === 'ENTER') {
        console.log('Enter pressed, clearing buffer');
        typedBuffer = '';
        return;
      } else if (e.name === 'TAB') {
        console.log('Tab pressed, clearing buffer');
        typedBuffer = '';
        return;
      } else if (e.name === 'BACKSPACE' || e.name === 'BACK SPACE') {
        typedBuffer = typedBuffer.slice(0, -1);
        console.log(`Backspace - Buffer: "${typedBuffer}"`);
        return;
      } else {
        return;
      }
      
      // Limit buffer size
      if (typedBuffer.length > 100) {
        typedBuffer = typedBuffer.slice(-50);
      }
      
      // Check if buffer ends with any snippet trigger
      for (const snippet of snippets) {
        // FEATURE 1: Skip if snippet is disabled
        if (snippet.disabled) {
          continue;
        }
        
        if (typedBuffer.toLowerCase().endsWith(snippet.trigger.toLowerCase())) {
          console.log(`\n*** TRIGGER MATCHED: ${snippet.trigger} ***`);
          
          typedBuffer = '';
          
          await expandSnippet(snippet);
          break;
        }
      }
    } catch (error) {
      console.error('Keyboard listener error:', error);
      // Reset state to safe defaults to prevent listener from breaking
      typedBuffer = '';
    }
  });
  
  console.log('=== Listener Active ===\n');
}

// Stop keyboard listener
function stopKeyboardListener() {
  if (keyboardListener) {
    keyboardListener.kill();
    keyboardListener = null;
    console.log('Keyboard listener stopped');
  }
}

// Create main window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    backgroundColor: '#0078d4',
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    icon: path.join(__dirname, 'icon.png')
  });
  
  mainWindow.loadFile('index.html');
  
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
  
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Main window loaded');
    mainWindow.webContents.executeJavaScript(`
      console.log('%c=== EXPANDIFY READY ===', 'color: blue; font-weight: bold; font-size: 16px');
      console.log('Loaded ${snippets.length} snippets');
      console.log('Triggers:', ${JSON.stringify(snippets.map(s => s.trigger))});
      console.log('Try typing a trigger in an allowed app (browser, notepad, VS Code)');
    `);
  });
}

// Create system tray
function createTray() {
  // Try .ico first, then .png as fallback
  let iconPath = path.join(__dirname, 'icon.ico');
  if (!fs.existsSync(iconPath)) {
    iconPath = path.join(__dirname, 'icon.png');
  }
  
  if (!fs.existsSync(iconPath)) {
    console.error('ERROR: No icon file found (icon.ico or icon.png). Tray will not be created!');
    console.error('This will cause the app to run in background without user visibility.');
    return;
  }
  
  try {
    tray = new Tray(iconPath);
    console.log('✓ System tray created successfully with icon from:', iconPath);
    
    const contextMenu = Menu.buildFromTemplate([
      {
        label: `Expandify (${snippets.length} snippets)`,
        enabled: false
      },
      { type: 'separator' },
      {
        label: 'Show Snippets',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          } else {
            createWindow();
          }
        }
      },
      {
        label: 'Reload Snippets',
        click: () => {
          loadSnippets();
          if (mainWindow) {
            mainWindow.webContents.send('snippets-updated', snippets);
          }
          console.log('Snippets reloaded');
        }
      },
      {
        label: 'Test Keyboard Listener',
        click: () => {
          console.log('\n=== LISTENER STATUS ===');
          console.log('Active:', keyboardListener !== null);
          console.log('Buffer:', typedBuffer);
          console.log('Snippets:', snippets.length);
          console.log('Triggers disabled:', triggersDisabled);
        }
      },
      {
        label: 'View Logs',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
            mainWindow.webContents.openDevTools();
          } else {
            createWindow();
            mainWindow.webContents.openDevTools();
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.isQuitting = true;
          app.quit();
        }
      }
    ]);
    
    tray.setToolTip('Expandify - Double-click to open');
    tray.setContextMenu(contextMenu);
    
    tray.on('double-click', () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      } else {
        createWindow();
      }
    });
  } catch (error) {
    console.error('CRITICAL ERROR: Could not create tray:', error);
    console.error('The app will run in background without being accessible!');
  }
}

// ============================================================================
// IPC HANDLERS
// ============================================================================

ipcMain.handle('get-snippets', () => {
  return snippets;
});

ipcMain.handle('open-external-link', async (event, url) => {
  try {
    await shell.openExternal(url);
    return true;
  } catch (error) {
    console.error('Error opening external link:', error);
    throw error;
  }
});

// FEATURE 5: Handle toggle triggers
ipcMain.on('toggle-triggers', (event, disabled) => {
  triggersDisabled = disabled;
  console.log(`Triggers ${disabled ? 'DISABLED' : 'ENABLED'}`);
  
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (disabled) {
      mainWindow.webContents.send('show-notification', {
        title: '⚠️ Expansion Disabled',
        body: 'Triggers will not work while disabled.'
      });
    } else {
      mainWindow.webContents.send('show-notification', {
        title: '✓ Expansion Enabled',
        body: 'Triggers are now active.'
      });
    }
  }
});

ipcMain.handle('add-snippet', async (event, snippet) => {
  try {
    // Validate input
    validateSnippet(snippet);
    
    // Ensure new fields have defaults
    const newSnippet = {
      ...snippet,
      disabled: snippet.disabled || false,
      usage: snippet.usage || 0
    };
    
    // Process images in rich text content
    if (newSnippet.richText && newSnippet.content) {
      newSnippet.content = await processImagesInHtml(newSnippet.content);
    }
    
    snippets.push(newSnippet);
    await saveSnippets();
    console.log(`Added snippet: ${newSnippet.trigger} -> ${newSnippet.name}`);
    return true;
  } catch (error) {
    console.error('Error adding snippet:', error);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('show-notification', {
        title: '❌ Error',
        body: 'Failed to add snippet: ' + error.message
      });
    }
    throw error;
  }
});

ipcMain.handle('update-snippet', async (event, index, snippet) => {
  try {
    validateIndex(index);
    validateSnippet(snippet);
    
    // Preserve existing usage and disabled state if not provided
    const existingSnippet = snippets[index] || {};
    
    const updatedSnippet = {
      ...snippet,
      disabled: snippet.disabled !== undefined ? snippet.disabled : existingSnippet.disabled || false,
      usage: snippet.usage !== undefined ? snippet.usage : existingSnippet.usage || 0
    };
    
    // Process images in rich text content
    if (updatedSnippet.richText && updatedSnippet.content) {
      updatedSnippet.content = await processImagesInHtml(updatedSnippet.content);
    }
    
    snippets[index] = updatedSnippet;
    await saveSnippets();
    return true;
  } catch (error) {
    console.error('Error updating snippet:', error);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('show-notification', {
        title: '❌ Error',
        body: 'Failed to update snippet: ' + error.message
      });
    }
    throw error;
  }
});

ipcMain.handle('delete-snippet', (event, index) => {
  try {
    validateIndex(index);
    
    const deleted = snippets[index];
    
    // Clean up associated images
    if (deleted.richText && deleted.content) {
      cleanupImagesFromHtml(deleted.content);
    }
    
    snippets.splice(index, 1);
    saveSnippets();
    console.log(`Deleted snippet: ${deleted.trigger} -> ${deleted.name}`);
    return true;
  } catch (error) {
    console.error('Error deleting snippet:', error);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('show-notification', {
        title: '❌ Error',
        body: 'Failed to delete snippet: ' + error.message
      });
    }
    return false;
  }
});;

// ============================================================================
// ALLOWED APPS HANDLERS
// ============================================================================

ipcMain.handle('get-allowed-apps', () => {
  return ALLOWED_APPS;
});

ipcMain.handle('add-allowed-app', (event, appPath) => {
  const appName = path.basename(appPath).toLowerCase();
  
  // Avoid duplicates
  if (!ALLOWED_APPS.includes(appName)) {
    ALLOWED_APPS.push(appName);
    saveAllowedApps();
    console.log(`Added allowed app: ${appName}`);
  }
  
  return true;
});

ipcMain.handle('remove-allowed-app', (event, appPath) => {
  const appName = path.basename(appPath).toLowerCase();
  const index = ALLOWED_APPS.indexOf(appName);
  
  if (index >= 0) {
    ALLOWED_APPS.splice(index, 1);
    saveAllowedApps();
    console.log(`Removed allowed app: ${appName}`);
  }
  
  return true;
});

ipcMain.handle('browse-for-app', async (event) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select an Application Executable',
    defaultPath: 'C:\\Program Files',
    filters: [
      { name: 'Applications', extensions: ['exe'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return path.basename(result.filePaths[0]);
  }
  
  return null;
});

// ============================================================================
// SETTINGS HANDLERS
// ============================================================================

ipcMain.handle('get-startup-on-boot', () => {
  return settings.startupOnBoot;
});

ipcMain.handle('toggle-startup-on-boot', async (event, enabled) => {
  settings.startupOnBoot = enabled;
  saveSettings();
  applyStartupOnBoot();
  
  console.log(`Startup on boot ${enabled ? 'ENABLED' : 'DISABLED'}`);
  
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('show-notification', {
      title: '✓ Setting Updated',
      body: `App will ${enabled ? 'start' : 'not start'} on boot.`
    });
  }
  
  return true;
});

// ============================================================================
// IMAGE PROCESSING FUNCTIONS
// ============================================================================

// Process images in HTML: convert base64 to files
async function processImagesInHtml(html) {
  const imgRegex = /<img[^>]+src="([^"]+)"[^>]*>/g;
  let match;
  let processedHtml = html;
  
  while ((match = imgRegex.exec(html)) !== null) {
    const imgTag = match[0];
    const src = match[1];
    
    // Only process base64 images
    if (src.startsWith('data:image/')) {
      try {
        const imagePath = await saveBase64Image(src);
        const newImgTag = imgTag.replace(src, `file:///${imagePath.replace(/\\/g, '/')}`);
        processedHtml = processedHtml.replace(imgTag, newImgTag);
        console.log(`Saved image to: ${imagePath}`);
      } catch (error) {
        console.error('Error processing image:', error);
      }
    }
  }
  
  return processedHtml;
}

// Save base64 image as JPEG file
async function saveBase64Image(base64Data) {
  const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB limit
  
  const matches = base64Data.match(/^data:image\/([^;]+);base64,(.+)$/);
  if (!matches) {
    throw new Error('Invalid base64 image data');
  }
  
  const base64Content = matches[2];
  const buffer = Buffer.from(base64Content, 'base64');
  
  if (buffer.length > MAX_IMAGE_SIZE) {
    throw new Error(`Image exceeds maximum size of ${MAX_IMAGE_SIZE / 1024 / 1024}MB`);
  }
  
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  const filename = `img_${timestamp}_${random}.jpg`;
  const filepath = path.join(IMAGES_DIR, filename);
  
  try {
    fs.writeFileSync(filepath, buffer);
  } catch (error) {
    console.error('Error writing image file:', error);
    throw new Error('Failed to save image: ' + error.message);
  }
  
  return filepath;
}

// Clean up images from deleted snippet
function cleanupImagesFromHtml(html) {
  const imgRegex = /<img[^>]+src="file:\/\/\/([^"]+)"[^>]*>/g;
  let match;
  
  while ((match = imgRegex.exec(html)) !== null) {
    const filepath = match[1].replace(/\//g, '\\');
    try {
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
        console.log(`Deleted image: ${filepath}`);
      }
    } catch (error) {
      console.error('Error deleting image:', error);
    }
  }
}

// Load images from file paths and convert to base64 for clipboard
async function loadImagesInHtml(html) {
  const imgRegex = /<img[^>]+src="file:\/\/\/([^"]+)"[^>]*>/g;
  let match;
  let loadedHtml = html;
  
  while ((match = imgRegex.exec(html)) !== null) {
    const imgTag = match[0];
    const filepath = match[1].replace(/\//g, '\\');
    
    try {
      if (!fs.existsSync(filepath)) {
        console.warn(`Image file not found: ${filepath}`);
        continue;
      }
      
      const buffer = fs.readFileSync(filepath);
      const base64 = buffer.toString('base64');
      const mimeType = 'image/jpeg';
      const base64Data = `data:${mimeType};base64,${base64}`;
      
      const newImgTag = imgTag.replace(`file:///${match[1]}`, base64Data);
      loadedHtml = loadedHtml.replace(imgTag, newImgTag);
    } catch (error) {
      console.error('Error loading image:', filepath, error);
      // Skip this image, continue with others
    }
  }
  
  return loadedHtml;
}

// ============================================================================
// APP LIFECYCLE
// ============================================================================

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
});

// Prevent multiple instances of the app
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, we should focus our window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(async () => {
  console.log('\n╔════════════════════════════════════╗');
  console.log('║   EXPANDIFY STARTING...           ║');
  console.log('╚════════════════════════════════════╝\n');
  
  // Remove default Electron menu
  Menu.setApplicationMenu(null);
  
  // Load active-win module
  await loadActiveWin();
  
  // Load snippets, allowed apps, and settings
  loadSnippets();
  loadAllowedApps();
  loadSettings();
  applyStartupOnBoot();
  
  console.log(`Loaded ${snippets.length} snippets:`);
  snippets.forEach(s => console.log(`  - "${s.trigger}" → ${s.name}`));
  
  console.log(`Allowed apps: ${ALLOWED_APPS.join(', ')}`);
  
  // Create window and tray
  createWindow();
  createTray();
  
  // Start keyboard listener
  startKeyboardListener();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Don't quit when all windows are closed
app.on('window-all-closed', () => {
  // Keep running in background
});

// Clean up on quit
app.on('before-quit', () => {
  app.isQuitting = true;
  stopKeyboardListener();
});

app.on('will-quit', () => {
  stopKeyboardListener();
});