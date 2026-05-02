// Chat — message sending, SSE stream reading, tool-call orchestration.

import { api }   from './api.js';
import { state } from './state.js';
import {
  createStreamingMessage, appendMessage, appendToolResult,
  showToolConfirmation, finalizeStreamingMessage, escapeHtml, scrollToBottom,
  createThinkingBlock, updateThinkingBlock, finalizeThinkingBlock,
} from './renderer.js';
import { applyMarkdown } from './markdown.js';
import { executeTool, isServerEnabled, isServerAutoApprove } from './mcp.js';
import { persistConversation, createNewConversation } from './conversations.js';

// ── Payload builders ──────────────────────────────────────────────────────────

function buildToolsPayload() {
  return state.mcpTools
    .filter(tool => isServerEnabled(tool.server))
    .map(tool => ({
      type: 'function',
      function: {
        name:        tool.name,
        description: tool.description,
        parameters:  tool.inputSchema || { type: 'object', properties: {} },
      },
    }));
}

function buildApiMessages() {
  const messages = [];
  if (state.systemPrompt) messages.push({ role: 'system', content: state.systemPrompt });
  messages.push(...state.messages);
  return messages;
}

// ── Streaming state ───────────────────────────────────────────────────────────

export function setStreaming(active) {
  state.isStreaming = active;
  document.getElementById('send-btn').style.display = active ? 'none' : 'grid';
  document.getElementById('stop-btn').style.display = active ? 'grid' : 'none';
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function sendMessage(userText) {
  if (!userText.trim() || state.isStreaming) return;
  if (!state.convId) await createNewConversation();

  setStreaming(true);

  if (state.messages.length === 0) {
    document.getElementById('chat-title-input').value =
      userText.slice(0, 42) + (userText.length > 42 ? '…' : '');
  }

  state.messages.push({ role: 'user', content: userText });
  state.displayLog.push({ type: 'message', role: 'user', content: userText });
  appendMessage('user', userText);

  await runChatLoop();
  await persistConversation();
  setStreaming(false);
}

// ── SSE helpers ───────────────────────────────────────────────────────────────

/** Parses a single SSE event and mutates the streaming context. Returns false on terminal error. */
function processSSEEvent(raw, ctx) {
  const evt = JSON.parse(raw);

  if (evt.type === 'reasoning') {
    ctx.accReasoning += evt.content;
    if (!ctx.reasoningBodyEl) ctx.reasoningBodyEl = createThinkingBlock();
    updateThinkingBlock(ctx.reasoningBodyEl, ctx.accReasoning);

  } else if (evt.type === 'text') {
    ctx.accText += evt.content;
    const el = ctx.getContentEl();
    el.classList.add('cursor-blink');
    applyMarkdown(el, ctx.accText);
    scrollToBottom();

  } else if (evt.type === 'tool_calls') {
    ctx.toolCalls = evt.calls;

  } else if (evt.type === 'error') {
    const el = ctx.getContentEl();
    el.classList.remove('cursor-blink');
    el.innerHTML = `<span style="color:var(--red)">Error: ${escapeHtml(evt.message)}</span>`;
    return false; // signal abort
  }

  return true;
}

/** Reads the SSE response body line-by-line, calling processSSEEvent for each data event. */
async function readSSEStream(resp, ctx) {
  const reader  = resp.body.getReader();
  const decoder = new TextDecoder();
  let   buffer  = '';

  outer: while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep incomplete line

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') break outer;

      try {
        if (!processSSEEvent(raw, ctx)) return false;
      } catch { /* malformed SSE line — skip */ }
    }
  }
  return true;
}

// ── SSE loop ──────────────────────────────────────────────────────────────────

async function runChatLoop() {
  let contentEl = null;

  const ctx = {
    accText:        '',
    accReasoning:   '',
    reasoningBodyEl: null,
    toolCalls:      null,
    getContentEl:   () => { if (!contentEl) contentEl = createStreamingMessage(); return contentEl; },
  };

  state.streamId = crypto.randomUUID();

  try {
    const resp = await api.stream('/api/chat/stream', {
      api_base:  state.apiBase,
      api_key:   state.apiKey,
      model:     state.model || 'gpt-4o',
      messages:  buildApiMessages(),
      tools:     buildToolsPayload(),
      stream_id: state.streamId,
    });

    const success = await readSSEStream(resp, ctx);
    if (!success) return;

    if (ctx.reasoningBodyEl) finalizeThinkingBlock(ctx.reasoningBodyEl, ctx.accReasoning);
    if (contentEl)           finalizeStreamingMessage(contentEl, ctx.accText);

    if (ctx.toolCalls?.length > 0) {
      await handleToolCalls(ctx.toolCalls, ctx.accText, ctx.accReasoning);
    } else if (ctx.accText) {
      if (ctx.accReasoning) state.displayLog.push({ type: 'thinking', content: ctx.accReasoning });
      state.messages.push({ role: 'assistant', content: ctx.accText });
      state.displayLog.push({ type: 'message', role: 'assistant', content: ctx.accText });
    }
  } catch (err) {
    const el = ctx.getContentEl();
    el.classList.remove('cursor-blink');
    el.innerHTML = `<span style="color:var(--red)">Network error: ${escapeHtml(err.message)}</span>`;
  }
}

// ── Tool-call orchestration ───────────────────────────────────────────────────

function parseToolArgs(rawArgs) {
  try { return JSON.parse(rawArgs || '{}'); } catch { return {}; }
}

async function resolveToolDecisions(calls) {
  const autoApprovedFlags = calls.map(tc => {
    const toolDef = state.mcpTools.find(t => t.name === tc.function.name);
    return !!(toolDef && isServerAutoApprove(toolDef.server));
  });

  if (autoApprovedFlags.every(Boolean)) {
    return new Array(calls.length).fill(true);
  }

  const decisions = await showToolConfirmation(calls);
  return decisions.map((d, i) => autoApprovedFlags[i] ? true : d);
}

async function handleToolCalls(calls, precedingText, precedingReasoning = '') {
  if (precedingReasoning) state.displayLog.push({ type: 'thinking', content: precedingReasoning });
  if (precedingText)      state.displayLog.push({ type: 'message', role: 'assistant', content: precedingText });

  state.messages.push({
    role:       'assistant',
    content:    precedingText || null,
    tool_calls: calls.map(tc => ({
      id:       tc.id,
      type:     'function',
      function: { name: tc.function.name, arguments: tc.function.arguments },
    })),
  });

  const decisions = await resolveToolDecisions(calls);

  for (let i = 0; i < calls.length; i++) {
    const tc     = calls[i];
    const args   = parseToolArgs(tc.function.arguments);
    const result = decisions[i] ? await executeTool(tc) : 'Tool execution denied by user.';
    appendToolResult(tc.function.name, args, result);
    state.displayLog.push({ type: 'tool_result', name: tc.function.name, args, result });
    state.messages.push({ role: 'tool', tool_call_id: tc.id, content: result });
  }

  await runChatLoop();
}
