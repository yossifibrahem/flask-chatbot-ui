// DOM rendering — the only module that touches #messages.
// Nothing here knows about API calls or state persistence.

import { applyMarkdown } from './markdown.js';

// ── Reusable SVG icons ────────────────────────────────────────────────────────

const ICONS = {
  user:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  ai:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>`,
  tool:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
  info:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  copy:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
};

// ── Utilities ─────────────────────────────────────────────────────────────────

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatTime() {
  return new Date().toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' });
}

export function scrollToBottom() {
  const el = document.getElementById('messages');
  requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
}

// ── Empty state ───────────────────────────────────────────────────────────────

const EMPTY_STATE_PROMPTS = [
  { tag: 'EXPLAIN', label: 'How do transformers work in machine learning?', prompt: 'Explain how transformers work in machine learning' },
  { tag: 'CODE',    label: 'Write a Python function to parse JSON safely',   prompt: 'Write a Python function to parse JSON with error handling' },
  { tag: 'COMPARE', label: 'REST vs GraphQL — key differences',              prompt: 'What are the key differences between REST and GraphQL APIs?' },
  { tag: 'WRITE',   label: 'Executive summary for a product launch',          prompt: 'Help me write a concise executive summary for a product launch' },
];

export function clearMessages() {
  const promptsHtml = EMPTY_STATE_PROMPTS.map(p =>
    `<div class="es-prompt" data-prompt="${escapeHtml(p.prompt)}"><strong>${p.tag}</strong>${p.label}</div>`
  ).join('');
  document.getElementById('messages').innerHTML = `
    <div id="empty-state">
      <div class="es-logo">Lu<em>men</em></div>
      <div class="es-sub">Your AI assistant — ready to help</div>
      <div class="es-prompts">${promptsHtml}</div>
    </div>`;
}

// ── Message row factory ───────────────────────────────────────────────────────

function createMessageRow(avatarClass, avatarIcon, roleLabel) {
  document.getElementById('empty-state')?.remove();

  const row = document.createElement('div');
  row.className = `msg-row${roleLabel === 'You' ? ' user-row' : ''}`;
  row.innerHTML = `
    <div class="msg-meta">
      <div class="msg-avatar ${avatarClass}">${avatarIcon}</div>
      <span class="msg-role-label">${roleLabel}</span>
      <span class="msg-time">${formatTime()}</span>
      <div class="msg-actions"></div>
    </div>`;

  document.getElementById('messages').appendChild(row);
  scrollToBottom();
  return row;
}

// ── Public renderers ──────────────────────────────────────────────────────────

export function appendMessage(role, content) {
  if (!content) return;
  const isUser = role === 'user';
  const row = createMessageRow(
    isUser ? 'user-av' : 'ai-av',
    isUser ? ICONS.user : ICONS.ai,
    isUser ? 'You' : 'Assistant',
  );

  const contentEl = document.createElement('div');
  contentEl.className = 'msg-content';

  if (typeof content === 'string') {
    applyMarkdown(contentEl, content);
  } else if (Array.isArray(content)) {
    content.forEach(part => {
      if (part.type === 'text') {
        const chunk = document.createElement('div');
        applyMarkdown(chunk, part.text);
        contentEl.appendChild(chunk);
      }
    });
  }
  row.appendChild(contentEl);

  // Copy-to-clipboard action button
  const copyBtn = document.createElement('button');
  copyBtn.className = 'msg-action-btn';
  copyBtn.innerHTML = `${ICONS.copy} copy`;
  copyBtn.onclick = () => {
    const text = typeof content === 'string' ? content : content.map(p => p.text || '').join('\n');
    navigator.clipboard.writeText(text);
    copyBtn.textContent = '✓ copied';
    setTimeout(() => { copyBtn.innerHTML = `${ICONS.copy} copy`; }, 1500);
  };
  row.querySelector('.msg-actions').appendChild(copyBtn);

  return contentEl;
}

export function createStreamingMessage() {
  const row = createMessageRow('ai-av', ICONS.ai, 'Assistant');
  const contentEl = document.createElement('div');
  contentEl.className = 'msg-content cursor-blink';
  contentEl.innerHTML = '&nbsp;';
  row.appendChild(contentEl);
  return contentEl;
}

export function appendToolResult(toolName, result) {
  const row = createMessageRow('tool-av', ICONS.tool, 'Tool Result');
  const box = document.createElement('div');
  box.className = 'tool-result-box';
  box.innerHTML = `<div class="tr-label">${escapeHtml(toolName)}</div><div>${escapeHtml(String(result))}</div>`;
  row.appendChild(box);
}

export function renderAllMessages(displayLog) {
  document.getElementById('messages').innerHTML = '';
  displayLog.forEach(entry => {
    if (entry.type === 'message')     appendMessage(entry.role, entry.content);
    if (entry.type === 'tool_result') appendToolResult(entry.name, entry.result);
  });
  scrollToBottom();
}

// ── Tool confirmation dialog ──────────────────────────────────────────────────

export function showToolConfirmation(calls) {
  return new Promise(resolve => {
    const row       = createMessageRow('ai-av', ICONS.info, 'Tool Request');
    const decisions = new Array(calls.length).fill(null);

    const checkAllDecided = () => {
      if (!decisions.every(d => d !== null)) return;
      row.style.transition = 'opacity .2s';
      row.style.opacity    = '0';
      setTimeout(() => row.remove(), 200);
      resolve(decisions);
    };

    calls.forEach((call, i) => {
      let args = {};
      try { args = JSON.parse(call.function.arguments || '{}'); } catch {}

      const box = document.createElement('div');
      box.className = 'tool-confirm-box';
      box.innerHTML = `
        <div class="tool-confirm-header">${ICONS.info} Tool call requires your approval</div>
        <div class="tc-name-row">Tool: <span class="tc-name">${escapeHtml(call.function.name)}</span></div>
        <div class="tc-args-label">Arguments:</div>
        <div class="tc-args">${escapeHtml(JSON.stringify(args, null, 2))}</div>
        <div class="tc-buttons">
          <button class="tc-btn approve">${ICONS.check} Allow</button>
          <button class="tc-btn deny">${ICONS.close} Deny</button>
        </div>`;

      box.querySelector('.tc-btn.approve').addEventListener('click', () => {
        decisions[i] = true;
        box.querySelector('.tc-buttons').innerHTML = '<span class="tc-decision approved">✓ Approved</span>';
        checkAllDecided();
      });
      box.querySelector('.tc-btn.deny').addEventListener('click', () => {
        decisions[i] = false;
        box.querySelector('.tc-buttons').innerHTML = '<span class="tc-decision denied">✕ Denied</span>';
        checkAllDecided();
      });
      row.appendChild(box);
    });
  });
}
