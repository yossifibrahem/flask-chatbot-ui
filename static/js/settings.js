// Settings — persisted to localStorage and reflected in state.

import { state, SETTINGS_DEFAULTS, STORAGE_KEYS } from './state.js';
import { storage } from './storage.js';
import { api }     from './api.js';
import { showStatus, showToast } from './ui.js';

// ── Read / write ──────────────────────────────────────────────────────────────

export function loadSettings() {
  const saved = storage.get(STORAGE_KEYS.settings, {});
  Object.assign(state, SETTINGS_DEFAULTS, saved);

  const cachedModels = storage.get(STORAGE_KEYS.models);
  if (cachedModels) renderModelList(cachedModels);

  document.getElementById('api-base').value      = state.apiBase;
  document.getElementById('api-key').value       = state.apiKey;
  document.getElementById('system-prompt').value = state.systemPrompt;
  updateModelBadge();
}

export function saveSettings() {
  state.apiBase      = document.getElementById('api-base').value.trim();
  state.apiKey       = document.getElementById('api-key').value.trim();
  state.systemPrompt = document.getElementById('system-prompt').value.trim();
  storage.set(STORAGE_KEYS.settings, {
    apiBase: state.apiBase, apiKey: state.apiKey,
    model: state.model, systemPrompt: state.systemPrompt,
  });
  updateModelBadge();
  showStatus('settings-status', 'Settings saved ✓', 'ok');
  showToast('Settings saved');
}

// ── Model list ────────────────────────────────────────────────────────────────

export async function fetchModels() {
  showStatus('settings-status', 'Fetching…', 'ok');
  try {
    const data = await api.post('/api/models', {
      api_base: document.getElementById('api-base').value.trim(),
      api_key:  document.getElementById('api-key').value.trim(),
    });
    if (data.error) { showStatus('settings-status', data.error, 'err'); return; }
    storage.set(STORAGE_KEYS.models, data.models || []);
    renderModelList(data.models || []);
    showStatus('settings-status', `${data.models.length} models ✓`, 'ok');
  } catch (err) {
    showStatus('settings-status', `Error: ${err.message}`, 'err');
  }
}

export function renderModelList(models) {
  _renderChips(document.getElementById('model-list'),    'model-chip', models);
  _renderChips(document.getElementById('mp-model-list'), 'mp-chip',    models);
}

function _renderChips(container, chipClass, models) {
  if (!container) return;
  if (!models.length) {
    container.innerHTML = '<span class="mp-empty">No models — fetch them in Settings</span>';
    return;
  }
  container.innerHTML = models.map(m =>
    `<div class="${chipClass}${m === state.model ? ' selected' : ''}" data-model="${m}">${m}</div>`
  ).join('');

  container.querySelectorAll(`.${chipClass}`).forEach(chip => {
    chip.addEventListener('click', () => {
      state.model = chip.dataset.model;
      renderModelList(models);  // re-render both lists with updated selection
      updateModelBadge();
      saveSettings();
    });
  });
}

function updateModelBadge() {
  document.getElementById('model-badge-label').textContent = state.model || 'No model';
}
