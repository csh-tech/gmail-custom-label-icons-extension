// Serves a locale's messages.json so the content script can follow Gmail's UI language.
const messageCache = new Map();

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'getMessages') return;
  const locale = String(msg.locale || '');
  if (!/^[A-Za-z0-9_]+$/.test(locale)) { sendResponse({ ok: false }); return; }
  if (messageCache.has(locale)) { sendResponse({ ok: true, messages: messageCache.get(locale) }); return; }
  fetch(chrome.runtime.getURL(`_locales/${locale}/messages.json`))
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(messages => { messageCache.set(locale, messages); sendResponse({ ok: true, messages }); })
    .catch(() => sendResponse({ ok: false }));
  return true; // async response
});
