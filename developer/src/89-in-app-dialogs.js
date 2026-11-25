// ---- v0.99.82 the app's own dialogs instead of the browser's alert() / confirm() / prompt() boxes, a leftover from the first versions:
// those stop the whole page, look like the operating system rather than the app, and on phones can be blocked.
// appAsk(title, text, okText, danger) -> Promise<boolean>   appNotice(title, text)   appAskNumber(title, note, def) -> Promise<number|null>
function appAsk(title, text, okText, danger) {
  return new Promise(res => { const m = modal(title, { width: 440 }); let done = false; const end = v => { if (done) return; done = true; m.close(); res(v); };
    m.body.append(h('div', { class: 'psub', text }));
    m.foot.append(h('button', { text: 'Cancel', onclick: () => end(false) }), h('button', { class: danger ? 'danger' : 'primary', text: okText || 'OK', onclick: () => end(true) }));
    const obs = new MutationObserver(() => { if (!document.body.contains(m.el || m.body)) { obs.disconnect(); end(false); } }); try { obs.observe(document.body, { childList: true, subtree: true }); } catch (e) { /* no observer */ } });
}
function appNotice(title, text) { try { toast(title, text); } catch (e) { /* no table yet */ } try { log(`${title}: ${text}`); } catch (e) { /* no game */ } }
function appAskNumber(title, note, def) { return new Promise(res => askNumber(title, note, def, v => res(v))); }
