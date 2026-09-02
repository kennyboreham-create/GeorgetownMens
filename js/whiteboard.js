let whiteboardDragging = false;

function initWhiteboardTab() {
  loadWhiteboard();
}

function readWhiteboardLink() {
  const input = document.getElementById('whiteboardLinkInput');
  return input ? input.value.trim() : '';
}

function clearWhiteboardLink() {
  const input = document.getElementById('whiteboardLinkInput');
  if (input) input.value = '';
}

async function loadWhiteboard() {
  const layer = document.getElementById('whiteboardLayer');
  if (!layer || whiteboardDragging) return;

  try {
    const items = await apiFetch('/whiteboard');
    const list = Array.isArray(items) ? items : (items.items || []);
    layer.innerHTML = '';
    list.forEach(renderWhiteboardItem);
  } catch (err) {
    layer.innerHTML = `<p class="text-red-500 text-sm p-3">${escapeDashboardHtml(err.message)}</p>`;
  }
}

function renderWhiteboardItem(item) {
  const layer = document.getElementById('whiteboardLayer');
  if (!layer) return;

  const el = document.createElement('div');
  el.className = `whiteboard-item whiteboard-item-${item.kind}${item.url ? ' has-link' : ''}`;
  el.dataset.id = item._id;
  el.dataset.url = item.url || '';
  el.style.position = 'absolute';
  el.style.left = `${item.x}%`;
  el.style.top = `${item.y}%`;
  el.style.transform = 'translate(-50%, -50%)';
  el.style.zIndex = '6';
  el.style.cursor = item.url ? 'pointer' : 'grab';
  el.style.touchAction = 'none';
  el.style.userSelect = 'none';
  el.draggable = false;
  if (item.url) el.title = item.url;

  if (item.kind === 'x') {
    el.textContent = 'X';
    el.style.color = item.url ? '#2563eb' : '#dc2626';
    el.style.fontSize = '2.6rem';
    el.style.fontWeight = '900';
  } else if (item.kind === 'o') {
    el.textContent = 'O';
    el.style.color = '#2563eb';
    el.style.fontSize = '2.6rem';
    el.style.fontWeight = '900';
  } else {
    el.textContent = item.text || '';
    el.style.color = item.url ? '#2563eb' : '#0f172a';
    el.style.background = item.url ? '#dbeafe' : '#fef9c3';
    el.style.border = item.url ? '2px solid #2563eb' : '2px solid #0f172a';
    el.style.borderRadius = '8px';
    el.style.padding = '6px 10px';
    el.style.fontWeight = '800';
  }

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'whiteboard-item-delete';
  del.title = 'Remove';
  del.textContent = '×';
  del.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteWhiteboardItem(item._id);
  });
  el.appendChild(del);

  attachWhiteboardDrag(el, item._id, item.url || '');
  layer.appendChild(el);
}

function attachWhiteboardDrag(el, id, url) {
  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.whiteboard-item-delete')) return;
    e.preventDefault();
    e.stopPropagation();
    el.setPointerCapture(e.pointerId);
    whiteboardDragging = true;
    document.body.classList.add('overlay-dragging');
    el.style.cursor = 'grabbing';

    const board = document.getElementById('whiteboardBoard');
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;

    const move = (ev) => {
      if (!board) return;
      if (Math.abs(ev.clientX - startX) > 6 || Math.abs(ev.clientY - startY) > 6) {
        moved = true;
      }
      const r = board.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const x = Math.min(98, Math.max(2, ((ev.clientX - r.left) / r.width) * 100));
      const y = Math.min(98, Math.max(2, ((ev.clientY - r.top) / r.height) * 100));
      el.style.left = `${x}%`;
      el.style.top = `${y}%`;
      el.dataset.x = String(x);
      el.dataset.y = String(y);
    };

    const up = async (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      document.body.classList.remove('overlay-dragging');
      el.style.cursor = url ? 'pointer' : 'grab';
      whiteboardDragging = false;
      if (ev && ev.clientX != null && moved) move(ev);
      const x = Number(el.dataset.x);
      const y = Number(el.dataset.y);
      if (moved && Number.isFinite(x) && Number.isFinite(y)) {
        try {
          await apiFetch(`/whiteboard/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ x, y })
          });
        } catch (err) {
          alert(err.message);
        }
      } else if (!moved && url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  });
}

async function addWhiteboardText(e) {
  e.preventDefault();
  const input = document.getElementById('whiteboardTextInput');
  const text = input.value.trim();
  if (!text) {
    alert('Type a word first.');
    return;
  }
  await createWhiteboardItem({ kind: 'text', text, url: readWhiteboardLink(), x: 50, y: 18 });
  input.value = '';
  clearWhiteboardLink();
}

async function addWhiteboardMark(kind) {
  await createWhiteboardItem({ kind, url: readWhiteboardLink(), x: 50, y: 70 });
  clearWhiteboardLink();
}

async function createWhiteboardItem(payload) {
  try {
    await apiFetch('/whiteboard', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    await loadWhiteboard();
  } catch (err) {
    alert(err.message);
  }
}

async function deleteWhiteboardItem(id) {
  try {
    await apiFetch(`/whiteboard/${id}`, { method: 'DELETE' });
    await loadWhiteboard();
  } catch (err) {
    alert(err.message);
  }
}
