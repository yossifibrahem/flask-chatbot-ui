// Conversation management — talking to /api/conversations and updating the sidebar.

import { api }         from './api.js';
import { state, STORAGE_KEYS } from './state.js';
import { storage } from './storage.js';
import { clearMessages, renderAllMessages, escapeHtml } from './renderer.js';
import { toggleSidebar } from './ui.js';

// ── Sidebar list ──────────────────────────────────────────────────────────────

export async function loadConversationList() {
  const list      = await api.get('/api/conversations');
  const container = document.getElementById('conv-list');
  container.innerHTML = '';

  if (!list.length) {
    container.innerHTML = '<div class="conv-section-label conv-empty">No conversations yet</div>';
    return;
  }

  container.appendChild(
    Object.assign(document.createElement('div'), { className: 'conv-section-label', textContent: 'Recent' })
  );
  list.forEach(conv => container.appendChild(_buildConvItem(conv)));
}

function _buildConvItem(conv) {
  const item   = document.createElement('div');
  item.className = `conv-item${conv.id === state.convId ? ' active' : ''}`;
  item.dataset.id = conv.id;

  const date = conv.updated_at
    ? new Date(conv.updated_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })
    : '';

  item.innerHTML = `
    <div class="conv-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    </div>
    <div class="conv-info">
      <div class="conv-title">${escapeHtml(conv.title)}</div>
      <div class="conv-meta">${conv.message_count} msg${conv.message_count !== 1 ? 's' : ''} · ${date}</div>
    </div>
    <button class="conv-del" title="Delete">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>`;

  item.addEventListener('click', e => { if (!e.target.closest('.conv-del')) openConversation(conv.id); });
  item.querySelector('.conv-del').addEventListener('click', e => { e.stopPropagation(); deleteConversation(conv.id); });
  return item;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function openConversation(id) {
  const data = await api.get(`/api/conversations/${id}`);
  state.convId     = id;
  state.messages   = data.messages   || [];
  state.displayLog = data.displayLog || [];
  storage.set(STORAGE_KEYS.lastConv, id);
  document.getElementById('chat-title-input').value = data.title || '';
  renderAllMessages(state.displayLog);
  await loadConversationList();
  if (window.innerWidth <= 768) toggleSidebar(false);
}

// Resets the UI to an empty chat without touching the server.
// The actual conversation record is created lazily on the first send (chat.js).
export function startNewChat() {
  state.convId     = null;
  state.messages   = [];
  state.displayLog = [];
  storage.remove(STORAGE_KEYS.lastConv);
  document.getElementById('chat-title-input').value = '';
  clearMessages();
  document.querySelectorAll('.conv-item.active').forEach(el => el.classList.remove('active'));
  if (window.innerWidth <= 768) toggleSidebar(false);
}

// Creates a conversation record on the server. Called by chat.js before the first send.
export async function createNewConversation() {
  const data = await api.post('/api/conversations', { title: 'New Conversation' });
  state.convId     = data.id;
  state.messages   = [];
  state.displayLog = [];
  storage.set(STORAGE_KEYS.lastConv, data.id);
  document.getElementById('chat-title-input').value = 'New Conversation';
  await loadConversationList();
}

export async function deleteConversation(convId) {
  if (!confirm('Delete this conversation?')) return;
  await api.delete(`/api/conversations/${convId}`);
  if (state.convId === convId) {
    state.convId     = null;
    state.messages   = [];
    state.displayLog = [];
    storage.remove(STORAGE_KEYS.lastConv);
    clearMessages();
  }
  await loadConversationList();
}

export async function persistConversation() {
  if (!state.convId) return;
  const title = document.getElementById('chat-title-input').value.trim() || 'Untitled';
  await api.put(`/api/conversations/${state.convId}`, {
    title, messages: state.messages, displayLog: state.displayLog,
  });
  await loadConversationList();
}
