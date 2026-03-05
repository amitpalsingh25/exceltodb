const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  validatePasscode: (passcode) => ipcRenderer.invoke('auth:validate-passcode', passcode),
  setPasscode: (passcode) => ipcRenderer.invoke('settings:set-passcode', passcode),
  saveUiConfig: (uiConfig) => ipcRenderer.invoke('settings:save-ui-config', uiConfig),
  saveDbConfig: (dbConfig) => ipcRenderer.invoke('db:save-config', dbConfig),
  testDbConnection: (dbConfig) => ipcRenderer.invoke('db:test-connection', dbConfig),
  getTableColumns: (dbConfig) => ipcRenderer.invoke('db:get-table-columns', dbConfig),
  fetchTableRecords: (dbConfig) => ipcRenderer.invoke('db:fetch-table-records', dbConfig),
  updateTableRow: (payload) => ipcRenderer.invoke('db:update-table-row', payload),
  pickAuthImage: () => ipcRenderer.invoke('ui:pick-auth-image'),
  pickAndReadExcel: () => ipcRenderer.invoke('excel:pick-and-read'),
  insertRow: (payload) => ipcRenderer.invoke('db:insert-row', payload),
  openHelpLink: () => ipcRenderer.invoke('app:open-help-link'),
  checkUpdates: (payload) => ipcRenderer.invoke('app:check-updates', payload),
  onNavigate: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('app:navigate', listener);
    return () => ipcRenderer.removeListener('app:navigate', listener);
  },
});
