const $ = (s, r = document) => r.querySelector(s);
const view = $('#view');
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const date = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const me = () => JSON.parse(localStorage.getItem('ink_user') || 'null');
const token = () => localStorage.getItem('ink_token');

async function api(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token() && { Authorization: `Bearer ${token()}` }) },
    body: opts.body && JSON.stringify(opts.body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function renderNav() {
  const u = me();
  document.querySelectorAll('[data-auth]').forEach((el) => el.hidden = !u);
  $('#loginLink').hidden = !!u; $('#who').textContent = u ? `Hi, ${u.name}` : '';
}
$('#logoutLink').onclick = (e) => { e.preventDefault(); localStorage.removeItem('ink_token'); localStorage.removeItem('ink_user'); renderNav(); location.hash = '#/'; };

const tagLinks = (tags = []) => tags.map((t) => `<a class="tag" href="#/tag/${encodeURIComponent(t)}">#${esc(t)}</a>`).join(' ');

async function feed(tag) {
  const posts = await api('/api/posts' + (tag ? `?tag=${encodeURIComponent(tag)}` : ''));
  view.innerHTML = `${tag ? `<p class="filter">Posts tagged <strong>#${esc(tag)}</strong> · <a href="#/">show all</a></p>` : '<h1>Latest posts</h1>'}
    ${posts.length ? posts.map((p) => `<article class="post">
      <h2><a href="#/post/${p._id}">${esc(p.title)}</a></h2>
      <p>${esc(p.body)}${p.body.length >= 220 ? '…' : ''}</p>
      <div class="meta">${esc(p.author?.name || 'Unknown')} · ${date(p.createdAt)} · ${p.comments} comment${p.comments === 1 ? '' : 's'} ${tagLinks(p.tags)}</div>
    </article>`).join('') : `<p class="muted">No posts yet. ${me() ? '<a href="#/new">Write the first one</a>' : '<a href="#/login">Log in to write the first one</a>'}.</p>`}`;
}

async function showPost(id) {
  const [p, comments] = await Promise.all([api(`/api/posts/${id}`), api(`/api/posts/${id}/comments`)]);
  const u = me(); const mine = u && p.author?._id === u.id;
  view.innerHTML = `<article>
    <h1>${esc(p.title)}</h1>
    <div class="meta">By ${esc(p.author?.name || 'Unknown')} · ${date(p.createdAt)}${p.updatedAt !== p.createdAt ? ' (edited)' : ''} ${tagLinks(p.tags)}
      ${mine ? `· <a href="#/edit/${p._id}">Edit</a> · <button class="link" id="del">Delete</button>` : ''}</div>
    <div class="post-body">${esc(p.body)}</div></article>
    <section class="comments"><h3>Comments (${comments.length})</h3>
      ${comments.map((c) => `<div class="comment"><div class="meta"><strong>${esc(c.author?.name || 'Unknown')}</strong> · ${date(c.createdAt)}
        ${u && (c.author?._id === u.id || mine) ? `<button class="link" data-c="${c._id}">delete</button>` : ''}</div><p>${esc(c.text)}</p></div>`).join('')}
      ${u ? `<form class="stack" id="cf" style="margin-top:14px"><textarea name="text" rows="3" placeholder="Add a comment" required maxlength="1000"></textarea>
        <button>Post comment</button><p class="error" id="err"></p></form>` : '<p class="muted"><a href="#/login">Log in</a> to comment.</p>'}
    </section>`;
  if (mine) $('#del').onclick = async () => { if (confirm('Delete this post and its comments?')) { await api(`/api/posts/${id}`, { method: 'DELETE' }); location.hash = '#/'; } };
  view.querySelectorAll('[data-c]').forEach((b) => b.onclick = async () => { await api(`/api/comments/${b.dataset.c}`, { method: 'DELETE' }); showPost(id); });
  const cf = $('#cf');
  if (cf) cf.onsubmit = async (e) => {
    e.preventDefault();
    try { await api(`/api/posts/${id}/comments`, { method: 'POST', body: { text: cf.text.value } }); showPost(id); }
    catch (err) { $('#err').textContent = err.message; }
  };
}

async function editor(id) {
  if (!me()) return (location.hash = '#/login');
  const p = id ? await api(`/api/posts/${id}`) : { title: '', body: '', tags: [] };
  view.innerHTML = `<h1>${id ? 'Edit post' : 'New post'}</h1><form class="stack" id="pf">
    <input name="title" placeholder="Title" required maxlength="150" value="${esc(p.title)}">
    <textarea name="body" rows="14" placeholder="Write your story…" required>${esc(p.body)}</textarea>
    <input name="tags" placeholder="Tags, comma separated (max 5)" value="${esc(p.tags.join(', '))}">
    <div><button>${id ? 'Save changes' : 'Publish'}</button></div><p class="error" id="err"></p></form>`;
  $('#pf').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const saved = await api(id ? `/api/posts/${id}` : '/api/posts', { method: id ? 'PUT' : 'POST', body: Object.fromEntries(new FormData(e.target)) });
      location.hash = `#/post/${saved._id}`;
    } catch (err) { $('#err').textContent = err.message; }
  };
}

function login() {
  let mode = 'login';
  view.innerHTML = `<form class="stack narrow" id="f"><h1 id="t">Log in</h1>
    <input name="name" placeholder="Your name" hidden><input name="email" type="email" placeholder="Email" required>
    <input name="password" type="password" placeholder="Password (6+ characters)" minlength="6" required>
    <div><button id="b">Log in</button></div><p class="error" id="err"></p><a href="#" id="sw">New here? Create an account</a></form>`;
  $('#sw').onclick = (e) => {
    e.preventDefault(); mode = mode === 'login' ? 'register' : 'login';
    $('#t').textContent = $('#b').textContent = mode === 'login' ? 'Log in' : 'Create account';
    $('[name=name]').hidden = mode === 'login'; $('[name=name]').required = mode === 'register';
    e.target.textContent = mode === 'login' ? 'New here? Create an account' : 'Have an account? Log in';
  };
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const d = await api(`/api/auth/${mode}`, { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
      localStorage.setItem('ink_token', d.token); localStorage.setItem('ink_user', JSON.stringify(d.user));
      renderNav(); location.hash = '#/';
    } catch (err) { $('#err').textContent = err.message; }
  };
}

async function router() {
  const [, page, arg] = location.hash.replace(/^#/, '').split('/');
  try {
    if (page === 'post') await showPost(arg);
    else if (page === 'new') await editor();
    else if (page === 'edit') await editor(arg);
    else if (page === 'tag') await feed(decodeURIComponent(arg));
    else if (page === 'login') login();
    else await feed();
    window.scrollTo(0, 0);
  } catch (e) { view.innerHTML = `<p class="error">${esc(e.message)}</p>`; }
}
window.addEventListener('hashchange', router);
renderNav(); router();
