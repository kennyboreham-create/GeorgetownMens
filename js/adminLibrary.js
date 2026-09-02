const adminState = {
  topics: [],
  playbookCategories: [],
  skillLevels: [],
  videos: [],
  playbooks: []
};

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showStatus(message, ok = false) {
  const el = $('adminStatus');
  if (!el) return;
  el.classList.remove('hidden', 'text-red-400', 'text-emerald-300');
  el.classList.add(ok ? 'text-emerald-300' : 'text-red-400');
  el.textContent = message;
}

function defaultSkillLevels() {
  return Array.from({ length: 10 }, (_, index) => ({
    id: index + 1,
    title: `Level ${index + 1}`
  }));
}

function fillSelect(select, items, selected) {
  if (!select || !items.length) return;
  const selectedValue = selected == null ? '' : String(selected);
  select.innerHTML = items.map((item) => (
    `<option value="${escapeHtml(item.id)}"${String(item.id) === selectedValue ? ' selected' : ''}>${escapeHtml(item.title)}</option>`
  )).join('');
}

function topicTitle(id) {
  return adminState.topics.find((topic) => topic.id === id)?.title || id;
}

function skillLevelTitle(level) {
  const n = Number(level);
  return adminState.skillLevels.find((item) => Number(item.id) === n)?.title || (n ? `Level ${n}` : 'Level 1');
}

function categoryTitle(id) {
  return adminState.playbookCategories.find((category) => category.id === id)?.title || id;
}

function resetVideoForm() {
  $('videoId').value = '';
  $('videoTitle').value = '';
  $('videoUrl').value = '';
  $('videoDescription').value = '';
  if (adminState.topics[0]) $('videoTopic').value = adminState.topics[0].id;
  if (adminState.skillLevels[0]) $('videoLevel').value = String(adminState.skillLevels[0].id);
}

function playbookEditorHref(id) {
  return `/admin-playbook.html?id=${encodeURIComponent(id)}`;
}

function resetPlaybookForm() {
  $('playbookId').value = '';
  $('playbookTitle').value = '';
  $('playbookSummary').value = '';
  if (adminState.playbookCategories[0]) $('playbookCategory').value = adminState.playbookCategories[0].id;
}

function renderVideos() {
  const list = $('videoList');
  if (!list) return;
  if (!adminState.videos.length) {
    list.innerHTML = '<p class="text-sm text-slate-500">No subscription videos yet.</p>';
    return;
  }
  list.innerHTML = adminState.videos.map((video) => `
    <article class="bg-slate-900/70 border border-slate-700 rounded-lg p-3 flex flex-wrap justify-between gap-2">
      <div class="min-w-0">
        <p class="font-semibold">${escapeHtml(video.title)}</p>
        <p class="text-xs text-slate-400">${escapeHtml(topicTitle(video.topic))} · ${escapeHtml(skillLevelTitle(video.level))} · ${escapeHtml(video.url)}</p>
        ${video.description ? `<p class="text-sm text-slate-300 mt-1">${escapeHtml(video.description)}</p>` : ''}
      </div>
      <div class="flex gap-2">
        <button type="button" data-edit-video="${escapeHtml(video.id)}" class="text-xs bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded">Edit</button>
        <button type="button" data-delete-video="${escapeHtml(video.id)}" class="text-xs bg-red-800 hover:bg-red-700 px-3 py-1.5 rounded">Delete</button>
      </div>
    </article>
  `).join('');
}

function renderPlaybooks() {
  const list = $('playbookList');
  if (!list) return;
  if (!adminState.playbooks.length) {
    list.innerHTML = '<p class="text-sm text-slate-500">No subscription playbooks yet.</p>';
    return;
  }
  list.innerHTML = adminState.playbooks.map((playbook) => `
    <article class="bg-slate-900/70 border border-slate-700 rounded-lg p-3 flex flex-wrap justify-between gap-2">
      <div class="min-w-0">
        <p class="font-semibold">${escapeHtml(playbook.title)}</p>
        <p class="text-xs text-slate-400">${escapeHtml(categoryTitle(playbook.category))}${playbook.presetKey ? ' · preset' : ''}</p>
        ${playbook.summary ? `<p class="text-sm text-slate-300 mt-1">${escapeHtml(playbook.summary)}</p>` : ''}
      </div>
      <div class="flex flex-wrap gap-2">
        <a href="${playbookEditorHref(playbook.id)}" class="text-xs bg-emerald-700 hover:bg-emerald-600 px-3 py-1.5 rounded font-semibold">Open editor</a>
        <button type="button" data-edit-playbook="${escapeHtml(playbook.id)}" class="text-xs bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded">Edit details</button>
        <button type="button" data-delete-playbook="${escapeHtml(playbook.id)}" class="text-xs bg-red-800 hover:bg-red-700 px-3 py-1.5 rounded">Delete</button>
      </div>
    </article>
  `).join('');
}

async function refreshLists() {
  const [videosRes, playbooksRes] = await Promise.all([
    apiFetch('/admin/videos'),
    apiFetch('/admin/playbooks')
  ]);
  adminState.videos = videosRes.videos || [];
  adminState.playbooks = playbooksRes.playbooks || [];
  renderVideos();
  renderPlaybooks();
}

function fillVideoForm(video) {
  $('videoId').value = video.id;
  $('videoTitle').value = video.title || '';
  $('videoTopic').value = video.topic;
  $('videoLevel').value = String(video.level || 1);
  $('videoUrl').value = video.url || '';
  $('videoDescription').value = video.description || '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function fillPlaybookForm(playbook) {
  $('playbookId').value = playbook.id;
  $('playbookTitle').value = playbook.title || '';
  $('playbookCategory').value = playbook.category;
  $('playbookSummary').value = playbook.summary || '';
  $('playbookForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('token');
  const user = (() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
  })();

  if (!token || !user || user.role !== 'ADMIN') {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.replace('/admin-login.html');
    return;
  }

  $('adminUserInfo').textContent = `${user.name || 'Admin'} · ${user.email || ''}`.trim();
  $('adminLogoutBtn').addEventListener('click', () => {
    localStorage.clear();
    window.location.href = '/admin-login.html';
  });
  $('videoResetBtn').addEventListener('click', resetVideoForm);
  $('playbookResetBtn').addEventListener('click', resetPlaybookForm);

  adminState.skillLevels = defaultSkillLevels();
  fillSelect($('videoLevel'), adminState.skillLevels);

  try {
    const catalog = await apiFetch('/admin/me');
    adminState.topics = catalog.topics || [];
    adminState.playbookCategories = catalog.playbookCategories || [];
    if (Array.isArray(catalog.skillLevels) && catalog.skillLevels.length) {
      adminState.skillLevels = catalog.skillLevels;
    }
    fillSelect($('videoTopic'), adminState.topics);
    fillSelect($('videoLevel'), adminState.skillLevels, $('videoLevel').value || 1);
    fillSelect($('playbookCategory'), adminState.playbookCategories);
    await refreshLists();
  } catch (err) {
    showStatus(err.message || 'Could not load the admin library.');
    return;
  }

  $('videoForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = $('videoId').value;
    const payload = {
      title: $('videoTitle').value,
      topic: $('videoTopic').value,
      level: Number($('videoLevel').value),
      url: $('videoUrl').value,
      description: $('videoDescription').value
    };
    try {
      if (id) {
        await apiFetch(`/admin/videos/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await apiFetch('/admin/videos', { method: 'POST', body: JSON.stringify(payload) });
      }
      resetVideoForm();
      await refreshLists();
      showStatus('Video saved to the subscription library.', true);
    } catch (err) {
      showStatus(err.message);
    }
  });

  $('playbookForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = $('playbookId').value;
    const payload = {
      title: $('playbookTitle').value,
      category: $('playbookCategory').value,
      summary: $('playbookSummary').value
    };
    try {
      if (id) {
        await apiFetch(`/admin/playbooks/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        resetPlaybookForm();
        await refreshLists();
        showStatus('Playbook details saved.', true);
      } else {
        const created = await apiFetch('/admin/playbooks', { method: 'POST', body: JSON.stringify(payload) });
        const playbookId = created.playbook?.id;
        if (playbookId) {
          window.location.href = playbookEditorHref(playbookId);
          return;
        }
        resetPlaybookForm();
        await refreshLists();
        showStatus('Playbook created. Open the editor to add sections.', true);
      }
    } catch (err) {
      showStatus(err.message);
    }
  });

  $('videoList').addEventListener('click', async (event) => {
    const editId = event.target.closest('[data-edit-video]')?.getAttribute('data-edit-video');
    const deleteId = event.target.closest('[data-delete-video]')?.getAttribute('data-delete-video');
    if (editId) {
      const video = adminState.videos.find((item) => item.id === editId);
      if (video) fillVideoForm(video);
      return;
    }
    if (deleteId && window.confirm('Delete this subscription video?')) {
      try {
        await apiFetch(`/admin/videos/${deleteId}`, { method: 'DELETE' });
        await refreshLists();
        showStatus('Video removed.', true);
      } catch (err) {
        showStatus(err.message);
      }
    }
  });

  $('playbookList').addEventListener('click', async (event) => {
    const editId = event.target.closest('[data-edit-playbook]')?.getAttribute('data-edit-playbook');
    const deleteId = event.target.closest('[data-delete-playbook]')?.getAttribute('data-delete-playbook');
    if (editId) {
      const playbook = adminState.playbooks.find((item) => item.id === editId);
      if (playbook) fillPlaybookForm(playbook);
      return;
    }
    if (deleteId && window.confirm('Delete this subscription playbook?')) {
      try {
        await apiFetch(`/admin/playbooks/${deleteId}`, { method: 'DELETE' });
        await refreshLists();
        showStatus('Playbook removed.', true);
      } catch (err) {
        showStatus(err.message);
      }
    }
  });
});
