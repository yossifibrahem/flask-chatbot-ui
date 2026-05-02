// DOM rendering — the only module that touches #messages.
// Nothing here knows about API calls or state persistence.

import { applyMarkdown } from './markdown.js';

// ── Reusable SVG icons ────────────────────────────────────────────────────────

const ICONS = {
  user:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  ai:           `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>`,
  tool:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
  info:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  check:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  close:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  copy:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  chevronRight: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
  chevronDown:  `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`,
  brain:        `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12c0 1.5.5 2 1 3h6c.5-1 1-1.5 1-3a7 7 0 0 0-4-12z"/></svg>`,
  toolSmall:    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
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

const BOTTOM_THRESHOLD = 32;
let stickToBottom = true;

function isNearBottom(el) {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_THRESHOLD;
}

function messagesEl() {
  return document.getElementById('messages');
}

document.addEventListener('DOMContentLoaded', () => {
  messagesEl()?.addEventListener('scroll', (e) => {
    stickToBottom = isNearBottom(e.currentTarget);
  }, { passive: true });
});

export function scrollToBottom(force = false) {
  const el = messagesEl();
  if (!el || (!force && !stickToBottom)) return;

  requestAnimationFrame(() => {
    if (force || stickToBottom) {
      el.scrollTop = el.scrollHeight;
      stickToBottom = true;
    }
  });
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

function createMessageRow(avatarClass, avatarIcon, roleLabel) {
  document.getElementById('empty-state')?.remove();

  const row = document.createElement('div');
  row.className = `msg-row${roleLabel === 'You' ? ' user-row' : ''}`;
  row.innerHTML = `
    <div class="msg-meta">
      <div class="msg-avatar ${avatarClass}">${avatarIcon}</div>
      <span class="msg-role-label">${roleLabel}</span>
      <span class="msg-time">${formatTime()}</span>
    </div>`;

  document.getElementById('messages').appendChild(row);
  return row;
}

// ── Get or create the last assistant row (used by tools to append inline) ─────

function getOrCreateAssistantRow() {
  // Walk backwards through #messages children to find the last msg-row.
  // Only reuse it if it is an assistant row AND it is the very last row
  // (i.e. no user message came after it).
  const msgs     = document.getElementById('messages');
  const children = [...msgs.children].filter(el => el.classList.contains('msg-row'));
  const last     = children[children.length - 1];
  if (last && !last.classList.contains('user-row')) return last;
  return createMessageRow('ai-av', ICONS.ai, 'Assistant');
}

// ── Copy footer ───────────────────────────────────────────────────────────────

function addCopyFooter(row, getText) {
  const footer  = document.createElement('div');
  footer.className = 'msg-footer';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'msg-action-btn';
  copyBtn.innerHTML = `${ICONS.copy} copy`;
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(getText());
    copyBtn.textContent = '✓ copied';
    setTimeout(() => { copyBtn.innerHTML = `${ICONS.copy} copy`; }, 1500);
  };

  footer.appendChild(copyBtn);
  row.appendChild(footer);
}

// ── Thinking / Reasoning block ────────────────────────────────────────────────

/**
 * Creates a collapsible "Thinking…" block inside the current assistant row.
 * Returns the <pre> element that streaming text should be written into.
 */
export function createThinkingBlock() {
  const row = getOrCreateAssistantRow();
  row.querySelector('.msg-footer')?.remove();

  const block = document.createElement('div');
  block.className = 'thinking-block thinking-streaming';
  block.innerHTML = `
    <button class="thinking-header">
      <span class="thinking-chevron">${ICONS.chevronDown}</span>
      <span class="thinking-icon">${ICONS.brain}</span>
      <span class="thinking-label">Thinking…</span>
      <span class="thinking-pulse"></span>
    </button>
    <pre class="thinking-body"></pre>`;

  const btn  = block.querySelector('.thinking-header');
  const body = block.querySelector('.thinking-body');
  const chev = block.querySelector('.thinking-chevron');

  btn.addEventListener('click', () => {
    const open = block.classList.toggle('open');
    // When manually toggled during streaming keep it open; override closed
    block.dataset.manualToggle = '1';
    chev.innerHTML = open ? ICONS.chevronDown : ICONS.chevronRight;
    body.style.display = open ? 'block' : 'none';
  });

  // Default: expanded while streaming
  block.classList.add('open');
  body.style.display = 'block';

  row.appendChild(block);
  scrollToBottom();
  return body;
}

/** Append a chunk of reasoning text to the streaming thinking body. */
export function updateThinkingBlock(bodyEl, text) {
  bodyEl.textContent = text;
  scrollToBottom();
}

/**
 * Called once reasoning is complete — removes pulse, updates label,
 * and collapses the block.
 */
export function finalizeThinkingBlock(bodyEl, fullText) {
  const block = bodyEl.closest('.thinking-block');
  if (!block) return;
  block.classList.remove('thinking-streaming');
  block.querySelector('.thinking-label').textContent = 'Thought process';
  block.querySelector('.thinking-pulse')?.remove();
  bodyEl.textContent = fullText;

  // Auto-collapse after streaming unless the user manually toggled it
  if (!block.dataset.manualToggle) {
    block.classList.remove('open');
    block.querySelector('.thinking-chevron').innerHTML = ICONS.chevronRight;
    bodyEl.style.display = 'none';
  }
}

/**
 * Renders a static (already-complete) thinking block from the display log.
 */
export function appendThinkingBlock(reasoningText) {
  if (!reasoningText) return;
  const row = getOrCreateAssistantRow();
  row.querySelector('.msg-footer')?.remove();

  const block = document.createElement('div');
  block.className = 'thinking-block';
  block.innerHTML = `
    <button class="thinking-header">
      <span class="thinking-chevron">${ICONS.chevronRight}</span>
      <span class="thinking-icon">${ICONS.brain}</span>
      <span class="thinking-label">Thought process</span>
    </button>
    <pre class="thinking-body" style="display:none">${escapeHtml(reasoningText)}</pre>`;

  const btn  = block.querySelector('.thinking-header');
  const body = block.querySelector('.thinking-body');
  const chev = block.querySelector('.thinking-chevron');

  btn.addEventListener('click', () => {
    const open = block.classList.toggle('open');
    chev.innerHTML = open ? ICONS.chevronDown : ICONS.chevronRight;
    body.style.display = open ? 'block' : 'none';
  });

  row.appendChild(block);
  scrollToBottom();
}

// ── Public renderers ──────────────────────────────────────────────────────────

export function appendMessage(role, content) {
  if (!content) return;
  const isUser = role === 'user';
  // For assistant messages reuse the current assistant row so that tool
  // results and follow-up text are grouped into the same bubble on replay.
  const row = isUser
    ? createMessageRow('user-av', ICONS.user, 'You')
    : getOrCreateAssistantRow();
  // Remove any stale copy footer — it will be re-added below
  row.querySelector('.msg-footer')?.remove();

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

  const rawText = typeof content === 'string' ? content : content.map(p => p.text || '').join('\n');
  addCopyFooter(row, () => rawText);
  scrollToBottom(isUser);

  return contentEl;
}

export function createStreamingMessage() {
  // Reuse the last assistant row so tools + follow-up text stay grouped
  const row = getOrCreateAssistantRow();
  // Remove any copy footer — it will be re-added by finalizeStreamingMessage
  row.querySelector('.msg-footer')?.remove();
  const contentEl = document.createElement('div');
  contentEl.className = 'msg-content cursor-blink';
  contentEl.innerHTML = '&nbsp;';
  row.appendChild(contentEl);
  scrollToBottom();
  return contentEl;
}

/** Called by chat.js once streaming is done — removes cursor and adds the copy footer. */
export function finalizeStreamingMessage(contentEl, text) {
  contentEl.classList.remove('cursor-blink');
  applyMarkdown(contentEl, text);
  // Always replace any existing copy footer so it stays at the bottom
  const row = contentEl.parentElement;
  row.querySelector('.msg-footer')?.remove();
  if (text) addCopyFooter(row, () => text);
}

function formatArgsHtml(args) {
  return Object.entries(args).map(([k, v]) => {
    const val = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return `<div class="arg-item">` +
      `<span class="arg-name">${escapeHtml(k)}</span>` +
      `<pre class="arg-value">${escapeHtml(val)}</pre>` +
      `</div>`;
  }).join('');
}

export function appendToolResult(toolName, args, result) {
  const row   = getOrCreateAssistantRow();
  row.querySelector('.msg-footer')?.remove();
  const strip = document.createElement('div');
  strip.className = 'tool-inline';

  const hasArgs = args && Object.keys(args).length > 0;
  const bodyHtml = hasArgs
    ? `<div class="tr-section-label">Arguments</div><div class="tr-args">${formatArgsHtml(args)}</div>` +
      `<div class="tr-section-label">Result</div><pre class="tr-result">${escapeHtml(String(result))}</pre>`
    : `<pre class="tr-result">${escapeHtml(String(result))}</pre>`;

  strip.innerHTML = `
    <button class="tr-summary">
      <span class="tr-chevron">${ICONS.chevronRight}</span>
      <span class="tool-icon">${ICONS.toolSmall}</span>
      <span class="tr-tool-name">${escapeHtml(toolName)}</span>
    </button>
    <div class="tr-body" style="display:none">${bodyHtml}</div>`;

  const btn  = strip.querySelector('.tr-summary');
  const body = strip.querySelector('.tr-body');
  const chev = strip.querySelector('.tr-chevron');
  btn.addEventListener('click', () => {
    const open = strip.classList.toggle('open');
    chev.innerHTML = open ? ICONS.chevronDown : ICONS.chevronRight;
    body.style.display = open ? 'block' : 'none';
  });
  row.appendChild(strip);
  scrollToBottom();
}

export function renderAllMessages(displayLog) {
  document.getElementById('messages').innerHTML = '';
  displayLog.forEach(entry => {
    if (entry.type === 'message')     appendMessage(entry.role, entry.content);
    if (entry.type === 'tool_result') appendToolResult(entry.name, entry.args, entry.result);
    if (entry.type === 'thinking')    appendThinkingBlock(entry.content);
  });
  scrollToBottom(true);
}

// ── Tool confirmation dialog ──────────────────────────────────────────────────

export function showToolConfirmation(calls) {
  return new Promise(resolve => {
    const row = getOrCreateAssistantRow();
    row.querySelector('.msg-footer')?.remove();

    const wrap = document.createElement('div');
    wrap.className = 'tc-wrap';
    row.appendChild(wrap);
    scrollToBottom();

    const decisions = new Array(calls.length).fill(null);
    let pending = calls.length;

    const cleanupAndResolve = () => {
      wrap.style.transition = 'opacity .2s';
      wrap.style.opacity    = '0';
      setTimeout(() => wrap.remove(), 200);
      resolve(decisions);
    };

    const decide = (idx, allowed, item) => {
      if (decisions[idx] !== null) return;

      decisions[idx] = allowed;
      pending -= 1;

      item.classList.add('decided');
      item.querySelectorAll('.tc-allow, .tc-deny').forEach(btn => {
        btn.disabled = true;
        btn.style.display = 'none';
      });

      const status = item.querySelector('.tc-status');
      if (status) {
        status.className = `tc-status ${allowed ? 'allowed' : 'denied'}`;
        status.innerHTML = allowed ? `${ICONS.check} allowed` : `${ICONS.close} denied`;
      }

      if (pending === 0) cleanupAndResolve();
    };

    // One independently approvable collapsible row per tool call.
    calls.forEach((call, idx) => {
      let args = {};
      try { args = JSON.parse(call.function.arguments || '{}'); } catch {}
      const hasArgs = Object.keys(args).length > 0;

      const item = document.createElement('div');
      item.className = 'tc-item open';
      item.innerHTML = `
        <div class="tc-item-row">
          <button class="tc-item-header">
            <span class="tc-item-chevron">${ICONS.chevronDown}</span>
            <span class="tool-icon">${ICONS.toolSmall}</span>
            <span class="tc-item-name">${escapeHtml(call.function.name)}</span>
            ${hasArgs ? '' : '<span class="tc-item-noargs">no arguments</span>'}
          </button>
          <span class="tc-actions">
            <button class="tc-allow">${ICONS.check} allow</button>
            <button class="tc-deny">${ICONS.close} deny</button>
          </span>
          <span class="tc-status" aria-live="polite"></span>
        </div>
        ${hasArgs ? `<div class="tc-item-args" style="display:block">${formatArgsHtml(args)}</div>` : ''}`;

      if (hasArgs) {
        const btn  = item.querySelector('.tc-item-header');
        const pre  = item.querySelector('.tc-item-args');
        const chev = item.querySelector('.tc-item-chevron');
        btn.addEventListener('click', () => {
          const open = item.classList.toggle('open');
          chev.innerHTML = open ? ICONS.chevronDown : ICONS.chevronRight;
          pre.style.display = open ? 'block' : 'none';
        });
      }

      item.querySelector('.tc-allow').addEventListener('click', () => decide(idx, true, item));
      item.querySelector('.tc-deny').addEventListener('click',  () => decide(idx, false, item));

      wrap.appendChild(item);
    });
  });
}