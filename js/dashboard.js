let currentUser = null;
let currentTab = null;
let assignVideoId = null;
let previewSnippetBounds = null;
let videoLibraryCache = [];
let stopPreviewOverlays = null;
let teamRosterEmails = [];

document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user');
  if (!token || !userStr) {
    localStorage.clear();
    window.location.href = '/login.html';
    return;
  }

  currentUser = JSON.parse(userStr);
  if (currentUser?.role === 'ADMIN') {
    window.location.replace('/admin.html');
    return;
  }
  if (currentUser?.role === 'PLAYER') {
    localStorage.clear();
    window.location.href = '/login.html';
    return;
  }

  document.getElementById('appTeamName').innerText = currentUser.teamName || 'Team Workspace';
  renderAppUserInfo();

  setupSidebar();
  syncMobileNavOffset();
  if (currentUser.role === 'HEAD_COACH') {
    document.getElementById('insertYouTubePanel')?.classList.remove('hidden');
  }

  window.addEventListener('hashchange', () => {
    const next = (window.location.hash || '').replace(/^#/, '');
    if (next && document.getElementById(next) && next !== currentTab) {
      switchTab(next);
    }
  });

  const hashTab = (window.location.hash || '').replace(/^#/, '');
  const initialTab = document.getElementById(hashTab) ? hashTab : 'tab-snippet-creator';
  switchTab(initialTab);
});

function formatSubscriptionLabel(userOrStorage) {
  const status = userOrStorage?.subscriptionStatus;
  const plan = userOrStorage?.plan === 'pro' ? 'premium' : userOrStorage?.plan;
  if (status === 'active' && plan && plan !== 'free') {
    return userOrStorage.planLabel || (plan === 'premium' ? 'Premium' : 'Plus');
  }
  return null;
}

function renderAppUserInfo(storage) {
  const el = document.getElementById('appUserInfo');
  if (!el || !currentUser) return;
  const planLabel = formatSubscriptionLabel(storage) || formatSubscriptionLabel(currentUser);
  el.innerText = planLabel
    ? `${currentUser.name} · ${planLabel}`
    : `${currentUser.name} (${currentUser.role})`;
}

function isMobileNav() {
  return window.matchMedia('(max-width: 767px)').matches;
}

function syncMobileNavOffset() {
  const header = document.getElementById('appHeader');
  if (!header) return;
  document.documentElement.style.setProperty('--app-header-height', `${header.offsetHeight}px`);
}

function setMobileNavToggleLabel(isOpen) {
  const toggle = document.getElementById('mobileNavToggle');
  if (toggle) {
    toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    toggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
  }
}

function openMobileNav() {
  const sidebar = document.getElementById('sidebarNav');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (!sidebar) return;
  syncMobileNavOffset();
  sidebar.classList.add('is-open');
  if (backdrop) backdrop.classList.remove('hidden');
  setMobileNavToggleLabel(true);
  document.body.classList.add('mobile-nav-open');
}

function closeMobileNav() {
  const sidebar = document.getElementById('sidebarNav');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (sidebar) sidebar.classList.remove('is-open');
  if (backdrop) backdrop.classList.add('hidden');
  setMobileNavToggleLabel(false);
  document.body.classList.remove('mobile-nav-open');
}

function toggleMobileNav() {
  const sidebar = document.getElementById('sidebarNav');
  if (sidebar && sidebar.classList.contains('is-open')) {
    closeMobileNav();
  } else {
    openMobileNav();
  }
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeMobileNav();
});

window.addEventListener('resize', () => {
  syncMobileNavOffset();
  if (!isMobileNav()) closeMobileNav();
});

function setupSidebar() {
  const sidebar = document.getElementById('sidebarNav');
  const isCoach = currentUser.role === 'HEAD_COACH' || currentUser.role === 'COACH';
  const navClass = 'w-full text-left px-4 py-3 min-h-[44px] rounded-lg text-sm font-medium transition hover:bg-slate-700/50 text-slate-300 flex items-center';

  const tabBtn = (id, label) => `
    <button onclick="switchTab('${id}')" id="nav-${id}" class="${navClass}">
      ${label}
    </button>`;

  let html = '';
  html += tabBtn('tab-snippet-creator', '🎬 Snippet Creator');
  if (isCoach) {
    html += `<a href="/rink-creator.html" class="block ${navClass}">🏒 Rink Video Creator</a>`;
  }
  html += tabBtn('tab-view-videos', '📹 Video Library');
  html += tabBtn('tab-assignments', '📋 Assignments & Links');
  html += tabBtn('tab-player-goals', '🎯 Player Goals');
  html += tabBtn('tab-my-goals', '⭐ My Goals');

  if (isCoach) {
    html += tabBtn('tab-whiteboard', '🧊 Whiteboard');
  }

  if (currentUser.role === 'HEAD_COACH') {
    html += tabBtn('tab-team-manage', '⚙️ Team Management');
  }

  if (isCoach) {
    html += `<a href="/playbook.html" class="block ${navClass}">📖 Playbook</a>`;
    html += `<button type="button" onclick="openSkillsLibraryNav()" id="nav-tab-skills-library" class="${navClass}">📚 Skills Library</button>`;
  }

  html += `<a href="/blog/" id="nav-blog" class="block ${navClass} mt-auto" target="_blank" rel="noopener noreferrer">📰 Coach Blog</a>`;

  sidebar.innerHTML = html;
}

function switchTab(tabId) {
  currentTab = tabId;
  closeMobileNav();
  if ((window.location.hash || '').replace(/^#/, '') !== tabId) {
    history.replaceState(null, '', '#' + tabId);
  }

  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('#sidebarNav button').forEach(el => el.classList.remove('bg-blue-600', 'text-white'));

  const activeTab = document.getElementById(tabId);
  const activeNav = document.getElementById(`nav-${tabId}`);

  if (activeTab) activeTab.classList.remove('hidden');
  if (activeNav) activeNav.classList.add('bg-blue-600', 'text-white');

  if (tabId === 'tab-view-videos') loadVideoLibrary({ refreshTags: true });
  if (tabId === 'tab-player-goals') renderPlayerGoalsUI();
  if (tabId === 'tab-my-goals') renderMyGoalsUI();
  if (tabId === 'tab-team-goals') renderTeamGoalsUI();

  if (tabId === 'tab-team-goals') {
    document.getElementById('nav-tab-my-goals')?.classList.add('bg-blue-600', 'text-white');
  }
  if (tabId === 'tab-assignments') loadAssignmentsData();
  if (tabId === 'tab-team-manage') loadTeamRoster();
  if (tabId === 'tab-skills-library') gateSkillsLibraryTab();
  if (tabId === 'tab-whiteboard') initWhiteboardTab();
}

function toggleLibraryPanel(bodyId, buttonEl) {
  const body = document.getElementById(bodyId);
  if (!body || !buttonEl) return;

  const isOpen = !body.classList.contains('hidden');
  body.classList.toggle('hidden', isOpen);
  buttonEl.setAttribute('aria-expanded', String(!isOpen));

  const chevron = buttonEl.querySelector('.library-panel-chevron');
  if (chevron) {
    chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
  }
}

function canAssignVideos() {
  return currentUser.role === 'HEAD_COACH' || currentUser.role === 'COACH';
}

function formatWatchDuration(seconds) {
  const s = Math.floor(seconds || 0);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem ? `${m}m ${rem}s` : `${m}m`;
}

async function populateVideoTagFilter() {
  const select = document.getElementById('videoTagFilter');
  if (!select) return;

  const selected = select.value;
  const tags = await apiFetch('/videos/tags');
  select.innerHTML = ['<option value="">All tags</option>']
    .concat((tags || []).map((t) => {
      const value = escapeDashboardHtml(t);
      return `<option value="${value}">${value}</option>`;
    }))
    .join('');

  if (selected && (tags || []).includes(selected)) {
    select.value = selected;
  }
}

async function loadVideoLibrary(options = {}) {
  if (options.refreshTags) {
    await populateVideoTagFilter();
  }

  const search = document.getElementById('videoSearchInput').value;
  const tag = document.getElementById('videoTagFilter')?.value || '';
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (tag) params.set('tag', tag);
  const qs = params.toString();
  const videos = await apiFetch(qs ? `/videos?${qs}` : '/videos');
  videoLibraryCache = videos;
  applyUploadQuotaNote();
  const grid = document.getElementById('videoGrid');

  if (!videos.length) {
    grid.innerHTML = '<p class="text-slate-400 italic col-span-full">No videos found. Upload a video to get started.</p>';
    return;
  }

  grid.innerHTML = videos.map(v => {
    const playable = isVideoPlayable(v);
    const isYouTube = !hasStoredVideoFile(v) && isYouTubeUrl(v.url);
    const hasClip = v.clipStartSeconds != null && v.clipEndSeconds != null;
    let typeLabel = 'Full Game';
    let typeClass = 'bg-emerald-900/60 text-emerald-300';
    if (v.isSnippet) {
      typeLabel = 'Snippet';
      typeClass = 'bg-indigo-900/60 text-indigo-300';
    } else if (isYouTube) {
      typeLabel = hasClip ? 'YouTube Clip' : 'YouTube';
      typeClass = 'bg-rose-900/60 text-rose-300';
    }
    return `
    <div class="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-2">
      <div class="flex justify-between items-start gap-2 min-w-0">
        <h3 class="font-bold text-blue-400 min-w-0 break-words">${escapeDashboardHtml(v.title)}</h3>
        <span class="text-xs ${typeClass} px-2 py-0.5 rounded">
          ${typeLabel}
        </span>
      </div>
      <div class="flex flex-wrap gap-1">
        ${(v.tags || []).map(t => `<span class="bg-slate-900 text-slate-400 text-xs px-2 py-0.5 rounded">${escapeDashboardHtml(t)}</span>`).join('')}
      </div>
      ${v.isSnippet && v.startTime != null ? `<p class="text-xs text-slate-500">${formatSnippetDuration(v.startTime, v.endTime)}</p>` : ''}
      ${!v.isSnippet && hasClip ? `<p class="text-xs text-slate-500">${formatSnippetDuration(v.clipStartSeconds, v.clipEndSeconds)}</p>` : ''}
      <div class="flex flex-wrap gap-2 pt-1">
        ${playable ? `
          <button onclick="openVideoPreview('${v._id}')" class="text-xs bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded transition font-semibold">
            ▶ Preview
          </button>
        ` : ''}
        ${canAssignVideos() ? `
          <button onclick="openAssignModal('${v._id}')" class="text-xs bg-emerald-700 hover:bg-emerald-600 px-3 py-1.5 rounded transition font-semibold">
            Assign
          </button>
        ` : ''}
        ${!v.isSnippet && hasStoredVideoFile(v) ? `
          <button onclick="downloadLibraryVideo('${v._id}', '${escapeDashboardHtml(v.originalFilename || v.title)}')" class="text-xs bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded transition">
            Download
          </button>
        ` : ''}
        <button onclick="deleteLibraryVideo('${v._id}')" class="text-xs bg-red-800 hover:bg-red-700 px-3 py-1.5 rounded transition font-semibold">
          Delete
        </button>
      </div>
    </div>
  `;
  }).join('');
}

function isVideoPlayable(v) {
  if (hasStoredVideoFile(v) || (v.url && v.url.includes('/stream'))) return true;
  if (v.url && /^https?:\/\//i.test(v.url)) return true;
  if (v.isSnippet && v.parentVideoId) return true;
  return false;
}

function resolvePreviewStreamId(video) {
  if (video.isSnippet && video.parentVideoId) {
    return video.parentVideoId;
  }
  return video._id;
}

function openVideoPreview(videoId) {
  const video = videoLibraryCache.find(v => v._id === videoId);
  if (!video) return;

  const modal = document.getElementById('videoPreviewModal');
  const player = document.getElementById('videoPreviewPlayer');
  const ytFrame = document.getElementById('videoPreviewYouTube');
  document.getElementById('videoPreviewTitle').textContent = video.title;

  previewSnippetBounds = video.isSnippet
    ? { startTime: video.startTime, endTime: video.endTime }
    : null;

  player.muted = Boolean(video.muteAudio);

  player.onloadedmetadata = null;
  player.ontimeupdate = null;
  if (typeof stopPreviewOverlays === 'function') {
    stopPreviewOverlays();
    stopPreviewOverlays = null;
  }
  const overlayLayer = document.getElementById('videoPreviewOverlayLayer');
  if (overlayLayer) overlayLayer.innerHTML = '';

  // YouTube (e.g. global how-to or inserted clips): embed iframe — <video src> cannot play YouTube pages.
  const ytEmbed = !hasStoredVideoFile(video) && !video.parentVideoId
    ? toYouTubeEmbedUrl(video.url, {
        startSeconds: video.clipStartSeconds,
        endSeconds: video.clipEndSeconds
      })
    : null;

  if (ytEmbed && ytFrame) {
    player.pause();
    player.removeAttribute('src');
    player.load();
    player.classList.add('hidden');
    ytFrame.src = ytEmbed;
    ytFrame.classList.remove('hidden');
    if (overlayLayer) overlayLayer.classList.add('hidden');
    modal.classList.remove('hidden');
    return;
  }

  if (ytFrame) {
    ytFrame.classList.add('hidden');
    ytFrame.removeAttribute('src');
  }
  player.classList.remove('hidden');
  if (overlayLayer) overlayLayer.classList.remove('hidden');

  if (video.url && /^https?:\/\//i.test(video.url) && !hasStoredVideoFile(video) && !video.parentVideoId) {
    player.src = video.url;
  } else {
    player.src = getVideoStreamUrl(resolvePreviewStreamId(video));
  }

  if (previewSnippetBounds?.startTime != null) {
    player.onloadedmetadata = () => {
      player.currentTime = previewSnippetBounds.startTime;
    };
    player.ontimeupdate = () => {
      if (previewSnippetBounds?.endTime != null && player.currentTime >= previewSnippetBounds.endTime) {
        player.pause();
      }
    };
  }

  if (video.isSnippet && Array.isArray(video.overlays) && video.overlays.length && typeof attachSnippetOverlayReplay === 'function') {
    stopPreviewOverlays = attachSnippetOverlayReplay(
      player,
      overlayLayer || document.getElementById('videoPreviewOverlayLayer'),
      video.overlays,
      video.startTime || 0
    );
  }

  modal.classList.remove('hidden');
  player.play().catch(() => {});
}

function formatSnippetDuration(start, end) {
  const secs = Math.max(0, Math.round((Number(end) || 0) - (Number(start) || 0)));
  if (secs === 1) return '1 second';
  if (secs < 60) return `${secs} seconds`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (s === 0) return m === 1 ? '1 minute' : `${m} minutes`;
  return `${m} min ${s} sec`;
}

function escapeDashboardHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function closeVideoPreview() {
  const modal = document.getElementById('videoPreviewModal');
  const player = document.getElementById('videoPreviewPlayer');
  const ytFrame = document.getElementById('videoPreviewYouTube');
  if (typeof stopPreviewOverlays === 'function') {
    stopPreviewOverlays();
    stopPreviewOverlays = null;
  }
  const overlayLayer = document.getElementById('videoPreviewOverlayLayer');
  if (overlayLayer) {
    overlayLayer.innerHTML = '';
    overlayLayer.classList.remove('hidden');
  }
  if (ytFrame) {
    ytFrame.classList.add('hidden');
    ytFrame.removeAttribute('src');
  }
  player.classList.remove('hidden');
  player.pause();
  player.removeAttribute('src');
  player.muted = false;
  player.load();
  previewSnippetBounds = null;
  modal.classList.add('hidden');
}

async function openAssignModal(videoId) {
  const video = videoLibraryCache.find(v => v._id === videoId);
  assignVideoId = videoId;
  document.getElementById('assignVideoTitle').textContent = video ? video.title : 'Video';
  document.getElementById('assignVideoNote').value = '';
  document.getElementById('assignVideoModal').classList.remove('hidden');

  const list = document.getElementById('assignPlayerList');
  list.innerHTML = '<p class="text-slate-400 text-sm italic">Loading roster...</p>';

  try {
    const { players } = await apiFetch('/team/members');
    if (!players.length) {
      list.innerHTML = currentUser && currentUser.role === 'COACH'
        ? '<p class="text-slate-400 text-sm italic">No players are assigned to you yet. Ask the head coach to assign players in Team Management.</p>'
        : '<p class="text-slate-400 text-sm italic">No players on roster. Add players in Team Management.</p>';
      return;
    }

    list.innerHTML = players.map(p => `
      <label class="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded px-3 py-2 cursor-pointer hover:border-blue-600 transition">
        <input type="checkbox" name="assignPlayer" value="${p._id}" class="w-4 h-4 accent-emerald-600">
        <span class="text-sm">${escapeDashboardHtml(p.name)}${p.jerseyNumber != null ? ` <span class="text-slate-500">#${p.jerseyNumber}</span>` : ''}</span>
      </label>
    `).join('');
  } catch (err) {
    list.innerHTML = `<p class="text-red-400 text-sm">${escapeDashboardHtml(err.message)}</p>`;
  }
}

function closeAssignModal() {
  assignVideoId = null;
  document.getElementById('assignVideoModal').classList.add('hidden');
}

async function submitVideoAssignment() {
  if (!assignVideoId) return;

  const selected = [...document.querySelectorAll('input[name="assignPlayer"]:checked')].map(el => el.value);
  if (!selected.length) {
    alert('Select at least one player.');
    return;
  }

  const note = document.getElementById('assignVideoNote').value.trim();
  const btn = document.getElementById('assignVideoSubmitBtn');
  btn.disabled = true;
  btn.textContent = 'Assigning...';

  let successCount = 0;
  let lastError = null;
  const manualLinks = [];

  for (const playerId of selected) {
    try {
      const data = await apiFetch('/assignments/player-video', {
        method: 'POST',
        body: JSON.stringify({ playerId, videoId: assignVideoId, note })
      });
      successCount += 1;
      if (data.emailSent === false && data.playerLink) {
        manualLinks.push(data.playerLink);
      }
    } catch (err) {
      lastError = err.message;
    }
  }

  btn.disabled = false;
  btn.textContent = 'Assign & Send Email';

  const linkNote = manualLinks.length
    ? `\n\nEmail could not be sent. Share these player links:\n${manualLinks.join('\n')}`
    : '';

  if (successCount === selected.length) {
    alert(manualLinks.length
      ? `Assigned to ${successCount} player(s), but email could not be sent.${linkNote}`
      : `Assigned to ${successCount} player(s). Email link(s) sent.`);
    closeAssignModal();
    if (currentTab === 'tab-assignments') loadAssignmentsData();
  } else if (successCount > 0) {
    alert(`Assigned to ${successCount} of ${selected.length} player(s).${lastError ? ` Last error: ${lastError}` : ''}${linkNote}`);
    closeAssignModal();
    if (currentTab === 'tab-assignments') loadAssignmentsData();
  } else {
    alert(`Assignment failed: ${lastError || 'Unknown error'}`);
  }
}

async function handleVideoUpload(e) {
  e.preventDefault();

  const titleInput = document.getElementById('uploadVideoTitle');
  const tagsInput = document.getElementById('uploadVideoTags');
  const fileInput = document.getElementById('uploadVideoFile');
  const statusEl = document.getElementById('uploadVideoStatus');
  const submitBtn = document.getElementById('uploadVideoBtn');

  const file = fileInput.files[0];
  if (!file) return;

  try {
    const quota = await apiFetch('/team/quota');
    if (quota && Number(quota.remainingBytes) >= 0 && file.size > quota.remainingBytes) {
      statusEl.classList.remove('hidden');
      statusEl.className = 'text-xs text-red-400';
      statusEl.textContent = `This file is larger than the remaining ${quota.remainingLabel || 'storage'} on this team’s ${quota.limitLabel || '1 GB'} plan.`;
      return;
    }
    if (quota && quota.canUpload === false) {
      statusEl.classList.remove('hidden');
      statusEl.className = 'text-xs text-red-400';
      statusEl.textContent = `This team is at its ${quota.limitLabel || '1 GB'} storage limit.`;
      return;
    }
  } catch {
    // Server still enforces the cap if quota cannot be pre-checked.
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Uploading...';
  statusEl.classList.remove('hidden');
  statusEl.className = 'text-xs text-slate-400';
  statusEl.textContent = 'Uploading video to library...';

  try {
    await apiUploadVideoFile({
      file,
      title: titleInput.value.trim(),
      tags: tagsInput.value.trim()
    });
    titleInput.value = '';
    tagsInput.value = '';
    fileInput.value = '';
    statusEl.className = 'text-xs text-emerald-400';
    statusEl.textContent = 'Video uploaded successfully.';
    loadVideoLibrary({ refreshTags: true });
  } catch (err) {
    statusEl.className = 'text-xs text-red-400';
    statusEl.textContent = err.message;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Upload to Library';
  }
}

async function handleInsertYouTube(e) {
  e.preventDefault();
  if (!currentUser || currentUser.role !== 'HEAD_COACH') return;

  const titleInput = document.getElementById('insertYtTitle');
  const urlInput = document.getElementById('insertYtUrl');
  const tagsInput = document.getElementById('insertYtTags');
  const startInput = document.getElementById('insertYtStart');
  const stopInput = document.getElementById('insertYtStop');
  const statusEl = document.getElementById('insertYtStatus');
  const submitBtn = document.getElementById('insertYtBtn');

  submitBtn.disabled = true;
  submitBtn.textContent = 'Inserting...';
  statusEl.classList.remove('hidden');
  statusEl.className = 'text-xs text-slate-400';
  statusEl.textContent = 'Saving YouTube clip to library...';

  try {
    await apiFetch('/videos/insert-youtube', {
      method: 'POST',
      body: JSON.stringify({
        title: titleInput.value.trim(),
        url: urlInput.value.trim(),
        tags: tagsInput.value.trim(),
        clipStartSeconds: startInput.value.trim(),
        clipEndSeconds: stopInput.value.trim()
      })
    });
    titleInput.value = '';
    urlInput.value = '';
    tagsInput.value = '';
    startInput.value = '';
    stopInput.value = '';
    statusEl.className = 'text-xs text-emerald-400';
    statusEl.textContent = 'YouTube video inserted successfully.';
    loadVideoLibrary({ refreshTags: true });
  } catch (err) {
    statusEl.className = 'text-xs text-red-400';
    statusEl.textContent = err.message;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Insert Video';
  }
}

async function downloadLibraryVideo(videoId, filename) {
  try {
    const response = await fetch(getVideoDownloadUrl(videoId), {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`
      }
    });

    if (!response.ok) {
      throw new Error('Download failed');
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'video.mp4';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert(`Download failed: ${err.message}`);
  }
}

async function deleteLibraryVideo(videoId) {
  const video = videoLibraryCache.find((item) => item._id === videoId);
  if (!video) return;

  const snippetCount = videoLibraryCache.filter((item) => (
    !item.isSnippet ? false : String(item.parentVideoId) === String(videoId)
  )).length;

  let warning;
  if (video.isSnippet) {
    warning = `Delete snippet "${video.title}"?\n\nThe original video will stay in the library.`;
  } else if (hasStoredVideoFile(video)) {
    warning = [
      `Delete "${video.title}"?`,
      '',
      'This permanently removes the original from Cloudflare R2 and deletes every snippet made from this video.',
      snippetCount ? `Visible snippets that will also be deleted: ${snippetCount}.` : '',
      '',
      'This cannot be undone.'
    ].filter(Boolean).join('\n');
  } else {
    warning = [
      `Delete "${video.title}"?`,
      '',
      'This removes it from the library and deletes every snippet made from this video.',
      snippetCount ? `Visible snippets that will also be deleted: ${snippetCount}.` : '',
      '',
      'This cannot be undone.'
    ].filter(Boolean).join('\n');
  }

  if (!window.confirm(warning)) return;

  try {
    const result = await apiFetch(`/videos/${videoId}`, { method: 'DELETE' });
    if (typeof showToast === 'function') {
      const extra = !result.isSnippet && result.deletedSnippets
        ? ` ${result.deletedSnippets} snippet${result.deletedSnippets === 1 ? '' : 's'} removed.`
        : '';
      showToast(`${result.message || 'Deleted.'}${extra}`);
    }
    await loadVideoLibrary({ refreshTags: true });
  } catch (err) {
    if (typeof showToast === 'function') {
      showToast(err.message || 'Could not delete video.', 'error');
      return;
    }
    alert(err.message || 'Could not delete video.');
  }
}

function filterVideos() {
  loadVideoLibrary();
}

async function loadAssignmentsData() {
  try {
    const assignNoteSection = document.getElementById('assignCoachNoteSection');
    if (assignNoteSection) {
      assignNoteSection.classList.toggle('hidden', currentUser.role !== 'HEAD_COACH');
    }
    if (currentUser.role === 'HEAD_COACH') {
      await populateAssistantSelect();
    }

    const [playerStatus, myAssignments] = await Promise.all([
      apiFetch('/assignments/player-status').catch(() => []),
      apiFetch('/assignments/my-assignments').catch(() => [])
    ]);
    await loadCoachNotes();
    renderMyAssignments(Array.isArray(myAssignments) ? myAssignments : []);

    const playerList = document.getElementById('playerAssignmentStatusList');
    if (!playerList) return;
    playerList.innerHTML = playerStatus.length
      ? playerStatus.map(p => `
      <div class="flex items-center justify-between bg-slate-800 p-3 rounded-lg border border-slate-700 gap-4">
        <div class="min-w-0">
          <p class="text-sm font-medium">${p.assignedTo ? escapeDashboardHtml(p.assignedTo.name) : 'Player'} — ${p.videoId ? escapeDashboardHtml(p.videoId.title) : 'Video'}</p>
          <p class="text-xs text-slate-400">Assigned by: ${p.assignedBy ? escapeDashboardHtml(p.assignedBy.name) : 'Coach'}${p.assignedBy && p.assignedBy.role === 'HEAD_COACH' ? ' (Head Coach)' : ''}</p>
          <p class="text-xs text-slate-400">Note: ${escapeDashboardHtml(p.note || 'None')}</p>
          ${(p.videoId && p.videoId.tags && p.videoId.tags.length)
            ? `<div class="flex flex-wrap gap-1 mt-1.5">${p.videoId.tags.map(t => `<span class="bg-slate-900 text-slate-400 text-xs px-2 py-0.5 rounded">${escapeDashboardHtml(t)}</span>`).join('')}</div>`
            : '<p class="text-xs text-slate-500 mt-1">No tags</p>'}
          ${p.linkClickedAt ? `<p class="text-xs text-slate-500 mt-0.5">Opened: ${new Date(p.linkClickedAt).toLocaleString()}</p>` : ''}
          ${!p.hasClickedLink && p.playerLink ? `<p class="text-xs text-slate-500 mt-1 break-all">${escapeDashboardHtml(p.playerLink)}</p>` : ''}
        </div>
        <div class="text-right flex-shrink-0 space-y-1">
          <span class="text-xs font-bold px-2.5 py-1 rounded block ${p.hasClickedLink ? 'bg-emerald-900/60 text-emerald-300' : 'bg-amber-900/60 text-amber-300'}">
            ${p.hasClickedLink ? '✓ Link Opened' : '⏳ Pending Click'}
          </span>
          <span class="text-xs text-slate-400 block">
            Watched: ${formatWatchDuration(p.watchDurationSeconds)}
          </span>
          ${!p.hasClickedLink && p.playerLink ? `<button type="button" onclick="copyPlayerLink(this.dataset.link)" data-link="${escapeDashboardHtml(p.playerLink)}" class="text-xs text-blue-400 hover:text-blue-300">Copy player link</button>` : ''}
        </div>
      </div>
    `).join('')
      : '<p class="text-slate-500 text-sm italic">No player video assignments yet.</p>';
  } catch (err) {
    console.error('Failed to load assignments', err);
  }
}

async function populateAssistantSelect() {
  const select = document.getElementById('assignAssistantSelect');
  if (!select) return;
  try {
    const { coaches } = await apiFetch('/team/members');
    const assistants = (coaches || []).filter(c => c.role === 'COACH');
    const previous = select.value;
    select.innerHTML = '<option value="">Select assistant...</option>' +
      assistants.map(c => `<option value="${c._id}">${escapeDashboardHtml(c.name)}</option>`).join('');
    if (previous && assistants.some(c => String(c._id) === previous)) {
      select.value = previous;
    }
  } catch (err) {
    select.innerHTML = '<option value="">Could not load assistants</option>';
  }
}

function renderMyAssignments(assignments) {
  const list = document.getElementById('myAssignmentsList');
  if (!list) return;
  if (!assignments.length) {
    list.innerHTML = '<p class="text-slate-500 text-sm italic">Nothing assigned to you yet.</p>';
    return;
  }
  list.innerHTML = assignments.map(a => {
    const videoTitle = a.videoId?.title ? `Video: ${escapeDashboardHtml(a.videoId.title)}` : 'Coach note';
    const assigner = a.assignedBy?.name ? `From ${escapeDashboardHtml(a.assignedBy.name)}` : '';
    return `
      <label class="bg-slate-800 border border-slate-700 rounded-lg p-3 flex items-start gap-3 cursor-pointer">
        <input type="checkbox" class="mt-1 w-4 h-4 accent-blue-600" ${a.completed ? 'checked' : ''}
          onchange="toggleAssignment('${a._id}', this.checked)">
        <div class="min-w-0">
          <p class="text-sm font-medium ${a.completed ? 'line-through text-slate-400' : ''}">${videoTitle}</p>
          ${a.note ? `<p class="text-slate-300 text-sm mt-1 whitespace-pre-wrap">${escapeDashboardHtml(a.note)}</p>` : ''}
          <p class="text-slate-500 text-xs mt-1">${assigner}${a.completed ? ' · Done' : ''}</p>
        </div>
      </label>
    `;
  }).join('');
}

async function submitCoachNoteAssignment(e) {
  e.preventDefault();
  const coachId = document.getElementById('assignAssistantSelect')?.value;
  const note = document.getElementById('assignAssistantNote')?.value.trim();
  if (!coachId || !note) {
    alert('Choose an assistant and enter a note.');
    return;
  }
  try {
    await apiFetch('/assignments/coach-note', {
      method: 'POST',
      body: JSON.stringify({ coachId, note })
    });
    document.getElementById('assignAssistantNote').value = '';
    await loadAssignmentsData();
    alert('Note assigned to assistant.');
  } catch (err) {
    alert(err.message || 'Failed to assign note');
  }
}

function copyPlayerLink(link) {
  if (!link) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(link)
      .then(() => alert('Player link copied.'))
      .catch(() => window.prompt('Copy this player link:', link));
  } else {
    window.prompt('Copy this player link:', link);
  }
}

async function loadCoachNotes() {
  const list = document.getElementById('coachNotesList');
  if (!list) return;

  try {
    const notes = await apiFetch('/notes');
    const isHead = currentUser && currentUser.role === 'HEAD_COACH';
    list.innerHTML = notes.length
      ? notes.map(n => `
        <div class="bg-slate-800 border border-slate-700 rounded-lg p-3">
          <p class="text-sm text-slate-200 whitespace-pre-wrap ${n.completed ? 'line-through text-slate-400' : ''}">${escapeDashboardHtml(n.body)}</p>
          <div class="flex justify-between items-center mt-2 gap-3">
            <p class="text-xs text-slate-500">
              ${isHead && n.authorId ? `Written by ${escapeDashboardHtml(n.authorId.name)}${n.authorId.role === 'HEAD_COACH' ? ' (Head Coach)' : ''} · ` : ''}
              ${n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}
            </p>
            <div class="flex items-center gap-3 flex-shrink-0">
              <label class="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                <input type="checkbox" ${n.completed ? 'checked' : ''} onchange="toggleCoachNoteComplete('${n._id}', this.checked)" class="w-4 h-4 accent-blue-600">
                Completed
              </label>
              <button type="button" onclick="deleteCoachNote('${n._id}')" class="text-xs text-slate-500 hover:text-red-400">Delete</button>
            </div>
          </div>
        </div>
      `).join('')
      : '<p class="text-slate-500 text-sm italic">No notes yet.</p>';
  } catch (err) {
    list.innerHTML = `<p class="text-red-400 text-sm">${escapeDashboardHtml(err.message)}</p>`;
  }
}

async function saveCoachNote(e) {
  e.preventDefault();
  const input = document.getElementById('coachNoteInput');
  const body = input.value.trim();
  if (!body) {
    alert('Write a note before saving.');
    return;
  }
  try {
    await apiFetch('/notes', {
      method: 'POST',
      body: JSON.stringify({ body })
    });
    input.value = '';
    await loadCoachNotes();
  } catch (err) {
    alert(err.message);
  }
}

async function toggleCoachNoteComplete(id, completed) {
  try {
    await apiFetch(`/notes/${id}/complete`, {
      method: 'PATCH',
      body: JSON.stringify({ completed })
    });
    await loadCoachNotes();
  } catch (err) {
    alert(err.message);
    await loadCoachNotes();
  }
}

async function deleteCoachNote(id) {
  try {
    await apiFetch(`/notes/${id}`, { method: 'DELETE' });
    await loadCoachNotes();
  } catch (err) {
    alert(err.message);
  }
}

async function toggleAssignment(id, completed) {
  try {
    await apiFetch(`/assignments/${id}/complete`, {
      method: 'PATCH',
      body: JSON.stringify({ completed })
    });
    loadAssignmentsData();
  } catch (err) {
    alert(err.message || 'Failed to update assignment');
    loadAssignmentsData();
  }
}

function mailtoLinkHtml(email) {
  if (!email) return '—';
  const safe = escapeDashboardHtml(email);
  return `<a href="mailto:${safe}" class="text-blue-400 hover:text-blue-300 underline break-all">${safe}</a>`;
}

function resolvePlaybookShareUrl(data) {
  const raw = (data && (data.shareUrl || (data.shareToken
    ? `${window.location.origin}/playbook.html?token=${data.shareToken}`
    : ''))) || '';
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${window.location.origin}${raw.startsWith('/') ? '' : '/'}${raw}`;
}

async function emailPlaybookToTeam() {
  const btn = document.getElementById('emailPlaybookToTeamBtn');
  if (btn) btn.disabled = true;

  try {
    let shareData;
    try {
      shareData = await apiFetch('/playbook/team-share');
    } catch (err) {
      const msg = err.message || '';
      if (/no playbook/i.test(msg) || /not found/i.test(msg)) {
        alert('No playbook yet. Create one from the Playbook page first, then try again.');
        return;
      }
      throw err;
    }

    const shareUrl = resolvePlaybookShareUrl(shareData);
    if (!shareUrl) {
      alert('Could not find a shareable playbook link. Open the Playbook page to confirm it exists.');
      return;
    }

    const selfEmail = (currentUser && currentUser.email || '').toLowerCase();
    let emails = teamRosterEmails.filter(Boolean);
    if (!emails.length) {
      const { coaches, players } = await apiFetch('/team/members');
      emails = [...players, ...coaches].map(m => m.email).filter(Boolean);
      teamRosterEmails = emails;
    }

    const recipients = [...new Set(
      emails
        .map(e => String(e).trim())
        .filter(e => e && e.toLowerCase() !== selfEmail)
    )];

    if (!recipients.length) {
      alert('No team member emails found to send to. Add players or coaches first.');
      return;
    }

    const teamLabel = (shareData && shareData.teamName)
      || (currentUser && currentUser.teamName)
      || 'Team';
    const subject = `${teamLabel} Playbook`;
    const body = [
      `Hi team,`,
      ``,
      `Here is our team playbook link:`,
      shareUrl,
      ``,
      `You will need the playbook password from your coach to open it.`,
      ``,
      `Thanks,`,
      currentUser && currentUser.name ? currentUser.name : 'Coach'
    ].join('\n');

    const mailto = `mailto:?bcc=${recipients.map(encodeURIComponent).join(',')}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    if (mailto.length > 1800) {
      alert('Too many recipients for one email link. Opening your email client with the playbook link only — please add team addresses manually (or in smaller batches).');
      window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      return;
    }

    window.location.href = mailto;
  } catch (err) {
    alert(err.message || 'Failed to prepare playbook email.');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function loadTeamRoster() {
  const tbody = document.getElementById('rosterTableBody');
  if (!tbody) return;

  loadTeamStorage();

  const { coaches, players } = await apiFetch('/team/members');
  const assistants = coaches.filter(c => c.role === 'COACH');
  const members = [...players, ...coaches];
  const isHead = currentUser && currentUser.role === 'HEAD_COACH';
  teamRosterEmails = members.map(m => m.email).filter(Boolean);

  tbody.innerHTML = members.length === 0
    ? '<tr><td colspan="5" class="py-4 px-3 text-center text-slate-500 italic">No team members yet</td></tr>'
    : members.map(m => {
      const assignedId = m.assignedCoachId && (m.assignedCoachId._id || m.assignedCoachId);
      const assignedName = m.assignedCoachId && m.assignedCoachId.name ? m.assignedCoachId.name : '';
      let coachCell = '—';
      if (m.role === 'PLAYER') {
        if (isHead) {
          coachCell = `
            <select onchange="assignPlayerToAssistant('${m._id}', this.value)" class="bg-slate-900 border border-slate-600 rounded px-2 py-1.5 min-h-[44px] text-xs max-w-[180px] focus:outline-none focus:border-blue-500">
              <option value="">Unassigned</option>
              ${assistants.map(c => `<option value="${c._id}" ${String(assignedId) === String(c._id) ? 'selected' : ''}>${escapeDashboardHtml(c.name)}</option>`).join('')}
            </select>
          `;
        } else {
          coachCell = assignedName || 'Unassigned';
        }
      }
      return `
      <tr>
        <td class="py-2 px-3" data-label="#">${m.jerseyNumber ?? '—'}</td>
        <td class="py-2 px-3" data-label="Name">${escapeDashboardHtml(m.name)}</td>
        <td class="py-2 px-3 min-w-0 break-all" data-label="Email">${mailtoLinkHtml(m.email)}</td>
        <td class="py-2 px-3" data-label="Role">${m.role.replace('_', ' ')}</td>
        <td class="py-2 px-3" data-label="Assigned assistant">${coachCell}</td>
      </tr>
    `;
    }).join('');
}

async function applyUploadQuotaNote() {
  const noteEl = document.getElementById('uploadQuotaNote');
  const submitBtn = document.getElementById('uploadVideoBtn');
  const fileInput = document.getElementById('uploadVideoFile');
  if (!noteEl) return;

  try {
    const quota = await apiFetch('/team/quota');
    const atMax = quota.canUpload === false;
    noteEl.classList.remove('hidden');
    noteEl.className = atMax ? 'text-xs text-amber-400' : 'text-xs text-slate-500';
    noteEl.textContent = atMax
      ? `Team storage is at the ${quota.limitLabel || '1 GB'} limit. New uploads are paused until space is freed or a paid plan is active.`
      : `Team storage: ${quota.usedLabel || '0 B'} of ${quota.limitLabel || '1 GB'}.`;
    if (submitBtn) submitBtn.disabled = atMax;
    if (fileInput) fileInput.disabled = atMax;
  } catch {
    noteEl.classList.add('hidden');
  }
}

function updateStoragePlansToggleLabel() {
  const toggle = document.getElementById('storagePlansToggle');
  const panel = document.getElementById('storagePlansPanel');
  if (!toggle || !panel) return;
  const subscribed = toggle.dataset.subscribed === '1';
  const open = !panel.classList.contains('hidden');
  if (subscribed) {
    toggle.textContent = open ? 'Hide subscription settings' : 'Update subscription';
  } else {
    toggle.textContent = open ? 'Hide plans' : 'Need more storage?';
  }
}

function toggleStoragePlans() {
  const panel = document.getElementById('storagePlansPanel');
  if (!panel) return;
  panel.classList.toggle('hidden');
  updateStoragePlansToggleLabel();
}

function subscriptionOfferKey(plan, interval) {
  const id = plan === 'pro' ? 'premium' : plan;
  return `${id || ''}:${interval === 'yearly' ? 'yearly' : 'monthly'}`;
}

async function requestStoragePlan(planId, interval = 'monthly') {
  const statusEl = document.getElementById('storagePlanStatus');
  const toggle = document.getElementById('storagePlansToggle');
  const isUpdate = toggle && toggle.dataset.subscribed === '1';
  if (statusEl) {
    statusEl.classList.remove('hidden');
    statusEl.className = 'text-xs text-slate-400';
    statusEl.textContent = isUpdate ? 'Saving subscription update…' : 'Activating plan…';
  }
  try {
    const result = await apiFetch('/team/subscription', {
      method: 'POST',
      body: JSON.stringify({ plan: planId, interval })
    });
    if (result.checkout?.url) {
      if (statusEl) {
        statusEl.className = 'text-xs text-slate-300';
        statusEl.textContent = result.message || 'Opening PayPal…';
      }
      window.location.href = result.checkout.url;
      return;
    }
    if (statusEl) {
      statusEl.className = 'text-xs text-slate-300';
      statusEl.textContent = result.message || (isUpdate ? 'Subscription update saved.' : 'Plan request saved.');
    }
    loadTeamStorage();
  } catch (err) {
    if (statusEl) {
      statusEl.className = 'text-xs text-red-400';
      statusEl.textContent = err.message;
    }
  }
}

async function openSkillsLibraryNav() {
  closeMobileNav();
  try {
    const data = await apiFetch('/skills-library');
    sessionStorage.setItem('skillsLibraryGate', JSON.stringify(data));
    if (data && data.unlocked) {
      switchTab('tab-skills-library');
      return;
    }
  } catch {
    sessionStorage.removeItem('skillsLibraryGate');
  }
  window.location.href = '/skills-library.html';
}

async function gateSkillsLibraryTab() {
  try {
    const data = await apiFetch('/skills-library');
    if (data && data.unlocked) {
      loadSkillsLibrary();
      return;
    }
  } catch {
    // Unsubscribed (or quota error) goes to the landing page.
  }
  window.location.replace('/skills-library.html');
}

function categoryTitleFromLibrary(data, categoryId) {
  return (data.playbookCategories || []).find((category) => category.id === categoryId)?.title || categoryId;
}

function topicTitleFromLibrary(data, topicId) {
  return (data.topics || data.lessons || []).find((topic) => topic.id === topicId)?.title
    || topicId;
}

function skillVideoLevel(video) {
  const level = Number(video?.level);
  return Number.isInteger(level) && level >= 1 && level <= 10 ? level : 1;
}

function skillVideoCategory(data, video) {
  return video.topicTitle || topicTitleFromLibrary(data, video.topic);
}

function skillVideoLevelTitle(video) {
  return video.levelTitle || `Level ${skillVideoLevel(video)}`;
}

function skillVideoMeta(data, video) {
  return `${skillVideoCategory(data, video)} · ${skillVideoLevelTitle(video)}`;
}

function sortSkillVideosByLevel(videos) {
  return [...videos].sort((a, b) => {
    const levelDiff = skillVideoLevel(a) - skillVideoLevel(b);
    if (levelDiff !== 0) return levelDiff;
    return (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0);
  });
}

function openSkillsVideo(buttonOrUrl, maybeTitle) {
  const url = typeof buttonOrUrl === 'string' ? buttonOrUrl : buttonOrUrl?.getAttribute('data-skills-url');
  const title = typeof buttonOrUrl === 'string' ? maybeTitle : buttonOrUrl?.getAttribute('data-skills-title');
  const meta = typeof buttonOrUrl === 'string' ? '' : buttonOrUrl?.getAttribute('data-skills-meta');
  if (!url) return;
  const modal = document.getElementById('videoPreviewModal');
  const player = document.getElementById('videoPreviewPlayer');
  const ytFrame = document.getElementById('videoPreviewYouTube');
  const overlayLayer = document.getElementById('videoPreviewOverlayLayer');
  const titleEl = document.getElementById('videoPreviewTitle');
  if (!modal || !ytFrame) return;

  if (titleEl) titleEl.textContent = [title || 'Skills video', meta].filter(Boolean).join(' · ');
  if (typeof stopPreviewOverlays === 'function') {
    stopPreviewOverlays();
    stopPreviewOverlays = null;
  }
  if (overlayLayer) {
    overlayLayer.innerHTML = '';
    overlayLayer.classList.add('hidden');
  }
  if (player) {
    player.pause();
    player.removeAttribute('src');
    player.load();
    player.classList.add('hidden');
  }

  const embed = typeof toYouTubeEmbedUrl === 'function' ? toYouTubeEmbedUrl(url) : null;
  if (!embed) {
    window.open(url, '_blank', 'noopener');
    return;
  }
  ytFrame.src = embed;
  ytFrame.classList.remove('hidden');
  modal.classList.remove('hidden');
}

async function loadSkillsLibrary() {
  const intro = document.getElementById('skillsLibraryIntro');
  const list = document.getElementById('skillsLibraryList');
  if (!list) return;

  try {
    const data = await apiFetch('/skills-library');
    if (intro) intro.textContent = data.message || '';
    if (!data.unlocked) {
      list.innerHTML = '<p class="text-sm text-slate-500">No lessons yet on the included 1 GB plan.</p>';
      return;
    }

    const videos = data.videos || [];
    const playbooks = data.playbooks || [];
    const topics = data.topics || data.lessons || [];
    const videoGroups = topics.map((topic) => ({
      topic,
      videos: sortSkillVideosByLevel(videos.filter((video) => video.topic === topic.id))
    })).filter((group) => group.videos.length);

    const videoHtml = videoGroups.length
      ? videoGroups.map((group) => `
          <section class="space-y-2">
            <h4 class="text-sm font-semibold text-slate-300">${escapeDashboardHtml(group.topic.title)}</h4>
            <div class="space-y-2">
              ${group.videos.map((video) => `
                <article class="bg-slate-800 border border-slate-700 rounded-lg p-3 flex flex-wrap justify-between gap-2">
                  <div class="min-w-0">
                    <div class="flex flex-wrap gap-1.5 mb-1">
                      <span class="text-xs font-semibold bg-slate-900 border border-slate-600 text-slate-200 rounded-full px-2 py-0.5">${escapeDashboardHtml(skillVideoCategory(data, video))}</span>
                      <span class="text-xs font-semibold bg-blue-950 border border-blue-700 text-blue-200 rounded-full px-2 py-0.5">${escapeDashboardHtml(skillVideoLevelTitle(video))}</span>
                    </div>
                    <p class="font-semibold">${escapeDashboardHtml(video.title)}</p>
                    ${video.description ? `<p class="text-sm text-slate-400">${escapeDashboardHtml(video.description)}</p>` : ''}
                  </div>
                  <button type="button" data-skills-url="${escapeDashboardHtml(video.url)}" data-skills-title="${escapeDashboardHtml(video.title)}" data-skills-meta="${escapeDashboardHtml(skillVideoMeta(data, video))}" onclick="openSkillsVideo(this)" class="text-xs bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded font-semibold">Watch</button>
                </article>
              `).join('')}
            </div>
          </section>
        `).join('')
      : `<p class="text-sm text-slate-500">Videos will appear here as they are added.</p>
         <div class="flex flex-wrap gap-2">${topics.map((topic) => `
           <span class="bg-slate-800 border border-slate-700 rounded-full px-3 py-1.5 text-sm text-slate-200">${escapeDashboardHtml(topic.title || topic.skill)}</span>
         `).join('')}</div>`;

    const playbookHtml = playbooks.length
      ? playbooks.map((playbook) => `
          <a href="/subscription-playbook.html?id=${encodeURIComponent(playbook.id)}" class="block bg-slate-800 border border-slate-700 rounded-lg p-4 space-y-2 hover:border-blue-500">
            <p class="text-xs uppercase tracking-wide text-slate-400">${escapeDashboardHtml(categoryTitleFromLibrary(data, playbook.category))}</p>
            <h4 class="font-semibold">${escapeDashboardHtml(playbook.title)}</h4>
            ${playbook.summary ? `<p class="text-sm text-slate-300">${escapeDashboardHtml(playbook.summary)}</p>` : ''}
            <p class="text-sm text-blue-400 font-semibold">Open playbook</p>
          </a>
        `).join('')
      : '<p class="text-sm text-slate-500">Preset playbooks will appear here.</p>';

    list.innerHTML = `
      <section class="space-y-3">
        <h3 class="text-lg font-semibold">Videos</h3>
        ${videoHtml}
      </section>
      <section class="space-y-3">
        <h3 class="text-lg font-semibold">Preset playbooks</h3>
        ${playbookHtml}
      </section>
    `;
  } catch (err) {
    if (intro) intro.textContent = err.message || 'Could not load the skills library.';
    list.innerHTML = '';
  }
}

async function loadTeamStorage() {
  const totalEl = document.getElementById('teamStorageTotal');
  const teamEl = document.getElementById('teamStorageTeam');
  const planEl = document.getElementById('teamStoragePlan');
  const barEl = document.getElementById('teamStorageBar');
  if (!totalEl) return;

  try {
    const data = await apiFetch('/team/storage');
    totalEl.textContent = `${data.usedLabel || data.totalLabel || '0 B'} of ${data.limitLabel || '1 GB'}`;
    const teamName = data.teamName ? escapeDashboardHtml(data.teamName) : 'your team';
    if (teamEl) {
      teamEl.innerHTML = `Used by <span class="text-white font-medium">${teamName}</span>`;
    }
    if (barEl) {
      const pct = Math.max(0, Math.min(100, Number(data.usedPercent) || 0));
      barEl.style.width = `${pct}%`;
      barEl.className = `h-full transition-all ${pct >= 100 ? 'bg-red-500' : pct >= 90 ? 'bg-amber-500' : 'bg-blue-500'}`;
    }
    const subscribed = data.subscriptionStatus === 'active' && data.plan !== 'free';
    currentUser.subscriptionStatus = subscribed ? 'active' : (data.subscriptionStatus || 'inactive');
    currentUser.plan = subscribed ? data.plan : 'free';
    currentUser.planLabel = subscribed ? data.planLabel : null;
    try { localStorage.setItem('user', JSON.stringify(currentUser)); } catch { /* ignore quota */ }
    renderAppUserInfo(data);
    if (planEl) {
      if (subscribed) {
        const billing = data.priceLabel || (data.interval === 'yearly' ? data.yearlyLabel : data.monthlyLabel);
        planEl.textContent = `${data.planLabel}${billing ? ` · ${billing}` : ''} · ${data.limitLabel}${data.skillsLibrary ? ' · skills library included' : ''}`;
      } else {
        planEl.textContent = `Included ${data.limitLabel} per team.`;
      }
    }
    const toggle = document.getElementById('storagePlansToggle');
    const panel = document.getElementById('storagePlansPanel');
    const heading = document.getElementById('storagePlansHeading');
    const copy = document.getElementById('storagePlansCopy');
    if (toggle) {
      toggle.dataset.subscribed = subscribed ? '1' : '0';
    }
    if (heading) heading.textContent = subscribed ? 'Subscription settings' : 'Storage plans';
    if (copy) {
      copy.textContent = subscribed
        ? 'Switch Plus or Premium, monthly or yearly. The current plan stays active until PayPal confirms the change.'
        : 'Paid plans raise the cap and include skill videos plus preset playbooks. Payment will go through PayPal.';
    }
    if (panel && subscribed) panel.classList.remove('hidden');
    updateStoragePlansToggleLabel();
    const currentKey = subscribed ? subscriptionOfferKey(data.plan, data.interval) : '';
    const requestedKey = data.requestedPlan
      ? subscriptionOfferKey(data.requestedPlan, data.requestedInterval)
      : '';
    const planButtonLabels = {
      'plus:monthly': subscribed ? 'Switch to Plus monthly' : 'Plus monthly',
      'plus:yearly': subscribed ? 'Switch to Plus yearly' : 'Plus yearly',
      'premium:monthly': subscribed ? 'Switch to Premium monthly' : 'Premium monthly',
      'premium:yearly': subscribed ? 'Switch to Premium yearly' : 'Premium yearly'
    };
    document.querySelectorAll('[data-plan-action]').forEach((button) => {
      const key = button.getAttribute('data-plan-action');
      const isCurrent = key === currentKey;
      const isPending = Boolean(requestedKey && key === requestedKey && requestedKey !== currentKey);
      button.textContent = isCurrent ? 'Current plan' : isPending ? 'Update requested' : (planButtonLabels[key] || key);
      button.disabled = isCurrent;
      button.classList.toggle('bg-blue-600', isCurrent);
      button.classList.toggle('hover:bg-blue-500', isCurrent);
      button.classList.toggle('bg-amber-700', isPending);
      button.classList.toggle('hover:bg-amber-600', isPending);
      button.classList.toggle('bg-slate-700', !isCurrent && !isPending);
      button.classList.toggle('hover:bg-slate-600', !isCurrent && !isPending);
    });
    const statusEl = document.getElementById('storagePlanStatus');
    if (statusEl && requestedKey && requestedKey !== currentKey && !statusEl.textContent) {
      statusEl.classList.remove('hidden');
      statusEl.className = 'text-xs text-slate-300';
      statusEl.textContent = 'A plan change is saved and waiting for PayPal to confirm.';
    }
  } catch (err) {
    totalEl.textContent = '—';
    if (teamEl) teamEl.textContent = 'Could not load storage for this team.';
    if (planEl) planEl.textContent = err.message || 'Storage usage unavailable.';
  }
}

async function assignPlayerToAssistant(playerId, coachId) {
  try {
    await apiFetch(`/team/players/${playerId}/coach`, {
      method: 'PATCH',
      body: JSON.stringify({ coachId: coachId || null })
    });
  } catch (err) {
    alert(err.message);
    loadTeamRoster();
  }
}

async function handleAddPlayer(e) {
  e.preventDefault();
  await apiFetch('/team/players', {
    method: 'POST',
    body: JSON.stringify({
      name: document.getElementById('pName').value,
      jerseyNumber: document.getElementById('pJersey').value,
      email: document.getElementById('pEmail').value
    })
  });
  alert('Player added!');
  e.target.reset();
  loadTeamRoster();
}

async function handleAddCoach(e) {
  e.preventDefault();
  if (!confirm('Are you sure you want to add coach?')) {
    return;
  }

  try {
    const data = await apiFetch('/team/coaches', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('cName').value,
        email: document.getElementById('cEmail').value
      })
    });
    alert(data.message || 'Coach invited. They will receive an email to create their password.');
    e.target.reset();
    loadTeamRoster();
  } catch (err) {
    alert(err.message || 'Failed to add coach.');
  }
}

function logout() {
  localStorage.clear();
  window.location.href = '/login.html';
}
