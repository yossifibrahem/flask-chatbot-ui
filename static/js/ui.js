// Generic UI helpers — no domain knowledge, no API calls.

import { storage }     from './storage.js';
import { STORAGE_KEYS } from './state.js';

// ── Toast & status ────────────────────────────────────────────────────────────

let _toastTimer;

export function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
}

export function showStatus(elementId, message, type) {
  const el = document.getElementById(elementId);
  el.textContent = message;
  el.className   = `status-msg ${type}`;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

export function toggleSidebar(forceOpen) {
  const sidebar = document.getElementById('sidebar');
  const main    = document.getElementById('main');
  const open    = forceOpen !== undefined ? forceOpen : sidebar.classList.contains('collapsed');
  sidebar.classList.toggle('collapsed', !open);
  main.style.marginLeft = open ? '' : '0';
  storage.set(STORAGE_KEYS.sidebar, open);
}

// ── Modals ────────────────────────────────────────────────────────────────────

export function openModal(id)  { document.getElementById(id).classList.add('open'); }
export function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// ── Input helpers ─────────────────────────────────────────────────────────────

export function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
}

export function updateCharCount() {
  const input = document.getElementById('user-input');
  const count = document.getElementById('char-count');
  const len   = input.value.length;
  count.textContent = len > 100 ? `${len} chars` : '';
  count.classList.toggle('warn', len > 3000);
}
