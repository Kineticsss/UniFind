// UniFind single-page app. Hash routes: #/ browse, #/report, #/mine, #/item/<id>.

import { auth, authMessage, uploadsEnabled, uploadPhoto, thumb, pushEnabled, initPush, requestPush, pushGranted } from './services.js';

const cfg = window.UNIFIND_CONFIG;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in the user's time zone
const fmtDate = (d) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

let categories = [];
const catLabel = (slug) => categories.find((c) => c.slug === slug)?.label || slug;

// ---------- API ----------
class ApiError extends Error {}

async function api(path, { method = 'GET', body } = {}) {
  const token = await auth.getToken();
  let res;
  try {
    res = await fetch(`${cfg.apiBase}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
      body: body && JSON.stringify(body),
    });
  } catch {
    throw Object.assign(new ApiError('UniFind is not responding. If it was idle it takes about a minute to start, so try again shortly.'), { status: 0 });
  }
  const data = await res.json().catch(() => ({}));
  if (res.ok) return data;
  // Expired or invalid sign-in: back to the sign-in screen (ST-03).
  if (res.status === 401) {
    toast('Your sign-in expired. Please sign in again.');
    await auth.signOut();
  }
  throw Object.assign(new ApiError(data.error?.message || 'Something went wrong.'), { status: res.status, fields: data.error?.fields });
}

// ---------- UI helpers ----------
function show(view) {
  $$('[data-view]').forEach((s) => (s.hidden = s.dataset.view !== view));
  $$('#nav [data-route]').forEach((a) => a.setAttribute('aria-current', a.dataset.route === view ? 'page' : 'false'));
  $('#nav').hidden = view === 'signin';
  $('#main').focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

function toast(text) {
  $('#toastBody').textContent = text;
  window.bootstrap?.Toast.getOrCreateInstance($('#toast')).show();
}

const loading = (on) => ($('#loading').hidden = !on);

const KIND = { lost: 'Lost', found: 'Found' };
const yours = (item) => (item.isMine ? '<span class="yours">Yours</span>' : '');
const where = (item) => (item.location ? `, ${esc(item.location)}` : '');

function tagCard(item) {
  const photo = item.imageUrl ? `<img class="card-photo" src="${esc(thumb(item.imageUrl, 'c_fill,w_480,h_360'))}" alt="" loading="lazy">` : '';
  return `<a class="card-item ${item.type}" href="#/item/${encodeURIComponent(item.itemId)}">
    ${photo}
    <div class="card-body">
      <span class="card-kind">${KIND[item.type]}${yours(item)}</span>
      <h2 class="card-title">${esc(item.title)}</h2>
      <p class="card-meta">${esc(catLabel(item.category))}</p>
      <p class="card-meta">${fmtDate(item.date)}${where(item)}</p>
    </div>
  </a>`;
}

// ---------- Views ----------
let searchTimer;
async function renderBrowse() {
  show('browse');
  const params = new URLSearchParams([...new FormData($('#filters'))].filter(([, v]) => v));
  try {
    const { items } = await api(`/api/items?${params}`);
    $('#resultCount').textContent = `${items.length} open report${items.length === 1 ? '' : 's'}`;
    $('#board').innerHTML = items.length
      ? items.map(tagCard).join('')
      : `<div class="empty"><h2 class="h-sub">No reports match these filters</h2><p class="muted">Clear a filter or search a different word. If nobody has posted your item yet, post it so others can find you.</p><a class="btn btn-pen" href="#/report">Report an item</a></div>`;
  } catch (err) {
    $('#board').innerHTML = `<div class="empty">${esc(err.message)}</div>`;
  }
}

function renderReport() {
  show('report');
  const form = $('#reportForm');
  if (!form.dataset.ready) {
    form.reset();
    form.date.value = today();
    resetPhoto();
    $('#descCount').textContent = '0 / 500';
    form.dataset.ready = '1';
  }
  form.date.max = today();
}

async function renderMine() {
  show('mine');
  loading(true);
  try {
    const { items } = await api('/api/items/mine');
    $('#mineList').innerHTML = items.length ? items.map(mineRow).join('') : `<div class="empty"><h2 class="h-sub">You have no reports yet</h2><p class="muted">Post a lost or found item and its possible matches show up here.</p><a class="btn btn-pen" href="#/report">Report an item</a></div>`;
  } catch (err) {
    $('#mineList').innerHTML = `<div class="empty">${esc(err.message)}</div>`;
  } finally {
    loading(false);
  }
  const btn = $('#pushBtn');
  btn.hidden = !pushEnabled || (await pushGranted());
}

function mineRow(item) {
  const matches = item.matches.length
    ? item.matches
        .map(
          ({ item: m, score }) => `<a class="match" href="#/item/${encodeURIComponent(m.itemId)}">
            ${m.imageUrl ? `<img src="${esc(thumb(m.imageUrl, 'c_fill,w_120,h_90'))}" alt="">` : '<span class="thumb"></span>'}
            <span><strong>${KIND[m.type]}: ${esc(m.title)}</strong><br><span class="small muted">${fmtDate(m.date)}${where(m)}</span></span>
            <span class="strength ${score >= 3 ? 'strong' : ''}">${score >= 3 ? 'Strong match' : 'Possible match'}</span>
          </a>`,
        )
        .join('')
    : '<p class="small muted mb-0">No possible matches yet. You get an alert when one is posted.</p>';
  return `<article class="report-row ${item.type}">
    <div class="d-flex flex-wrap gap-2 align-items-baseline">
      <h2 class="h-sub m-0"><a href="#/item/${encodeURIComponent(item.itemId)}" class="text-reset">${KIND[item.type]}: ${esc(item.title)}</a></h2>
      <span class="small muted ms-auto">Report ${esc(item.itemId.slice(0, 8))}</span>
    </div>
    <p class="small muted mb-3">${esc(catLabel(item.category))}, ${fmtDate(item.date)}</p>
    <h3 class="h-small mb-2">Possible matches (${item.matches.length})</h3>
    <div class="vstack gap-2">${matches}</div>
    ${item.matches.length ? '<p class="small muted mt-3 mb-0">Check the details first. Then hand over the item at the campus lost and found office.</p>' : ''}
  </article>`;
}

async function renderItem(id) {
  show('item');
  const box = $('#itemDetail');
  box.innerHTML = '';
  loading(true);
  try {
    const item = await api(`/api/items/${encodeURIComponent(id)}`);
    box.innerHTML = `<div class="row g-4 g-lg-5">
      <div class="col-md-6">${item.imageUrl ? `<img class="item-photo" src="${esc(thumb(item.imageUrl, 'c_limit,w_1000'))}" alt="Photo of ${esc(item.title)}">` : '<div class="item-nophoto" role="img" aria-label="No photo"></div>'}</div>
      <div class="col-md-6">
        <span class="card-kind ${item.type === 'lost' ? 'text-danger' : ''}">${KIND[item.type]}${yours(item)}</span>
        <h1 class="page-title mt-1">${esc(item.title)}</h1>
        <dl class="facts">
          <dt>Category</dt><dd>${esc(catLabel(item.category))}</dd>
          <dt>Date</dt><dd>${fmtDate(item.date)}</dd>
          ${item.location ? `<dt>Where</dt><dd>${esc(item.location)}</dd>` : ''}
          <dt>Report</dt><dd>${esc(item.itemId)}</dd>
        </dl>
        ${item.description ? `<p style="white-space: pre-line; max-width: 34em">${esc(item.description)}</p>` : ''}
        <p class="small muted" ${item.isMine ? 'hidden' : ''}>${item.type === 'found' ? 'Is this yours? Bring proof that it is yours to the campus lost and found office.' : 'Found this? Turn it in at the campus lost and found office, then post it as found.'}</p>
      </div></div>`;
  } catch (err) {
    box.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
  } finally {
    loading(false);
  }
}

function route() {
  if (!auth.user) return show('signin');
  const [, view, id] = location.hash.split('/');
  if (view === 'report') return renderReport();
  if (view === 'mine') return renderMine();
  if (view === 'item' && id) return renderItem(decodeURIComponent(id));
  renderBrowse();
}

// ---------- Report form ----------
let imageUrl = null;
let uploading = null;

function resetPhoto() {
  imageUrl = null;
  uploading = null;
  $('#photo').value = '';
  $('#photoPreview').hidden = true;
  $('#photoClear').hidden = true;
  $('#photoLabel').textContent = 'Choose a photo';
  setPhotoStatus(uploadsEnabled ? '' : 'Photo upload is off in demo mode (no Cloudinary account configured).');
  $('#photo').disabled = !uploadsEnabled;
}

function setPhotoStatus(text, isError = false) {
  const el = $('#photoStatus');
  el.textContent = text;
  el.className = `small mt-2 mb-0 ${isError ? 'text-danger' : 'muted'}`;
}

$('#photo').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  imageUrl = null;
  $('#photoPreview').src = URL.createObjectURL(file);
  $('#photoPreview').hidden = false;
  $('#photoClear').hidden = false;
  $('#photoLabel').textContent = 'Change photo';
  setPhotoStatus('Uploading…');
  const attempt = (uploading = uploadPhoto(file));
  try {
    const url = await attempt;
    if (uploading === attempt) {
      imageUrl = url;
      setPhotoStatus('Photo uploaded.');
    }
  } catch (err) {
    if (uploading !== attempt) return;
    // Failed upload never blocks posting (ST-07).
    resetPhoto();
    setPhotoStatus(`${err.message} You can still post without a photo.`, true);
  }
});
$('#photoClear').addEventListener('click', () => resetPhoto());

$('#description').addEventListener('input', (e) => ($('#descCount').textContent = `${e.target.value.length} / 500`));

function showFieldErrors(fields = {}) {
  const form = $('#reportForm');
  $$('[data-error]', form).forEach((el) => {
    const msg = fields[el.dataset.error] || '';
    el.textContent = msg;
    const input = form.elements[el.dataset.error];
    if (input instanceof HTMLElement) {
      input.classList.toggle('is-invalid', Boolean(msg));
      input.setAttribute('aria-invalid', String(Boolean(msg)));
    }
  });
  const first = Object.keys(fields)[0];
  if (first) form.elements[first]?.focus?.();
}

$('#reportForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const btn = $('#submitReport');
  $('#reportError').textContent = '';
  showFieldErrors();
  btn.disabled = true;
  btn.textContent = 'Posting…';
  try {
    if (uploading) await uploading.catch(() => {}); // wait for an upload in progress
    const body = Object.fromEntries(new FormData(form));
    const result = await api('/api/items', { method: 'POST', body: { ...body, imageUrl } });
    form.dataset.ready = '';
    $('#postedTitle').textContent = result.matchCount
      ? `Posted. ${result.matchCount} possible match${result.matchCount === 1 ? '' : 'es'}.`
      : 'Posted to the board';
    $('#postedId').textContent = `Report ${result.itemId}`;
    $('#postedText').textContent = result.matchCount
      ? result.notificationStatus === 'sent'
        ? 'The people who posted them got an alert. Compare the details in My reports.'
        : 'Compare the details in My reports. The alert to the other people did not go through, so it is marked to send again.'
      : 'No open report looks like yours yet. You get an alert when one is posted.';
    show('posted');
  } catch (err) {
    if (err.fields) showFieldErrors(err.fields);
    $('#reportError').textContent = err.status === 503 ? 'Your report was not saved because the database is not responding. Try posting again in a minute.' : err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Post report';
  }
});

// ---------- Filters ----------
$('#filters').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(renderBrowse, 250);
});
$('#filters').addEventListener('submit', (e) => e.preventDefault());

// ---------- Sign in ----------
const signinError = (msg) => ($('#signinError').textContent = msg);

$('#emailForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const action = e.submitter?.dataset.action || 'signin';
  signinError('');
  try {
    await (action === 'signup' ? auth.signUpEmail : auth.signInEmail)($('#email').value.trim(), $('#password').value);
  } catch (err) {
    signinError(authMessage(err));
  }
});
$('#googleBtn').addEventListener('click', () => auth.signInGoogle().catch((err) => signinError(authMessage(err))));
$('#signinFake').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#fakeName').value.trim();
  if (!name) return signinError('Enter a name.');
  signinError('');
  auth.signInDemo(name);
});
$('#signOut').addEventListener('click', () => auth.signOut());
$('#pushBtn').addEventListener('click', async () => {
  const granted = await requestPush().catch(() => false);
  $('#pushBtn').hidden = granted;
  toast(granted ? 'Match alerts are on for this browser.' : 'Alerts are blocked. Allow notifications for this site in your browser settings.');
});

// ---------- Start ----------
async function start() {
  $(auth.mode === 'firebase' ? '#signinFirebase' : '#signinFake').hidden = false;
  try {
    ({ categories } = await (await fetch(`${cfg.apiBase}/api/categories`)).json());
  } catch {
    signinError('UniFind is not responding. If it was idle it takes about a minute to start. Refresh the page to try again.');
  }
  const options = categories.map((c) => `<option value="${esc(c.slug)}">${esc(c.label)}</option>`).join('');
  $('#category').insertAdjacentHTML('beforeend', options);
  $('#fcat').insertAdjacentHTML('beforeend', options);

  auth.onChange((user) => {
    initPush(user?.uid);
    route();
  });
  window.addEventListener('hashchange', route);
  await auth.init();
}

start();
