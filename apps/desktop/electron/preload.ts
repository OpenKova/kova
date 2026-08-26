import { contextBridge, ipcRenderer, webFrame, webUtils } from 'electron'

// Which translucency the OS can back. Asked synchronously because the renderer
// needs it before its first paint, and answered by main because deciding it
// needs `os.release()` — a sandboxed preload may only require electron, events,
// timers and url, so importing node:os here throws before contextBridge runs
// and takes the ENTIRE bridge down with it (window.hermesDesktop undefined =>
// "Desktop IPC bridge is unavailable"). No reply means no glass, which degrades
// to an ordinary opaque window rather than a page thinned over nothing.
const translucencySupport = ipcRenderer.sendSync('kova:translucency:support')
const hudWindowing = ipcRenderer.sendSync('kova:hud:windowing')
const hudNativeDrag = hudWindowing?.nativeDrag === true

contextBridge.exposeInMainWorld('hermesDesktop', {
  glassSupported: translucencySupport?.glass === true,
  translucencySupported: translucencySupport?.translucency === true,
  getConnection: profile => ipcRenderer.invoke('kova:connection', profile),
  // Registry-scoped backend resolution: { connectionId, profile } → descriptor.
  getConnectionFor: payload => ipcRenderer.invoke('kova:connection:for', payload),
  getProfileRoutes: profiles => ipcRenderer.invoke('kova:plugin-profile-routes', profiles),
  revalidateConnection: () => ipcRenderer.invoke('kova:connection:revalidate'),
  touchBackend: profile => ipcRenderer.invoke('kova:backend:touch', profile),
  getGatewayWsUrl: profile => ipcRenderer.invoke('kova:gateway:ws-url', profile),
  // Registry-scoped fresh WS URL: { connectionId, profile } → result shape of
  // getGatewayWsUrl, minted against that connection's backend.
  getGatewayWsUrlFor: payload => ipcRenderer.invoke('kova:gateway:ws-url-for', payload),
  // Union agent roster across every registered connection.
  getAgentRoster: () => ipcRenderer.invoke('kova:agents:roster'),
  openSessionWindow: (sessionId, opts) => ipcRenderer.invoke('kova:window:openSession', sessionId, opts),
  openSessionInTerminal: (sessionId, opts) => ipcRenderer.invoke('kova:window:openInTerminal', sessionId, opts),
  openWindow: () => ipcRenderer.invoke('kova:window:openInstance'),
  openBrowserWindow: tabId => ipcRenderer.invoke('kova:window:openBrowser', tabId),
  onBrowserPopoutClosed: callback => {
    const listener = (_event, tabId) => callback(tabId)
    ipcRenderer.on('kova:browser-popout:closed', listener)

    return () => ipcRenderer.removeListener('kova:browser-popout:closed', listener)
  },
  claimAmbientCue: key => ipcRenderer.invoke('kova:ambient:claim', key),
  wakeIndicator: {
    getState: () => ipcRenderer.invoke('kova:wake-indicator:get'),
    setState: state => ipcRenderer.send('kova:wake-indicator:set', state),
    onState: callback => {
      const listener = (_event, state) => callback(state)
      ipcRenderer.on('kova:wake-indicator:state', listener)

      return () => ipcRenderer.removeListener('kova:wake-indicator:state', listener)
    }
  },
  petOverlay: {
    // Main renderer → main process: window lifecycle + drag. `request` is
    // `{ bounds, screen }`; resolves with the screen bounds it actually used.
    open: request => ipcRenderer.invoke('kova:pet-overlay:open', request),
    close: () => ipcRenderer.invoke('kova:pet-overlay:close'),
    setBounds: bounds => ipcRenderer.send('kova:pet-overlay:set-bounds', bounds),
    setIgnoreMouse: ignore => ipcRenderer.send('kova:pet-overlay:ignore-mouse', ignore),
    // Flip the overlay focusable (and focus it) while the composer needs keys.
    setFocusable: focusable => ipcRenderer.send('kova:pet-overlay:set-focusable', focusable),
    // Main renderer → overlay (forwarded by main): push the latest pet state.
    pushState: payload => ipcRenderer.send('kova:pet-overlay:state', payload),
    // Overlay → main renderer (forwarded by main): pop back in / composer submit.
    control: payload => ipcRenderer.send('kova:pet-overlay:control', payload),
    // Overlay subscribes to state pushes.
    onState: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('kova:pet-overlay:state', listener)

      return () => ipcRenderer.removeListener('kova:pet-overlay:state', listener)
    },
    // Main renderer subscribes to overlay control messages.
    onControl: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('kova:pet-overlay:control', listener)

      return () => ipcRenderer.removeListener('kova:pet-overlay:control', listener)
    }
  },
  // HUD mode: the chrome-free floating chat. A full app renderer (own gateway)
  // sized as a floating bar, so it mounts the real composer. Main owns the
  // window; `onChanged` keeps every window's toggle truthful.
  hud: {
    nativeDrag: hudNativeDrag,
    windowing: {
      clientPlacement: hudWindowing?.clientPlacement !== false,
      controlDrag: hudWindowing?.controlDrag === true,
      nativeDrag: hudNativeDrag,
      workspaceTransfer: hudWindowing?.workspaceTransfer === true
    },
    open: request => ipcRenderer.invoke('kova:hud:open', request),
    close: () => ipcRenderer.invoke('kova:hud:close'),
    setIgnoreMouse: ignore => ipcRenderer.send('kova:hud:ignore-mouse', ignore),
    moveBy: delta => ipcRenderer.send('kova:hud:move-by', delta),
    setWorkspaceTransfer: transferring => ipcRenderer.send('kova:hud:workspace-transfer', transferring),
    setBounds: bounds => ipcRenderer.send('kova:hud:set-bounds', bounds),
    resetLayout: () => ipcRenderer.invoke('kova:hud:reset-layout'),
    // Whether the band covers the window below the bar. Main pairs it with the
    // user's translucency setting to decide the native frost (macOS vibrancy /
    // Windows 11 DWM backdrop) — see hudFrostFor.
    setFrost: showing => ipcRenderer.invoke('kova:hud:frost', showing),
    // The HUD tells main which session it is on; main hands that back to the
    // app window when the HUD closes, so the app can re-home onto it.
    setSession: sessionId => ipcRenderer.send('kova:hud:session', sessionId),
    onGoto: callback => {
      const listener = (_event, sessionId) => callback(sessionId)
      ipcRenderer.on('kova:hud:goto', listener)

      return () => ipcRenderer.removeListener('kova:hud:goto', listener)
    },
    onChanged: callback => {
      const listener = (_event, state) => callback(state)
      ipcRenderer.on('kova:hud:changed', listener)

      return () => ipcRenderer.removeListener('kova:hud:changed', listener)
    },
    // Linux only, and silent elsewhere: where the cursor is, in page
    // coordinates, or null when it has left the window. Stands in for the
    // mousemove that `setIgnoreMouseEvents(true, { forward: true })` delivers on
    // macOS and Windows but not here.
    onCursor: callback => {
      const listener = (_event, point) => callback(point)
      ipcRenderer.on('kova:hud:cursor', listener)

      return () => ipcRenderer.removeListener('kova:hud:cursor', listener)
    },
    // Main's game-overlay watch: whether a fullscreen app (a game) is under
    // the HUD, so the renderer can step back to the low-opacity overlay
    // treatment while one owns the screen.
    onGameOverlay: callback => {
      const listener = (_event, state) => callback(state)
      ipcRenderer.on('kova:hud:game-overlay', listener)

      return () => ipcRenderer.removeListener('kova:hud:game-overlay', listener)
    }
  },
  // Quick Entry: the global-hotkey mini composer window. Main owns the OS
  // shortcut + the persisted preference; the quick window only captures text
  // and hands it back, and the primary renderer submits it through the normal
  // prompt path.
  quickEntry: {
    getSettings: () => ipcRenderer.invoke('kova:quick-entry:settings:get'),
    setSettings: patch => ipcRenderer.invoke('kova:quick-entry:settings:set', patch),
    submit: payload => ipcRenderer.send('kova:quick-entry:submit', payload),
    dismiss: () => ipcRenderer.send('kova:quick-entry:dismiss'),
    // Primary renderer → main → quick window: gateway connection state + the
    // recent-session options the target picker offers. Main caches the latest
    // payload so a freshly spawned quick window starts from truth.
    pushState: payload => ipcRenderer.send('kova:quick-entry:state', payload),
    // Quick window subscribes to those pushes.
    onState: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('kova:quick-entry:state', listener)

      return () => ipcRenderer.removeListener('kova:quick-entry:state', listener)
    },
    // Main → primary renderer: a submit captured by the quick window.
    onSubmit: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('kova:quick-entry:submit', listener)

      return () => ipcRenderer.removeListener('kova:quick-entry:submit', listener)
    },
    // Main → quick window: you were just summoned (reset draft + refocus).
    onShown: callback => {
      const listener = () => callback()
      ipcRenderer.on('kova:quick-entry:shown', listener)

      return () => ipcRenderer.removeListener('kova:quick-entry:shown', listener)
    }
  },
  getBootProgress: () => ipcRenderer.invoke('kova:boot-progress:get'),
  getConnectionConfig: profile => ipcRenderer.invoke('kova:connection-config:get', profile),
  saveConnectionConfig: payload => ipcRenderer.invoke('kova:connection-config:save', payload),
  applyConnectionConfig: payload => ipcRenderer.invoke('kova:connection-config:apply', payload),
  testConnectionConfig: payload => ipcRenderer.invoke('kova:connection-config:test', payload),
  // Opt-in OS-keychain encryption for stored gateway secrets (default off —
  // see secret-storage-policy.ts). get never touches the OS keychain.
  getSecretStorageEncryption: () => ipcRenderer.invoke('kova:secret-storage:get'),
  setSecretStorageEncryption: (on: boolean) => ipcRenderer.invoke('kova:secret-storage:set', on),
  // v2 multi-connection registry: named agent sources (local / remote / cloud / ssh).
  connections: {
    list: () => ipcRenderer.invoke('kova:connections:list'),
    save: payload => ipcRenderer.invoke('kova:connections:save', payload),
    remove: id => ipcRenderer.invoke('kova:connections:remove', id),
    setPrimary: id => ipcRenderer.invoke('kova:connections:set-primary', id),
    setLaunchMode: mode => ipcRenderer.invoke('kova:connections:set-launch-mode', mode),
    setLastUsed: id => ipcRenderer.invoke('kova:connections:set-last-used', id),
    test: id => ipcRenderer.invoke('kova:connections:test', id),
    // Fan out `kova update` to every eligible registered connection.
    // Optional excludeIds skips rows the caller updates through another path.
    updateAll: options => ipcRenderer.invoke('kova:connections:update-all', options),
    // Registry lifecycle push (main → renderer): a connection was removed or
    // materially edited, so secondaries scoped to it must be disposed (and,
    // for edits, re-dialed at the new target).
    onChanged: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('kova:connections:changed', listener)

      return () => ipcRenderer.removeListener('kova:connections:changed', listener)
    }
  },
  sshConfigHosts: () => ipcRenderer.invoke('kova:ssh-config:hosts'),
  sshResolveHost: host => ipcRenderer.invoke('kova:ssh-config:resolve', host),
  probeConnectionConfig: remoteUrl => ipcRenderer.invoke('kova:connection-config:probe', remoteUrl),
  oauthLoginConnectionConfig: remoteUrl => ipcRenderer.invoke('kova:connection-config:oauth-login', remoteUrl),
  oauthLogoutConnectionConfig: remoteUrl => ipcRenderer.invoke('kova:connection-config:oauth-logout', remoteUrl),
  // Kova Cloud: one portal login powers discovery + silent per-agent sign-in
  // (cloud-auto-discovery Phase 3).
  cloud: {
    status: () => ipcRenderer.invoke('kova:cloud:status'),
    login: () => ipcRenderer.invoke('kova:cloud:login'),
    logout: () => ipcRenderer.invoke('kova:cloud:logout'),
    discover: org => ipcRenderer.invoke('kova:cloud:discover', org),
    agentSignIn: dashboardUrl => ipcRenderer.invoke('kova:cloud:agent-sign-in', dashboardUrl)
  },
  profile: {
    get: () => ipcRenderer.invoke('kova:profile:get'),
    set: name => ipcRenderer.invoke('kova:profile:set', name)
  },
  api: request => ipcRenderer.invoke('kova:api', request),
  notify: payload => ipcRenderer.invoke('kova:notify', payload),
  requestMicrophoneAccess: () => ipcRenderer.invoke('kova:requestMicrophoneAccess'),
  readWindowBelow: () => ipcRenderer.invoke('kova:window:readBelow'),
  readFileDataUrl: filePath => ipcRenderer.invoke('kova:readFileDataUrl', filePath),
  readFileDataUrlForAttach: filePath => ipcRenderer.invoke('kova:readFileDataUrlForAttach', filePath),
  dataUrlReadMax: {
    get: () => ipcRenderer.invoke('kova:data-url-read-max:get'),
    set: maxMb => ipcRenderer.invoke('kova:data-url-read-max:set', maxMb)
  },
  readFileText: filePath => ipcRenderer.invoke('kova:readFileText', filePath),
  readPluginSource: (filePath: string) => ipcRenderer.invoke('kova:readPluginSource', filePath),
  selectPaths: options => ipcRenderer.invoke('kova:selectPaths', options),
  selectSavePath: options => ipcRenderer.invoke('kova:selectSavePath', options),
  writeClipboard: text => ipcRenderer.invoke('kova:writeClipboard', text),
  readClipboard: () => ipcRenderer.invoke('kova:readClipboard'),
  saveGatewayFile: payload => ipcRenderer.invoke('kova:saveGatewayFile', payload),
  saveImageFromUrl: url => ipcRenderer.invoke('kova:saveImageFromUrl', url),
  contextMenuEdit: command => ipcRenderer.invoke('kova:context-menu:edit', command),
  contextMenuCopyImage: () => ipcRenderer.invoke('kova:context-menu:copy-image'),
  contextMenuSpellcheck: action => ipcRenderer.invoke('kova:context-menu:spellcheck', action),
  contextMenuGuestAddWord: payload => ipcRenderer.invoke('kova:context-menu:guest-add-word', payload),
  onContextMenuSpellcheck: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('kova:context-menu-spellcheck', listener)

    return () => ipcRenderer.removeListener('kova:context-menu-spellcheck', listener)
  },
  saveImageBuffer: (data, ext) => ipcRenderer.invoke('kova:saveImageBuffer', { data, ext }),
  saveClipboardImage: () => ipcRenderer.invoke('kova:saveClipboardImage'),
  getPathForFile: file => {
    try {
      return webUtils.getPathForFile(file) || ''
    } catch {
      return ''
    }
  },
  normalizePreviewTarget: (target, baseDir) => ipcRenderer.invoke('kova:normalizePreviewTarget', target, baseDir),
  watchPreviewFile: url => ipcRenderer.invoke('kova:watchPreviewFile', url),
  watchDirectory: dir => ipcRenderer.invoke('kova:watchDirectory', dir),
  stopPreviewFileWatch: id => ipcRenderer.invoke('kova:stopPreviewFileWatch', id),
  setActiveWork: payload => ipcRenderer.send('kova:active-work', payload),
  setTitleBarTheme: payload => ipcRenderer.send('kova:titlebar-theme', payload),
  setNativeTheme: mode => ipcRenderer.send('kova:native-theme', mode),
  setTranslucency: payload => ipcRenderer.send('kova:translucency', payload),
  setKeepAwake: on => ipcRenderer.send('kova:keep-awake', on),
  setDisableF12: blocked => ipcRenderer.send('kova:devtools:disable-f12', blocked),
  setPreviewShortcutActive: active => ipcRenderer.send('kova:previewShortcutActive', Boolean(active)),
  openExternal: url => ipcRenderer.invoke('kova:openExternal', url),
  openPreviewInBrowser: url => ipcRenderer.invoke('kova:openPreviewInBrowser', url),
  reachPreviewUrl: url => ipcRenderer.invoke('kova:preview:reach', url),
  setActiveConnectionRoute: route => ipcRenderer.send('kova:connection:active-route', route),
  fetchLinkTitle: url => ipcRenderer.invoke('kova:fetchLinkTitle', url),
  resolveFavicon: url => ipcRenderer.invoke('kova:resolveFavicon', url),
  sanitizeWorkspaceCwd: cwd => ipcRenderer.invoke('kova:workspace:sanitize', cwd),
  settings: {
    getDefaultProjectDir: () => ipcRenderer.invoke('kova:setting:defaultProjectDir:get'),
    setDefaultProjectDir: dir => ipcRenderer.invoke('kova:setting:defaultProjectDir:set', dir),
    pickDefaultProjectDir: () => ipcRenderer.invoke('kova:setting:defaultProjectDir:pick')
  },
  zoom: {
    // Current zoom of this window, as { level, percent }.
    get: () => ipcRenderer.invoke('kova:zoom:get'),
    // Synchronous zoom factor (1 = 100%). Coordinate math needs it in the
    // same tick as the event it converts, so no IPC round-trip here.
    factor: () => webFrame.getZoomFactor(),
    setPercent: percent => ipcRenderer.send('kova:zoom:set-percent', percent),
    // Fires on every zoom change, including the Ctrl/Cmd +/-/0 shortcuts,
    // so the settings UI can stay in sync with the keyboard.
    onChanged: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('kova:zoom:changed', listener)

      return () => ipcRenderer.removeListener('kova:zoom:changed', listener)
    }
  },
  revealLogs: () => ipcRenderer.invoke('kova:logs:reveal'),
  getRecentLogs: () => ipcRenderer.invoke('kova:logs:recent'),
  // Fire-and-forget: persists a renderer error-boundary catch (with component
  // stack) to desktop.log so crashes survive the window (#79428).
  reportRendererError: report => ipcRenderer.send('kova:logs:renderer-error', report),
  readDir: dirPath => ipcRenderer.invoke('kova:fs:readDir', dirPath),
  gitRoot: startPath => ipcRenderer.invoke('kova:fs:gitRoot', startPath),
  revealPath: targetPath => ipcRenderer.invoke('kova:fs:reveal', targetPath),
  openDir: dirPath => ipcRenderer.invoke('kova:fs:openDir', dirPath),
  desktopPluginsRoot: () => ipcRenderer.invoke('kova:fs:desktopPluginsRoot'),
  logsRoot: () => ipcRenderer.invoke('kova:fs:logsRoot'),
  agentPluginsRoot: () => ipcRenderer.invoke('kova:fs:agentPluginsRoot'),
  renamePath: (targetPath, newName) => ipcRenderer.invoke('kova:fs:rename', targetPath, newName),
  writeTextFile: (filePath, content) => ipcRenderer.invoke('kova:fs:writeText', filePath, content),
  trashPath: targetPath => ipcRenderer.invoke('kova:fs:trash', targetPath),
  git: {
    worktreeList: repoPath => ipcRenderer.invoke('kova:git:worktreeList', repoPath),
    worktreeAdd: (repoPath, options) => ipcRenderer.invoke('kova:git:worktreeAdd', repoPath, options),
    worktreeRemove: (repoPath, worktreePath, options) =>
      ipcRenderer.invoke('kova:git:worktreeRemove', repoPath, worktreePath, options),
    branchSwitch: (repoPath, branch) => ipcRenderer.invoke('kova:git:branchSwitch', repoPath, branch),
    branchList: repoPath => ipcRenderer.invoke('kova:git:branchList', repoPath),
    baseBranchList: repoPath => ipcRenderer.invoke('kova:git:baseBranchList', repoPath),
    repoStatus: repoPath => ipcRenderer.invoke('kova:git:repoStatus', repoPath),
    fileDiff: (repoPath, filePath) => ipcRenderer.invoke('kova:git:fileDiff', repoPath, filePath),
    scanRepos: (roots, options) => ipcRenderer.invoke('kova:git:scanRepos', roots, options),
    review: {
      list: (repoPath, scope, baseRef) => ipcRenderer.invoke('kova:git:review:list', repoPath, scope, baseRef),
      diff: (repoPath, filePath, scope, baseRef, staged) =>
        ipcRenderer.invoke('kova:git:review:diff', repoPath, filePath, scope, baseRef, staged),
      stage: (repoPath, filePath) => ipcRenderer.invoke('kova:git:review:stage', repoPath, filePath),
      unstage: (repoPath, filePath) => ipcRenderer.invoke('kova:git:review:unstage', repoPath, filePath),
      revert: (repoPath, filePath) => ipcRenderer.invoke('kova:git:review:revert', repoPath, filePath),
      revParse: (repoPath, ref) => ipcRenderer.invoke('kova:git:review:revParse', repoPath, ref),
      commit: (repoPath, message, push) => ipcRenderer.invoke('kova:git:review:commit', repoPath, message, push),
      commitContext: repoPath => ipcRenderer.invoke('kova:git:review:commitContext', repoPath),
      push: repoPath => ipcRenderer.invoke('kova:git:review:push', repoPath),
      shipInfo: repoPath => ipcRenderer.invoke('kova:git:review:shipInfo', repoPath),
      prList: (repoPath, branches, numbers) =>
        ipcRenderer.invoke('kova:git:review:prList', repoPath, branches, numbers),
      fetchPrComment: (repoPath, url) => ipcRenderer.invoke('kova:git:review:fetchPrComment', repoPath, url),
      createPr: repoPath => ipcRenderer.invoke('kova:git:review:createPr', repoPath)
    }
  },
  terminal: {
    cwd: id => ipcRenderer.invoke('kova:terminal:cwd', id),
    dispose: id => ipcRenderer.invoke('kova:terminal:dispose', id),
    resize: (id, size) => ipcRenderer.invoke('kova:terminal:resize', id, size),
    start: options => ipcRenderer.invoke('kova:terminal:start', options),
    write: (id, data) => ipcRenderer.invoke('kova:terminal:write', id, data),
    onData: (id, callback) => {
      const channel = `kova:terminal:${id}:data`
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on(channel, listener)

      return () => ipcRenderer.removeListener(channel, listener)
    },
    onExit: (id, callback) => {
      const channel = `kova:terminal:${id}:exit`
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on(channel, listener)

      return () => ipcRenderer.removeListener(channel, listener)
    }
  },
  onClosePreviewRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('kova:close-preview-requested', listener)

    return () => ipcRenderer.removeListener('kova:close-preview-requested', listener)
  },
  onPreviewNav: callback => {
    const listener = (_event, command) => callback(command)
    ipcRenderer.on('kova:preview-nav', listener)

    return () => ipcRenderer.removeListener('kova:preview-nav', listener)
  },
  onOpenFolderRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('kova:open-folder-requested', listener)

    return () => ipcRenderer.removeListener('kova:open-folder-requested', listener)
  },
  onOpenUpdatesRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('kova:open-updates', listener)

    return () => ipcRenderer.removeListener('kova:open-updates', listener)
  },
  onDeepLink: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('kova:deep-link', listener)

    return () => ipcRenderer.removeListener('kova:deep-link', listener)
  },
  signalDeepLinkReady: () => ipcRenderer.invoke('kova:deep-link-ready'),
  probePluginRepo: payload => ipcRenderer.invoke('kova:plugin:probe', payload),
  installDesktopPlugin: payload => ipcRenderer.invoke('kova:plugin:installDesktop', payload),
  onWindowStateChanged: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('kova:window-state-changed', listener)

    return () => ipcRenderer.removeListener('kova:window-state-changed', listener)
  },
  onFocusSession: callback => {
    const listener = (_event, sessionId) => callback(sessionId)
    ipcRenderer.on('kova:focus-session', listener)

    return () => ipcRenderer.removeListener('kova:focus-session', listener)
  },
  onNotificationAction: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('kova:notification-action', listener)

    return () => ipcRenderer.removeListener('kova:notification-action', listener)
  },
  onNotificationActivate: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('kova:notification-activate', listener)

    return () => ipcRenderer.removeListener('kova:notification-activate', listener)
  },
  onPreviewFileChanged: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('kova:preview-file-changed', listener)

    return () => ipcRenderer.removeListener('kova:preview-file-changed', listener)
  },
  onBackendExit: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('kova:backend-exit', listener)

    return () => ipcRenderer.removeListener('kova:backend-exit', listener)
  },
  // Soft gateway-mode apply finished tearing down the primary backend. Renderer
  // should wipe session lists + re-dial without a window reload.
  onConnectionApplied: callback => {
    const listener = () => callback()
    ipcRenderer.on('kova:connection:applied', listener)

    return () => ipcRenderer.removeListener('kova:connection:applied', listener)
  },
  onPowerResume: callback => {
    const listener = () => callback()
    ipcRenderer.on('kova:power-resume', listener)

    return () => ipcRenderer.removeListener('kova:power-resume', listener)
  },
  // AC ↔ battery transitions; renderers slow their backstop polls on battery.
  getOnBattery: () => ipcRenderer.invoke('kova:power-battery:get'),
  onBatteryChanged: callback => {
    const listener = (_event, onBattery) => callback(Boolean(onBattery))
    ipcRenderer.on('kova:power-battery', listener)

    return () => ipcRenderer.removeListener('kova:power-battery', listener)
  },
  onBootProgress: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('kova:boot-progress', listener)

    return () => ipcRenderer.removeListener('kova:boot-progress', listener)
  },
  // First-launch bootstrap progress -- emitted by the install.ps1 stage
  // runner in main.ts (apps/desktop/electron/bootstrap-runner.ts).
  // Renderer's install overlay subscribes to live events and queries the
  // current snapshot via getBootstrapState() to recover after a devtools
  // reload mid-bootstrap.
  getBootstrapState: () => ipcRenderer.invoke('kova:bootstrap:get'),
  continueBootstrapLocal: () => ipcRenderer.invoke('kova:bootstrap:continue-local'),
  resetBootstrap: () => ipcRenderer.invoke('kova:bootstrap:reset'),
  repairBootstrap: () => ipcRenderer.invoke('kova:bootstrap:repair'),
  cancelBootstrap: () => ipcRenderer.invoke('kova:bootstrap:cancel'),
  onBootstrapEvent: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('kova:bootstrap:event', listener)

    return () => ipcRenderer.removeListener('kova:bootstrap:event', listener)
  },
  getVersion: () => ipcRenderer.invoke('kova:version'),
  getRemoteDisplayReason: () => ipcRenderer.invoke('kova:get-remote-display-reason'),
  uninstall: {
    summary: () => ipcRenderer.invoke('kova:uninstall:summary'),
    run: mode => ipcRenderer.invoke('kova:uninstall:run', { mode })
  },
  updates: {
    check: () => ipcRenderer.invoke('kova:updates:check'),
    apply: opts => ipcRenderer.invoke('kova:updates:apply', opts),
    getBranch: () => ipcRenderer.invoke('kova:updates:branch:get'),
    setBranch: name => ipcRenderer.invoke('kova:updates:branch:set', name),
    onProgress: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('kova:updates:progress', listener)

      return () => ipcRenderer.removeListener('kova:updates:progress', listener)
    }
  },
  themes: {
    fetchMarketplace: id => ipcRenderer.invoke('kova:vscode-theme:fetch', id),
    searchMarketplace: query => ipcRenderer.invoke('kova:vscode-theme:search', query)
  },
  // Find-in-page (Ctrl/Cmd+F): delegates to Electron's
  // webContents.findInPage on the IPC sender's window so a Cmd+F pressed
  // in a secondary session window searches THAT window, not the primary.
  // `onFoundInPage` returns the unsubscribe fn; the renderer wires it via
  // `initFindInPageListener` in store/find-in-page.ts and tears it down
  // when the FindBar unmounts.
  findInPage: (query, options) => ipcRenderer.invoke('kova:find-in-page', query, options),
  stopFindInPage: () => ipcRenderer.invoke('kova:stop-find-in-page'),
  onFoundInPage: callback => {
    const listener = (_event, result) => callback(result)
    ipcRenderer.on('kova:found-in-page', listener)

    return () => ipcRenderer.removeListener('kova:found-in-page', listener)
  },
  // Main-process `before-input-event` forwards Ctrl/Cmd+F here so renderer
  // can open the FindBar even when the GTK compositor has already grabbed
  // the chord at the windowing layer (#81727).
  onOpenFindBarRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('kova:open-find-bar', listener)

    return () => ipcRenderer.removeListener('kova:open-find-bar', listener)
  }
})
