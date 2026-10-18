import { createIcons, icons } from 'https://cdn.jsdelivr.net/npm/lucide@latest/+esm';
import { API } from './config.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = () => createIcons({ icons });
const state = { type: 'gallery', items: [], categories: [], files: [], filter: '' };

const LABELS = {
  gallery: { upload: 'Upload pictures', dz: 'Drop pictures here or click to browse', hint: 'JPG, PNG, GIF, WEBP — multiple files allowed', accept: 'image/*', lib: 'Photo library', stat: 'Photos' },
  videos: { upload: 'Upload videos', dz: 'Drop videos here or click to browse', hint: 'MP4, WEBM, MOV — multiple files allowed', accept: 'video/*', lib: 'Video library', stat: 'Videos' }
};

function toast(msg, err = false) {
  const el = document.createElement('div');
  el.className = 'toast-msg' + (err ? ' err' : '');
  el.textContent = msg;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

const TOKEN_KEY = 'mh_admin_token';
const getToken = () => sessionStorage.getItem(TOKEN_KEY) || '';

function handleExpired(status) {
  if (status === 401 && getToken()) {
    sessionStorage.removeItem(TOKEN_KEY);
    showLogin('Your session expired. Please sign in again.');
  }
}

async function call(path, body = {}) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, token: getToken() })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { handleExpired(res.status); throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status }); }
  return data;
}

async function uploadForm(path, form) {
  form.append('token', getToken());
  const res = await fetch(`${API}${path}`, { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { handleExpired(res.status); throw Object.assign(new Error(data.message || data.error || 'Upload failed'), { status: res.status }); }
  return data;
}

function show(view) {
  ['signinView', 'loadingView', 'dashView'].forEach(v => $(v).classList.toggle('d-none', v !== view));
}

function showLogin(msg = '') {
  $('userPill').classList.add('d-none');
  $('signOutBtn').classList.add('d-none');
  $('loginErr').textContent = msg;
  $('loginErr').classList.toggle('d-none', !msg);
  show('signinView');
  setTimeout(() => $('loginUser').focus(), 50);
}

function enterDashboard(username) {
  $('userName').textContent = username || 'admin';
  $('userPill').classList.remove('d-none');
  $('signOutBtn').classList.remove('d-none');
  show('dashView');
  setType('gallery');
}

async function boot() {
  icon();
  if (!getToken()) { showLogin(); return; }
  show('loadingView');
  try {
    const r = await call('/auth/check');
    enterDashboard(r.username);
  } catch {
    sessionStorage.removeItem(TOKEN_KEY);
    showLogin();
  }
}

$('loginForm').onsubmit = async (e) => {
  e.preventDefault();
  const btn = $('signInBtn');
  btn.disabled = true;
  $('loginErr').classList.add('d-none');
  try {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: $('loginUser').value.trim(), password: $('loginPass').value })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Sign in failed');
    sessionStorage.setItem(TOKEN_KEY, data.token);
    $('loginPass').value = '';
    enterDashboard(data.username);
  } catch (err) {
    $('loginErr').textContent = err.message;
    $('loginErr').classList.remove('d-none');
  } finally { btn.disabled = false; }
};

$('signOutBtn').onclick = async () => {
  try { await fetch(`${API}/auth/logout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: getToken() }) }); } catch {}
  sessionStorage.removeItem(TOKEN_KEY);
  showLogin();
};

// ---------- Tabs ----------
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => setType(b.dataset.type));

function setType(type) {
  state.type = type; state.files = []; state.filter = '';
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.type === type));
  const L = LABELS[type];
  $('uploadTitle').textContent = L.upload;
  $('dzText').textContent = L.dz;
  $('dzHint').textContent = L.hint;
  $('fileInput').accept = L.accept;
  $('libTitle').textContent = L.lib;
  $('statItemsLab').textContent = L.stat;
  renderFiles();
  refresh();
}

async function refresh() {
  $('library').innerHTML = `<div class="col-12 text-center py-4"><div class="spinner-border spinner-border-sm text-warning"></div></div>`;
  try {
    const data = await call(`/admin/${state.type}/list`);
    state.items = data.items || [];
    state.categories = data.categories || [];
    render();
  } catch (e) { toast(e.message, true); }
}

function catOptions(selected, withAll = false) {
  let html = withAll ? `<option value="">All categories</option>` : `<option value="">Uncategorized</option>`;
  html += state.categories.map(c => `<option value="${esc(c)}" ${c === selected ? 'selected' : ''}>${esc(c)}</option>`).join('');
  return html;
}

function render() {
  $('statItems').textContent = state.items.length;
  $('statCats').textContent = state.categories.length;
  const upSel = $('upCat').value;
  $('upCat').innerHTML = catOptions(upSel);
  $('libFilter').innerHTML = catOptions(state.filter, true);

  // categories
  $('catList').innerHTML = state.categories.length ? state.categories.map(c => {
    const n = state.items.filter(i => i.category === c).length;
    return `<li><span><i data-lucide="folder" class="text-yellow mr-2"></i>${esc(c)}<span class="count">${n}</span></span>
      <button class="icon-btn" data-del-cat="${esc(c)}" title="Delete category"><i data-lucide="trash-2"></i></button></li>`;
  }).join('') : `<li class="text-muted justify-content-center">No categories yet</li>`;
  $('catList').querySelectorAll('[data-del-cat]').forEach(b => b.onclick = () => deleteCat(b.dataset.delCat));

  // library
  const list = state.filter ? state.items.filter(i => i.category === state.filter) : state.items;
  $('library').innerHTML = list.length ? list.map(it => {
    const media = state.type === 'gallery'
      ? `<img src="${esc(it.url)}" loading="lazy">`
      : (it.thumbUrl ? `<img src="${esc(it.thumbUrl)}" loading="lazy">` : `<video src="${esc(it.url)}#t=0.5" preload="metadata" muted></video>`);
    return `<div class="col-6 col-sm-4 col-md-3 col-xl-2 mb-3"><div class="manage-item">
      <div class="thumb">${media}</div>
      <div class="meta">
        <input class="form-control" data-title="${it.id}" value="${esc(it.title)}" placeholder="Title">
        <select class="custom-select" data-cat="${it.id}">${catOptions(it.category)}</select>
        <button class="btn btn-danger-ghost btn-sm btn-block" data-del="${it.id}"><i data-lucide="trash-2" class="mr-1"></i>Delete</button>
      </div></div></div>`;
  }).join('') : `<div class="col-12 empty-state"><i data-lucide="inbox"></i><p class="mt-2 mb-0">Nothing here yet. Upload something above.</p></div>`;

  $('library').querySelectorAll('[data-title]').forEach(inp => inp.onchange = () => updateItem(inp.dataset.title, { title: inp.value }));
  $('library').querySelectorAll('[data-cat]').forEach(sel => sel.onchange = () => updateItem(sel.dataset.cat, { category: sel.value }));
  $('library').querySelectorAll('[data-del]').forEach(b => b.onclick = () => deleteItem(b.dataset.del));
  icon();
}

$('libFilter').onchange = (e) => { state.filter = e.target.value; render(); };

// ---------- Categories ----------
$('catForm').onsubmit = async (e) => {
  e.preventDefault();
  const name = $('catName').value.trim();
  if (!name) return;
  try {
    const d = await call(`/admin/${state.type}/categories/add`, { name });
    state.categories = d.categories; $('catName').value = '';
    render(); toast('Category added');
  } catch (err) { toast(err.message, true); }
};

async function deleteCat(name) {
  if (!confirm(`Delete category "${name}"? Items in it will become uncategorized.`)) return;
  try {
    await call(`/admin/${state.type}/categories/delete`, { name });
    if (state.filter === name) state.filter = '';
    toast('Category deleted'); refresh();
  } catch (err) { toast(err.message, true); }
}

// ---------- Items ----------
async function updateItem(id, patch) {
  try {
    const d = await call(`/admin/${state.type}/items/update`, { id, ...patch });
    const i = state.items.findIndex(x => x.id === id);
    if (i > -1) state.items[i] = { ...state.items[i], ...d.item };
    if (patch.category !== undefined) render();
    toast('Saved');
  } catch (err) { toast(err.message, true); }
}

async function deleteItem(id) {
  if (!confirm('Delete this item permanently?')) return;
  try {
    await call(`/admin/${state.type}/items/delete`, { id });
    toast('Deleted'); refresh();
  } catch (err) { toast(err.message, true); }
}

// ---------- Upload ----------
const dz = $('dropzone');
dz.onclick = () => $('fileInput').click();
dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('drag'); };
dz.ondragleave = () => dz.classList.remove('drag');
dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('drag'); addFiles(e.dataTransfer.files); };
$('fileInput').onchange = (e) => { addFiles(e.target.files); e.target.value = ''; };

function addFiles(list) {
  const prefix = state.type === 'gallery' ? 'image/' : 'video/';
  const ok = [...list].filter(f => f.type.startsWith(prefix));
  if (ok.length < list.length) toast(`Skipped ${list.length - ok.length} unsupported file(s)`, true);
  state.files.push(...ok);
  renderFiles();
}
function renderFiles() {
  $('fileChips').innerHTML = state.files.map(f => `<span class="file-chip">${esc(f.name)}</span>`).join('');
  $('uploadBtn').disabled = !state.files.length;
  $('upStatus').textContent = state.files.length ? `${state.files.length} file(s) ready` : '';
}

function videoThumb(file) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    const url = URL.createObjectURL(file);
    let done = false;
    const finish = (b) => { if (done) return; done = true; URL.revokeObjectURL(url); resolve(b); };
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
    v.onloadeddata = () => { v.currentTime = Math.min(1, (v.duration || 2) / 2); };
    v.onseeked = () => {
      try {
        const s = 480, w = v.videoWidth, h = v.videoHeight;
        if (!w || !h) return finish(null);
        const c = document.createElement('canvas');
        const scale = s / Math.max(w, h);
        c.width = Math.round(w * scale); c.height = Math.round(h * scale);
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        c.toBlob(b => finish(b), 'image/jpeg', 0.82);
      } catch { finish(null); }
    };
    v.onerror = () => finish(null);
    setTimeout(() => finish(null), 8000);
  });
}

$('uploadBtn').onclick = async () => {
  const files = state.files.slice();
  if (!files.length) return;
  const title = $('upTitle').value.trim();
  const category = $('upCat').value;
  $('uploadBtn').disabled = true;
  $('upProgWrap').classList.remove('d-none');
  let done = 0, failed = 0;
  for (const f of files) {
    $('upStatus').textContent = `Uploading ${done + 1} of ${files.length}…`;
    try {
      const t = title ? (files.length > 1 ? `${title} ${done + 1}` : title) : f.name.replace(/\.[^.]+$/, '');
      const form = new FormData();
      form.append('file', f, f.name);
      form.append('title', t);
      form.append('category', category);
      if (state.type === 'videos') {
        const blob = await videoThumb(f);
        if (blob) form.append('thumb', blob, 'thumb.jpg');
      }
      await uploadForm(`/admin/${state.type}/upload`, form);
    } catch (e) {
      failed++; console.warn(e);
      if (e.status === 401) break;
    }
    done++;
    $('upProg').style.width = `${Math.round(done / files.length * 100)}%`;
  }
  state.files = []; $('upTitle').value = '';
  renderFiles();
  setTimeout(() => { $('upProgWrap').classList.add('d-none'); $('upProg').style.width = '0%'; }, 600);
  toast(failed ? `Uploaded ${done - failed}, ${failed} failed` : `Uploaded ${done} file(s)`, !!failed);
  refresh();
};

boot();
