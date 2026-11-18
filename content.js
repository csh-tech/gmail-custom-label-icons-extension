(() => {
  'use strict';

  const STORAGE_KEY = 'labelIcons';
  const ICON_SIZE = 64;
  let currentLabel = null;
  let armedAt = 0; // timestamp of the last interaction with a label control
  let icons = {}; // { [label]: { src, type: 'file'|'url', url?, fileName? } }

  // User-facing text lives in _locales/<locale>/messages.json (chrome.i18n format).
  // The locale follows Gmail's UI language; chrome.i18n (browser language) is the fallback.
  let messages = null;
  let uiDir = 'ltr';
  const RTL_LANGS = new Set(['he', 'ar', 'fa', 'ur', 'yi']);
  const LEGACY_CODES = { iw: 'he', in: 'id', ji: 'yi' };

  const m = (key, subs = []) => {
    const entry = messages && messages[key];
    if (entry && typeof entry.message === 'string') {
      return subs.reduce((str, v, i) => str.split('$' + (i + 1)).join(v), entry.message);
    }
    return chrome.i18n.getMessage(key, subs) || key;
  };

  function gmailLocales() {
    const raw = (document.documentElement.lang || '').replace('-', '_');
    if (!raw) return [];
    const base = raw.split('_')[0].toLowerCase();
    const fixed = LEGACY_CODES[base] || base;
    uiDir = RTL_LANGS.has(fixed) ? 'rtl' : 'ltr';
    return [...new Set([raw.replace(base, fixed), fixed])];
  }

  function requestMessages(locale) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'getMessages', locale }, (res) => {
        resolve(!chrome.runtime.lastError && res && res.ok ? res.messages : null);
      });
    });
  }

  async function loadMessages() {
    for (const locale of gmailLocales()) {
      const found = await requestMessages(locale);
      if (found) { messages = found; return; }
    }
    // No matching locale file: fall back to the browser language.
    uiDir = chrome.i18n.getMessage('@@bidi_dir') || uiDir;
  }

  const ready = loadMessages();

  /* ---------- Storage and style injection ---------- */

  const styleEl = document.createElement('style');
  styleEl.id = 'gli-style';
  document.documentElement.appendChild(styleEl);

  const escAttr = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  // Quote-safe CSS url(): escapes characters that could end the string early.
  const cssUrl = (u) => 'url("' + String(u).replace(/[\\"\n\r\f]/g, c => '\\' + c.charCodeAt(0).toString(16) + ' ') + '")';

  function renderStyles() {
    let css = '';
    for (const [name, entry] of Object.entries(icons)) {
      const names = new Set([name]);
      // Nested labels: data-tooltip may hold only the last path segment.
      if (name.includes('/')) names.add(name.split('/').pop());
      const selector = [...names]
        .map(n => `div[data-tooltip="${escAttr(n)}"] .qj.aEe.qr`)
        .join(',\n');
      css += `${selector} {
  -webkit-mask: none !important;
  mask: none !important;
  background: ${cssUrl(entry.src)} center / contain no-repeat !important;
  background-color: transparent !important;
  opacity: 1 !important;
}\n`;
    }
    styleEl.textContent = css;
  }

  // Backward compatibility with the old format (plain data: string).
  function normalizeStored(raw) {
    const out = {};
    for (const [k, v] of Object.entries(raw || {})) {
      out[k] = typeof v === 'string' ? { src: v, type: 'file', fileName: '' } : v;
    }
    return out;
  }

  async function loadIcons() {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    icons = normalizeStored(data[STORAGE_KEY]);
    renderStyles();
  }

  async function saveIcon(label, entry) {
    icons[label] = entry;
    await chrome.storage.local.set({ [STORAGE_KEY]: icons });
    renderStyles();
  }

  async function removeIcon(label) {
    delete icons[label];
    await chrome.storage.local.set({ [STORAGE_KEY]: icons });
    renderStyles();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEY]) {
      icons = normalizeStored(changes[STORAGE_KEY].newValue);
      renderStyles();
    }
  });

  loadIcons();

  /* ---------- Detect which label was clicked ---------- */

  // The "more" (▼) button carries the full label name.
  document.addEventListener('mousedown', (e) => {
    const btn = e.target.closest && e.target.closest('[data-label-name]');
    if (btn) { currentLabel = btn.getAttribute('data-label-name'); armedAt = Date.now(); }
  }, true);

  // Right-click on the label row.
  document.addEventListener('contextmenu', (e) => {
    const row = e.target.closest && e.target.closest('div[data-tooltip]');
    if (!row) return;
    const inner = row.querySelector('[data-label-name]');
    if (inner) { currentLabel = inner.getAttribute('data-label-name'); armedAt = Date.now(); }
  }, true);

  /* ---------- Inject the menu item ---------- */

  // The label menu is recognised by structure, never by text, so it works in every Gmail language:
  //   first row  = a menuitem that opens a submenu (label colour)
  //   other rows = at least three plain menuitems (edit / remove / add sublabel)
  //                plus checkbox items (show / hide options)
  const ARMED_WINDOW_MS = 3000;

  function plainItems(menu) {
    return [...menu.querySelectorAll(':scope > [role="menuitem"]')]
      .filter(el => el.getAttribute('aria-haspopup') !== 'true');
  }

  function isLabelMenu(menu) {
    if (Date.now() - armedAt > ARMED_WINDOW_MS) return false; // opened from a label control
    const first = menu.querySelector(':scope > [role="menuitem"]');
    if (!first || first.getAttribute('aria-haspopup') !== 'true') return false;
    if (!menu.querySelector(':scope > [role="menuitemcheckbox"]')) return false;
    return plainItems(menu).length >= 3;
  }

  function isVisible(menu) {
    return menu.style.display !== 'none' && menu.style.visibility !== 'hidden';
  }

  function injectItem(menu) {
    if (menu.querySelector('.gli-item')) return;
    const editItem = plainItems(menu)[0];
    if (!editItem) return;

    // Clone the first plain item (a simple row without a submenu) to inherit Gmail's styling.
    const item = editItem.cloneNode(true);
    item.removeAttribute('id');
    item.classList.add('gli-item');
    (item.querySelector('.J-N-Jz') || item).textContent = m('menuItem');

    const activate = (e) => {
      e.stopPropagation();
      e.preventDefault();
      const label = currentLabel;
      closeMenu();
      if (label) openPicker(label);
    };
    item.addEventListener('mouseup', activate, true);
    item.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); }, true);
    item.addEventListener('mouseenter', () => item.classList.add('J-N-JT'));
    item.addEventListener('mouseleave', () => item.classList.remove('J-N-JT'));

    // Separator below our item: clone one of Gmail's own, or build an equivalent.
    const existingSep = menu.querySelector(':scope > [role="separator"]');
    let separator;
    if (existingSep) {
      separator = existingSep.cloneNode(true);
      separator.removeAttribute('id');
    } else {
      separator = document.createElement('div');
      separator.className = 'J-Kh J-Kh-KL';
      separator.setAttribute('role', 'separator');
      separator.setAttribute('aria-disabled', 'true');
    }
    separator.classList.add('gli-separator');

    // Top of the menu: [our item] [separator] [Gmail's items...]
    menu.prepend(separator);
    menu.prepend(item);
  }

  function closeMenu() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  }

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      document.querySelectorAll('div.J-M[role="menu"]').forEach(menu => {
        if (isVisible(menu) && isLabelMenu(menu)) injectItem(menu);
      });
    });
  });
  ready.then(() => observer.observe(document.body, {
    childList: true, subtree: true,
    attributes: true, attributeFilter: ['style', 'class']
  }));

  /* ---------- Image processing ---------- */

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(m('errLoad')));
      img.src = src;
    });
  }

  // Downscale to 64px to save storage. GIF/SVG are kept as-is (animation/vector).
  async function normalizeImage(dataUrl) {
    if (/^data:image\/(gif|svg\+xml)/.test(dataUrl)) {
      if (dataUrl.length > 400000) throw new Error(m('errBig'));
      return dataUrl;
    }
    const img = await loadImage(dataUrl);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = ICON_SIZE;
    const ctx = canvas.getContext('2d');
    const scale = Math.min(ICON_SIZE / img.width, ICON_SIZE / img.height);
    const w = img.width * scale, h = img.height * scale;
    ctx.drawImage(img, (ICON_SIZE - w) / 2, (ICON_SIZE - h) / 2, w, h);
    return canvas.toDataURL('image/png');
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(new Error(m('errRead')));
      fr.readAsDataURL(file);
    });
  }

  /* ---------- Image picker dialog (Material 3, values measured from Gmail's "Edit label" dialog) ---------- */


  // Perceived luminance of a CSS colour string; null when transparent or unparsable.
  function luminance(cssColor) {
    const n = (cssColor.match(/[\d.]+/g) || []).map(Number);
    if (n.length < 3 || (n.length > 3 && n[3] === 0)) return null;
    return 0.2126 * n[0] + 0.7152 * n[1] + 0.0722 * n[2];
  }

  // Gmail's theme is independent of the OS theme, so look at the page itself:
  // first an opaque background, then the text colour (light text means a dark theme).
  function isDarkPage() {
    for (const el of [document.body, document.documentElement]) {
      const bg = luminance(getComputedStyle(el).backgroundColor);
      if (bg !== null) return bg < 128;
    }
    const fg = luminance(getComputedStyle(document.body).color);
    return fg !== null ? fg > 128 : false;
  }

  function openPicker(label) {
    document.getElementById('gli-host')?.remove();
        const existing = icons[label] || null;
    const isLocal = !!existing && existing.type === 'file';

    const host = document.createElement('div');
    host.id = 'gli-host';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;';
    const root = host.attachShadow({ mode: 'open' });

    root.innerHTML = `
      <style>
        :host { all: initial; }
        .scrim {
          /* Gmail's gm3 system colours win when defined; light-theme fallbacks otherwise */
          --surface: #ffffff;               /* dialog surface */
          --on-surface: var(--gm3-sys-color-on-surface, #1f1f1f);
          --on-surface-variant: var(--gm3-sys-color-on-surface-variant, #444746);
          --outline: var(--gm3-sys-color-outline, #747775);
          --primary: var(--gm3-sys-color-primary, #0b57d0);
          --on-primary: var(--gm3-sys-color-on-primary, #ffffff);
          --secondary: var(--gm3-sys-color-secondary, #00639b);   /* focus ring */
          --error: var(--gm3-sys-color-error, #b3261e);
          --scrim: rgba(0,0,0,.32);
          position: fixed; inset: 0; background: var(--scrim);
          display: flex; align-items: center; justify-content: center;
          font-family: "Google Sans", Roboto, RobotoDraft, Helvetica, Arial, sans-serif;
          animation: scrim-in .15s linear;
        }
        .scrim.dark {
          /* Same variables, dark fallbacks */
          --surface: #282a2c;
          --on-surface: var(--gm3-sys-color-on-surface, #e3e3e3);
          --on-surface-variant: var(--gm3-sys-color-on-surface-variant, #c4c7c5);
          --outline: var(--gm3-sys-color-outline, #8e918f);
          --primary: var(--gm3-sys-color-primary, #a8c7fa);
          --on-primary: var(--gm3-sys-color-on-primary, #062e6f);
          --secondary: var(--gm3-sys-color-secondary, #7fcfff);
          --error: var(--gm3-sys-color-error, #f2b8b5);
          --scrim: rgba(0,0,0,.5);
          color-scheme: dark;
        }
        * { box-sizing: border-box; }
        @keyframes scrim-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes dialog-in { from { transform: scale(.8); opacity: 0 } to { transform: none; opacity: 1 } }

        /* .uW2Fw-bHo: min-width 280, max-width 560, radius 28, elevation 3 */
        .dialog {
          background: var(--surface); color: var(--on-surface);
          width: 498px; min-width: 280px; max-width: min(560px, calc(100vw - 32px));
          max-height: calc(100% - 32px); overflow-y: auto;
          border-radius: 28px; outline: 0; text-align: start;
          box-shadow: 0 1px 3px 0 rgba(0,0,0,.3), 0 4px 8px 3px rgba(0,0,0,.15);
          animation: dialog-in .15s cubic-bezier(.2,0,0,1);
        }
        /* .uW2Fw-bHp: padding 24 24 16, 1.5rem/2rem, 400 */
        h2 { margin: 0; padding: 24px 24px 16px; font: 400 1.5rem/2rem "Google Sans", Roboto, Arial, sans-serif;
          letter-spacing: 0; color: var(--on-surface); }
        /* .uW2Fw-bHk: .875rem/1.25rem, on-surface-variant, padding 0 24 20 */
        .content { padding: 0 24px 20px; font: 400 .875rem/1.25rem "Google Sans", Roboto, Arial, sans-serif;
          letter-spacing: 0; color: var(--on-surface-variant); }
        .sub { margin: 0 0 16px; word-break: break-word; }
        .field-label { margin-bottom: 8px; }

        .row { display: flex; align-items: center; gap: 12px; }
        .preview { flex: none; width: 56px; height: 56px; border-radius: 4px;
          border: 1px solid var(--outline); background: center / 70% no-repeat; }

        /* Outlined text field: height 56, 1px border, radius 4, padding-inline 16, text 1rem/1.5rem */
        .field { flex: 1; min-width: 0; }
        .field input {
          display: block; width: 100%; height: 56px; padding: 0 16px; margin: 0;
          border: 1px solid var(--outline); border-radius: 4px; outline: none;
          background: none; appearance: none;
          color: var(--on-surface); caret-color: var(--primary);
          font: 400 1rem/1.5rem "Google Sans", Roboto, Arial, sans-serif; letter-spacing: 0;
          text-align: start; unicode-bidi: plaintext; text-overflow: ellipsis;
          transition: opacity .15s cubic-bezier(.4,0,.2,1);
        }
        .field input::placeholder { color: var(--on-surface-variant); opacity: 1; }
        .field input:hover:not(:disabled):not(:focus) { border-color: var(--on-surface); }
        .field input:focus { border: 3px solid var(--primary); padding: 0 14px; }
        .field input:disabled { cursor: not-allowed;
          color: color-mix(in srgb, var(--on-surface) 38%, transparent);
          border-color: color-mix(in srgb, var(--on-surface) 12%, transparent); }

        .or { margin: 16px 0 8px; font-size: .75rem; line-height: 1rem; }
        .hint { margin: 12px 0 0; font-size: .75rem; line-height: 1rem; }
        .err { min-height: 1rem; margin-top: 8px; font-size: .75rem; line-height: 1rem; color: var(--error); }

        /* .uW2Fw-bHg: padding 0 24 20, gap 8, min-height 52, flex-end */
        .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
          min-height: 52px; padding: 0 24px 20px; }
        .spacer { flex: 1; }

        /* Text button: height 40, radius 20, padding-inline 12, min-width 64, .875rem/500 */
        button {
          position: relative; display: inline-flex; align-items: center; justify-content: center;
          gap: 8px; min-width: 64px; height: 40px; padding: 0 12px; margin: 0;
          border: 0; border-radius: 20px; outline: none; background: transparent;
          color: var(--primary); cursor: pointer; user-select: none; vertical-align: middle;
          font: 500 .875rem/1.25rem "Google Sans", Roboto, Arial, sans-serif; letter-spacing: 0;
          transition: border-radius .35s cubic-bezier(.4,.1,.5,1.4);
        }
        button:hover:not(:disabled) { background: color-mix(in srgb, var(--primary) 8%, transparent); }
        button:active:not(:disabled) { background: color-mix(in srgb, var(--primary) 10%, transparent); }
        button:focus-visible { outline: 3px solid var(--secondary); outline-offset: 2px; }
        button:disabled { opacity: .38; cursor: not-allowed; }
        button svg { width: 18px; height: 18px; fill: currentColor; }

        /* Filled button, padding-inline 24 */
        .filled { background: var(--primary); color: var(--on-primary); padding: 0 24px;
          box-shadow: none; transition: box-shadow .2s, border-radius .35s cubic-bezier(.4,.1,.5,1.4); }
        .filled:hover:not(:disabled) {
          background: linear-gradient(color-mix(in srgb, var(--on-primary) 8%, transparent),
            color-mix(in srgb, var(--on-primary) 8%, transparent)), var(--primary);
          box-shadow: 0 1px 3px 1px rgba(0,0,0,.15), 0 1px 2px 0 rgba(0,0,0,.3); }
        .filled:active:not(:disabled) {
          background: linear-gradient(color-mix(in srgb, var(--on-primary) 10%, transparent),
            color-mix(in srgb, var(--on-primary) 10%, transparent)), var(--primary);
          box-shadow: none; }

        .outlined { border: 1px solid var(--outline); padding: 0 24px 0 16px; }
        .danger { color: var(--error); }
        .danger:hover:not(:disabled) { background: color-mix(in srgb, var(--error) 8%, transparent); }
      </style>

      <div class="scrim">
        <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="ttl" dir="${uiDir}">
          <h2 id="ttl"></h2>
          <div class="content">
            <p class="sub"></p>
            <div class="field-label" id="urlLabel"></div>
            <div class="row">
              <div class="preview" id="preview"></div>
              <div class="field"><input type="text" id="url" autocomplete="off" spellcheck="false" aria-labelledby="urlLabel"></div>
            </div>

            <div id="fileSection">
              <p class="or"></p>
              <button class="outlined" id="pick" type="button">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"/></svg>
                <span id="pickText"></span>
              </button>
              <input type="file" id="file" accept="image/*" hidden>
            </div>

            <p class="hint" id="hint" style="display:none"></p>
            <div class="err" id="err" role="alert"></div>
          </div>

          <div class="actions">
            <button class="danger" id="remove" type="button"></button>
            <span class="spacer"></span>
            <button id="cancel" type="button"></button>
            <button class="filled" id="save" type="button"></button>
          </div>
        </div>
      </div>`;

    document.body.appendChild(host);

    const $ = (id) => root.getElementById(id);
    if (isDarkPage()) root.querySelector('.scrim').classList.add('dark');
    $('ttl').textContent = m('menuItem');
    root.querySelector('.sub').textContent = m('dialogLabel', [label]);
    $('urlLabel').textContent = m('urlLabel');
    root.querySelector('.or').textContent = m('or');
    $('pickText').textContent = m('pickFile');
    $('save').textContent = m('save');
    $('cancel').textContent = m('cancel');
    $('remove').textContent = m('remove');

    const urlInput = $('url'), preview = $('preview'), err = $('err'), saveBtn = $('save');
    urlInput.placeholder = m('urlPlaceholder');
    let pending = null; // { dataUrl, fileName } for a chosen file that is not saved yet
    const setErr = (m) => { err.textContent = m || ''; };
    const close = () => host.remove();
    const setPreview = (src) => { preview.style.backgroundImage = src ? cssUrl(src) : ''; };

    if (existing) setPreview(existing.src);
    else $('remove').style.display = 'none';

    if (isLocal) {
      // Local image: the field is greyed out and locked until the image is removed
      urlInput.value = m('localFile', [existing.fileName || '']);
      urlInput.disabled = true;
      $('fileSection').style.display = 'none';
      saveBtn.style.display = 'none';
      $('cancel').textContent = m('close');
      $('cancel').classList.add('filled');
      $('hint').textContent = m('localHint');
      $('hint').style.display = 'block';
    } else if (existing && existing.type === 'url') {
      urlInput.value = existing.url || '';
    }

    root.querySelector('.scrim').addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('scrim')) close();
    });
    host.addEventListener('keydown', (e) => {
      e.stopPropagation(); // keep Gmail keyboard shortcuts from firing
      if (e.key === 'Escape') close();
      if (e.key === 'Enter' && e.target === urlInput && !saveBtn.disabled) saveBtn.click();
    });
    host.addEventListener('keyup', (e) => e.stopPropagation());
    host.addEventListener('keypress', (e) => e.stopPropagation());
    $('cancel').onclick = close;

    $('pick').onclick = () => $('file').click();
    $('file').onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const dataUrl = await fileToDataUrl(f);
        urlInput.value = m('localFile', [f.name]);
        pending = { dataUrl, fileName: f.name }; // set after the value so it is not cleared
        setPreview(dataUrl);
        setErr('');
      } catch (ex) { setErr(ex.message); }
    };

    urlInput.addEventListener('input', () => {
      pending = null;
      const v = urlInput.value.trim();
      setPreview(/^https:\/\//i.test(v) ? v : '');
    });

    $('remove').onclick = async () => { await removeIcon(label); close(); };

    saveBtn.onclick = async () => {
      setErr('');
      saveBtn.disabled = true;
      try {
        if (pending) {
          const src = await normalizeImage(pending.dataUrl);
          await saveIcon(label, { src, type: 'file', fileName: pending.fileName });
        } else {
          const url = urlInput.value.trim();
          if (!url) throw new Error(m('errNeed'));
          if (existing && existing.type === 'url' && existing.url === url) { close(); return; }
          if (!/^https:\/\//i.test(url)) throw new Error(m('errUrl'));
          await loadImage(url); // make sure it really loads in this page
          await saveIcon(label, { src: url, type: 'url', url });
        }
        close();
      } catch (ex) {
        setErr(ex.message || m('errGeneric'));
        saveBtn.disabled = false;
      }
    };

    if (!isLocal) urlInput.focus();
  }
})();
