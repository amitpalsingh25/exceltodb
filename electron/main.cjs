const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fsSync = require('fs');
const fs = require('fs/promises');
const XLSX = require('xlsx');
const mysql = require('mysql2/promise');
const { autoUpdater } = require('electron-updater');

const SETTINGS_FILE = 'settings.json';
const DEFAULT_SETTINGS = {
  passcode: '1234',
  dbConfig: {
    host: '',
    port: '3306',
    user: '',
    password: '',
    database: '',
    table: '',
  },
  uiConfig: {
    authBackgroundType: 'gradient',
    authGradient: 'linear-gradient(135deg, #0f172a 0%, #1d4ed8 45%, #22d3ee 100%)',
    authImageDataUrl: '',
    headingColor: '#111827',
    buttonColor: '#2563eb',
    buttonTextColor: '#ffffff',
    updateRepo: 'amitpalsingh25/exceltodb',
  },
};

const devServerUrl = process.env.VITE_DEV_SERVER_URL;
let mainWindow;
let updateState = {
  phase: 'idle',
  text: '',
  currentVersion: '',
  latestVersion: '',
  updateAvailable: false,
  downloadPercent: 0,
  releaseUrl: '',
  downloaded: false,
};

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception in main process:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection in main process:', reason);
});

function getSettingsPath() {
  return path.join(app.getPath('userData'), SETTINGS_FILE);
}

async function readSettings() {
  try {
    const raw = await fs.readFile(getSettingsPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      dbConfig: {
        ...DEFAULT_SETTINGS.dbConfig,
        ...(parsed.dbConfig || {}),
      },
      uiConfig: sanitizeUiConfig({
        ...DEFAULT_SETTINGS.uiConfig,
        ...(parsed.uiConfig || {}),
      }),
    };
  } catch {
    return {
      ...DEFAULT_SETTINGS,
      dbConfig: { ...DEFAULT_SETTINGS.dbConfig },
      uiConfig: { ...DEFAULT_SETTINGS.uiConfig },
    };
  }
}

async function writeSettings(settings) {
  await fs.writeFile(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf8');
}

function sanitizeDbConfig(input = {}) {
  return {
    host: String(input.host || '').trim(),
    port: String(input.port || '3306').trim(),
    user: String(input.user || '').trim(),
    password: String(input.password || ''),
    database: String(input.database || '').trim(),
    table: String(input.table || '').trim(),
  };
}

function sanitizeUiConfig(input = {}) {
  const type = input.authBackgroundType === 'image' ? 'image' : 'gradient';
  return {
    authBackgroundType: type,
    authGradient: String(input.authGradient || DEFAULT_SETTINGS.uiConfig.authGradient).trim(),
    authImageDataUrl: String(input.authImageDataUrl || ''),
    headingColor: String(input.headingColor || DEFAULT_SETTINGS.uiConfig.headingColor),
    buttonColor: String(input.buttonColor || DEFAULT_SETTINGS.uiConfig.buttonColor),
    buttonTextColor: String(input.buttonTextColor || DEFAULT_SETTINGS.uiConfig.buttonTextColor),
    updateRepo: String(input.updateRepo || DEFAULT_SETTINGS.uiConfig.updateRepo).trim(),
  };
}

function ensureRequiredDbConfig(config) {
  const missing = ['host', 'port', 'user', 'database', 'table'].filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(`Missing DB fields: ${missing.join(', ')}`);
  }
}

function ensureRequiredDbConfigForTest(config) {
  const missing = ['host', 'port', 'user', 'database'].filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(`Missing DB fields: ${missing.join(', ')}`);
  }
}

function getErrorMessage(error) {
  if (!error) {
    return 'Unknown error';
  }
  if (typeof error === 'string') {
    return error;
  }
  return error.message || 'Unknown error';
}

function getUpdaterErrorMessage(error) {
  const raw = getErrorMessage(error);
  const lower = raw.toLowerCase();
  if (lower.includes('cannot parse releases feed') || lower.includes('unable to find latest version on github') || lower.includes('406')) {
    return 'Update source is not valid. Publish a non-draft GitHub Release with latest.yml, Setup .exe, and .exe.blockmap assets.';
  }
  if (lower.includes('404') || lower.includes('latest release') || lower.includes('cannot find channel') || lower.includes('latest.yml')) {
    return 'No published update metadata found. Upload latest.yml, Setup .exe, and .exe.blockmap to the latest GitHub Release.';
  }
  return raw;
}

function sanitizeUpdateRepo(repoInput) {
  const fallback = DEFAULT_SETTINGS.uiConfig.updateRepo;
  const raw = String(repoInput || '').trim();
  if (!raw) {
    return fallback;
  }

  const withoutPrefix = raw.replace(/^https?:\/\/github\.com\//i, '').replace(/^github\.com\//i, '').replace(/\/+$/, '');
  const parts = withoutPrefix.split('/').filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]}/${parts[1]}`;
  }

  return fallback;
}

async function configureAutoUpdaterFeed() {
  const settings = await readSettings();
  const repo = sanitizeUpdateRepo(settings?.uiConfig?.updateRepo);
  const feedUrl = `https://github.com/${repo}/releases/latest/download`;
  autoUpdater.requestHeaders = {
    Accept: '*/*',
    'User-Agent': 'KCS-Excel-to-DB-Updater',
  };
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: feedUrl,
    channel: 'latest',
  });
  setUpdateState({
    releaseUrl: `https://github.com/${repo}/releases/latest`,
  });
}

function normalizeVersion(version) {
  return String(version || '')
    .trim()
    .replace(/^v/i, '');
}

function compareVersions(a, b) {
  const aParts = normalizeVersion(a).split('.').map((n) => Number.parseInt(n, 10) || 0);
  const bParts = normalizeVersion(b).split('.').map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i += 1) {
    const av = aParts[i] || 0;
    const bv = bParts[i] || 0;
    if (av > bv) {
      return 1;
    }
    if (av < bv) {
      return -1;
    }
  }
  return 0;
}

function broadcastUpdateState() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send('app:update-status', updateState);
}

function setUpdateState(partial) {
  updateState = {
    ...updateState,
    ...partial,
    currentVersion: normalizeVersion(app.getVersion()),
  };
  broadcastUpdateState();
}

async function initializeAutoUpdater() {
  if (!app.isPackaged) {
    return;
  }

  await configureAutoUpdaterFeed();
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    setUpdateState({
      phase: 'checking',
      text: 'Checking for updates...',
      error: '',
      downloaded: false,
      downloadPercent: 0,
    });
  });

  autoUpdater.on('update-available', (info) => {
    setUpdateState({
      phase: 'available',
      text: `Update available: v${normalizeVersion(info?.version)} (current v${normalizeVersion(app.getVersion())})`,
      latestVersion: normalizeVersion(info?.version),
      updateAvailable: true,
      releaseUrl: info?.releaseNotesUrl || '',
      downloaded: false,
      downloadPercent: 0,
    });
  });

  autoUpdater.on('update-not-available', () => {
    setUpdateState({
      phase: 'up-to-date',
      text: `You are up to date (v${normalizeVersion(app.getVersion())}).`,
      latestVersion: normalizeVersion(app.getVersion()),
      updateAvailable: false,
      downloaded: false,
      downloadPercent: 0,
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    setUpdateState({
      phase: 'downloading',
      text: `Downloading update... ${Math.round(progress?.percent || 0)}%`,
      downloadPercent: Number(progress?.percent || 0),
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    setUpdateState({
      phase: 'downloaded',
      text: `Update downloaded (v${normalizeVersion(info?.version)}). Restart to install.`,
      latestVersion: normalizeVersion(info?.version),
      updateAvailable: true,
      downloaded: true,
      downloadPercent: 100,
    });
  });

  autoUpdater.on('error', (error) => {
    const message = getUpdaterErrorMessage(error);
    setUpdateState({
      phase: 'error',
      text: `Update failed: ${message}`,
      error: message,
    });
  });
}

async function withDbConnection(dbConfig, callback) {
  const config = sanitizeDbConfig(dbConfig);
  ensureRequiredDbConfig(config);
  const portNum = Number(config.port);

  if (!Number.isFinite(portNum) || portNum <= 0) {
    throw new Error('Port must be a valid number.');
  }

  const connection = await mysql.createConnection({
    host: config.host,
    port: portNum,
    user: config.user,
    password: config.password,
    database: config.database,
    connectTimeout: 15000,
  });

  try {
    return await callback(connection, config);
  } finally {
    await connection.end();
  }
}

function createWindow() {
  const candidateIcons = app.isPackaged
    ? [path.join(process.resourcesPath, 'icon.ico'), path.join(process.resourcesPath, 'KCS-Icon.png')]
    : [path.join(__dirname, '..', 'build', 'icon.ico'), path.join(__dirname, '..', 'KCS-Icon.png')];
  const windowIconPath = candidateIcons.find((iconPath) => fsSync.existsSync(iconPath));

  mainWindow = new BrowserWindow({
    title: 'KCS Excel to DB',
    width: 1300,
    height: 800,
    icon: windowIconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (windowIconPath) {
    mainWindow.setIcon(windowIconPath);
  }

  mainWindow.webContents.on('did-finish-load', () => {
    broadcastUpdateState();
  });

  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

function sendNavigate(page) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send('app:navigate', { page });
}

function createAppMenu() {
  const template = [
    {
      label: 'File',
      submenu: [{ role: 'quit' }],
    },
    {
      label: 'Edit',
      submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }],
    },
    {
      label: 'View',
      submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }],
    },
    {
      label: 'Importer',
      click: () => sendNavigate('importer'),
    },
    {
      label: 'Settings',
      click: () => sendNavigate('settings'),
    },
    {
      label: 'Edit Records',
      click: () => sendNavigate('edit-records'),
    },
    {
      label: 'Help',
      click: () => shell.openExternal('https://woocoders.com/'),
    },
    {
      label: 'Logout',
      click: () => sendNavigate('logout'),
    },
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(async () => {
  app.setName('KCS Excel to DB');
  app.setAppUserModelId('com.woocoders.kcsexceltodb');
  setUpdateState({
    phase: 'idle',
    text: '',
    currentVersion: normalizeVersion(app.getVersion()),
    latestVersion: '',
    updateAvailable: false,
    downloadPercent: 0,
    releaseUrl: '',
    downloaded: false,
  });
  await initializeAutoUpdater();
  createAppMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('settings:get', async () => {
  const settings = await readSettings();
  return {
    passcodeSet: Boolean(settings.passcode),
    dbConfig: settings.dbConfig,
    uiConfig: settings.uiConfig,
    appVersion: app.getVersion(),
  };
});

ipcMain.handle('auth:validate-passcode', async (_event, passcode) => {
  const settings = await readSettings();
  return String(passcode || '') === String(settings.passcode || '');
});

ipcMain.handle('settings:set-passcode', async (_event, passcode) => {
  const value = String(passcode || '').trim();
  if (!value) {
    throw new Error('Passcode cannot be empty.');
  }

  const settings = await readSettings();
  settings.passcode = value;
  await writeSettings(settings);
  return true;
});

ipcMain.handle('db:save-config', async (_event, dbConfig) => {
  const config = sanitizeDbConfig(dbConfig);
  const settings = await readSettings();
  settings.dbConfig = config;
  await writeSettings(settings);
  return settings.dbConfig;
});

ipcMain.handle('settings:save-ui-config', async (_event, uiConfig) => {
  const settings = await readSettings();
  settings.uiConfig = sanitizeUiConfig(uiConfig);
  await writeSettings(settings);
  if (app.isPackaged) {
    try {
      await configureAutoUpdaterFeed();
    } catch (error) {
      console.error('Failed to reconfigure updater feed:', error);
    }
  }
  return settings.uiConfig;
});

ipcMain.handle('db:test-connection', async (_event, dbConfig) => {
  try {
    const config = sanitizeDbConfig(dbConfig);
    ensureRequiredDbConfigForTest(config);
    const portNum = Number(config.port);

    if (!Number.isFinite(portNum) || portNum <= 0) {
      return { success: false, error: 'Port must be a valid number.' };
    }

    const connection = await mysql.createConnection({
      host: config.host,
      port: portNum,
      user: config.user,
      password: config.password,
      database: config.database,
      connectTimeout: 15000,
    });

    try {
      await connection.query('SELECT 1');
      return { success: true };
    } finally {
      await connection.end();
    }
  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }
});

ipcMain.handle('db:get-table-columns', async (_event, dbConfig) => {
  try {
    return await withDbConnection(dbConfig, async (connection, config) => {
      const escapedTable = mysql.escapeId(config.table);
      const [rows] = await connection.query(`SHOW COLUMNS FROM ${escapedTable}`);
      const columns = rows.map((row) => row.Field).filter(Boolean);
      return { success: true, columns };
    });
  } catch (error) {
    return { success: false, error: getErrorMessage(error), columns: [] };
  }
});

ipcMain.handle('db:fetch-table-records', async (_event, dbConfig) => {
  try {
    return await withDbConnection(dbConfig, async (connection, config) => {
      const escapedTable = mysql.escapeId(config.table);
      const [columnRows] = await connection.query(`SHOW COLUMNS FROM ${escapedTable}`);
      const columns = columnRows.map((row) => row.Field).filter(Boolean);
      const primaryKeyColumn =
        columnRows.find((row) => row.Key === 'PRI')?.Field ||
        (columns.includes('ID') ? 'ID' : columns[0] || '');
      const primaryKeyMeta = columnRows.find((row) => row.Field === primaryKeyColumn);
      const primaryKeyAutoIncrement = String(primaryKeyMeta?.Extra || '').toLowerCase().includes('auto_increment');
      const columnMeta = columnRows.map((row) => ({
        name: row.Field,
        isPrimary: row.Key === 'PRI',
        isAutoIncrement: String(row.Extra || '').toLowerCase().includes('auto_increment'),
      }));

      const [rows] = await connection.query(`SELECT * FROM ${escapedTable}`);
      return {
        success: true,
        columns,
        columnMeta,
        primaryKeyColumn,
        primaryKeyAutoIncrement,
        rows,
      };
    });
  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error),
      columns: [],
      columnMeta: [],
      primaryKeyColumn: '',
      primaryKeyAutoIncrement: false,
      rows: [],
    };
  }
});

ipcMain.handle('db:update-table-row', async (_event, payload) => {
  const { dbConfig, row, primaryKeyColumn, originalPrimaryValue } = payload || {};

  if (!row || typeof row !== 'object') {
    return { success: false, error: 'Row payload is missing.' };
  }

  if (!primaryKeyColumn) {
    return { success: false, error: 'Primary key column is required for updates.' };
  }

  try {
    return await withDbConnection(dbConfig, async (connection, config) => {
      const columns = Object.keys(row).filter((key) => key && key !== primaryKeyColumn);
      if (columns.length === 0) {
        return { success: false, error: 'No editable fields found in row.' };
      }

      const values = columns.map((key) => {
        const value = row[key];
        if (value === null || value === undefined) {
          return null;
        }
        if (typeof value === 'object') {
          return JSON.stringify(value);
        }
        return value;
      });

      const escapedTable = mysql.escapeId(config.table);
      const assignments = columns.map((col) => `${mysql.escapeId(col)} = ?`).join(', ');
      const sql = `UPDATE ${escapedTable} SET ${assignments} WHERE ${mysql.escapeId(primaryKeyColumn)} = ?`;
      const [result] = await connection.execute(sql, [...values, originalPrimaryValue]);

      return {
        success: true,
        affectedRows: result.affectedRows,
      };
    });
  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }
});

ipcMain.handle('ui:pick-auth-image', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose background image',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const filePath = result.filePaths[0];
  const ext = path.extname(filePath).toLowerCase();
  const mime =
    ext === '.png'
      ? 'image/png'
      : ext === '.webp'
        ? 'image/webp'
        : ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : 'application/octet-stream';
  const buffer = await fs.readFile(filePath);
  const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`;
  return { canceled: false, dataUrl };
});

ipcMain.handle('excel:pick-and-read', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose Excel file',
    properties: ['openFile'],
    filters: [{ name: 'Excel', extensions: ['xlsx', 'xls', 'csv'] }],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const filePath = result.filePaths[0];
  const workbook = XLSX.readFile(filePath, { raw: false });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new Error('Workbook does not have any sheet.');
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];

  return {
    canceled: false,
    filePath,
    sheetName: firstSheetName,
    columns,
    rows,
  };
});

ipcMain.handle('app:open-help-link', async () => {
  await shell.openExternal('https://woocoders.com/');
  return true;
});

ipcMain.handle('app:check-updates', async (_event, payload) => {
  if (app.isPackaged) {
    try {
      await configureAutoUpdaterFeed();
      await autoUpdater.checkForUpdates();
      return { success: true, ...updateState };
    } catch (error) {
      const message = getUpdaterErrorMessage(error);
      setUpdateState({
        phase: 'error',
        text: `Update failed: ${message}`,
        error: message,
      });
      return { success: false, error: message, ...updateState };
    }
  }

  try {
    const repo = String(payload?.repo || '').trim();
    if (!repo) {
      return {
        success: false,
        error: 'GitHub repo is not configured. Format: owner/repo',
      };
    }

    const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github+json',
      },
    });

    const currentVersion = normalizeVersion(app.getVersion());

    if (response.status === 404) {
      const tagsResponse = await fetch(`https://api.github.com/repos/${repo}/tags?per_page=20`, {
        headers: {
          Accept: 'application/vnd.github+json',
        },
      });

      if (!tagsResponse.ok) {
        return {
          success: false,
          error: `Could not fetch tags (${tagsResponse.status}).`,
        };
      }

      const tags = await tagsResponse.json();
      const versions = (tags || [])
        .map((tag) => normalizeVersion(tag?.name || ''))
        .filter(Boolean)
        .sort((a, b) => compareVersions(b, a));

      const latestVersion = versions[0];
      if (!latestVersion) {
        return {
          success: false,
          error: 'No release/tag versions found in this repo.',
        };
      }

      return {
        success: true,
        currentVersion,
        latestVersion,
        updateAvailable: compareVersions(latestVersion, currentVersion) > 0,
        releaseUrl: `https://github.com/${repo}/releases/tag/v${latestVersion}`,
      };
    }

    if (!response.ok) {
      return {
        success: false,
        error: `Could not fetch latest release (${response.status}).`,
      };
    }

    const latest = await response.json();
    const latestVersion = normalizeVersion(latest.tag_name || latest.name || '');

    if (!latestVersion) {
      return {
        success: false,
        error: 'Latest release tag/version is empty.',
      };
    }

    return {
      success: true,
      currentVersion,
      latestVersion,
      updateAvailable: compareVersions(latestVersion, currentVersion) > 0,
      releaseUrl: latest.html_url || '',
    };
  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error),
    };
  }
});

ipcMain.handle('app:get-update-state', async () => ({ ...updateState }));

ipcMain.handle('app:download-update', async () => {
  if (!app.isPackaged) {
    return { success: false, error: 'Updater is only available in installed app.' };
  }

  try {
    await configureAutoUpdaterFeed();
    setUpdateState({
      phase: 'downloading',
      text: 'Downloading update...',
      downloadPercent: 0,
    });
    await autoUpdater.downloadUpdate();
    return { success: true, ...updateState };
  } catch (error) {
    const message = getUpdaterErrorMessage(error);
    setUpdateState({
      phase: 'error',
      text: `Update download failed: ${message}`,
      error: message,
    });
    return { success: false, error: message, ...updateState };
  }
});

ipcMain.handle('app:install-update', async () => {
  if (!app.isPackaged) {
    return { success: false, error: 'Updater is only available in installed app.' };
  }

  setUpdateState({
    phase: 'installing',
    text: 'Installing update and restarting...',
  });
  setImmediate(() => autoUpdater.quitAndInstall(false, true));
  return { success: true };
});

ipcMain.handle('db:insert-row', async (_event, payload) => {
  const { dbConfig, row } = payload || {};

  if (!row || typeof row !== 'object') {
    throw new Error('Row payload is missing.');
  }

  return withDbConnection(dbConfig, async (connection, config) => {
    const columns = Object.keys(row).filter((key) => key && row[key] !== undefined);

    if (columns.length === 0) {
      throw new Error('Row has no valid columns.');
    }

    const values = columns.map((key) => {
      const value = row[key];
      if (value === null || value === undefined) {
        return null;
      }
      if (typeof value === 'object') {
        return JSON.stringify(value);
      }
      return value;
    });
    const escapedTable = mysql.escapeId(config.table);
    const escapedColumns = columns.map((col) => mysql.escapeId(col)).join(', ');
    const placeholders = columns.map(() => '?').join(', ');

    const sql = `INSERT INTO ${escapedTable} (${escapedColumns}) VALUES (${placeholders})`;
    const [result] = await connection.execute(sql, values);

    return {
      success: true,
      insertId: result.insertId,
      affectedRows: result.affectedRows,
    };
  });
});
