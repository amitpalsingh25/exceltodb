import { useEffect, useMemo, useState } from 'react';
import './App.css';

const IGNORE_FIELD = '__ignore__';

const emptyDbConfig = {
  host: '',
  port: '3306',
  user: '',
  password: '',
  database: '',
  table: '',
};

const defaultUiConfig = {
  authBackgroundType: 'gradient',
  authGradient: 'linear-gradient(135deg, #0f172a 0%, #1d4ed8 45%, #22d3ee 100%)',
  authImageDataUrl: '',
  headingColor: '#111827',
  buttonColor: '#2563eb',
  buttonTextColor: '#ffffff',
  updateRepo: 'amitpalsingh25/exceltodb',
};

const defaultGradientStops = ['#0f172a', '#1d4ed8', '#22d3ee'];

function buildInitialMapping(excelColumns, dbColumns) {
  const dbSet = new Set(dbColumns);
  return excelColumns.reduce((acc, excelColumn) => {
    acc[excelColumn] = dbSet.has(excelColumn) ? excelColumn : IGNORE_FIELD;
    return acc;
  }, {});
}

function extractGradientStops(gradientText) {
  const matches = String(gradientText || '').match(/#[0-9a-fA-F]{6}/g);
  if (!matches || matches.length < 3) {
    return [...defaultGradientStops];
  }
  return [matches[0], matches[1], matches[2]];
}

function buildGradientFromStops(stops) {
  return `linear-gradient(135deg, ${stops[0]} 0%, ${stops[1]} 45%, ${stops[2]} 100%)`;
}

function App() {
  const hasElectronApi = Boolean(window?.electronAPI);

  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState('importer');
  const [auth, setAuth] = useState(false);
  const [appVersion, setAppVersion] = useState('1.0.0');

  const [passcodeInput, setPasscodeInput] = useState('');
  const [passcodeError, setPasscodeError] = useState('');
  const [newPasscode, setNewPasscode] = useState('');

  const [dbConfig, setDbConfig] = useState(emptyDbConfig);
  const [dbMessage, setDbMessage] = useState('');
  const [dbColumns, setDbColumns] = useState([]);
  const [tableColumnsState, setTableColumnsState] = useState({ loading: false, text: '' });
  const [testConnectionState, setTestConnectionState] = useState({ loading: false, text: '' });

  const [uiConfig, setUiConfig] = useState(defaultUiConfig);
  const [uiMessage, setUiMessage] = useState('');
  const [updateStatus, setUpdateStatus] = useState({ text: '', updateAvailable: false, releaseUrl: '' });
  const [gradientStops, setGradientStops] = useState(defaultGradientStops);

  const [excelMeta, setExcelMeta] = useState({ filePath: '', sheetName: '' });
  const [excelColumns, setExcelColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [fieldMapping, setFieldMapping] = useState({});
  const [rowStatuses, setRowStatuses] = useState({});
  const [editColumns, setEditColumns] = useState([]);
  const [editRows, setEditRows] = useState([]);
  const [editPrimaryKey, setEditPrimaryKey] = useState('');
  const [editPrimaryAutoIncrement, setEditPrimaryAutoIncrement] = useState(false);
  const [editNonEditableColumns, setEditNonEditableColumns] = useState([]);
  const [editLoadState, setEditLoadState] = useState({ loading: false, text: '' });
  const [editRowStatuses, setEditRowStatuses] = useState({});
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      if (!hasElectronApi) {
        setDbMessage('Electron bridge not found. Run this app with Electron (npm run dev).');
        setLoading(false);
        return;
      }

      try {
        const settings = await window.electronAPI.getSettings();
        if (settings?.dbConfig) {
          setDbConfig({ ...emptyDbConfig, ...settings.dbConfig });
        }
        if (settings?.uiConfig) {
          const savedUi = { ...defaultUiConfig, ...settings.uiConfig };
          setUiConfig(savedUi);
          setGradientStops(extractGradientStops(savedUi.authGradient));
        }
        if (settings?.appVersion) {
          setAppVersion(settings.appVersion);
        }
      } catch (error) {
        setDbMessage(`Failed to load settings: ${error.message}`);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [hasElectronApi]);

  useEffect(() => {
    if (typeof window?.electronAPI?.onNavigate !== 'function') {
      return undefined;
    }

    const unsubscribe = window.electronAPI.onNavigate((payload) => {
      const page = payload?.page;
      if (page === 'logout') {
        setAuth(false);
        setPasscodeInput('');
        setPasscodeError('');
        return;
      }
      if (page === 'importer' || page === 'settings' || page === 'edit-records') {
        setActivePage(page);
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  useEffect(() => {
    if (!auth) {
      setShowScrollTop(false);
      return undefined;
    }

    const onScroll = () => {
      setShowScrollTop(window.scrollY > 220);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    return () => window.removeEventListener('scroll', onScroll);
  }, [auth]);

  const canSavePasscode = newPasscode.trim().length > 0;

  const dbConfigReady = useMemo(
    () =>
      Boolean(
        dbConfig.host.trim() &&
          dbConfig.port.trim() &&
          dbConfig.user.trim() &&
          dbConfig.database.trim() &&
          dbConfig.table.trim()
      ),
    [dbConfig]
  );

  const mappedFieldCount = useMemo(
    () => Object.values(fieldMapping).filter((target) => target && target !== IGNORE_FIELD).length,
    [fieldMapping]
  );

  const authBackgroundStyle = useMemo(() => {
    if (uiConfig.authBackgroundType === 'image' && uiConfig.authImageDataUrl) {
      return {
        backgroundImage: `linear-gradient(135deg, rgba(15, 23, 42, 0.62), rgba(30, 64, 175, 0.52)), url(${uiConfig.authImageDataUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      };
    }

    return {
      background: uiConfig.authGradient || defaultUiConfig.authGradient,
    };
  }, [uiConfig]);

  const themeVars = useMemo(
    () => ({
      '--app-heading-color': uiConfig.headingColor || defaultUiConfig.headingColor,
      '--app-btn-bg': uiConfig.buttonColor || defaultUiConfig.buttonColor,
      '--app-btn-text': uiConfig.buttonTextColor || defaultUiConfig.buttonTextColor,
    }),
    [uiConfig]
  );

  const onLogin = async (event) => {
    event.preventDefault();
    setPasscodeError('');

    try {
      const valid = await window.electronAPI.validatePasscode(passcodeInput);
      if (!valid) {
        setPasscodeError('Invalid passcode.');
        return;
      }
      setAuth(true);
      setPasscodeInput('');
    } catch (error) {
      setPasscodeError(error.message || 'Unable to validate passcode.');
    }
  };

  const onSavePasscode = async () => {
    try {
      await window.electronAPI.setPasscode(newPasscode);
      setNewPasscode('');
      setDbMessage('Passcode updated successfully.');
    } catch (error) {
      setDbMessage(`Failed to set passcode: ${error.message}`);
    }
  };

  const onDbFieldChange = (key, value) => {
    setDbConfig((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const runTestConnection = async (config) => {
    if (!hasElectronApi) {
      setTestConnectionState({
        loading: false,
        text: 'Electron bridge not found. Close browser-only session and start Electron app.',
      });
      return false;
    }

    setTestConnectionState({ loading: true, text: 'Testing database connection...' });

    try {
      const result = await window.electronAPI.testDbConnection(config);
      if (!result?.success) {
        setDbMessage(`DB connection failed: ${result?.error || 'Unknown error'}`);
        setTestConnectionState({
          loading: false,
          text: `Connection failed: ${result?.error || 'Unknown error'}`,
        });
        return false;
      }

      setDbMessage('Database connection is successful.');
      setTestConnectionState({ loading: false, text: 'Connection successful.' });
      return true;
    } catch (error) {
      setDbMessage(`DB connection failed: ${error.message}`);
      setTestConnectionState({
        loading: false,
        text: `Connection failed: ${error.message || 'Unknown error'}`,
      });
      return false;
    }
  };

  const runLoadTableColumns = async (config) => {
    if (!hasElectronApi) {
      setTableColumnsState({
        loading: false,
        text: 'Electron bridge not found. Start app with Electron.',
      });
      return false;
    }

    setTableColumnsState({ loading: true, text: 'Loading table fields...' });

    try {
      const result = await window.electronAPI.getTableColumns(config);
      if (!result?.success) {
        setTableColumnsState({
          loading: false,
          text: `Failed to load fields: ${result?.error || 'Unknown error'}`,
        });
        return false;
      }

      const tableFields = result.columns || [];
      setDbColumns(tableFields);
      setTableColumnsState({ loading: false, text: `Loaded ${tableFields.length} table fields.` });

      if (excelColumns.length > 0) {
        setFieldMapping(buildInitialMapping(excelColumns, tableFields));
        setRowStatuses({});
      }
      return true;
    } catch (error) {
      setTableColumnsState({
        loading: false,
        text: `Failed to load fields: ${error.message || 'Unknown error'}`,
      });
      return false;
    }
  };

  const onSaveDbConfig = async () => {
    try {
      const saved = await window.electronAPI.saveDbConfig(dbConfig);
      const savedConfig = { ...emptyDbConfig, ...saved };
      setDbConfig(savedConfig);
      setDbMessage('DB config saved. Running connection test and loading table fields...');

      const connected = await runTestConnection(savedConfig);
      if (connected) {
        await runLoadTableColumns(savedConfig);
      }
    } catch (error) {
      setDbMessage(`Could not save DB config: ${error.message}`);
    }
  };

  const onTestConnection = async () => {
    await runTestConnection(dbConfig);
  };

  const onLoadTableColumns = async () => {
    await runLoadTableColumns(dbConfig);
  };

  const onPickAuthImage = async () => {
    setUiMessage('');
    try {
      const result = await window.electronAPI.pickAuthImage();
      if (result?.canceled) {
        return;
      }
      setUiConfig((prev) => ({
        ...prev,
        authBackgroundType: 'image',
        authImageDataUrl: result.dataUrl || '',
      }));
    } catch (error) {
      setUiMessage(`Could not load image: ${error.message}`);
    }
  };

  const onSaveUiConfig = async () => {
    try {
      const saved = await window.electronAPI.saveUiConfig(uiConfig);
      setUiConfig({ ...defaultUiConfig, ...saved });
      setUiMessage('Auth page appearance saved.');
    } catch (error) {
      setUiMessage(`Could not save appearance: ${error.message}`);
    }
  };

  const onCheckUpdates = async (repoFromArg) => {
    const repo = String(repoFromArg || uiConfig.updateRepo || '').trim();
    if (!repo) {
      setUpdateStatus({
        text: 'Set GitHub repo first. Example: owner/repo',
        updateAvailable: false,
        releaseUrl: '',
      });
      return;
    }

    setUpdateStatus({ text: 'Checking updates...', updateAvailable: false, releaseUrl: '' });

    try {
      const result = await window.electronAPI.checkUpdates({ repo });
      if (!result?.success) {
        console.error('Update check failed result:', result);
        setUpdateStatus({
          text: `Update check failed: ${result?.error || 'Unknown error'}`,
          updateAvailable: false,
          releaseUrl: '',
        });
        return;
      }

      if (result.updateAvailable) {
        setUpdateStatus({
          text: `Update available: v${result.latestVersion} (current v${result.currentVersion})`,
          updateAvailable: true,
          releaseUrl: result.releaseUrl || '',
        });
      } else {
        setUpdateStatus({
          text: `You are up to date (v${result.currentVersion}).`,
          updateAvailable: false,
          releaseUrl: '',
        });
      }
    } catch (error) {
      console.error('Update check error:', error);
      setUpdateStatus({
        text: `Update check failed: ${error.message || 'Unknown error'}`,
        updateAvailable: false,
        releaseUrl: '',
      });
    }
  };

  const onGradientColorChange = (index, color) => {
    setGradientStops((prev) => {
      const updated = [...prev];
      updated[index] = color;
      setUiConfig((old) => ({
        ...old,
        authGradient: buildGradientFromStops(updated),
      }));
      return updated;
    });
  };

  const onImportExcel = async () => {
    try {
      const data = await window.electronAPI.pickAndReadExcel();
      if (data.canceled) {
        return;
      }

      const importedColumns = data.columns || [];
      setExcelMeta({ filePath: data.filePath, sheetName: data.sheetName });
      setExcelColumns(importedColumns);
      setRows(data.rows || []);
      setRowStatuses({});
      setFieldMapping(buildInitialMapping(importedColumns, dbColumns));
    } catch (error) {
      setDbMessage(`Could not read Excel: ${error.message}`);
    }
  };

  const onOpenHelp = async () => {
    if (window?.electronAPI?.openHelpLink) {
      await window.electronAPI.openHelpLink();
      return;
    }
    window.open('https://woocoders.com/', '_blank');
  };

  useEffect(() => {
    if (!auth) {
      return;
    }
    if (uiConfig.updateRepo?.trim()) {
      onCheckUpdates(uiConfig.updateRepo);
    }
  }, [auth]);

  const onLogout = () => {
    setAuth(false);
    setPasscodeInput('');
    setPasscodeError('');
  };

  const onLoadEditRecords = async () => {
    if (!dbConfigReady) {
      setEditLoadState({ loading: false, text: 'Please configure DB settings first.' });
      return;
    }

    if (typeof window?.electronAPI?.fetchTableRecords !== 'function') {
      setEditLoadState({
        loading: false,
        text: 'App update detected. Please fully restart Electron (stop npm run dev, then start again).',
      });
      return;
    }

    setEditLoadState({ loading: true, text: 'Loading table records...' });
    setEditRowStatuses({});

    try {
      const result = await window.electronAPI.fetchTableRecords(dbConfig);
      if (!result?.success) {
        setEditLoadState({ loading: false, text: `Failed to load records: ${result?.error || 'Unknown error'}` });
        return;
      }

      const loadedRows = (result.rows || []).map((row) => ({ ...row }));
      setEditColumns(result.columns || []);
      setEditPrimaryKey(result.primaryKeyColumn || '');
      setEditPrimaryAutoIncrement(Boolean(result.primaryKeyAutoIncrement));
      setEditNonEditableColumns(
        (result.columnMeta || [])
          .filter((col) => col.isPrimary && col.isAutoIncrement)
          .map((col) => col.name)
      );
      setEditRows(loadedRows);
      setEditLoadState({ loading: false, text: `Loaded ${loadedRows.length} records.` });
    } catch (error) {
      setEditLoadState({ loading: false, text: `Failed to load records: ${error.message || 'Unknown error'}` });
    }
  };

  const onEditCellChange = (rowIndex, column, value) => {
    setEditRows((prev) => {
      const next = [...prev];
      next[rowIndex] = { ...next[rowIndex], [column]: value };
      return next;
    });
  };

  const buildRowPayload = (row, { forInsert = false } = {}) => {
    const payload = {};
    for (const column of editColumns) {
      if (forInsert && editNonEditableColumns.includes(column)) {
        continue;
      }
      payload[column] = row[column];
    }
    return payload;
  };

  const onAddNewEditRow = () => {
    if (editColumns.length === 0) {
      setEditLoadState({ loading: false, text: 'Load table records first.' });
      return;
    }

    const newRow = {};
    for (const column of editColumns) {
      newRow[column] = '';
    }
    newRow.__isNew = true;
    newRow.__tempKey = `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setEditRows((prev) => [...prev, newRow]);
  };

  const onSaveEditRow = async (rowIndex) => {
    const row = editRows[rowIndex];
    const isNew = Boolean(row?.__isNew);

    if (!isNew && !editPrimaryKey) {
      setEditLoadState({ loading: false, text: 'Primary key is missing for this table. Cannot save row.' });
      return;
    }

    const originalPrimaryValue = row?.[editPrimaryKey];
    if (!isNew && (originalPrimaryValue === undefined || originalPrimaryValue === null || originalPrimaryValue === '')) {
      setEditRowStatuses((prev) => ({
        ...prev,
        [rowIndex]: { state: 'error', text: 'Primary key value is missing.' },
      }));
      return;
    }

    setEditRowStatuses((prev) => ({
      ...prev,
      [rowIndex]: { state: 'saving', text: 'Saving...' },
    }));

    try {
      const result = isNew
        ? await window.electronAPI.insertRow({
            dbConfig,
            row: buildRowPayload(row, { forInsert: true }),
          })
        : await window.electronAPI.updateTableRow({
            dbConfig,
            row: buildRowPayload(row),
            primaryKeyColumn: editPrimaryKey,
            originalPrimaryValue,
          });

      if (!result?.success) {
        setEditRowStatuses((prev) => ({
          ...prev,
          [rowIndex]: { state: 'error', text: result?.error || 'Save failed' },
        }));
        return;
      }

      if (isNew) {
        await onLoadEditRecords();
        return;
      }

      setEditRowStatuses((prev) => ({
        ...prev,
        [rowIndex]: { state: 'success', text: 'Saved' },
      }));
    } catch (error) {
      setEditRowStatuses((prev) => ({
        ...prev,
        [rowIndex]: { state: 'error', text: error.message || 'Save failed' },
      }));
    }
  };

  const onMappingChange = (excelColumn, dbColumn) => {
    setFieldMapping((prev) => ({
      ...prev,
      [excelColumn]: dbColumn,
    }));
    setRowStatuses({});
  };

  const buildMappedRow = (row) => {
    const mappedRow = {};

    for (const excelColumn of excelColumns) {
      const dbColumn = fieldMapping[excelColumn];
      if (!dbColumn || dbColumn === IGNORE_FIELD) {
        continue;
      }
      mappedRow[dbColumn] = row[excelColumn] ?? '';
    }

    return mappedRow;
  };

  const postRow = async (row, rowIndex) => {
    if (!dbConfigReady) {
      setDbMessage('Please fill DB config before posting rows.');
      return;
    }

    if (mappedFieldCount === 0) {
      setDbMessage('Please map at least one field before posting.');
      return;
    }

    const mappedRow = buildMappedRow(row);
    if (Object.keys(mappedRow).length === 0) {
      setRowStatuses((prev) => ({
        ...prev,
        [rowIndex]: { state: 'error', message: 'No mapped fields for this row.' },
      }));
      return;
    }

    setRowStatuses((prev) => ({
      ...prev,
      [rowIndex]: { state: 'posting', message: 'Posting...' },
    }));

    try {
      const result = await window.electronAPI.insertRow({ dbConfig, row: mappedRow });
      setRowStatuses((prev) => ({
        ...prev,
        [rowIndex]: {
          state: 'success',
          message: `Inserted (id: ${result.insertId || 'n/a'})`,
        },
      }));
    } catch (error) {
      setRowStatuses((prev) => ({
        ...prev,
        [rowIndex]: { state: 'error', message: error.message },
      }));
    }
  };

  if (loading) {
    return <div className="center-screen">Loading app...</div>;
  }

  if (!auth) {
    return (
      <div className="auth-screen" style={{ ...authBackgroundStyle, ...themeVars }}>
        <div className="auth-overlay" />
        <form className="card auth-card auth-form" onSubmit={onLogin}>
          <img src="./KCS-Logo.png" alt="KCS Logo" className="auth-logo" />
          <h1 className="auth-title">KCS Excel to DB</h1>
          <p className="auth-subtitle">Secure Internal Importer</p>
          <div className="auth-fields">
            <input
              type="password"
              value={passcodeInput}
              onChange={(e) => setPasscodeInput(e.target.value)}
              placeholder="Enter passcode"
              required
            />
            {passcodeError ? <p className="error auth-error">{passcodeError}</p> : null}
            <button type="submit" className="auth-submit-btn">
              Enter App
            </button>
          </div>
          <p className="hint auth-hint">Default passcode is 1234. Change it in Settings.</p>
        </form>
      </div>
    );
  }

  return (
    <div className="app-shell" style={themeVars}>
      <header className="app-header">
        <div>
          <h1 className="app-title">KCS Excel to DB</h1>
          <p className="app-version">v{appVersion}</p>
        </div>
        <div className="header-right">
          <div className="page-tabs" role="tablist" aria-label="Main navigation">
            <button
              type="button"
              className={`tab-btn ${activePage === 'importer' ? 'active' : ''}`}
              onClick={() => setActivePage('importer')}
              role="tab"
              aria-selected={activePage === 'importer'}
            >
              Importer
            </button>
            <button
              type="button"
              className={`tab-btn ${activePage === 'settings' ? 'active' : ''}`}
              onClick={() => setActivePage('settings')}
              role="tab"
              aria-selected={activePage === 'settings'}
            >
              Settings
            </button>
            <button
              type="button"
              className={`tab-btn ${activePage === 'edit-records' ? 'active' : ''}`}
              onClick={() => setActivePage('edit-records')}
              role="tab"
              aria-selected={activePage === 'edit-records'}
            >
              Edit Records
            </button>
          </div>
          <div className="utility-actions">
            <button type="button" className="help-btn" onClick={onOpenHelp}>
              Help
            </button>
            <button type="button" className="logout-btn" onClick={onLogout}>
              Logout
            </button>
          </div>
        </div>
      </header>

      {activePage === 'settings' ? (
        <>
          <section className="card">
            <h2>Security</h2>
            <div className="inline-form security-form">
              <input
                type="password"
                value={newPasscode}
                onChange={(e) => setNewPasscode(e.target.value)}
                placeholder="New passcode"
              />
              <button type="button" className="security-save-btn" onClick={onSavePasscode} disabled={!canSavePasscode}>
                Save Passcode
              </button>
            </div>
          </section>

          <section className="card">
            <h2>Auth Page Appearance</h2>
            <div className="grid-2">
              <select
                value={uiConfig.authBackgroundType}
                onChange={(e) =>
                  setUiConfig((prev) => ({
                    ...prev,
                    authBackgroundType: e.target.value,
                  }))
                }
              >
                <option value="gradient">Gradient</option>
                <option value="image">Image</option>
              </select>
              <button type="button" onClick={onPickAuthImage}>
                Choose Background Image
              </button>
            </div>
            {uiConfig.authBackgroundType === 'gradient' ? (
              <div className="grid-3 gradient-pickers">
                <label className="color-field">
                  Gradient Color 1
                  <input type="color" value={gradientStops[0]} onChange={(e) => onGradientColorChange(0, e.target.value)} />
                </label>
                <label className="color-field">
                  Gradient Color 2
                  <input type="color" value={gradientStops[1]} onChange={(e) => onGradientColorChange(1, e.target.value)} />
                </label>
                <label className="color-field">
                  Gradient Color 3
                  <input type="color" value={gradientStops[2]} onChange={(e) => onGradientColorChange(2, e.target.value)} />
                </label>
              </div>
            ) : (
              <p className="hint">Image mode uses the selected background image.</p>
            )}
            <div className="appearance-preview" style={authBackgroundStyle}>
              <span>Preview</span>
            </div>
            <h3>Theme Colors</h3>
            <div className="grid-3">
              <label className="color-field">
                Heading Color
                <input
                  type="color"
                  value={uiConfig.headingColor}
                  onChange={(e) =>
                    setUiConfig((prev) => ({
                      ...prev,
                      headingColor: e.target.value,
                    }))
                  }
                />
              </label>
              <label className="color-field">
                Button Color
                <input
                  type="color"
                  value={uiConfig.buttonColor}
                  onChange={(e) =>
                    setUiConfig((prev) => ({
                      ...prev,
                      buttonColor: e.target.value,
                    }))
                  }
                />
              </label>
              <label className="color-field">
                Button Text
                <input
                  type="color"
                  value={uiConfig.buttonTextColor}
                  onChange={(e) =>
                    setUiConfig((prev) => ({
                      ...prev,
                      buttonTextColor: e.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <div className="inline-form">
              <button type="button" onClick={onSaveUiConfig}>
                Save Appearance
              </button>
            </div>
            {uiMessage ? <p className="hint">{uiMessage}</p> : null}
          </section>

          <section className="card">
            <h2>App Updates</h2>
            <div className="inline-form">
              <button type="button" onClick={() => onCheckUpdates()}>
                Check for Updates
              </button>
            </div>
            <p className="hint">Checks updates from the configured official release channel.</p>
            {updateStatus.text ? <p className={updateStatus.updateAvailable ? 'success' : 'hint'}>{updateStatus.text}</p> : null}
            {updateStatus.updateAvailable && updateStatus.releaseUrl ? (
              <button type="button" onClick={() => window.open(updateStatus.releaseUrl, '_blank')}>
                Open Latest Release
              </button>
            ) : null}
          </section>

          <section className="card">
            <h2>Database Config (phpMyAdmin / MySQL)</h2>
            <div className="grid-2">
              <input
                placeholder="Host"
                value={dbConfig.host}
                onChange={(e) => onDbFieldChange('host', e.target.value)}
              />
              <input
                placeholder="Port"
                value={dbConfig.port}
                onChange={(e) => onDbFieldChange('port', e.target.value)}
              />
              <input
                placeholder="User"
                value={dbConfig.user}
                onChange={(e) => onDbFieldChange('user', e.target.value)}
              />
              <input
                type="password"
                placeholder="Password"
                value={dbConfig.password}
                onChange={(e) => onDbFieldChange('password', e.target.value)}
              />
              <input
                placeholder="Database"
                value={dbConfig.database}
                onChange={(e) => onDbFieldChange('database', e.target.value)}
              />
              <input
                placeholder="Table"
                value={dbConfig.table}
                onChange={(e) => onDbFieldChange('table', e.target.value)}
              />
            </div>
            <div className="inline-form">
              <button type="button" onClick={onSaveDbConfig}>
                Save DB Config
              </button>
              <button type="button" onClick={onTestConnection}>
                {testConnectionState.loading ? 'Testing...' : 'Test Connection'}
              </button>
              <button type="button" onClick={onLoadTableColumns}>
                {tableColumnsState.loading ? 'Loading Fields...' : 'Load Table Fields'}
              </button>
            </div>
            {testConnectionState.text ? <p className="hint">{testConnectionState.text}</p> : null}
            {tableColumnsState.text ? <p className="hint">{tableColumnsState.text}</p> : null}
            {dbColumns.length > 0 ? <p className="hint">Table fields: {dbColumns.join(', ')}</p> : null}
            {dbMessage ? <p className="hint">{dbMessage}</p> : null}
          </section>
        </>
      ) : activePage === 'edit-records' ? (
        <>
          <section className="card">
            <h2>Edit Records</h2>
            <div className="inline-form">
              <button type="button" onClick={onLoadEditRecords} disabled={editLoadState.loading}>
                {editLoadState.loading ? 'Loading...' : 'Load Table Records'}
              </button>
            </div>
            {editLoadState.text ? <p className="hint">{editLoadState.text}</p> : null}
            {editPrimaryKey ? <p className="hint">Primary key used for save: {editPrimaryKey}</p> : null}
          </section>

          <section className="card">
            <h2>Record Editor</h2>
            {editRows.length === 0 ? (
              <p className="hint">No records loaded yet.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {editColumns.map((column) => (
                        <th key={column}>{column}</th>
                      ))}
                      <th>Action</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editRows.map((row, rowIndex) => {
                      const status = editRowStatuses[rowIndex];
                      const isSaving = status?.state === 'saving';

                      return (
                        <tr key={`edit-${rowIndex}`}>
                          {editColumns.map((column) => (
                            <td key={`edit-${rowIndex}-${column}`}>
                              {editNonEditableColumns.includes(column) ? (
                                <input value={String(row[column] ?? '')} readOnly className="cell-input-readonly" />
                              ) : (
                                <input
                                  value={String(row[column] ?? '')}
                                  onChange={(e) => onEditCellChange(rowIndex, column, e.target.value)}
                                  className="cell-input"
                                />
                              )}
                            </td>
                          ))}
                          <td>
                            <button
                              type="button"
                              className="save-row-btn"
                              onClick={() => onSaveEditRow(rowIndex)}
                              disabled={isSaving}
                            >
                              {isSaving ? 'Saving...' : row.__isNew ? 'Insert Row' : 'Save Row'}
                            </button>
                          </td>
                          <td className={status?.state || ''}>{status?.text || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="inline-form">
              <button type="button" className="add-row-btn" onClick={onAddNewEditRow}>
                Add New Row
              </button>
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="card">
            <h2>Import Excel</h2>
            <button type="button" onClick={onImportExcel}>
              Choose Excel File
            </button>
            {excelMeta.filePath ? (
              <p className="hint">
                File: {excelMeta.filePath} | Sheet: {excelMeta.sheetName} | Rows: {rows.length}
              </p>
            ) : null}
            {!dbConfigReady ? <p className="error">Configure DB settings first from Settings page.</p> : null}
            {dbColumns.length === 0 ? (
              <p className="hint">Go to Settings and click "Load Table Fields" for mapping options.</p>
            ) : null}
          </section>

          <section className="card">
            <h2>Field Mapping</h2>
            {excelColumns.length === 0 ? (
              <p className="hint">Import an Excel file to map columns.</p>
            ) : (
              <>
                <p className="hint">Map Excel columns to DB fields. Select Ignore for fields you do not need.</p>
                <div className="mapping-grid">
                  {excelColumns.map((excelColumn) => (
                    <div className="mapping-row" key={excelColumn}>
                      <label>{excelColumn}</label>
                      <select
                        value={fieldMapping[excelColumn] || IGNORE_FIELD}
                        onChange={(e) => onMappingChange(excelColumn, e.target.value)}
                      >
                        <option value={IGNORE_FIELD}>Ignore this field</option>
                        {dbColumns.map((dbColumn) => (
                          <option value={dbColumn} key={dbColumn}>
                            {dbColumn}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                <p className="hint">
                  Mapped fields: {mappedFieldCount} / {excelColumns.length}
                </p>
              </>
            )}
          </section>

          <section className="card">
            <h2>Rows</h2>
            {rows.length === 0 ? (
              <p className="hint">No rows imported yet.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {excelColumns.map((column) => (
                        <th key={column}>{column}</th>
                      ))}
                      <th>Action</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, rowIndex) => {
                      const status = rowStatuses[rowIndex];
                      const isPosting = status?.state === 'posting';

                      return (
                        <tr key={rowIndex}>
                          {excelColumns.map((column) => (
                            <td key={`${rowIndex}-${column}`}>{String(row[column] ?? '')}</td>
                          ))}
                          <td>
                            <button
                              type="button"
                              onClick={() => postRow(row, rowIndex)}
                              disabled={isPosting || mappedFieldCount === 0}
                            >
                              {isPosting ? 'Posting...' : 'Post'}
                            </button>
                          </td>
                          <td className={status?.state || ''}>{status?.message || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
      {showScrollTop ? (
        <button
          type="button"
          className="scroll-top-btn"
          aria-label="Scroll to top"
          title="Scroll to top"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          ↑
        </button>
      ) : null}
    </div>
  );
}

export default App;
