// Fills static HTML from content.js and builds the keepsake (letter, photo grid + lightbox,
// reply link, credits). The keepsake is what stays on screen after the show ends.

const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

/** Elements with data-bind="a.b" get their text from content.a.b. */
export function bindContent(content) {
  document.querySelectorAll('[data-bind]').forEach((el) => {
    const v = get(content, el.dataset.bind);
    if (v != null) el.textContent = v;
  });
}

export function buildKeepsake(content, photos = content.photos || []) {
  const L = content.letter || {};
  const art = document.querySelector('[data-letter]');
  if (art) {
    art.textContent = '';
    const add = (tag, text, cls) => { if (!text) return; const e = document.createElement(tag); e.textContent = text; if (cls) e.className = cls; art.appendChild(e); return e; };
    add('h2', L.greeting);
    (L.body || []).forEach((p) => add('p', p));
    add('p', L.signoff, 'signoff');
    add('p', L.signature, 'signature');
  }

  const gal = document.querySelector('[data-gallery]');
  if (gal) {
    gal.textContent = '';
    photos.filter((p) => p.src || p.poster).forEach((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', p.caption ? `View photo: ${p.caption}` : 'View photo');
      const img = new Image();
      img.loading = 'lazy'; img.decoding = 'async';
      img.src = p.thumb || p.src || p.poster; img.alt = p.alt || p.caption || '';
      if (p.focus) img.style.objectPosition = `${p.focus[0] * 100}% ${p.focus[1] * 100}%`;
      b.appendChild(img);
      b.addEventListener('click', () => lightbox(p));
      gal.appendChild(b);
    });
    gal.hidden = !gal.children.length;
  }

  const reply = document.querySelector('[data-reply]');
  if (reply && content.reply?.href) {
    reply.href = content.reply.href;
    reply.textContent = content.reply.label || 'Reply 💬';
    reply.hidden = false;
  }

  const cr = document.querySelector('[data-credits]');
  if (cr) cr.innerHTML = (content.credits || []).map((c) => `<div>${escapeHtml(c)}</div>`).join('');
}

function lightbox(p) {
  const box = document.createElement('div');
  box.className = 'lightbox';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', p.caption || 'Photo');
  const fig = document.createElement('figure');
  fig.style.margin = '0';
  if (p.video) {
    const v = document.createElement('video');
    Object.assign(v, { src: p.video, controls: true, playsInline: true, autoplay: true, poster: p.poster || '' });
    v.style.maxWidth = '100%'; v.style.maxHeight = '80vh';
    fig.appendChild(v);
  } else {
    const img = new Image(); img.src = p.src; img.alt = p.alt || p.caption || '';
    fig.appendChild(img);
  }
  if (p.caption) { const c = document.createElement('figcaption'); c.textContent = p.caption; fig.appendChild(c); }
  box.appendChild(fig);
  const close = () => { box.remove(); removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  box.addEventListener('click', (e) => { if (e.target === box || e.target.tagName === 'IMG') close(); });
  addEventListener('keydown', onKey);
  document.body.appendChild(box);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
