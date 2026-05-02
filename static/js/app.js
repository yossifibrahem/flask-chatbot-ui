// App entry point — event binding and boot sequence.
//
// This module's only job is to wire UI events to domain functions.
// No business logic lives here.

import { state, STORAGE_KEYS } from './state.js';
import { storage }  from './storage.js';
import { api }      from './api.js';

import { openModal, closeModal, toggleSidebar, autoResize, updateCharCount, showToast } from './ui.js';
import { loadSettings, saveSettings, fetchModels, renderModelList, updateModelBadge }   from './settings.js';
import { loadConversationList, openConversation, createNewConversation, persistConversation } from './conversations.js';
import { loadMcpConfig, saveMcpConfig, reloadTools, renderToolList, loadCachedTools } from './mcp.js';
import { sendMessage, setStreaming } from './chat.js';

// ── Event binding ─────────────────────────────────────────────────────────────

function bindEvents() {
  // Sidebar
  document.getElementById('btn-toggle-sidebar').addEventListener('click', () => toggleSidebar());
  document.getElementById('btn-new-chat').addEventListener('click', createNewConversation);

  // Model picker popover
  const modelBadge   = document.getElementById('model-badge');
  const modelPopover = document.getElementById('model-popover');
  modelBadge.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = modelPopover.classList.toggle('open');
    modelBadge.classList.toggle('open', isOpen);
  });
  document.addEventListener('click', e => {
    if (!document.getElementById('model-picker-wrap').contains(e.target)) {
      modelPopover.classList.remove('open');
      modelBadge.classList.remove('open');
    }
  });

  // Modal open/close
  document.getElementById('btn-open-settings').addEventListener('click', () => openModal('settings-modal'));
  document.querySelectorAll('[data-close]').forEach(btn =>
    btn.addEventListener('click', () => closeModal(btn.dataset.close))
  );
  document.querySelectorAll('.modal-overlay').forEach(overlay =>
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(overlay.id); })
  );

  // Tab switching
  document.querySelectorAll('.modal-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.dataset.tab;
      document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.tab-footer-btn').forEach(b => b.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(targetId).classList.add('active');
      document.querySelector(`.tab-footer-btn[data-for-tab="${targetId}"]`)?.classList.add('active');
    });
  });
  // Show the correct footer button for the default active tab on load.
  document.querySelector('.tab-footer-btn[data-for-tab="tab-settings"]').classList.add('active');

  // Settings
  document.getElementById('btn-save-settings').addEventListener('click', saveSettings);
  document.getElementById('btn-fetch-models').addEventListener('click',         fetchModels);

  // MCP
  document.getElementById('btn-save-mcp').addEventListener('click',    saveMcpConfig);
  document.getElementById('btn-reload-tools').addEventListener('click', reloadTools);

  // Input
  const userInput = document.getElementById('user-input');
  const submitInput = () => {
    const text = userInput.value.trim();
    if (!text) return;
    userInput.value = '';
    autoResize(userInput);
    updateCharCount();
    sendMessage(text);
  };
  document.getElementById('send-btn').addEventListener('click', submitInput);
  userInput.addEventListener('input',   () => { autoResize(userInput); updateCharCount(); });
  userInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitInput(); } });

  // Stop streaming
  document.getElementById('stop-btn').addEventListener('click', async () => {
    if (!state.streamId) return;
    try { await api.post('/api/chat/cancel', { stream_id: state.streamId }); } catch {}
  });

  // Chat title persistence
  const titleInput = document.getElementById('chat-title-input');
  titleInput.addEventListener('change', persistConversation);
  titleInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.target.blur(); persistConversation(); } });

  // Empty-state prompt clicks (event delegation — no rebinding needed after clearMessages)
  document.getElementById('messages').addEventListener('click', e => {
    const prompt = e.target.closest('.es-prompt');
    if (!prompt) return;
    const input = document.getElementById('user-input');
    input.value = prompt.dataset.prompt;
    autoResize(input);
    input.focus();
  });

  // Global keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      createNewConversation();
    }
  });
}

// ── Boot sequence ─────────────────────────────────────────────────────────────

(async () => {
  bindEvents();
  loadSettings();
  loadCachedTools();
  await loadConversationList();
  await loadMcpConfig();

  // Restore the last-viewed conversation.
  const lastConvId = storage.get(STORAGE_KEYS.lastConv);
  if (lastConvId) {
    try { await openConversation(lastConvId); } catch {}
  }

  // Restore sidebar state.
  const sidebarOpen = storage.get(STORAGE_KEYS.sidebar, true);
  if (!sidebarOpen) toggleSidebar(false);
})();
