const PAGE_SIZE = 18;
const TYPES = ['gallery', 'videos'];
const P = 'mh_';
const ADMIN_USER = 'admin';
const ADMIN_PASS = '123456';
const SESSION_TTL = 60 * 60 * 12; // 12 hours

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
function validType(t) { return TYPES.includes(t); }
async function getList(key) { const v = await me.puter.kv.get(P + key); return Array.isArray(v) ? v : []; }
async function setList(key, v) { await me.puter.kv.set(P + key, v); }

function safeEqual(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

async function checkToken(token) {
  if (!token || typeof token !== 'string' || token.length < 20) return false;
  const s = await me.puter.kv.get(P + 'sess_' + token);
  if (!s || !s.exp || s.exp < Date.now()) return false;
  return true;
}

async function readJson(request) {
  try { return await request.json(); } catch { return {}; }
}

// ---------- Auth ----------
router.post('/auth/login', async ({ request }) => {
  const { username, password } = await readJson(request);
  if (!safeEqual(username || '', ADMIN_USER) || !safeEqual(password || '', ADMIN_PASS)) {
    return json({ error: 'Invalid username or password' }, 401);
  }
  const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
  const key = P + 'sess_' + token;
  await me.puter.kv.set(key, { user: ADMIN_USER, exp: Date.now() + SESSION_TTL * 1000 });
  try { await me.puter.kv.expire(key, SESSION_TTL); } catch {}
  return { token, username: ADMIN_USER, expiresIn: SESSION_TTL };
});

router.post('/auth/check', async ({ request }) => {
  const { token } = await readJson(request);
  if (!(await checkToken(token))) return json({ error: 'Session expired' }, 401);
  return { ok: true, username: ADMIN_USER };
});

router.post('/auth/logout', async ({ request }) => {
  const { token } = await readJson(request);
  if (token) { try { await me.puter.kv.del(P + 'sess_' + token); } catch {} }
  return { ok: true };
});

// ---------- Public ----------
router.get('/api/:type', async ({ request, params }) => {
  const type = params.type;
  if (!validType(type)) return json({ error: 'Unknown type' }, 404);
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const category = url.searchParams.get('category') || '';
  const [items, categories] = await Promise.all([getList('items_' + type), getList('cats_' + type)]);
  let list = items.slice().sort((a, b) => b.createdAt - a.createdAt);
  if (category) list = list.filter(i => i.category === category);
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const p = Math.min(page, pages);
  const slice = list.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE).map(({ path, thumbPath, ...rest }) => rest);
  return { items: slice, total, page: p, pages, pageSize: PAGE_SIZE, categories };
});

// ---------- Admin (JSON, token in body) ----------
async function guard(request, params) {
  const body = await readJson(request);
  if (!(await checkToken(body.token))) return { err: json({ error: 'Session expired' }, 401) };
  if (!validType(params.type)) return { err: json({ error: 'Unknown type' }, 404) };
  return { body };
}

router.post('/admin/:type/list', async ({ request, params }) => {
  const g = await guard(request, params); if (g.err) return g.err;
  const [items, categories] = await Promise.all([getList('items_' + params.type), getList('cats_' + params.type)]);
  return { items: items.sort((x, y) => y.createdAt - x.createdAt), categories };
});

router.post('/admin/:type/categories/add', async ({ request, params }) => {
  const g = await guard(request, params); if (g.err) return g.err;
  const clean = String(g.body.name || '').trim().slice(0, 40);
  if (!clean) return json({ error: 'Category name required' }, 400);
  const cats = await getList('cats_' + params.type);
  if (cats.some(c => c.toLowerCase() === clean.toLowerCase())) return json({ error: 'Category already exists' }, 400);
  cats.push(clean);
  await setList('cats_' + params.type, cats);
  return { categories: cats };
});

router.post('/admin/:type/categories/delete', async ({ request, params }) => {
  const g = await guard(request, params); if (g.err) return g.err;
  const name = g.body.name;
  const cats = (await getList('cats_' + params.type)).filter(c => c !== name);
  await setList('cats_' + params.type, cats);
  const items = await getList('items_' + params.type);
  let changed = false;
  items.forEach(i => { if (i.category === name) { i.category = ''; changed = true; } });
  if (changed) await setList('items_' + params.type, items);
  return { categories: cats };
});

router.post('/admin/:type/items/update', async ({ request, params }) => {
  const g = await guard(request, params); if (g.err) return g.err;
  const { id, title, category } = g.body;
  const items = await getList('items_' + params.type);
  const it = items.find(i => i.id === id);
  if (!it) return json({ error: 'Not found' }, 404);
  if (title !== undefined) it.title = String(title).slice(0, 120);
  if (category !== undefined) it.category = String(category);
  await setList('items_' + params.type, items);
  return { item: it };
});

router.post('/admin/:type/items/delete', async ({ request, params }) => {
  const g = await guard(request, params); if (g.err) return g.err;
  const { id } = g.body;
  const items = await getList('items_' + params.type);
  const removed = items.find(i => i.id === id);
  await setList('items_' + params.type, items.filter(i => i.id !== id));
  if (removed) {
    for (const p of [removed.path, removed.thumbPath]) {
      if (p) { try { await me.puter.fs.delete(p); } catch {} }
    }
  }
  return { ok: true };
});

// ---------- Upload (multipart form) ----------
router.post('/admin/:type/upload', async ({ request, params }) => {
  const type = params.type;
  if (!validType(type)) return json({ error: 'Unknown type' }, 404);
  let form;
  try { form = await request.formData(); } catch { return json({ error: 'Invalid upload' }, 400); }
  if (!(await checkToken(form.get('token')))) return json({ error: 'Session expired' }, 401);

  const file = form.get('file');
  if (!file || typeof file === 'string') return json({ error: 'No file provided' }, 400);
  const mime = file.type || '';
  if (type === 'gallery' && !mime.startsWith('image/')) return json({ error: 'Only images allowed' }, 400);
  if (type === 'videos' && !mime.startsWith('video/')) return json({ error: 'Only videos allowed' }, 400);

  try {
    const id = crypto.randomUUID();
    const safe = String(file.name || 'file').replace(/[^\w.\-]+/g, '_').slice(-80);
    const dir = `MediaHub/${type}`;
    try { await me.puter.fs.mkdir(dir, { createMissingParents: true }); } catch {}
    const path = `${dir}/${Date.now()}-${id.slice(0, 8)}-${safe}`;
    await me.puter.fs.write(path, file);
    const url = await me.puter.fs.getReadURL(path, '3650d');

    let thumbUrl = '', thumbPath = '';
    const thumb = form.get('thumb');
    if (type === 'videos' && thumb && typeof thumb !== 'string') {
      thumbPath = path + '.thumb.jpg';
      await me.puter.fs.write(thumbPath, thumb);
      thumbUrl = await me.puter.fs.getReadURL(thumbPath, '3650d');
    }

    const item = {
      id,
      title: String(form.get('title') || '').slice(0, 120),
      category: String(form.get('category') || ''),
      url, path, thumbUrl, thumbPath,
      createdAt: Date.now()
    };
    const items = await getList('items_' + type);
    items.push(item);
    await setList('items_' + type, items);
    return { item };
  } catch (e) {
    return json({ error: 'Upload failed', message: e && e.message ? e.message : String(e) }, 500);
  }
});

router.get('/*rest', async () => json({ error: 'Not found' }, 404));
