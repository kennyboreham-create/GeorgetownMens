const GOAL_CATEGORIES = ['Skills', 'Behaviour', 'Strategy'];
const GOAL_ORIGINS = ['Coach', 'Player'];

function goalCategoryOptions(selected) {
  const current = GOAL_CATEGORIES.includes(selected) ? selected : 'Skills';
  return GOAL_CATEGORIES.map((category) => (
    `<option value="${category}" ${category === current ? 'selected' : ''}>${category}</option>`
  )).join('');
}

function goalOriginOptions(selected) {
  const current = GOAL_ORIGINS.includes(selected) ? selected : 'Coach';
  return GOAL_ORIGINS.map((origin) => (
    `<option value="${origin}" ${origin === current ? 'selected' : ''}>${origin}</option>`
  )).join('');
}

function goalCategoryBadge(category) {
  const label = GOAL_CATEGORIES.includes(category) ? category : 'Skills';
  return `<span class="text-xs font-semibold uppercase tracking-wider text-slate-400 bg-slate-900 border border-slate-700 px-2 py-0.5 rounded">${escapeGoalHtml(label)}</span>`;
}

const expandedPlayerInfoIds = new Set();

function playerRecordId(record, key = '_id') {
  if (!record) return '';
  const value = record[key] || record;
  return value && value._id ? String(value._id) : String(value);
}

function togglePlayerInfoCard(playerId) {
  const id = String(playerId);
  const body = document.getElementById(`player-info-body-${id}`);
  const btn = document.getElementById(`player-info-toggle-${id}`);
  if (!body || !btn) return;

  const open = body.classList.contains('hidden');
  body.classList.toggle('hidden', !open);
  btn.setAttribute('aria-expanded', String(open));
  btn.classList.toggle('border-b', open);
  btn.classList.toggle('border-slate-700', open);
  if (open) expandedPlayerInfoIds.add(id);
  else expandedPlayerInfoIds.delete(id);
}

function formatPlayerNoteDate(note) {
  if (!note || !note.createdAt) return '';
  const date = new Date(note.createdAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
}

async function renderPlayerGoalsUI() {
  const container = document.getElementById('playerGoalsContainer');
  if (!container) return;

  try {
    const [goals, teamData, notesResult] = await Promise.all([
      apiFetch('/goals'),
      apiFetch('/team/members'),
      apiFetch('/notes/players').catch(() => [])
    ]);
    const notes = Array.isArray(notesResult) ? notesResult : [];

    if (!teamData.players.length) {
      container.innerHTML = currentUser && currentUser.role === 'COACH'
        ? '<p class="text-slate-400 text-sm italic">No players are assigned to you yet. Ask the head coach to assign players in Team Management.</p>'
        : '<p class="text-slate-400 text-sm italic">No players on roster yet.</p>';
      return;
    }

    container.innerHTML = teamData.players.map(player => {
      const playerId = playerRecordId(player);
      const playerGoals = goals.filter(g => playerRecordId(g.playerId) === playerId);
      const activeGoals = playerGoals.filter(g => !g.completed);
      const completedGoals = playerGoals.filter(g => g.completed);
      const playerNotes = notes.filter(n => playerRecordId(n.playerId) === playerId);
      const canAddGoal = activeGoals.length < 3;
      const isOpen = expandedPlayerInfoIds.has(playerId);

      return `
        <div class="bg-slate-800 border border-slate-700 rounded-xl">
          <button type="button" id="player-info-toggle-${playerId}" onclick="togglePlayerInfoCard('${playerId}')"
            aria-expanded="${isOpen ? 'true' : 'false'}" aria-controls="player-info-body-${playerId}"
            class="w-full text-left px-5 py-3 ${isOpen ? 'border-b border-slate-700' : ''} hover:bg-slate-700/30 rounded-xl">
            <h3 class="font-bold text-lg text-blue-400 min-w-0">#${player.jerseyNumber || ''} ${escapeGoalHtml(player.name)}</h3>
          </button>

          <div id="player-info-body-${playerId}" class="${isOpen ? '' : 'hidden'} px-5 pb-5 pt-4 space-y-4">
            <div class="space-y-2">
              <h4 class="text-xs font-semibold uppercase tracking-wider text-slate-400">Player Goals</h4>
              ${activeGoals.length === 0 ? '<p class="text-slate-500 text-xs italic">No active goals</p>' : ''}
              ${activeGoals.map(goal => `
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-lg border border-slate-700/50">
                  <div class="flex-1 min-w-0">
                    <span class="text-sm font-medium">${escapeGoalHtml(goal.description)}</span>
                    <div class="mt-1.5 flex flex-wrap items-end gap-2">
                      <div>
                        <label class="text-[10px] uppercase tracking-wider text-slate-500 block mb-0.5" for="player-goal-category-${goal._id}">Category</label>
                        <select id="player-goal-category-${goal._id}" onchange="updatePlayerGoalCategory('${goal._id}', this.value)"
                          class="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500">
                          ${goalCategoryOptions(goal.category)}
                        </select>
                      </div>
                      <div>
                        <label class="text-[10px] uppercase tracking-wider text-slate-500 block mb-0.5" for="player-goal-originated-${goal._id}">Originated</label>
                        <select id="player-goal-originated-${goal._id}" onchange="updatePlayerGoalOriginated('${goal._id}', this.value)"
                          class="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500">
                          ${goalOriginOptions(goal.originated)}
                        </select>
                      </div>
                    </div>
                    <p class="text-xs mt-0.5 ${isGoalTargetOverdue(goal) ? 'text-amber-400 font-medium' : 'text-slate-400'}">${formatGoalTargetDate(goal)}</p>
                    ${goal.createdBy && goal.createdBy.name ? `<p class="text-xs text-slate-500 mt-0.5">Set by: ${escapeGoalHtml(goal.createdBy.name)}${goal.createdBy.role === 'HEAD_COACH' ? ' (Head Coach)' : ''}</p>` : ''}
                  </div>
                  <div class="flex items-center space-x-2">
                    <input type="number" min="0" max="100" value="${goal.progress}" 
                      onchange="updateGoalProgress('${goal._id}', this.value)"
                      class="w-16 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-center text-sm font-bold text-emerald-400 focus:outline-none focus:border-blue-500">
                    <span class="text-sm text-slate-400">%</span>
                  </div>
                </div>
              `).join('')}
            </div>

            ${completedGoals.length > 0 ? `
              <div class="space-y-2 pt-2">
                <h4 class="text-xs font-semibold uppercase tracking-wider text-emerald-500">Completed Goals</h4>
                ${completedGoals.map(goal => `
                  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-emerald-950/30 border border-emerald-800/40 p-2.5 rounded-lg text-sm text-slate-300">
                    <div class="min-w-0">
                      <span class="line-through text-slate-400">${escapeGoalHtml(goal.description)}</span>
                      <p class="text-xs text-slate-500 mt-0.5 no-underline">${escapeGoalHtml(GOAL_CATEGORIES.includes(goal.category) ? goal.category : 'Skills')} · ${escapeGoalHtml(GOAL_ORIGINS.includes(goal.originated) ? goal.originated : 'Coach')}</p>
                      <p class="text-xs text-slate-500 mt-0.5 no-underline">${formatGoalTargetDate(goal)}</p>
                      ${goal.createdBy && goal.createdBy.name ? `<p class="text-xs text-slate-500 mt-0.5 no-underline">Set by: ${escapeGoalHtml(goal.createdBy.name)}</p>` : ''}
                    </div>
                    <span class="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded font-bold">100% Complete</span>
                  </div>
                `).join('')}
              </div>
            ` : ''}

            <div class="space-y-2 pt-2">
              <h4 class="text-xs font-semibold uppercase tracking-wider text-slate-400">Player Notes</h4>
              ${playerNotes.length === 0 ? '<p class="text-slate-500 text-xs italic">No notes yet</p>' : ''}
              ${playerNotes.map(note => `
                <div class="bg-slate-900/60 border border-slate-700/50 rounded-lg p-3 space-y-2">
                  <p class="text-sm text-slate-200 whitespace-pre-wrap">${escapeGoalHtml(note.body)}</p>
                  <div class="flex flex-wrap justify-between items-center gap-2">
                    <p class="text-xs text-slate-500">
                      ${note.authorId && note.authorId.name ? `${escapeGoalHtml(note.authorId.name)}${note.authorId.role === 'HEAD_COACH' ? ' (Head Coach)' : ''} · ` : ''}${escapeGoalHtml(formatPlayerNoteDate(note))}
                    </p>
                    <button type="button" onclick="deletePlayerNote('${note._id}')" class="text-xs text-slate-500 hover:text-red-400">Delete</button>
                  </div>
                </div>
              `).join('')}
            </div>

            <div class="space-y-3 pt-3 border-t border-slate-700">
              ${canAddGoal ? `
                <form onsubmit="submitPlayerGoal(event, '${playerId}')" class="flex flex-wrap items-end gap-2">
                  <div class="min-w-[140px]">
                    <label class="text-xs text-slate-400 block mb-1" for="player-goal-new-category-${playerId}">Category</label>
                    <select id="player-goal-new-category-${playerId}" class="w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-sm focus:outline-none focus:border-blue-500">
                      ${goalCategoryOptions('Skills')}
                    </select>
                  </div>
                  <div class="min-w-[140px]">
                    <label class="text-xs text-slate-400 block mb-1" for="player-goal-new-originated-${playerId}">Originated</label>
                    <select id="player-goal-new-originated-${playerId}" class="w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-sm focus:outline-none focus:border-blue-500">
                      ${goalOriginOptions('Coach')}
                    </select>
                  </div>
                  <div class="flex-1 min-w-[180px]">
                    <label class="text-xs text-slate-400 block mb-1" for="player-goal-new-desc-${playerId}">Player goal</label>
                    <input id="player-goal-new-desc-${playerId}" type="text" maxlength="200" required placeholder="Enter up to 3 active goals"
                      class="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
                  </div>
                  <button type="submit" class="text-xs bg-blue-600 hover:bg-blue-500 font-semibold px-3 py-2 min-h-[44px] rounded">
                    + Add Goal
                  </button>
                </form>
              ` : '<p class="text-xs text-amber-400 font-medium">This player already has 3 active goals.</p>'}
              <form onsubmit="submitPlayerNote(event, '${playerId}')" class="space-y-2">
                <label class="text-xs text-slate-400 block" for="player-note-new-${playerId}">Player note</label>
                <textarea id="player-note-new-${playerId}" rows="3" maxlength="4000" placeholder="Write a note about this player..."
                  class="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"></textarea>
                <button type="submit" class="text-xs bg-slate-700 hover:bg-slate-600 font-semibold px-3 py-2 min-h-[44px] rounded">
                  Save Note
                </button>
              </form>
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Failed rendering goals UI:', err);
    container.innerHTML = `<p class="text-red-400 text-sm">${escapeGoalHtml(err.message)}</p>`;
  }
}

function addOneCalendarMonth(from = new Date()) {
  const start = new Date(from);
  if (Number.isNaN(start.getTime())) return null;
  const day = start.getDate();
  const target = new Date(start);
  target.setMonth(target.getMonth() + 1);
  if (target.getDate() !== day) {
    target.setDate(0);
  }
  return target;
}

function goalTargetDate(goal) {
  if (goal && goal.targetDate) {
    const stored = new Date(goal.targetDate);
    if (!Number.isNaN(stored.getTime())) return stored;
  }
  if (goal && goal.createdAt) return addOneCalendarMonth(goal.createdAt);
  return null;
}

function formatGoalTargetDate(goal) {
  const date = goalTargetDate(goal);
  if (!date) return 'Target: 1 month after created';
  const label = date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
  return isGoalTargetOverdue(goal) ? `Target: ${label} (overdue)` : `Target: ${label}`;
}

function isGoalTargetOverdue(goal) {
  if (!goal || goal.completed) return false;
  const date = goalTargetDate(goal);
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(date);
  due.setHours(0, 0, 0, 0);
  return due < today;
}

function escapeGoalHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function submitPlayerGoal(event, playerId) {
  event.preventDefault();
  const desc = document.getElementById(`player-goal-new-desc-${playerId}`)?.value.trim();
  const category = document.getElementById(`player-goal-new-category-${playerId}`)?.value;
  const originated = document.getElementById(`player-goal-new-originated-${playerId}`)?.value;
  if (!desc) {
    alert('Enter a goal description.');
    return;
  }

  try {
    await apiFetch('/goals', {
      method: 'POST',
      body: JSON.stringify({ playerId, description: desc, category, originated })
    });
    expandedPlayerInfoIds.add(String(playerId));
    renderPlayerGoalsUI();
  } catch (err) {
    alert(err.message);
  }
}

async function submitPlayerNote(event, playerId) {
  event.preventDefault();
  const body = document.getElementById(`player-note-new-${playerId}`)?.value.trim();
  if (!body) {
    alert('Write a note before saving.');
    return;
  }

  try {
    await apiFetch('/notes/players', {
      method: 'POST',
      body: JSON.stringify({ playerId, body })
    });
    expandedPlayerInfoIds.add(String(playerId));
    renderPlayerGoalsUI();
  } catch (err) {
    alert(err.message);
  }
}

async function deletePlayerNote(noteId) {
  if (!window.confirm('Delete this player note?')) return;
  try {
    await apiFetch(`/notes/players/${noteId}`, { method: 'DELETE' });
    renderPlayerGoalsUI();
  } catch (err) {
    alert(err.message);
  }
}

async function updatePlayerGoalCategory(goalId, category) {
  try {
    await apiFetch(`/goals/${goalId}`, {
      method: 'PATCH',
      body: JSON.stringify({ category })
    });
  } catch (err) {
    alert(err.message);
    renderPlayerGoalsUI();
  }
}

async function updatePlayerGoalOriginated(goalId, originated) {
  try {
    await apiFetch(`/goals/${goalId}`, {
      method: 'PATCH',
      body: JSON.stringify({ originated })
    });
  } catch (err) {
    alert(err.message);
    renderPlayerGoalsUI();
  }
}

async function updateGoalProgress(goalId, progressVal) {
  try {
    await apiFetch(`/goals/${goalId}`, {
      method: 'PATCH',
      body: JSON.stringify({ progress: parseInt(progressVal, 10) })
    });
    renderPlayerGoalsUI();
  } catch (err) {
    alert(err.message);
  }
}

function formatCoachGoalPercent(completed, total) {
  if (!total) return '0%';
  const pct = (Number(completed) / Number(total)) * 100;
  const rounded = Math.round(pct * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

function coachGoalProgressBar(completed, total) {
  const pct = total ? Math.max(0, Math.min(100, (Number(completed) / Number(total)) * 100)) : 0;
  return `
    <div class="flex items-center gap-3">
      <div class="flex-1 h-2 rounded-full bg-slate-900 overflow-hidden">
        <div class="h-full bg-emerald-500 transition-all" style="width:${pct}%"></div>
      </div>
      <span class="text-sm font-bold text-emerald-400 tabular-nums">${formatCoachGoalPercent(completed, total)}</span>
    </div>`;
}

async function renderMyGoalsUI() {
  const container = document.getElementById('myGoalsContainer');
  const createPanel = document.getElementById('myGoalsCreatePanel');
  if (!container || !createPanel) return;

  try {
    const data = await apiFetch('/coach-goals');
    const goals = Array.isArray(data.goals) ? data.goals : [];
    const remaining = Number.isFinite(data.remaining) ? data.remaining : Math.max(0, 10 - goals.length);

    createPanel.innerHTML = remaining > 0 ? `
      <form onsubmit="submitCoachGoal(event)" class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="font-semibold text-slate-200">Create a goal</h3>
          <span class="text-xs text-slate-400">${remaining} of 10 slots available</span>
        </div>
        <div class="grid gap-3 sm:grid-cols-[1fr_180px]">
          <div>
            <label class="text-xs text-slate-400 block mb-1" for="coachGoalTitle">Goal name</label>
            <input id="coachGoalTitle" type="text" maxlength="120" required placeholder="e.g. Improve breakouts"
              class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
          </div>
          <div>
            <label class="text-xs text-slate-400 block mb-1" for="coachGoalCategory">Category</label>
            <select id="coachGoalCategory" required class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
              ${goalCategoryOptions('Skills')}
            </select>
          </div>
        </div>
        <div>
          <p class="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">3 steps to complete this goal</p>
          <div class="grid gap-2 sm:grid-cols-3">
            <input id="coachGoalStep1" type="text" maxlength="80" placeholder="Step 1" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
            <input id="coachGoalStep2" type="text" maxlength="80" placeholder="Step 2" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
            <input id="coachGoalStep3" type="text" maxlength="80" placeholder="Step 3" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
          </div>
        </div>
        <button type="submit" class="bg-blue-600 hover:bg-blue-500 font-semibold px-4 py-2 min-h-[44px] rounded-lg text-sm transition">
          Create Goal
        </button>
      </form>
    ` : '<p class="text-amber-400 text-sm font-medium">You have 10 goals. Delete one to create another.</p>';

    if (!goals.length) {
      container.innerHTML = '<p class="text-slate-400 text-sm italic">No goals yet. Create one above. Each step will start with 6 placeholder drills you can rename.</p>';
      return;
    }

    container.innerHTML = goals.map((goal) => `
      <article class="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
        <div class="flex flex-wrap justify-between items-start gap-3 border-b border-slate-700 pb-3">
          <div class="flex-1 min-w-0 space-y-2">
            <input type="text" value="${escapeGoalHtml(goal.title)}" maxlength="120"
              onblur="renameCoachGoal('${goal._id}', this.value)"
              class="w-full bg-transparent border border-transparent hover:border-slate-600 focus:border-blue-500 rounded px-2 py-1 text-lg font-bold text-blue-400 focus:outline-none">
            <select onchange="updateCoachGoalCategory('${goal._id}', this.value)"
              class="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500">
              ${goalCategoryOptions(goal.category)}
            </select>
            ${coachGoalProgressBar(goal.completedDrills, goal.totalDrills)}
            <p class="text-xs text-slate-500">${goal.completedDrills || 0} of ${goal.totalDrills || 0} drills complete</p>
          </div>
          <button type="button" onclick="deleteCoachGoal('${goal._id}')" class="text-xs text-slate-500 hover:text-red-400 px-2 py-2">Delete</button>
        </div>
        <div class="space-y-4">
          ${(goal.steps || []).map((step, stepIndex) => `
            <div class="bg-slate-900/60 border border-slate-700/50 rounded-lg p-4 space-y-3">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex items-center gap-2 min-w-0 flex-1">
                  <span class="text-xs font-semibold uppercase tracking-wider text-slate-500 shrink-0">Step ${stepIndex + 1}</span>
                  <input type="text" value="${escapeGoalHtml(step.name)}" maxlength="80"
                    onblur="renameCoachGoalStep('${goal._id}', '${step._id}', this.value)"
                    class="min-w-0 flex-1 bg-transparent border border-transparent hover:border-slate-600 focus:border-blue-500 rounded px-2 py-1 text-sm font-medium focus:outline-none">
                </div>
                <div class="w-40 shrink-0">${coachGoalProgressBar(step.completedDrills, step.totalDrills)}</div>
              </div>
              <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                ${(step.drills || []).map((drill) => `
                  <label class="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 cursor-pointer hover:border-blue-600 transition">
                    <input type="checkbox" ${drill.completed ? 'checked' : ''}
                      onchange="toggleCoachGoalDrill('${goal._id}', '${drill._id}', this.checked)"
                      class="w-4 h-4 accent-emerald-600 shrink-0">
                    <input type="text" value="${escapeGoalHtml(drill.name)}" maxlength="80"
                      onclick="event.stopPropagation()"
                      onblur="renameCoachGoalDrill('${goal._id}', '${drill._id}', this.value)"
                      class="min-w-0 flex-1 bg-transparent border-0 text-sm focus:outline-none focus:ring-0">
                  </label>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </article>
    `).join('');
  } catch (err) {
    container.innerHTML = `<p class="text-red-400 text-sm">${escapeGoalHtml(err.message)}</p>`;
    createPanel.innerHTML = '';
  }
}

async function submitCoachGoal(event) {
  event.preventDefault();
  const title = document.getElementById('coachGoalTitle')?.value.trim();
  const category = document.getElementById('coachGoalCategory')?.value;
  const steps = [
    document.getElementById('coachGoalStep1')?.value || '',
    document.getElementById('coachGoalStep2')?.value || '',
    document.getElementById('coachGoalStep3')?.value || ''
  ];
  if (!title) {
    alert('Enter a goal name.');
    return;
  }
  try {
    await apiFetch('/coach-goals', {
      method: 'POST',
      body: JSON.stringify({ title, category, steps })
    });
    await renderMyGoalsUI();
  } catch (err) {
    alert(err.message);
  }
}

async function updateCoachGoalCategory(goalId, category) {
  try {
    await apiFetch(`/coach-goals/${goalId}`, {
      method: 'PATCH',
      body: JSON.stringify({ category })
    });
  } catch (err) {
    alert(err.message);
    await renderMyGoalsUI();
  }
}

async function renameCoachGoal(goalId, title) {
  const next = String(title || '').trim();
  if (!next) {
    await renderMyGoalsUI();
    return;
  }
  try {
    await apiFetch(`/coach-goals/${goalId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: next })
    });
  } catch (err) {
    alert(err.message);
    await renderMyGoalsUI();
  }
}

async function renameCoachGoalStep(goalId, stepId, name) {
  const next = String(name || '').trim();
  if (!next) {
    await renderMyGoalsUI();
    return;
  }
  try {
    await apiFetch(`/coach-goals/${goalId}/steps/${stepId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: next })
    });
  } catch (err) {
    alert(err.message);
    await renderMyGoalsUI();
  }
}

async function renameCoachGoalDrill(goalId, drillId, name) {
  const next = String(name || '').trim();
  if (!next) {
    await renderMyGoalsUI();
    return;
  }
  try {
    await apiFetch(`/coach-goals/${goalId}/drills/${drillId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: next })
    });
  } catch (err) {
    alert(err.message);
    await renderMyGoalsUI();
  }
}

async function toggleCoachGoalDrill(goalId, drillId, completed) {
  try {
    await apiFetch(`/coach-goals/${goalId}/drills/${drillId}`, {
      method: 'PATCH',
      body: JSON.stringify({ completed: Boolean(completed) })
    });
    await renderMyGoalsUI();
  } catch (err) {
    alert(err.message);
    await renderMyGoalsUI();
  }
}

async function deleteCoachGoal(goalId) {
  if (!window.confirm('Delete this goal and its steps and drills?')) return;
  try {
    await apiFetch(`/coach-goals/${goalId}`, { method: 'DELETE' });
    await renderMyGoalsUI();
  } catch (err) {
    alert(err.message);
  }
}

async function renderTeamGoalsUI() {
  const container = document.getElementById('teamGoalsContainer');
  if (!container) return;

  try {
    const data = await apiFetch('/coach-goals/team');
    const goals = Array.isArray(data.goals) ? data.goals : [];
    const coaches = Array.isArray(data.coaches) ? data.coaches : [];

    if (!coaches.length && !goals.length) {
      container.innerHTML = '<p class="text-slate-400 text-sm italic">No coaches on this team yet.</p>';
      return;
    }

    const grouped = (coaches.length ? coaches : []).map((coach) => ({
      coach,
      goals: goals.filter((goal) => {
        const owner = goal.createdBy && (goal.createdBy._id || goal.createdBy);
        return String(owner) === String(coach._id);
      })
    }));

    const knownIds = new Set(grouped.map((row) => String(row.coach._id)));
    goals.forEach((goal) => {
      const owner = goal.createdBy;
      const ownerId = owner && (owner._id || owner);
      if (ownerId && !knownIds.has(String(ownerId))) {
        knownIds.add(String(ownerId));
        grouped.push({
          coach: owner.name ? owner : { _id: ownerId, name: 'Coach', role: owner.role },
          goals: [goal]
        });
      }
    });

    container.innerHTML = grouped.map(({ coach, goals: coachGoals }) => `
      <article class="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-3">
        <h3 class="font-bold text-lg text-blue-400">
          ${escapeGoalHtml(coach.name || 'Coach')}${coach.role === 'HEAD_COACH' ? ' <span class="text-xs text-slate-400 font-medium">(Head Coach)</span>' : ''}
        </h3>
        ${coachGoals.length === 0
          ? '<p class="text-slate-500 text-sm italic">No goals yet</p>'
          : `<div class="space-y-2">${coachGoals.map((goal) => `
              <div class="bg-slate-900/60 border border-slate-700/50 rounded-lg p-3 space-y-2">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <p class="text-sm font-medium">${escapeGoalHtml(goal.title)}</p>
                  ${goalCategoryBadge(goal.category)}
                </div>
                ${coachGoalProgressBar(goal.completedDrills, goal.totalDrills)}
              </div>
            `).join('')}</div>`}
      </article>
    `).join('');
  } catch (err) {
    container.innerHTML = `<p class="text-red-400 text-sm">${escapeGoalHtml(err.message)}</p>`;
  }
}