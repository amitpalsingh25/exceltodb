---
name: electron-windows-release-fixes
description: Fix Windows Electron packaging/release issues for Vite+React apps, especially when installed builds show blank screens, missing CSS/JS, missing login logos, missing titlebar/taskbar/desktop icons, or default NSIS installer artwork. Use when preparing installer builds, versioned releases, and client-ready executables.
---

# Electron Windows Release Fixes

Apply this workflow for Electron + Vite apps that work in dev but fail after install.

## Quick Fix Sequence

1. Set Vite base path to relative for `file://` runtime.
2. Ensure renderer image/icon paths are relative (`./...`) instead of root (`/...`).
3. Use a real multi-size `.ico` for Windows executable and installer.
4. Configure NSIS installer branding assets.
5. Rebuild installer and verify installed app behavior.

## Required Config Patterns

### 1) Vite path safety

Set in `vite.config.js`:

```js
export default defineConfig({
  base: './',
  plugins: [react()],
});
```

Purpose: prevents installed app `ERR_FILE_NOT_FOUND` for hashed CSS/JS assets.

### 2) Renderer asset paths

In HTML/JSX, use relative paths for bundled static assets:

- `./KCS-Icon.png`
- `./KCS-Logo.png`

Avoid absolute root paths like `/KCS-Logo.png` in installed builds.

### 3) Windows icon reliability

Generate `build/icon.ico` from source PNG with multiple sizes (16..256).

Use icon in builder config:

- `build.win.icon`
- `build.nsis.installerIcon`
- `build.nsis.uninstallerIcon`
- `build.nsis.installerHeaderIcon`

Copy `.ico` into packaged resources via `extraResources`.

### 4) BrowserWindow packaged icon path

In Electron main process, set packaged-safe icon path:

- Packaged: `path.join(process.resourcesPath, 'icon.ico')`
- Dev: local `build/icon.ico`

Also set app user model id:

```js
app.setAppUserModelId('com.woocoders.kcsexceltodb');
```

Purpose: improves taskbar/shortcut icon consistency on Windows.

### 5) NSIS branding

Provide branded bitmaps and wire them:

- `build/installerSidebar.bmp` (164x314)
- `build/installerHeader.bmp` (150x57)

Set in `build.nsis`:

- `installerSidebar`
- `uninstallerSidebar`
- `installerHeader`

Optional but recommended:

- `createDesktopShortcut: true`
- `createStartMenuShortcut: true`
- `shortcutName: "KCS Excel to DB"`

## Release Discipline

1. Bump `package.json` version (e.g., `1.0.2`).
2. Build installer (`npm run dist:win`).
3. Keep installer artifacts out of git via `.gitignore` (`release/`, `*.exe`, `*.blockmap`).
4. Commit code/config only.
5. Tag release (`vX.Y.Z`) and push tag.
6. Publish GitHub Release with same tag.

## Update Check Notes

If update check returns 404 from GitHub Releases API, ensure a published release exists for the configured repo and tag.

## Verification Checklist

- Installed app loads UI (no blank page, no missing CSS/JS console errors).
- Login/logo assets render in installed build.
- Titlebar icon appears.
- Taskbar icon appears.
- Desktop shortcut icon appears.
- Installer UI uses branded artwork.
- Version string in app matches packaged version.