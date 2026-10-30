(() => {
  'use strict';
  const RELEASE_API = 'https://api.github.com/repos/annouli48-coder/alex-reuploader/releases/tags/alex-executor-v0.1.0';
  const DEFAULT_CODE = '-- Welcome to ALEX Code\nlocal message = "Hello, world!"\nprint(message)';
  const STORAGE_KEY = 'alex-code-editor-v1';
  const $ = (id) => document.getElementById(id);
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isiOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(navigator.userAgent);
  const isMac = /Macintosh|Mac OS/i.test(navigator.userAgent) && !isiOS;
  const isWindows = /Windows/i.test(navigator.userAgent);
  const status = $('editor-status');
  const code = $('code-input');
  const nameField = $('script-name');
  const gutter = $('code-gutter');
  let deferredInstall = null;
  let lastSaved = null;

  function textStatus(message) {
    status.textContent = message;
  }
  function safeName(value) {
    const x = (value || 'script.luau').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
    return (x || 'script.luau').slice(0, 90);
  }
  function updateLines() {
    const count = code.value.split('\n').length;
    gutter.textContent = Array.from({length: count}, (_, i) => i + 1).join('\n');
    $('editor-lines').textContent = `${count} line${count === 1 ? '' : 's'} · Luau`;
    gutter.scrollTop = code.scrollTop;
  }
  function loadSaved() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const value = JSON.parse(raw);
      if (!value || typeof value.content !== 'string' || typeof value.name !== 'string') return false;
      if (value.content.length > 1000000) return false;
      code.value = value.content;
      nameField.value = safeName(value.name);
      lastSaved = raw;
      textStatus('Restored last saved script from this device.');
      return true;
    } catch {
      textStatus('Local storage is unavailable; use Export to keep a backup.');
      return false;
    }
  }
  function saveLocal() {
    try {
      const record = JSON.stringify({name: safeName(nameField.value), content: code.value, savedAt: Date.now()});
      if (record.length > 1000000) {
        textStatus('This file is too large for local storage. Use Export instead.');
        return;
      }
      localStorage.setItem(STORAGE_KEY, record);
      lastSaved = record;
      nameField.value = safeName(nameField.value);
      textStatus('✓ Saved on this device. Export a backup for safekeeping.');
    } catch {
      textStatus('Could not save locally. Your browser may be in private mode; use Export.');
    }
  }
  function newDocument() {
    if (code.value && lastSaved !== JSON.stringify({name: safeName(nameField.value), content: code.value, savedAt: 0})) {
      // No destructive navigation confirmation; editor remains available in history.
    }
    code.value = '-- New ALEX script\n';
    nameField.value = 'untitled.luau';
    textStatus('New script created. Press Save or Export to keep it.');
    updateLines();
    code.focus();
  }
  function exportFile() {
    const filename = safeName(nameField.value);
    const blob = new Blob([code.value], {type: 'text/plain;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
    textStatus('Export requested: ' + filename + '. Check your downloads.');
  }
  code.addEventListener('scroll', () => { gutter.scrollTop = code.scrollTop; });
  code.addEventListener('input', () => { updateLines(); textStatus('Unsaved changes. Press Save or Export.'); });
  code.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      code.setRangeText('  ', code.selectionStart, code.selectionEnd, 'end');
      code.dispatchEvent(new Event('input'));
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      saveLocal();
    }
  });
  nameField.addEventListener('input', () => textStatus('Name changed. Press Save or Export.'));
  $('save-code').addEventListener('click', saveLocal);
  $('new-code').addEventListener('click', newDocument);
  $('export-code').addEventListener('click', exportFile);
  $('open-code').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (file.size > 1000000) {
      textStatus('Import must be under 1 MB. Desktop app supports larger files.');
      event.target.value = '';
      return;
    }
    try {
      const contents = await file.text();
      code.value = contents;
      nameField.value = safeName(file.name);
      updateLines();
      textStatus('Imported ' + nameField.value + '. Press Save to keep it on this device.');
    } catch {
      textStatus('Import failed; try another .lua, .luau, or .txt file.');
    } finally {
      event.target.value = '';
    }
  });
  loadSaved();
  updateLines();

  const platform = isiOS ? 'iPhone / iPad detected' :
    isAndroid ? 'Android detected' :
    isMac ? 'Mac detected' :
    isWindows ? 'Windows detected' : 'Browser detected';
  $('device-detected').textContent = '✳ ' + platform;
  if (isiOS) $('mobile-card').classList.add('detected');
  if (isAndroid) $('android-card').classList.add('detected');
  if (isMac) $('mac-card').classList.add('detected');
  if (isWindows) $('windows-card').classList.add('detected');

  async function refreshDesktopReleases() {
    const label = $('release-status-text');
    const links = document.querySelectorAll('.download-link');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(RELEASE_API, {
        signal: controller.signal,
        headers: {'Accept': 'application/vnd.github+json'}
      });
      if (response.status === 404) {
        label.textContent = 'Desktop prerelease not published yet. Buttons unlock only when verified files are available.';
        return;
      }
      if (!response.ok) throw new Error('Release service temporarily unavailable');
      const release = await response.json();
      if (release.draft || !Array.isArray(release.assets)) throw new Error('No published release assets');
      const assets = new Map(release.assets.map(a => [a.name, a]));
      let enabled = 0;
      for (const link of links) {
        const name = link.dataset.asset;
        const asset = assets.get(name);
        const checksum = assets.get(name + '.sha256');
        if (!asset || !checksum || asset.size < 10000 || !asset.browser_download_url ||
            !checksum.browser_download_url) continue;
        link.href = asset.browser_download_url;
        link.setAttribute('aria-disabled', 'false');
        link.removeAttribute('title');
        enabled++;
      }
      label.textContent = enabled === links.length ?
        'Desktop prerelease published. All three packages and SHA-256 files are available. These are unsigned editor builds.' :
        `Desktop release partially available (${enabled}/3 platforms). Other download buttons remain disabled.`;
    } catch {
      label.textContent = 'Could not verify the desktop release right now. View GitHub Releases for the latest status.';
    } finally {
      clearTimeout(timeout);
    }
  }
  document.querySelectorAll('.download-link').forEach(link => link.addEventListener('click', (event) => {
    if (link.getAttribute('aria-disabled') === 'true') {
      event.preventDefault();
      $('download-info').scrollIntoView({behavior: 'smooth', block: 'center'});
    }
  }));
  refreshDesktopReleases();

  const dialog = $('install-dialog');
  const steps = $('install-steps');
  function showInstructions(type) {
    steps.replaceChildren();
    const iOSsteps = [
      'Open this website in Safari on your iPhone or iPad.',
      'Tap Share (square with upward arrow).',
      'Scroll to Add to Home Screen; on newer iOS versions, choose Open as Web App if prompted.',
      'Tap Add, then launch the purple ALEX icon from your Home Screen.'
    ];
    const androidSteps = [
      'Open this website in Chrome on your Android phone or tablet.',
      'Tap the browser menu (three dots).',
      'Tap Install app or Add to Home screen (wording varies).',
      'Confirm Install, then open ALEX from your Home Screen.'
    ];
    for (const item of type === 'ios' ? iOSsteps : androidSteps) {
      const li = document.createElement('li');
      li.textContent = item;
      steps.appendChild(li);
    }
    $('dialog-title').textContent = type === 'ios' ? 'Install on iPhone / iPad' : 'Install on Android';
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }
  $('ios-install').addEventListener('click', () => showInstructions('ios'));
  $('android-install').addEventListener('click', async () => {
    if (deferredInstall) {
      const promptEvent = deferredInstall;
      deferredInstall = null;
      try { await promptEvent.prompt(); } catch { showInstructions('android'); }
    } else {
      showInstructions('android');
    }
  });
  $('close-dialog').addEventListener('click', () => dialog.close());
  $('dialog-done').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstall = event;
    $('android-install').firstChild.textContent = 'Install ALEX now ';
  });
  window.addEventListener('appinstalled', () => {
    deferredInstall = null;
    textStatus('ALEX Code installed on this device.');
  });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {
        // Browser editing works even if offline caching is unavailable.
      });
    });
  }
})();
