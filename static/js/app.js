// App entry point — event binding and boot sequence.
//
// This module's only job is to wire UI events to domain functions.
// No business logic lives here.

import { STORAGE_KEYS } from './state.js';
import { storage }  from './storage.js';

import { openModal, closeModal, toggleSidebar, autoResize, updateCharCount } from './ui.js';
import { loadSettings, saveSettings, fetchModels }                           from './settings.js';
import { loadConversationList, openConversation, createNewConversation, persistConversation, startNewChat } from './conversations.js';
import { loadMcpConfig, saveMcpConfig, reloadTools, loadCachedTools } from './mcp.js';
import { sendMessage, stopAssistantTurn, editAndResend, regenerateFrom, initImageAttachments } from './chat.js';
import { clearMessages } from './renderer.js';
import { ICONS } from './icons.js';

// ── Event binding ─────────────────────────────────────────────────────────────

function bindSidebarEvents() {
  document.getElementById('btn-toggle-sidebar').addEventListener('click', () => toggleSidebar());
  document.getElementById('btn-new-chat').addEventListener('click', startNewChat);
}

function bindModelPickerEvents() {
  const modelBadge   = document.getElementById('model-badge');
  const modelPopover = document.getElementById('model-popover');

  // Prepend the AI avatar icon from the single source of truth in icons.js
  modelBadge.insertAdjacentHTML('afterbegin', `<span class="model-icon">${ICONS.ai}</span>`);

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
}

function bindModalEvents() {
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
  document.querySelector('.tab-footer-btn[data-for-tab="tab-settings"]').classList.add('active');
}

function bindSettingsEvents() {
  document.getElementById('btn-save-settings').addEventListener('click', saveSettings);
  document.getElementById('btn-fetch-models').addEventListener('click', fetchModels);
  document.getElementById('btn-save-mcp').addEventListener('click', saveMcpConfig);
  document.getElementById('btn-reload-tools').addEventListener('click', reloadTools);
}

function bindInputEvents() {
  const userInput = document.getElementById('user-input');

  const submitInput = () => {
    const text = userInput.value;
    userInput.value = '';
    autoResize(userInput);
    updateCharCount();
    sendMessage(text);
  };

  document.getElementById('send-btn').addEventListener('click', submitInput);
  userInput.addEventListener('input',   () => { autoResize(userInput); updateCharCount(); });
  userInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitInput(); }
  });

  document.getElementById('stop-btn').addEventListener('click', stopAssistantTurn);

  initImageAttachments();

  // Chat title persistence
  const titleInput = document.getElementById('chat-title-input');
  titleInput.addEventListener('change', persistConversation);
  titleInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.target.blur(); persistConversation(); } });

  // Empty-state prompt clicks (event delegation)
  document.getElementById('messages').addEventListener('click', e => {
    const prompt = e.target.closest('.es-prompt');
    if (!prompt) return;
    userInput.value = prompt.dataset.prompt;
    autoResize(userInput);
    userInput.focus();
  });

  // Edit & Resend — dispatched from renderer when user confirms an edit
  document.getElementById('messages').addEventListener('chat:edit-resend', e => {
    const { logIndex, newText, imageUrls } = e.detail;
    editAndResend(logIndex, newText, imageUrls);
  });

  // Regenerate — dispatched from renderer when user clicks regenerate
  document.getElementById('messages').addEventListener('chat:regenerate', e => {
    regenerateFrom(e.detail.logIndex);
  });
}

function bindKeyboardEvents() {
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      startNewChat();
    }
  });
}

function bindEvents() {
  bindSidebarEvents();
  bindModelPickerEvents();
  bindModalEvents();
  bindSettingsEvents();
  bindInputEvents();
  bindKeyboardEvents();
}

// ── Boot sequence ─────────────────────────────────────────────────────────────

(async () => {
  bindEvents();
  loadSettings();
  loadCachedTools();
  await loadConversationList();
  await loadMcpConfig();

  const lastConvId = storage.get(STORAGE_KEYS.lastConv);
  if (lastConvId) {
    try {
      await openConversation(lastConvId);
    } catch {
      storage.remove(STORAGE_KEYS.lastConv);
      clearMessages();
    }
  } else {
    clearMessages(); // Show empty state when no conversation exists
  }

  const sidebarOpen = storage.get(STORAGE_KEYS.sidebar, true);
  // Always start collapsed on mobile — sidebar overlays content there
  const shouldOpen = window.innerWidth <= 768 ? false : sidebarOpen;
  if (!shouldOpen) toggleSidebar(false);
})();
