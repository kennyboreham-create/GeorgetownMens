const SECTIONS = [
  { key: 'team_rules', label: 'Team Rules' },
  { key: 'backbone_pillars', label: 'Backbone' },
  { key: 'coaches_admin', label: 'Coaches and Admin' },
  { key: 'systems', label: 'Systems' },
  { key: 'base_knowledge', label: 'Base Knowledge' },
  { key: 'players', label: 'Players' },
  { key: 'links', label: 'Useful Links' }
];

const CREATE_SECTION_TITLES = {
  team_rules: 'Add your team rules and policies for the team to see',
  coaches_admin: 'Add your staff for players to see',
  backbone_pillars: 'Show the main philosophy that drives the team',
  systems: 'Teach players your system',
  base_knowledge: 'Tell the players what they need to know before season',
  players: 'Use this section to break philosophy and thoughts into positions',
  links: 'Add outside links that are useful'
};

const SYSTEM_SUBS = ['Forecheck', 'Backcheck', 'Breakouts', 'O-Zone', 'D-Zone', 'Neutral Zone', 'Powerplay', 'Penalty Kill'];
const PLAYER_SUBS = ['Forwards', 'Defense', 'Goalies'];
const BACKBONE_LAYOUTS = [
  { key: 'vertical_box', label: '1 — Vertical box list' },
  { key: 'radial', label: '2 — Basic Radial' },
  { key: 'horizontal_hierarchy', label: '3 — Horizontal Hierarchy' }
];

const VIEW_TOKEN_KEY = 'playbookViewToken';

function playbookApp() {
  const app = window.PLAYBOOK_APP || {};
  return {
    variant: app.variant || 'team',
    playbookId: String(app.playbookId || ''),
    backHref: app.backHref || '/dashboard.html',
    backLabel: app.backLabel || 'Dashboard'
  };
}

function isAdminPlaybook() {
  return playbookApp().variant === 'admin';
}

function isSubscriptionView() {
  return playbookApp().variant === 'subscription-view';
}

let pbState = {
  mode: null, // 'editor' | 'viewer' | 'gate' | 'empty'
  isHead: false,
  playbook: null,
  blocks: [],
  shareToken: null,
  viewToken: null,
  user: null
};

function $(id) { return document.getElementById(id); }

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function show(el, on = true) {
  if (!el) return;
  el.classList.toggle('hidden', !on);
}

function resolveApiBase() {
  if (typeof API_BASE_URL !== 'undefined' && API_BASE_URL) return String(API_BASE_URL).replace(/\/$/, '');
  if (window.API_BASE_URL) return String(window.API_BASE_URL).replace(/\/$/, '');
  return '/api';
}

function mediaUrl(blockId) {
  const token = pbState.viewToken || localStorage.getItem('token') || '';
  const q = token ? `?token=${encodeURIComponent(token)}` : '';
  const app = playbookApp();
  if (isAdminPlaybook() && app.playbookId) {
    return `${resolveApiBase()}/admin/playbooks/${app.playbookId}/media/${blockId}${q}`;
  }
  if (isSubscriptionView() && app.playbookId) {
    return `${resolveApiBase()}/skills-library/playbooks/${app.playbookId}/media/${blockId}${q}`;
  }
  return `${resolveApiBase()}/playbook/media/${blockId}${q}`;
}

function pbEditorPath(name, extra) {
  const app = playbookApp();
  if (isAdminPlaybook() && app.playbookId) {
    const base = `/admin/playbooks/${app.playbookId}`;
    if (name === 'editor') return `${base}/editor`;
    if (name === 'sections') return `${base}/sections`;
    if (name === 'comingSoon') return `${base}/coming-soon`;
    if (name === 'blocks') return `${base}/blocks`;
    if (name === 'block') return `${base}/blocks/${extra}`;
    if (name === 'mediaUpload') return `${base}/blocks/${extra}/media`;
  }
  if (name === 'editor') return '/playbook/editor';
  if (name === 'view') return '/playbook/view';
  if (name === 'sections') return '/playbook/sections';
  if (name === 'comingSoon') return '/playbook/coming-soon';
  if (name === 'blocks') return '/playbook/blocks';
  if (name === 'block') return `/playbook/blocks/${extra}`;
  if (name === 'mediaUpload') return `/playbook/blocks/${extra}/media`;
  return '/playbook/editor';
}

async function pbFetch(endpoint, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }

  const appToken = localStorage.getItem('token');
  const useView = options.useViewToken;
  if (useView && pbState.viewToken) {
    headers.Authorization = `Bearer ${pbState.viewToken}`;
  } else if (appToken) {
    headers.Authorization = `Bearer ${appToken}`;
  }

  const res = await fetch(`${resolveApiBase()}${endpoint}`, { ...options, headers });
  const text = await res.text();
  let data = {};
  if (text) {
    try { data = JSON.parse(text); } catch (_) { data = { error: text.slice(0, 200) }; }
  }
  if (!res.ok) {
    throw new Error(data.error || data.message || `Request failed (${res.status})`);
  }
  return data;
}

function getQueryToken() {
  return new URLSearchParams(window.location.search).get('token') || '';
}

function readUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch (_) {
    return null;
  }
}

function applyBackLinks() {
  const app = playbookApp();
  document.querySelectorAll('[data-playbook-back]').forEach((link) => {
    link.href = app.backHref;
    link.textContent = app.backLabel;
  });
}

document.addEventListener('DOMContentLoaded', () => {
  pbState.user = readUser();
  pbState.isHead = pbState.user && pbState.user.role === 'HEAD_COACH';
  pbState.shareToken = getQueryToken();
  pbState.viewToken = sessionStorage.getItem(VIEW_TOKEN_KEY);
  applyBackLinks();

  $('pbGateForm')?.addEventListener('submit', onGateSubmit);
  $('pbCreateBtn')?.addEventListener('click', () => show($('pbCreatePanel'), true));
  $('pbCreateForm')?.addEventListener('submit', onCreatePlaybook);
  $('pbCopyShare')?.addEventListener('click', copyShareLink);
  $('pbChangePwBtn')?.addEventListener('click', () => show($('pbChangePwPanel'), true));
  $('pbChangePwForm')?.addEventListener('submit', onChangePassword);

  bootstrap();
});

async function bootstrap() {
  if (isAdminPlaybook()) {
    if (!localStorage.getItem('token') || pbState.user?.role !== 'ADMIN') {
      window.location.replace('/admin-login.html');
      return;
    }
    if (!playbookApp().playbookId) {
      window.location.replace('/admin.html');
      return;
    }
    await loadEditor();
    return;
  }

  if (isSubscriptionView()) {
    if (!localStorage.getItem('token') || !pbState.user || pbState.user.role === 'PLAYER') {
      window.location.replace('/login.html');
      return;
    }
    if (!playbookApp().playbookId) {
      window.location.replace('/dashboard.html#tab-skills-library');
      return;
    }
    try {
      await loadViewer();
    } catch (err) {
      show($('pbGate'), false);
      show($('pbMain'), true);
      $('pbPageTitle').textContent = 'Skills playbook';
      show($('pbEmptyState'), true);
      $('pbEmptyState').innerHTML = `<p class="pb-coming-soon" style="margin:0">${escapeHtml(err.message || 'Could not open this playbook.')}</p>`;
    }
    return;
  }

  // Share link always uses password gate (unless view token already valid)
  if (pbState.shareToken) {
    if (pbState.viewToken) {
      try {
        await loadViewer();
        return;
      } catch (_) {
        sessionStorage.removeItem(VIEW_TOKEN_KEY);
        pbState.viewToken = null;
      }
    }
    await showGateForToken(pbState.shareToken);
    return;
  }

  // No share token — need logged-in coach
  if (!pbState.user || !localStorage.getItem('token')) {
    window.location.href = '/login.html';
    return;
  }

  if (pbState.isHead) {
    await loadEditor();
    return;
  }

  // Assistant coach → team share password gate
  if (pbState.user.role === 'COACH') {
    try {
      const data = await pbFetch('/playbook/team-share');
      pbState.shareToken = data.shareToken;
      history.replaceState({}, '', `/playbook.html?token=${encodeURIComponent(data.shareToken)}`);
      await showGateForToken(data.shareToken);
    } catch (err) {
      show($('pbGate'), false);
      show($('pbMain'), true);
      $('pbPageTitle').textContent = `${pbState.user.teamName || 'Team'}'s Playbook`;
      show($('pbEmptyState'), true);
      $('pbEmptyState').innerHTML = `<p class="pb-coming-soon" style="margin:0">${escapeHtml(err.message || 'No playbook yet.')}</p>`;
    }
    return;
  }

  window.location.href = '/dashboard.html';
}

async function showGateForToken(shareToken) {
  show($('pbMain'), false);
  show($('pbGate'), true);
  try {
    const meta = await pbFetch(`/playbook/meta/${encodeURIComponent(shareToken)}`);
    $('pbGateTitle').textContent = `${meta.teamName}'s Playbook`;
  } catch (_) {
    $('pbGateTitle').textContent = 'Team Playbook';
  }
}

async function onGateSubmit(e) {
  e.preventDefault();
  const btn = $('pbGateSubmit');
  const msg = $('pbGateMsg');
  msg.classList.add('hidden');
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'Opening…';
  try {
    const data = await pbFetch('/playbook/access', {
      method: 'POST',
      body: JSON.stringify({
        shareToken: pbState.shareToken,
        password: $('pbGatePassword').value
      })
    });
    pbState.viewToken = data.viewToken;
    sessionStorage.setItem(VIEW_TOKEN_KEY, data.viewToken);
    pbState.playbook = data.playbook;
    await loadViewer();
  } catch (err) {
    msg.textContent = err.message;
    msg.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

async function loadEditor() {
  pbState.mode = 'editor';
  show($('pbGate'), false);
  show($('pbMain'), true);
  const catalogEditor = isAdminPlaybook();
  show($('pbCreateBtn'), !catalogEditor);
  show($('pbChangePwBtn'), !catalogEditor);
  $('pbModeLabel').textContent = catalogEditor ? 'Subscription playbook editor' : 'Head coach editor';

  try {
    const data = await pbFetch(pbEditorPath('editor'));
    if (!data.exists || !data.playbook) {
      pbState.playbook = null;
      pbState.blocks = [];
      show($('pbCreateBtn'), !catalogEditor);
      show($('pbShareBox'), false);
      show($('pbEmptyState'), true);
      $('pbPageTitle').textContent = catalogEditor ? 'Subscription playbook' : `${pbState.user.teamName || 'Team'}'s Playbook`;
      $('pbSections').innerHTML = '';
      return;
    }
    pbState.playbook = data.playbook;
    pbState.blocks = data.blocks || [];
    show($('pbCreateBtn'), false);
    show($('pbCreatePanel'), false);
    show($('pbEmptyState'), false);
    renderHeader();
    renderSections(true);
  } catch (err) {
    pbState.playbook = null;
    pbState.blocks = [];
    show($('pbCreateBtn'), !catalogEditor);
    show($('pbShareBox'), false);
    show($('pbEmptyState'), true);
    $('pbPageTitle').textContent = catalogEditor ? 'Subscription playbook' : `${pbState.user.teamName || 'Team'}'s Playbook`;
    $('pbSections').innerHTML = '';
    if (err.message && !/playbook not found/i.test(err.message)) {
      show($('pbEmptyState'), true);
      $('pbEmptyState').innerHTML = `<p class="pb-coming-soon" style="margin:0">${escapeHtml(err.message)}</p>`;
    }
  }
}

async function loadViewer() {
  pbState.mode = 'viewer';
  show($('pbGate'), false);
  show($('pbMain'), true);
  show($('pbCreateBtn'), false);
  show($('pbCreatePanel'), false);
  show($('pbChangePwBtn'), false);
  show($('pbChangePwPanel'), false);
  $('pbModeLabel').textContent = 'View only';

  const data = isSubscriptionView()
    ? await pbFetch(`/skills-library/playbooks/${playbookApp().playbookId}/view`)
    : await pbFetch('/playbook/view', { useViewToken: true });
  pbState.playbook = data.playbook;
  pbState.blocks = data.blocks || [];
  if (isSubscriptionView()) {
    $('pbModeLabel').textContent = 'Included with your plan';
  }
  renderHeader();
  renderSections(false);
}

function renderHeader() {
  const pb = pbState.playbook;
  if (!pb) return;
  const catalogTitle = pb.title || pb.teamName || 'Playbook';
  const pageTitle = (isAdminPlaybook() || isSubscriptionView())
    ? catalogTitle
    : `${pb.teamName}'s Playbook`;
  $('pbPageTitle').textContent = pageTitle;
  document.title = pageTitle;
  if (pbState.mode === 'editor' && !isAdminPlaybook()) {
    show($('pbShareBox'), true);
    $('pbShareUrl').textContent = pb.shareUrl || `${window.location.origin}/playbook.html?token=${pb.shareToken}`;
  } else {
    show($('pbShareBox'), false);
  }
}

async function onCreatePlaybook(e) {
  e.preventDefault();
  const msg = $('pbCreateMsg');
  const p1 = $('pbCreatePassword').value;
  const p2 = $('pbCreatePassword2').value;
  msg.classList.add('hidden');
  if (p1 !== p2) {
    msg.textContent = 'Passwords do not match.';
    msg.className = 'pb-msg pb-msg-error';
    return;
  }
  try {
    await pbFetch('/playbook', {
      method: 'POST',
      body: JSON.stringify({ password: p1 })
    });
    await loadEditor();
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'pb-msg pb-msg-error';
  }
}

async function onChangePassword(e) {
  e.preventDefault();
  const msg = $('pbChangePwMsg');
  try {
    await pbFetch('/playbook/password', {
      method: 'PATCH',
      body: JSON.stringify({ password: $('pbNewPassword').value })
    });
    msg.textContent = 'Password updated.';
    msg.className = 'pb-msg pb-msg-ok';
    $('pbNewPassword').value = '';
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'pb-msg pb-msg-error';
  }
}

function copyShareLink() {
  const text = $('pbShareUrl').textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = $('pbCopyShare');
    const old = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = old; }, 1200);
  }).catch(() => alert('Copy failed — select the link manually.'));
}

function blocksFor(section) {
  return pbState.blocks.filter((b) => b.section === section);
}

function showComingSoon(sectionKey) {
  const dismissed = pbState.playbook?.comingSoonDismissed?.[sectionKey];
  const hasBlocks = blocksFor(sectionKey).length > 0;
  return !hasBlocks && !dismissed;
}

function sectionLabel(key) {
  return SECTIONS.find((s) => s.key === key)?.label || key;
}

function orderedSectionKeys(canEdit) {
  const labelMap = Object.fromEntries(SECTIONS.map((s) => [s.key, s.label]));
  const defaultKeys = SECTIONS.map((s) => s.key);
  const fromPlaybook = Array.isArray(pbState.playbook?.sectionOrder)
    ? pbState.playbook.sectionOrder.filter((k) => labelMap[k])
    : [];
  const seen = new Set(fromPlaybook);
  const order = [...fromPlaybook, ...defaultKeys.filter((k) => !seen.has(k))];

  if (canEdit) return order;

  const hidden = pbState.playbook?.hiddenSections || {};
  return order.filter((key) => !hidden[key]);
}

function isSectionHidden(sectionKey) {
  return Boolean(pbState.playbook?.hiddenSections?.[sectionKey]);
}

function renderSections(canEdit) {
  const root = $('pbSections');
  const keys = orderedSectionKeys(canEdit);
  root.innerHTML = keys.map((key) => {
    const blocks = blocksFor(key);
    const coming = showComingSoon(key);
    const hidden = isSectionHidden(key);
    return `
      <section class="pb-section${hidden && canEdit ? ' pb-section-hidden' : ''}" data-section="${key}">
        <div class="pb-section-head">
          <div class="pb-section-title-row">
            ${canEdit ? `<span class="pb-drag-handle" title="Drag to reorder" aria-label="Drag to reorder" role="button">⋮⋮</span>` : ''}
            <h2>${escapeHtml(sectionLabel(key))}</h2>
            ${hidden && canEdit ? `<span class="pb-hidden-badge">${isAdminPlaybook() ? 'Hidden from coaches' : 'Hidden from share link'}</span>` : ''}
          </div>
          ${canEdit ? `
            <div class="pb-actions">
              <button type="button" class="pb-btn" data-toggle-hide="${key}">${hidden
                ? (isAdminPlaybook() ? 'Show to coaches' : 'Show on share link')
                : (isAdminPlaybook() ? 'Hide from coaches' : 'Hide from share link')}</button>
              ${coming ? `<button type="button" class="pb-btn" data-dismiss="${key}">Remove Coming Soon</button>` : ''}
              <button type="button" class="pb-btn pb-btn-primary" data-create="${key}"${CREATE_SECTION_TITLES[key] ? ` title="${escapeHtml(CREATE_SECTION_TITLES[key])}"` : ''}>Create section</button>
            </div>
          ` : ''}
        </div>
        ${coming ? '<p class="pb-coming-soon">Coming Soon</p>' : ''}
        <div class="pb-blocks">${blocks.map((b) => renderBlock(b, canEdit)).join('')}</div>
        <div id="form-${key}" class="pb-form hidden"></div>
      </section>
    `;
  }).join('');

  if (canEdit) {
    root.querySelectorAll('[data-create]').forEach((btn) => {
      btn.addEventListener('click', () => openCreateForm(btn.getAttribute('data-create')));
    });
    root.querySelectorAll('[data-dismiss]').forEach((btn) => {
      btn.addEventListener('click', () => dismissComingSoon(btn.getAttribute('data-dismiss')));
    });
    root.querySelectorAll('[data-toggle-hide]').forEach((btn) => {
      btn.addEventListener('click', () => toggleSectionHidden(btn.getAttribute('data-toggle-hide')));
    });
    root.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', () => deleteBlock(btn.getAttribute('data-delete')));
    });
    root.querySelectorAll('[data-upload]').forEach((input) => {
      input.addEventListener('change', () => uploadMedia(input.getAttribute('data-upload'), input.files[0]));
    });
    bindSectionDragAndDrop(root);
  }
}

function bindSectionDragAndDrop(root) {
  let dragKey = null;

  root.querySelectorAll('.pb-section').forEach((el) => {
    const handle = el.querySelector('.pb-drag-handle');
    if (handle) {
      handle.addEventListener('mousedown', () => {
        el.setAttribute('draggable', 'true');
      });
      handle.addEventListener('mouseup', () => {
        if (!dragKey) el.setAttribute('draggable', 'false');
      });
    }
    el.setAttribute('draggable', 'false');

    el.addEventListener('dragstart', (e) => {
      if (el.getAttribute('draggable') !== 'true') {
        e.preventDefault();
        return;
      }
      dragKey = el.getAttribute('data-section');
      el.classList.add('pb-section-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragKey);
    });

    el.addEventListener('dragend', () => {
      el.classList.remove('pb-section-dragging');
      el.setAttribute('draggable', 'false');
      root.querySelectorAll('.pb-section-drop-target').forEach((n) => n.classList.remove('pb-section-drop-target'));
      dragKey = null;
    });

    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const target = e.currentTarget;
      if (!dragKey || target.getAttribute('data-section') === dragKey) return;
      root.querySelectorAll('.pb-section-drop-target').forEach((n) => n.classList.remove('pb-section-drop-target'));
      target.classList.add('pb-section-drop-target');
    });

    el.addEventListener('dragleave', (e) => {
      if (e.currentTarget.contains(e.relatedTarget)) return;
      e.currentTarget.classList.remove('pb-section-drop-target');
    });

    el.addEventListener('drop', async (e) => {
      e.preventDefault();
      const targetKey = e.currentTarget.getAttribute('data-section');
      const fromKey = dragKey || e.dataTransfer.getData('text/plain');
      e.currentTarget.classList.remove('pb-section-drop-target');
      if (!fromKey || !targetKey || fromKey === targetKey) return;

      const order = orderedSectionKeys(true);
      const fromIdx = order.indexOf(fromKey);
      const toIdx = order.indexOf(targetKey);
      if (fromIdx < 0 || toIdx < 0) return;

      order.splice(fromIdx, 1);
      order.splice(toIdx, 0, fromKey);

      if (pbState.playbook) {
        pbState.playbook.sectionOrder = order;
      }
      renderSections(true);
      await saveSectionOrder(order);
    });
  });
}

async function saveSectionOrder(sectionOrder) {
  try {
    const data = await pbFetch(pbEditorPath('sections'), {
      method: 'PATCH',
      body: JSON.stringify({ sectionOrder })
    });
    if (data.playbook) pbState.playbook = data.playbook;
  } catch (err) {
    alert(err.message);
    await loadEditor();
  }
}

async function toggleSectionHidden(sectionKey) {
  const currentlyHidden = isSectionHidden(sectionKey);
  const nextHidden = !currentlyHidden;
  try {
    const data = await pbFetch(pbEditorPath('sections'), {
      method: 'PATCH',
      body: JSON.stringify({ hiddenSections: { [sectionKey]: nextHidden } })
    });
    if (data.playbook) {
      pbState.playbook = data.playbook;
    } else if (pbState.playbook) {
      pbState.playbook.hiddenSections = {
        ...(pbState.playbook.hiddenSections || {}),
        [sectionKey]: nextHidden
      };
    }
    renderSections(true);
  } catch (err) {
    alert(err.message);
  }
}

function renderBlock(block, canEdit) {
  let extra = '';

  if (block.section === 'backbone_pillars') {
    extra = renderBackbone(block);
  } else if (block.section === 'coaches_admin') {
    extra = `
      <div class="pb-coach-card pb-block-meta">
        <div><strong>${escapeHtml(block.name || 'Coach')}</strong></div>
        ${block.experience ? `<div>Experience: ${escapeHtml(block.experience)}</div>` : ''}
        ${block.jobScope ? `<div>Job scope: ${escapeHtml(block.jobScope)}</div>` : ''}
        ${block.email ? `<div><a href="mailto:${escapeHtml(block.email)}">${escapeHtml(block.email)}</a></div>` : ''}
      </div>
    `;
  } else if (block.subsection) {
    extra += `<div class="pb-block-meta">Subsection: ${escapeHtml(block.subsection)}</div>`;
  }

  if (block.section === 'links' && block.url) {
    extra += `<div class="pb-block-meta"><a class="pb-link" href="${escapeHtml(block.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(block.label || block.url)}</a></div>`;
  }

  if (block.r2ObjectKey && (block.section === 'systems' || block.section === 'base_knowledge')) {
    if (block.mediaType === 'image') {
      extra += `<div class="pb-media"><img src="${mediaUrl(block._id)}" alt=""></div>`;
    } else {
      extra += `<div class="pb-media"><video src="${mediaUrl(block._id)}" controls></video></div>`;
    }
  }

  return `
    <article class="pb-block">
      ${block.title ? `<h2>${escapeHtml(block.title)}</h2>` : ''}
      ${block.subtitle ? `<h3>${escapeHtml(block.subtitle)}</h3>` : ''}
      ${block.body ? `<p>${escapeHtml(block.body)}</p>` : ''}
      ${extra}
      ${canEdit ? `
        <div class="pb-block-actions">
          ${(block.section === 'systems' || block.section === 'base_knowledge')
            ? `<label class="pb-btn" style="display:inline-block;cursor:pointer">
                Add image/video
                <input type="file" accept="image/*,video/*" data-upload="${block._id}" hidden>
              </label>`
            : ''}
          <button type="button" class="pb-btn pb-btn-danger" data-delete="${block._id}">Delete</button>
        </div>
      ` : ''}
    </article>
  `;
}

function renderBackbone(block) {
  const items = (block.items || []).map((i) => i.text).filter(Boolean);
  if (!items.length) return '';
  const layout = block.layoutType || 'vertical_box';

  if (layout === 'radial') {
    const spokes = items.slice(0, 6).map((text, idx) => {
      const angle = (idx / Math.max(items.length, 1)) * Math.PI * 2 - Math.PI / 2;
      const radius = 88;
      const x = 50 + Math.cos(angle) * (radius / 2.2);
      const y = 50 + Math.sin(angle) * (radius / 2.2);
      return `<div class="pb-spoke" style="left:${x}%;top:${y}%;transform:translate(-50%,-50%)">${escapeHtml(text)}</div>`;
    }).join('');
    return `
      <div class="pb-backbone-radial">
        <div class="pb-ring"></div>
        <div class="pb-hub">Backbone</div>
        ${spokes}
      </div>
    `;
  }

  if (layout === 'horizontal_hierarchy') {
    return `<div class="pb-backbone-horizontal">${items.map((t) => `<div class="pb-pillar">${escapeHtml(t)}</div>`).join('')}</div>`;
  }

  return `<div class="pb-backbone-vertical">${items.map((t) => `<div class="pb-pillar">${escapeHtml(t)}</div>`).join('')}</div>`;
}

function openCreateForm(sectionKey) {
  const host = $(`form-${sectionKey}`);
  if (!host) return;
  show(host, true);

  const common = `
    <div class="pb-field"><label>Header (H2)</label><input name="title" placeholder="Section header"></div>
    <div class="pb-field"><label>Sub header (H3)</label><input name="subtitle" placeholder="Sub header"></div>
    <div class="pb-field"><label>Paragraph</label><textarea name="body" placeholder="Details…"></textarea></div>
  `;

  let extra = '';
  if (sectionKey === 'backbone_pillars') {
    extra = `
      <div class="pb-field">
        <label>Layout</label>
        <select name="layoutType">
          ${BACKBONE_LAYOUTS.map((l) => `<option value="${l.key}">${escapeHtml(l.label)}</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="font-size:0.75rem;color:#94a3b8">Pillar items</label>
        <div id="pbItems-${sectionKey}"></div>
        <button type="button" class="pb-btn" id="pbAddItem-${sectionKey}">Add item</button>
      </div>
    `;
  } else if (sectionKey === 'coaches_admin') {
    extra = `
      <div class="pb-field"><label>Name</label><input name="name" required></div>
      <div class="pb-field"><label>Experience</label><input name="experience"></div>
      <div class="pb-field"><label>Job Scope</label><input name="jobScope"></div>
      <div class="pb-field"><label>Email</label><input name="email" type="email"></div>
    `;
  } else if (sectionKey === 'systems') {
    extra = `
      <div class="pb-chips" id="chips-${sectionKey}">
        ${SYSTEM_SUBS.map((s) => `<button type="button" class="pb-chip" data-sub="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join('')}
      </div>
      <input type="hidden" name="subsection" value="">
    `;
  } else if (sectionKey === 'players') {
    extra = `
      <div class="pb-chips" id="chips-${sectionKey}">
        ${PLAYER_SUBS.map((s) => `<button type="button" class="pb-chip" data-sub="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join('')}
      </div>
      <input type="hidden" name="subsection" value="">
    `;
  } else if (sectionKey === 'links') {
    extra = `
      <div class="pb-field"><label>Link label</label><input name="label" placeholder="Useful resource"></div>
      <div class="pb-field"><label>URL</label><input name="url" placeholder="https://…" required></div>
    `;
  }

  host.innerHTML = `
    <form class="pb-form-grid" data-section-form="${sectionKey}">
      ${common}
      ${extra}
      <p class="pb-msg pb-msg-error hidden" data-form-msg></p>
      <div class="pb-actions">
        <button type="submit" class="pb-btn pb-btn-primary">Save section</button>
        <button type="button" class="pb-btn" data-cancel>Cancel</button>
      </div>
    </form>
  `;

  const form = host.querySelector('form');
  form.addEventListener('submit', (ev) => submitCreateForm(ev, sectionKey));
  host.querySelector('[data-cancel]').addEventListener('click', () => show(host, false));

  host.querySelectorAll('.pb-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      host.querySelectorAll('.pb-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      const input = form.querySelector('[name="subsection"]');
      if (input) input.value = chip.getAttribute('data-sub');
    });
  });

  if (sectionKey === 'backbone_pillars') {
    const list = $(`pbItems-${sectionKey}`);
    const addRow = () => {
      const row = document.createElement('div');
      row.className = 'pb-item-row';
      row.innerHTML = `<input name="itemText" placeholder="Pillar text"><button type="button" class="pb-btn">×</button>`;
      row.querySelector('button').addEventListener('click', () => row.remove());
      list.appendChild(row);
    };
    addRow();
    addRow();
    addRow();
    $(`pbAddItem-${sectionKey}`).addEventListener('click', addRow);
  }
}

async function submitCreateForm(e, sectionKey) {
  e.preventDefault();
  const form = e.target;
  const msg = form.querySelector('[data-form-msg]');
  msg.classList.add('hidden');

  const fd = new FormData(form);
  const payload = {
    section: sectionKey,
    title: fd.get('title') || '',
    subtitle: fd.get('subtitle') || '',
    body: fd.get('body') || '',
    name: fd.get('name') || '',
    experience: fd.get('experience') || '',
    jobScope: fd.get('jobScope') || '',
    email: fd.get('email') || '',
    subsection: fd.get('subsection') || '',
    url: fd.get('url') || '',
    label: fd.get('label') || '',
    layoutType: fd.get('layoutType') || undefined,
    items: Array.from(form.querySelectorAll('[name="itemText"]'))
      .map((el) => ({ text: el.value.trim() }))
      .filter((i) => i.text)
  };

  try {
    await pbFetch(pbEditorPath('blocks'), {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    await loadEditor();
  } catch (err) {
    msg.textContent = err.message;
    msg.classList.remove('hidden');
  }
}

async function dismissComingSoon(section) {
  try {
    await pbFetch(pbEditorPath('comingSoon'), {
      method: 'PATCH',
      body: JSON.stringify({ section })
    });
    await loadEditor();
  } catch (err) {
    alert(err.message);
  }
}

async function deleteBlock(id) {
  if (!confirm('Delete this section?')) return;
  try {
    await pbFetch(pbEditorPath('block', id), { method: 'DELETE' });
    await loadEditor();
  } catch (err) {
    alert(err.message);
  }
}

async function uploadMedia(blockId, file) {
  if (!file) return;
  const form = new FormData();
  form.append('file', file);
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`${resolveApiBase()}${pbEditorPath('mediaUpload', blockId)}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form
    });
    const text = await res.text();
    let data = {};
    try { data = JSON.parse(text); } catch (_) { data = { error: text }; }
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    await loadEditor();
  } catch (err) {
    alert(err.message);
  }
}
