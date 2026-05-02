// MCP server config and tool management.

import { api }     from './api.js';
import { state }   from './state.js';
import { storage } from './storage.js';
import { STORAGE_KEYS } from './state.js';
import { escapeHtml }   from './renderer.js';
import { showStatus, showToast } from './ui.js';

export async function loadMcpConfig() {
  const cfg = await api.get('/api/mcp/config');
  document.getElementById('mcp-config-editor').value = JSON.stringify(cfg, null, 2);
}

export async function saveMcpConfig() {
  try {
    const cfg = JSON.parse(document.getElementById('mcp-config-editor').value);
    await api.post('/api/mcp/config', cfg);
    showStatus('mcp-status', 'Config saved ✓', 'ok');
    showToast('MCP config saved');
  } catch (err) {
    showStatus('mcp-status', `Invalid JSON: ${err.message}`, 'err');
  }
}

export function loadCachedTools() {
  const cached = storage.get(STORAGE_KEYS.mcpTools);
  if (cached?.length) {
    state.mcpTools = cached;
    renderToolList();
  }
}


export async function reloadTools() {
  showStatus('mcp-status', 'Loading tools…', 'ok');
  try {
    state.mcpTools = await api.get('/api/mcp/tools');
    storage.set(STORAGE_KEYS.mcpTools, state.mcpTools);
    renderToolList();
    showStatus('mcp-status', `${state.mcpTools.length} tool(s) loaded ✓`, 'ok');
    showToast(`${state.mcpTools.length} tool(s) loaded`);
  } catch (err) {
    showStatus('mcp-status', `Error loading tools: ${err.message}`, 'err');
  }
}

export function renderToolList() {
  const container = document.getElementById('tool-list');
  if (!state.mcpTools.length) {
    container.innerHTML = '<div class="no-tools-label">No tools available</div>';
    return;
  }
  container.innerHTML = state.mcpTools.map(tool => `
    <div class="tool-card">
      <div class="tool-card-header">
        <span class="tool-card-name">${escapeHtml(tool.name)}</span>
        <span class="tool-card-server">${escapeHtml(tool.server)}</span>
      </div>
      <div class="tool-card-desc">${escapeHtml(tool.description)}</div>
    </div>`).join('');
}

export async function executeTool(tc) {
  const toolDef = state.mcpTools.find(t => t.name === tc.function.name);
  if (!toolDef) return 'Tool not found in any MCP server.';
  let args = {};
  try { args = JSON.parse(tc.function.arguments || '{}'); } catch {}
  try {
    const data = await api.post('/api/mcp/call', { server: toolDef.server, tool: tc.function.name, arguments: args });
    return data.result || data.error || '';
  } catch (err) {
    return `Error: ${err.message}`;
  }
}