// Chat — message sending, SSE stream reading, tool-call orchestration.

import { api }   from './api.js';
import { state } from './state.js';
import {
  createStreamingMessage, appendMessage, appendToolResult,
  showToolConfirmation, finalizeStreamingMessage, escapeHtml, scrollToBottom,
} from './renderer.js';
import { applyMarkdown } from './markdown.js';
import { executeTool }   from './mcp.js';
import { persistConversation, createNewConversation } from './conversations.js';

// ── Payload builders ──────────────────────────────────────────────────────────

function buildToolsPayload() {
  return state.mcpTools.map(tool => ({
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

  // Auto-title from the first message.
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

// ── SSE loop ──────────────────────────────────────────────────────────────────

async function runChatLoop() {
  const contentEl = createStreamingMessage();
  let accText     = '';
  let toolCalls   = null;

  state.streamId = crypto.randomUUID();

  try {
    const resp    = await api.stream('/api/chat/stream', {
      api_base:  state.apiBase,
      api_key:   state.apiKey,
      model:     state.model || 'gpt-4o',
      messages:  buildApiMessages(),
      tools:     buildToolsPayload(),
      stream_id: state.streamId,
    });

    const reader  = resp.body.getReader();
    const decoder = new TextDecoder();
    let   buffer  = '';

    outer: while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep any incomplete line

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') break outer;

        try {
          const evt = JSON.parse(raw);
          if (evt.type === 'text') {
            accText += evt.content;
            contentEl.classList.add('cursor-blink');
            applyMarkdown(contentEl, accText);
            scrollToBottom();
          } else if (evt.type === 'tool_calls') {
            toolCalls = evt.calls;
          } else if (evt.type === 'error') {
            contentEl.classList.remove('cursor-blink');
            contentEl.innerHTML = `<span style="color:var(--red)">Error: ${escapeHtml(evt.message)}</span>`;
            return;
          }
        } catch { /* Malformed SSE line — skip */ }
      }
    }

    finalizeStreamingMessage(contentEl, accText);

    if (toolCalls?.length > 0) {
      await handleToolCalls(toolCalls, accText);
    } else if (accText) {
      state.messages.push({ role: 'assistant', content: accText });
      state.displayLog.push({ type: 'message', role: 'assistant', content: accText });
    }
  } catch (err) {
    contentEl.classList.remove('cursor-blink');
    contentEl.innerHTML = `<span style="color:var(--red)">Network error: ${escapeHtml(err.message)}</span>`;
  }
}

// ── Tool-call orchestration ───────────────────────────────────────────────────

async function handleToolCalls(calls, precedingText) {
  if (precedingText) {
    state.displayLog.push({ type: 'message', role: 'assistant', content: precedingText });
  }
  state.messages.push({
    role:       'assistant',
    content:    precedingText || null,
    tool_calls: calls.map(tc => ({
      id:       tc.id,
      type:     'function',
      function: { name: tc.function.name, arguments: tc.function.arguments },
    })),
  });

  const decisions = await showToolConfirmation(calls);

  for (let i = 0; i < calls.length; i++) {
    const tc     = calls[i];
    const result = decisions[i] ? await executeTool(tc) : 'Tool execution denied by user.';
    appendToolResult(tc.function.name, result);
    state.displayLog.push({ type: 'tool_result', name: tc.function.name, result });
    state.messages.push({ role: 'tool', tool_call_id: tc.id, content: result });
  }

  // Re-enter the loop so the model can respond to tool results.
  await runChatLoop();
}
