// Automation Summary tab (feedback #45, ported from SFMC Automation Viewer): on an
// Automation Studio automation page (#Instance/<id> in Automation Studio's frame or in
// the address), a tab on the right edge opens a summary of that automation with every step's activities (read by the
// service worker: AUTOMATION_SUMMARY), with a link into Marketing Cloud Toolkit.
// Runs in a shadow root so Automation Studio's styles and ours do not mix. Off with
// Settings > Connection > "Automation Summary tab in Automation Studio".
(function () {
  'use strict';
  if (window.top !== window) return;

  var SETTING = '_automationPanel';
  var HOST_ID = 'sfmc-toolkit-automation-summary';
  // SFMC Automation Viewer's own tab: if it is on the page, ours stays away.
  var VIEWER_ID = 'query-studio-opener';
  var STATUS = { '-1': 'Error', 0: 'Build error', 1: 'Building', 2: 'Ready', 3: 'Running', 4: 'Paused', 5: 'Stopped', 6: 'Scheduled', 7: 'Awaiting trigger', 8: 'Inactive trigger' };
  var TYPES = { 42: 'Send Email', 43: 'Import', 53: 'File Transfer', 73: 'Data Extract', 84: 'Report', 300: 'SQL Query', 303: 'Filter', 423: 'Script', 425: 'Data Factory Utility', 467: 'Wait', 724: 'Refresh Group', 725: 'SMS', 726: 'Import to Mobile', 736: 'Push', 749: 'Fire Event', 771: 'Salesforce Send', 783: 'Refresh Mobile List', 952: 'Journey Builder', 1000: 'Verification', 1101: 'Interaction Studio' };

  var host = null;
  var root = null;
  var open = false;
  var loadedFor = '';
  var token = 0;
  var enabled = true;
  var lastKey = '';
  // The URL Automation Studio's frame (mc.<stack>.marketingcloudapps.com, a cross-origin
  // iframe this script does not run in) last reported. It posts {msg: 'urlChange', url}
  // to the page on every route change, back and forward included, and the shell copies
  // only some of them into the address (checkpoint: true), so the frame's own URL is what
  // the user sees (live test, 2026-11-07). Null until it reports, and after the address
  // leaves Automation Studio.
  var frameUrl = null;

  function parse(href) {
    try {
      var url = new URL(href);
      var parts = url.hostname.split('.');
      if (parts[0] !== 'mc' || !/^s\d+$/i.test(parts[1] || '')) return null;
      var decoded = decodeURIComponent(url.pathname + url.search + url.hash);
      var m = decoded.match(/#Instance\/([^/?#\s]+)/i) || url.pathname.match(/\/Instance\/([^/?#]+)/i);
      return m ? { stack: parts[1].toLowerCase(), id: m[1] } : null;
    } catch (e) {
      return null;
    }
  }

  function inAutomationStudio(href) {
    try { return /#app\/Automation Studio(\/|$)/i.test(decodeURIComponent(new URL(href).hash)); } catch (e) { return false; }
  }

  // The automation on screen: Automation Studio's frame when it has reported, else the address.
  function current() {
    if (!inAutomationStudio(location.href)) return parse(location.href);
    return frameUrl !== null ? parse(frameUrl) : parse(location.href);
  }

  function onMessage(e) {
    if (e.source === window || !/^https:\/\/mc\.s\d+\.marketingcloudapps\.com$/i.test(e.origin || '')) return;
    var d = e.data;
    if (typeof d === 'string') {
      if (d.indexOf('urlChange') < 0) return;
      try { d = JSON.parse(d); } catch (x) { return; }
    }
    if (!d || d.msg !== 'urlChange' || typeof d.url !== 'string') return;
    if (d.url.indexOf(e.origin + '/AutomationStudioFuel3/') !== 0 || !inAutomationStudio(location.href)) return;
    frameUrl = d.url;
    check();
  }

  function statusName(v) {
    if (v === null || v === undefined || v === '') return '\u2014';
    var n = Number(v);
    if (Number.isInteger(n) && STATUS[n] !== undefined && String(n) === String(v).trim()) return STATUS[n];
    // PausedSchedule -> Paused schedule (as in the Toolkit, live test 2026-11-08).
    var s = String(v);
    return /^[A-Z][a-z]+(?:[A-Z][a-z]+)+$/.test(s) ? s.replace(/(?!^)([A-Z])/g, function (c) { return ' ' + c.toLowerCase(); }) : s;
  }

  function date(v) {
    if (!v) return '\u2014';
    var d = new Date(v);
    // SFMC sends 0001-01-01 when there is no date.
    return isNaN(d.getTime()) || d.getFullYear() < 1900 ? '\u2014' : d.toLocaleString();
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // After Marketing Cloud Toolkit is updated or reloaded, this copy of the script is cut off
  // from it (Chrome does not replace content scripts in open pages).
  var ORPHANED = 'Marketing Cloud Toolkit was updated since this page was opened, so the summary cannot reach it.';
  function orphaned() {
    try { return !chrome.runtime || !chrome.runtime.id; } catch (e) { return true; }
  }

  function send(message) {
    return new Promise(function (resolve, reject) {
      if (orphaned()) return reject(Object.assign(new Error(ORPHANED), { orphaned: true }));
      try {
        chrome.runtime.sendMessage(message, function (res) {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (!res) return reject(new Error('No reply from Marketing Cloud Toolkit.'));
          if (res.error) return reject(new Error(res.error));
          resolve(res);
        });
      } catch (e) {
        // The extension was updated or reloaded: this page has to be reloaded.
        reject(Object.assign(new Error(ORPHANED), { orphaned: true }));
      }
    });
  }

  var CSS = [
    ':host{all:initial}',
    '.wrap{position:fixed;top:0;right:0;bottom:0;z-index:2147483646;display:flex;align-items:center;pointer-events:none;font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1e293b}',
    '.tab{pointer-events:auto;writing-mode:vertical-rl;transform:rotate(180deg);background:#0070d2;color:#fff;border:0;border-radius:0 8px 8px 0;padding:14px 7px;font:600 12px/1 inherit;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.2)}',
    '.tab:hover{background:#005fb2}.tab:focus-visible{outline:2px solid #7fb8ec;outline-offset:2px}',
    '.panel{pointer-events:auto;display:none;flex-direction:column;width:420px;height:100%;background:#fff;border-left:1px solid #e2e8f0;box-shadow:-6px 0 18px rgba(0,0,0,.12)}',
    '.open .panel{display:flex}',
    '.head{padding:12px 14px;border-bottom:1px solid #e2e8f0;display:flex;align-items:flex-start;gap:8px}',
    '.title{font-weight:700;font-size:14px;margin:0;flex:1}.sub{color:#64748b;font-size:11px;margin:2px 0 0}',
    '.x{border:0;background:none;font-size:18px;line-height:1;cursor:pointer;color:#64748b;padding:0 2px}',
    '.body{flex:1;overflow:auto;padding:10px 14px}',
    '.row{display:grid;grid-template-columns:110px 1fr;gap:8px;padding:4px 0;border-bottom:1px solid #f1f5f9}',
    '.k{color:#64748b;font-size:12px}.v{font-size:12px;word-break:break-word}',
    '.h{font-weight:600;font-size:12px;margin:12px 0 4px}',
    '.step{font-size:12px;margin:2px 0 6px}.step b{color:#0070d2}',
    '.act{display:flex;gap:6px;padding:2px 0 2px 10px;font-size:12px}.t{color:#64748b;white-space:nowrap}',
    '.msg{color:#64748b;font-size:12px;padding:6px 0}.err{color:#b91c1c;font-size:12px;padding:6px 0}',
    '.foot{padding:10px 14px;border-top:1px solid #e2e8f0;display:flex;gap:8px}',
    '.btn{flex:1;border:1px solid #0070d2;background:#0070d2;color:#fff;border-radius:6px;padding:7px 10px;font:600 12px/1 inherit;cursor:pointer}',
    '.btn.alt{background:#fff;color:#0070d2}',
    '.card{border:1px solid #e2e8f0;border-radius:6px;padding:6px 8px;margin:4px 0 8px}',
    '.ct{font-size:12px;font-weight:600;margin:0 0 2px}.ct .t{font-weight:400;margin-right:4px}',
    '.kv{display:grid;grid-template-columns:96px 1fr;gap:2px 8px;font-size:11px}.kv .k{font-size:11px}',
    'details summary{cursor:pointer;color:#0070d2;font-size:11px;margin-top:4px}',
    'pre{margin:4px 0 0;max-height:220px;overflow:auto;background:#f1f5f9;border-radius:4px;padding:6px;font:11px/1.4 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-word}',
    '.note{color:#64748b;font-size:11px}',
    '@media (prefers-color-scheme: dark){.panel{background:#0f172a;color:#e2e8f0;border-color:#1e293b}.head,.foot{border-color:#1e293b}.row,.card{border-color:#1e293b}.btn.alt{background:#0f172a}pre{background:#1e293b}}',
  ].join('');

  function mount() {
    if (host && document.contains(host)) return;
    if (document.getElementById(VIEWER_ID)) return;
    host = document.createElement('div');
    host.id = HOST_ID;
    root = host.attachShadow({ mode: 'open' });
    var style = document.createElement('style');
    style.textContent = CSS;
    var wrap = el('div', 'wrap');
    var tab = el('button', 'tab', 'Automation Summary');
    tab.type = 'button';
    tab.setAttribute('aria-expanded', 'false');
    tab.title = 'Marketing Cloud Toolkit: summary of this automation';
    tab.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); setOpen(!open); });
    var panel = el('aside', 'panel');
    panel.setAttribute('aria-label', 'Automation summary');
    var head = el('div', 'head');
    var titles = el('div');
    titles.style.flex = '1';
    titles.appendChild(el('p', 'title', 'Automation summary'));
    titles.appendChild(el('p', 'sub', 'Marketing Cloud Toolkit'));
    var x = el('button', 'x', '\u00d7');
    x.type = 'button';
    x.setAttribute('aria-label', 'Close');
    x.addEventListener('click', function () { setOpen(false); });
    head.appendChild(titles);
    head.appendChild(x);
    var body = el('div', 'body');
    body.appendChild(el('div', 'msg', 'Loading...'));
    var foot = el('div', 'foot');
    var openBtn = el('button', 'btn', 'Open in Marketing Cloud Toolkit');
    openBtn.type = 'button';
    openBtn.addEventListener('click', function () {
      var ctx = current();
      if (ctx) send({ type: 'OPEN_APP', path: '/automations/' + encodeURIComponent(ctx.id) }).catch(function (e) { showError(e.message, !!e.orphaned); });
    });
    var reload = el('button', 'btn alt', 'Refresh');
    reload.type = 'button';
    reload.addEventListener('click', function () { loadedFor = ''; load(); });
    foot.appendChild(openBtn);
    foot.appendChild(reload);
    panel.appendChild(head);
    panel.appendChild(body);
    panel.appendChild(foot);
    wrap.appendChild(panel);
    wrap.insertBefore(tab, panel);
    root.appendChild(style);
    root.appendChild(wrap);
    (document.body || document.documentElement).appendChild(host);
  }

  function unmount() {
    token++;
    open = false;
    loadedFor = '';
    if (host) host.remove();
    host = null;
    root = null;
  }

  function setOpen(v) {
    open = v;
    if (!root) return;
    root.querySelector('.wrap').classList.toggle('open', v);
    root.querySelector('.tab').setAttribute('aria-expanded', v ? 'true' : 'false');
    if (v && loadedFor !== key(current())) load();
  }

  function body() { return root && root.querySelector('.body'); }
  function showError(text, canReload) {
    var b = body();
    if (!b) return;
    b.textContent = '';
    b.appendChild(el('div', 'err', text));
    if (canReload) {
      var r = el('button', 'btn', 'Reload this page');
      r.type = 'button';
      r.style.flex = 'none';
      r.addEventListener('click', function () { location.reload(); });
      b.appendChild(r);
    }
  }

  function row(b, k, v) {
    var r = el('div', 'row');
    r.appendChild(el('div', 'k', k));
    r.appendChild(el('div', 'v', v === undefined || v === null || v === '' ? '\u2014' : String(v)));
    b.appendChild(r);
  }

  function activityCard(a) {
    var c = el('div', 'card');
    var t = el('div', 'ct');
    t.appendChild(el('span', 't', a.type || 'Activity'));
    t.appendChild(document.createTextNode(a.title || ''));
    c.appendChild(t);
    if (a.rows && a.rows.length) {
      var kv = el('div', 'kv');
      a.rows.forEach(function (r) { kv.appendChild(el('div', 'k', r[0])); kv.appendChild(el('div', 'v', r[1])); });
      c.appendChild(kv);
    }
    if (a.code && a.code.text) {
      var det = document.createElement('details');
      det.appendChild(el('summary', '', a.type === 'Script' ? 'Script' : 'SQL'));
      det.appendChild(el('pre', '', a.code.text + (a.code.cut ? '\n...' : '')));
      c.appendChild(det);
    }
    if (a.error) c.appendChild(el('div', 'note', 'Details could not be read: ' + a.error));
    else if (a.note) c.appendChild(el('div', 'note', a.note));
    return c;
  }

  function key(ctx) { return ctx ? ctx.stack + '/' + ctx.id : ''; }

  function load() {
    var ctx = current();
    var b = body();
    if (!ctx || !b) return;
    var mine = ++token;
    b.textContent = '';
    b.appendChild(el('div', 'msg', 'Loading the automation and its steps...'));
    send({ type: 'AUTOMATION_SUMMARY', stack: ctx.stack, id: ctx.id }).then(function (res) {
      if (mine !== token) return;
      var d = res.summary || {};
      b.textContent = '';
      row(b, 'Name', d.name);
      row(b, 'Status', statusName(d.status));
      row(b, 'Last run', date(d.lastRunTime));
      row(b, 'Last run status', d.lastRunStatus);
      if (d.schedule) {
        row(b, 'Schedule', statusName(d.schedule.status));
        row(b, 'Next run', date(d.schedule.next));
      }
      row(b, 'Key', d.key);
      if (d.description) row(b, 'Description', d.description);
      var steps = d.steps || [];
      b.appendChild(el('div', 'h', steps.length + (steps.length === 1 ? ' step' : ' steps')));
      steps.forEach(function (s, i) {
        var st = el('div', 'step');
        st.appendChild(el('b', '', 'Step ' + (i + 1)));
        if (s.name) st.appendChild(document.createTextNode(' ' + s.name));
        b.appendChild(st);
        (s.activities || []).forEach(function (a) { b.appendChild(activityCard(a || {})); });
      });
      loadedFor = key(ctx);
    }).catch(function (e) {
      if (mine !== token) return;
      showError(e.orphaned ? e.message : 'Could not load the automation: ' + e.message, !!e.orphaned);
    });
  }

  function check() {
    if (!inAutomationStudio(location.href)) frameUrl = null;
    var ctx = current();
    var k = key(ctx);
    if (k === lastKey && (!!host === !!(enabled && ctx))) return;
    lastKey = k;
    if (enabled && ctx) {
      mount();
      if (open) load();
    } else {
      unmount();
    }
  }

  try {
    chrome.storage.local.get(SETTING, function (r) {
      enabled = !r || r[SETTING] !== false;
      check();
    });
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === 'local' && SETTING in changes) { enabled = changes[SETTING].newValue !== false; check(); }
    });
  } catch (e) { /* extension context gone */ }
  window.addEventListener('message', onMessage);
  window.addEventListener('hashchange', check);
  window.addEventListener('popstate', check);
  // Automation Studio also changes the address without events the isolated world sees.
  setInterval(check, 1000);
})();
