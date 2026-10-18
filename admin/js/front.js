import { createIcons, icons } from 'https://cdn.jsdelivr.net/npm/lucide@latest/+esm';
import { API } from './config.js';

const PAGE_SIZE = 18;
const state = { type: 'gallery', page: 1, category: '', items: [], lbIndex: 0 };
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = () => createIcons({ icons });

const COPY = {
  gallery: { title: 'Photo <span class="accent">Gallery</span>', sub: 'Browse our latest photos.', empty: 'image' },
  videos: { title: 'Video <span class="accent">Library</span>', sub: 'Watch our latest videos.', empty: 'film' }
};

function parseHash() {
  const h = location.hash.replace('#', '');
  const [route, qs] = h.split('?');
  const params = new URLSearchParams(qs || '');
  state.type = route === 'videos' ? 'videos' : 'gallery';
  state.page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  state.category = params.get('cat') || '';
}

function setHash(page, category) {
  const p = new URLSearchParams();
  if (page > 1) p.set('page', page);
  if (category) p.set('cat', category);
  const qs = p.toString();
  location.hash = state.type + (qs ? '?' + qs : '');
}

function renderSkeleton() {
  $('grid').innerHTML = Array.from({ length: PAGE_SIZE }, () =>
    `<div class="col-6 col-sm-4 col-md-3 col-lg-2"><div class="tile skeleton"></div></div>`).join('');
}

function renderCats(categories) {
  const all = [''].concat(categories);
  $('catBar').innerHTML = all.map(c =>
    `<button class="cat-pill ${c === state.category ? 'active' : ''}" data-cat="${esc(c)}">${c ? esc(c) : 'All'}</button>`).join('');
  $('catBar').querySelectorAll('.cat-pill').forEach(b => b.onclick = () => setHash(1, b.dataset.cat));
}

function tileHtml(item, i) {
  if (state.type === 'gallery') {
    return `<div class="tile" data-i="${i}"><img src="${esc(item.url)}" alt="${esc(item.title)}" loading="lazy">
      ${item.title ? `<div class="tile-cap">${esc(item.title)}</div>` : ''}</div>`;
  }
  const media = item.thumbUrl
    ? `<img src="${esc(item.thumbUrl)}" alt="${esc(item.title)}" loading="lazy">`
    : `<video src="${esc(item.url)}#t=0.5" preload="metadata" muted playsinline></video>`;
  return `<div class="tile" data-i="${i}">${media}<div class="play"><i data-lucide="play"></i></div>
    ${item.title ? `<div class="tile-cap">${esc(item.title)}</div>` : ''}</div>`;
}

function renderGrid(items) {
  const cells = [];
  for (let i = 0; i < PAGE_SIZE; i++) {
    const it = items[i];
    cells.push(`<div class="col-6 col-sm-4 col-md-3 col-lg-2">${it ? tileHtml(it, i)
      : `<div class="tile empty"><div class="ph"><i data-lucide="${COPY[state.type].empty}"></i></div></div>`}</div>`);
  }
  $('grid').innerHTML = cells.join('');
  $('grid').querySelectorAll('.tile[data-i]').forEach(t => t.onclick = () => openLightbox(+t.dataset.i));
}

function renderPager(page, pages, total) {
  const start = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const end = Math.min(page * PAGE_SIZE, total);
  $('pagerInfo').textContent = total ? `Showing ${start}–${end} of ${total}` : 'No items yet';
  const li = (label, p, { disabled = false, active = false } = {}) =>
    `<li class="page-item ${disabled ? 'disabled' : ''} ${active ? 'active' : ''}"><a class="page-link" href="#" data-p="${p}">${label}</a></li>`;
  let html = li('<i data-lucide="chevron-left"></i> Prev', page - 1, { disabled: page <= 1 });
  const from = Math.max(1, page - 2), to = Math.min(pages, page + 2);
  for (let p = from; p <= to; p++) html += li(p, p, { active: p === page });
  html += li('Next page <i data-lucide="chevron-right"></i>', page + 1, { disabled: page >= pages });
  $('pagination').innerHTML = html;
  $('pagination').querySelectorAll('.page-item:not(.disabled) .page-link').forEach(a => a.onclick = (e) => {
    e.preventDefault(); setHash(+a.dataset.p, state.category); window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

async function load() {
  parseHash();
  document.querySelectorAll('[data-route]').forEach(a => a.classList.toggle('active', a.dataset.route === state.type));
  $('pageTitle').innerHTML = COPY[state.type].title;
  $('pageSub').textContent = COPY[state.type].sub;
  renderSkeleton();
  try {
    const url = `${API}/api/${state.type}?page=${state.page}${state.category ? '&category=' + encodeURIComponent(state.category) : ''}`;
    const res = await fetch(url);
    const data = await res.json();
    state.items = data.items || [];
    renderCats(data.categories || []);
    renderGrid(state.items);
    renderPager(data.page || 1, data.pages || 1, data.total || 0);
  } catch (e) {
    $('grid').innerHTML = `<div class="col-12 empty-state"><i data-lucide="wifi-off"></i><p class="mt-2">Could not load content. Please try again.</p></div>`;
    $('pagerInfo').textContent = ''; $('pagination').innerHTML = '';
  }
  icon();
}

function openLightbox(i) {
  state.lbIndex = i;
  showLb();
  window.jQuery('#lightbox').modal('show');
}
function showLb() {
  const it = state.items[state.lbIndex];
  if (!it) return;
  $('lbTitle').textContent = it.title || 'Untitled';
  $('lbCat').textContent = it.category || '';
  $('lbBody').innerHTML = state.type === 'gallery'
    ? `<img src="${esc(it.url)}" alt="${esc(it.title)}">`
    : `<video src="${esc(it.url)}" controls autoplay playsinline></video>`;
  $('lbPrev').disabled = state.lbIndex <= 0;
  $('lbNext').disabled = state.lbIndex >= state.items.length - 1;
}
$('lbPrev').onclick = () => { if (state.lbIndex > 0) { state.lbIndex--; showLb(); } };
$('lbNext').onclick = () => { if (state.lbIndex < state.items.length - 1) { state.lbIndex++; showLb(); } };
window.jQuery('#lightbox').on('hidden.bs.modal', () => { $('lbBody').innerHTML = ''; });
document.addEventListener('keydown', (e) => {
  if (!document.getElementById('lightbox').classList.contains('show')) return;
  if (e.key === 'ArrowLeft') $('lbPrev').click();
  if (e.key === 'ArrowRight') $('lbNext').click();
});

$('yr').textContent = new Date().getFullYear();
window.addEventListener('hashchange', load);
document.querySelectorAll('#mainNav .nav-link').forEach(a => a.addEventListener('click', () => window.jQuery('#mainNav').collapse('hide')));
load();
