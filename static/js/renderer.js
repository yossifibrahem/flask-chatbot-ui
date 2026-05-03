// DOM rendering — the only module that touches #messages.
// API calls, persistence, and chat orchestration live elsewhere.

import { applyMarkdown } from './markdown.js';
import { $, createElement, remove, setVisible } from './dom.js';
import { ICONS } from './icons.js';
import { state } from './state.js';

const EMPTY_STATE_PROMPTS = [
  { tag: 'EXPLAIN', label: 'How do transformers work in machine learning?', prompt: 'Explain how transformers work in machine learning' },
  { tag: 'CODE',    label: 'Write a Python function to parse JSON safely',   prompt: 'Write a Python function to parse JSON with error handling' },
  { tag: 'COMPARE', label: 'REST vs GraphQL — key differences',              prompt: 'What are the key differences between REST and GraphQL APIs?' },
  { tag: 'WRITE',   label: 'Executive summary for a product launch',          prompt: 'Help me write a concise executive summary for a product launch' },
];

const BOTTOM_THRESHOLD = 32;
let stickToBottom = true;
let activeToolConfirmation = null;

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const messagesEl = () => $('#messages');
const formatTime = () => new Date().toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' });
const isNearBottom = el => el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_THRESHOLD;

document.addEventListener('DOMContentLoaded', () => {
  messagesEl()?.addEventListener('scroll', event => {
    stickToBottom = isNearBottom(event.currentTarget);
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

export function clearMessages() {
  const promptsHtml = EMPTY_STATE_PROMPTS.map(prompt => `
    <div class="es-prompt" data-prompt="${escapeHtml(prompt.prompt)}">
      <strong>${prompt.tag}</strong>${escapeHtml(prompt.label)}
    </div>`).join('');

  messagesEl().innerHTML = `
    <div id="empty-state">
      <div class="es-logo">Lu<em>men</em></div>
      <div class="es-sub">Your AI assistant — ready to help</div>
      <div class="es-prompts">${promptsHtml}</div>
    </div>`;
}

function createMessageRow({ avatarClass, avatarIcon, roleLabel, isUser = false }) {
  remove('#empty-state');

  const row = createElement('div', { className: `msg-row${isUser ? ' user-row' : ''}` });
  row.innerHTML = `
    <div class="msg-meta">
      <div class="msg-avatar ${avatarClass}">${avatarIcon}</div>
      <span class="msg-role-label">${roleLabel}</span>
      <span class="msg-time">${formatTime()}</span>
    </div>`;

  messagesEl().appendChild(row);
  return row;
}

function getOrCreateAssistantRow() {
  const rows = [...messagesEl().children].filter(child => child.classList.contains('msg-row'));
  const last = rows.at(-1);
  return last && !last.classList.contains('user-row')
    ? last
    : createMessageRow({ avatarClass: 'ai-av', avatarIcon: ICONS.ai, roleLabel: 'Assistant' });
}

function prepareAssistantRow() {
  const row = getOrCreateAssistantRow();
  row.querySelector('.msg-footer')?.remove();
  return row;
}

function addCopyFooter(row, getText) {
  const footer = createElement('div', { className: 'msg-footer' });
  const copyBtn = createElement('button', { className: 'msg-action-btn', html: `${ICONS.copy} copy` });

  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(getText());
    copyBtn.textContent = '✓ copied';
    setTimeout(() => { copyBtn.innerHTML = `${ICONS.copy} copy`; }, 1500);
  });

  footer.appendChild(copyBtn);
  row.appendChild(footer);
}

function addUserFooter(row, getText, logIndex) {
  const footer = createElement('div', { className: 'msg-footer' });

  const copyBtn = createElement('button', { className: 'msg-action-btn', html: `${ICONS.copy} copy` });
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(getText());
    copyBtn.textContent = '✓ copied';
    setTimeout(() => { copyBtn.innerHTML = `${ICONS.copy} copy`; }, 1500);
  });

  const editBtn = createElement('button', { className: 'msg-action-btn', html: `${ICONS.edit} edit` });
  editBtn.addEventListener('click', () => {
    if (logIndex < 0) return;
    startInlineEdit(row, logIndex, getText());
  });

  footer.appendChild(copyBtn);
  footer.appendChild(editBtn);
  row.appendChild(footer);
}

function addAssistantFooter(row, getText, logIndex) {
  const footer = createElement('div', { className: 'msg-footer' });

  const copyBtn = createElement('button', { className: 'msg-action-btn', html: `${ICONS.copy} copy` });
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(getText());
    copyBtn.textContent = '✓ copied';
    setTimeout(() => { copyBtn.innerHTML = `${ICONS.copy} copy`; }, 1500);
  });

  if (logIndex >= 0) {
    const regenBtn = createElement('button', { className: 'msg-action-btn', html: `${ICONS.refresh} regenerate` });
    regenBtn.addEventListener('click', () => {
      row.dispatchEvent(new CustomEvent('chat:regenerate', { bubbles: true, detail: { logIndex } }));
    });
    footer.appendChild(copyBtn);
    footer.appendChild(regenBtn);
  } else {
    footer.appendChild(copyBtn);
  }

  row.appendChild(footer);
}

function startInlineEdit(row, logIndex, currentText) {
  // Save and remove existing content and footer
  const contentEl = row.querySelector('.msg-content');
  const footerEl  = row.querySelector('.msg-footer');
  if (!contentEl) return;

  contentEl.style.display = 'none';
  footerEl?.remove();

  // Build edit UI
  const editWrap = createElement('div', { className: 'msg-edit-wrap' });
  const textarea = createElement('textarea', { className: 'msg-edit-textarea' });
  textarea.value = currentText;
  textarea.rows = Math.min(Math.max(currentText.split('\n').length, 2), 10);

  const actions = createElement('div', { className: 'msg-edit-actions' });
  const saveBtn   = createElement('button', { className: 'msg-edit-save',   text: 'Send' });
  const cancelBtn = createElement('button', { className: 'msg-edit-cancel', text: 'Cancel' });

  const cancelEdit = () => {
    editWrap.remove();
    contentEl.style.display = '';
    addUserFooter(row, () => currentText, logIndex);
  };

  saveBtn.addEventListener('click', () => {
    const newText = textarea.value.trim();
    if (!newText) return;
    editWrap.remove();
    contentEl.style.display = '';
    row.dispatchEvent(new CustomEvent('chat:edit-resend', { bubbles: true, detail: { logIndex, newText } }));
  });

  cancelBtn.addEventListener('click', cancelEdit);

  textarea.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveBtn.click(); }
    if (e.key === 'Escape') cancelEdit();
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);
  editWrap.appendChild(textarea);
  editWrap.appendChild(actions);
  row.appendChild(editWrap);

  // Auto-resize textarea
  setTimeout(() => {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, 0);
}

function toggleCollapsible(block, body, chevron) {
  const isOpen = block.classList.toggle('open');
  chevron.innerHTML = isOpen ? ICONS.chevronDown : ICONS.chevronRight;
  setVisible(body, isOpen);
  return isOpen;
}

function attachCollapsible(block, { headerSelector, bodySelector, chevronSelector, markManualToggle = false }) {
  const header = block.querySelector(headerSelector);
  const body = block.querySelector(bodySelector);
  const chevron = block.querySelector(chevronSelector);

  header?.addEventListener('click', () => {
    if (markManualToggle) block.dataset.manualToggle = '1';
    toggleCollapsible(block, body, chevron);
  });
}

function createThinkingMarkup({ label, chevron, body = '', streaming = false, display = 'none' }) {
  return `
    <button class="thinking-header">
      <span class="thinking-chevron">${chevron}</span>
      <span class="thinking-icon">${ICONS.brain}</span>
      <span class="thinking-label">${label}</span>
      ${streaming ? '<span class="thinking-pulse"></span>' : ''}
    </button>
    <pre class="thinking-body" style="display:${display}">${body}</pre>`;
}

export function createThinkingBlock() {
  const row = prepareAssistantRow();
  const block = createElement('div', {
    className: 'thinking-block thinking-streaming open',
    html: createThinkingMarkup({ label: 'Thinking…', chevron: ICONS.chevronDown, streaming: true, display: 'block' }),
  });

  attachCollapsible(block, {
    headerSelector: '.thinking-header',
    bodySelector: '.thinking-body',
    chevronSelector: '.thinking-chevron',
    markManualToggle: true,
  });

  row.appendChild(block);
  scrollToBottom();
  return block.querySelector('.thinking-body');
}

export function updateThinkingBlock(bodyEl, text) {
  bodyEl.textContent = text;
  scrollToBottom();
}

export function finalizeThinkingBlock(bodyEl, fullText) {
  const block = bodyEl.closest('.thinking-block');
  if (!block) return;

  block.classList.remove('thinking-streaming');
  block.querySelector('.thinking-label').textContent = 'Thought process';
  block.querySelector('.thinking-pulse')?.remove();
  bodyEl.textContent = fullText;

  if (!block.dataset.manualToggle) {
    block.classList.remove('open');
    block.querySelector('.thinking-chevron').innerHTML = ICONS.chevronRight;
    setVisible(bodyEl, false);
  }
}

export function appendThinkingBlock(reasoningText) {
  if (!reasoningText) return;

  const row = prepareAssistantRow();
  const block = createElement('div', {
    className: 'thinking-block',
    html: createThinkingMarkup({
      label: 'Thought process',
      chevron: ICONS.chevronRight,
      body: escapeHtml(reasoningText),
    }),
  });

  attachCollapsible(block, {
    headerSelector: '.thinking-header',
    bodySelector: '.thinking-body',
    chevronSelector: '.thinking-chevron',
  });

  row.appendChild(block);
  scrollToBottom();
}

function appendContentParts(contentEl, content) {
  // Multipart with images: { text, imageUrls: ['/api/images/...', ...] }
  if (content && typeof content === 'object' && !Array.isArray(content) && 'imageUrls' in content) {
    if (content.text) {
      const textChunk = createElement('div');
      applyMarkdown(textChunk, content.text);
      contentEl.appendChild(textChunk);
    }
    if (content.imageUrls?.length) {
      const imgWrap = createElement('div', { className: 'msg-images' });
      content.imageUrls.forEach(url => {
        const img = document.createElement('img');
        img.src = url;
        img.className = 'msg-image';
        img.addEventListener('click', () => window.open(url, '_blank'));
        imgWrap.appendChild(img);
      });
      contentEl.appendChild(imgWrap);
    }
    return;
  }

  if (typeof content === 'string') {
    applyMarkdown(contentEl, content);
    return;
  }

  if (!Array.isArray(content)) return;
  content
    .filter(part => part.type === 'text')
    .forEach(part => {
      const chunk = createElement('div');
      applyMarkdown(chunk, part.text);
      contentEl.appendChild(chunk);
    });
}

function getRawText(content) {
  if (typeof content === 'string') return content;
  if (content && typeof content === 'object' && !Array.isArray(content) && 'imageUrls' in content) return content.text || '';
  if (!Array.isArray(content)) return '';
  return content.map(part => part.text || '').join('\n');
}

export function appendMessage(role, content, logIndex = -1) {
  if (!content) return null;

  const isUser = role === 'user';
  const row = isUser
    ? createMessageRow({ avatarClass: 'user-av', avatarIcon: ICONS.user, roleLabel: 'You', isUser: true })
    : prepareAssistantRow();

  if (logIndex >= 0) row.dataset.logIndex = logIndex;
  row.querySelector('.msg-footer')?.remove();

  const contentEl = createElement('div', { className: 'msg-content' });
  appendContentParts(contentEl, content);
  row.appendChild(contentEl);

  if (isUser) {
    addUserFooter(row, () => getRawText(content), logIndex);
  } else {
    addAssistantFooter(row, () => getRawText(content), logIndex);
  }
  scrollToBottom(isUser);
  return contentEl;
}

export function createStreamingMessage() {
  const row = prepareAssistantRow();
  const contentEl = createElement('div', { className: 'msg-content cursor-blink', html: '&nbsp;' });
  row.appendChild(contentEl);
  scrollToBottom();
  return contentEl;
}

export function finalizeStreamingMessage(contentEl, text) {
  contentEl.classList.remove('cursor-blink');
  applyMarkdown(contentEl, text);

  const row = contentEl.parentElement;
  row.querySelector('.msg-footer')?.remove();
  // logIndex will be set after state.displayLog.push() via setStreamingMessageLogIndex
  if (text) addAssistantFooter(row, () => text, -1);
}

export function setStreamingMessageLogIndex(contentEl, logIndex) {
  const row = contentEl?.parentElement;
  if (!row) return;
  row.dataset.logIndex = logIndex;
  // Update the regenerate button's logIndex closure by replacing the footer
  const footerEl = row.querySelector('.msg-footer');
  if (!footerEl) return;
  // Find existing copy text via button
  const copyBtn = footerEl.querySelector('.msg-action-btn');
  const getText = () => {
    const el = row.querySelector('.msg-content');
    return el ? el.textContent : '';
  };
  footerEl.remove();
  addAssistantFooter(row, getText, logIndex);
}

function normalizeBlockText(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/^\s*\n+/, '')
    .replace(/\n+\s*$/, '');
}

function formatToolValue(value) {
  if (value == null) return '';
  if (typeof value === 'object') {
    return normalizeBlockText(JSON.stringify(value, null, 2));
  }
  return normalizeBlockText(value);
}

function formatArgsHtml(args) {
  return Object.entries(args).map(([key, value]) => `
    <div class="arg-item">
      <span class="arg-name">${escapeHtml(key)}</span>
      <pre class="arg-value">${escapeHtml(formatToolValue(value))}</pre>
    </div>`).join('');
}

function createToolResultBody(args, result) {
  const hasArgs = args && Object.keys(args).length > 0;
  const resultHtml = `<div class="tr-section"><div class="tr-section-label">Result</div><pre class="tr-result">${escapeHtml(formatToolValue(result))}</pre></div>`;

  if (!hasArgs) return resultHtml;

  return `
    <div class="tr-section">
      <div class="tr-section-label">Arguments</div>
      <div class="tr-args">${formatArgsHtml(args)}</div>
    </div>
    ${resultHtml}`;
}

export function appendToolResult(toolName, args, result) {
  const row = prepareAssistantRow();
  const strip = createElement('div', { className: 'tool-inline' });

  strip.innerHTML = `
    <button class="tr-summary">
      <span class="tr-chevron">${ICONS.chevronRight}</span>
      <span class="tool-icon">${ICONS.toolSmall}</span>
      <span class="tr-tool-name">${escapeHtml(toolName)}</span>
    </button>
    <div class="tr-body" style="display:none">${createToolResultBody(args, result)}</div>`;

  attachCollapsible(strip, {
    headerSelector: '.tr-summary',
    bodySelector: '.tr-body',
    chevronSelector: '.tr-chevron',
  });

  row.appendChild(strip);
  scrollToBottom();
}

export function renderAllMessages(displayLog) {
  messagesEl().innerHTML = '';
  displayLog.forEach((entry, idx) => {
    if (entry.type === 'message') appendMessage(entry.role, entry.content, idx);
    if (entry.type === 'tool_result') appendToolResult(entry.name, entry.args, entry.result);
    if (entry.type === 'thinking') appendThinkingBlock(entry.content);
  });
  scrollToBottom(true);
}

export function cancelToolConfirmation() {
  activeToolConfirmation?.cancel();
}

function parseToolArguments(call) {
  try { return JSON.parse(call.function.arguments || '{}'); }
  catch { return {}; }
}

function createToolDecisionItem(call, idx, decide) {
  const args = parseToolArguments(call);
  const hasArgs = Object.keys(args).length > 0;
  const item = createElement('div', { className: 'tc-item open' });

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
    attachCollapsible(item, {
      headerSelector: '.tc-item-header',
      bodySelector: '.tc-item-args',
      chevronSelector: '.tc-item-chevron',
    });
  }

  item.querySelector('.tc-allow').addEventListener('click', () => decide(idx, true, item));
  item.querySelector('.tc-deny').addEventListener('click', () => decide(idx, false, item));
  return item;
}

function markDecision(item, allowed) {
  item.classList.add('decided');
  item.querySelectorAll('.tc-allow, .tc-deny').forEach(button => {
    button.disabled = true;
    setVisible(button, false);
  });

  const status = item.querySelector('.tc-status');
  if (!status) return;

  status.className = `tc-status ${allowed ? 'allowed' : 'denied'}`;
  status.innerHTML = allowed ? `${ICONS.check} allowed` : `${ICONS.close} denied`;
}

export function showToolConfirmation(calls) {
  cancelToolConfirmation();

  return new Promise(resolve => {
    const row = prepareAssistantRow();
    const wrap = createElement('div', { className: 'tc-wrap' });
    row.appendChild(wrap);
    scrollToBottom();

    const decisions = new Array(calls.length).fill(null);
    let pending = calls.length;
    let settled = false;
    let timerId = null;

    const cleanup = () => {
      if (activeToolConfirmation?.wrap === wrap) activeToolConfirmation = null;
      wrap.style.transition = 'opacity .2s';
      wrap.style.opacity = '0';
      timerId = setTimeout(() => wrap.remove(), 200);
    };

    const settle = value => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const decide = (idx, allowed, item) => {
      if (settled || decisions[idx] !== null) return;

      decisions[idx] = allowed;
      pending -= 1;
      markDecision(item, allowed);

      if (pending === 0) settle(decisions);
    };

    activeToolConfirmation = {
      wrap,
      cancel: () => {
        if (timerId) clearTimeout(timerId);
        settle(null);
      },
    };

    calls.forEach((call, idx) => wrap.appendChild(createToolDecisionItem(call, idx, decide)));
  });
}
