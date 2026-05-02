// MCP server config and tool management.

import { api }     from './api.js';
import { state }   from './state.js';
import { storage } from './storage.js';
import { STORAGE_KEYS } from './state.js';
import { escapeHtml }   from './renderer.js';
import { showStatus, showToast } from './ui.js';

// ── Server settings helpers ───────────────────────────────────────────────────

function loadServerSettings() {
  state.mcpServerSettings = storage.get(STORAGE_KEYS.mcpServerSettings, {});
}

function saveServerSettings() {
  storage.set(STORAGE_KEYS.mcpServerSettings, state.mcpServerSettings);
}

function getServerSetting(serverName) {
  if (!state.mcpServerSettings[serverName]) {
    state.mcpServerSettings[serverName] = { enabled: true, autoApprove: false };
  }
  return state.mcpServerSettings[serverName];
}

/** Returns true if the server is enabled (tools should be sent to the model). */
export function isServerEnabled(serverName) {
  return getServerSetting(serverName).enabled !== false;
}

/** Returns true if tool calls from this server should be auto-approved. */
export function isServerAutoApprove(serverName) {
  return getServerSetting(serverName).autoApprove === true;
}

// ── Config ────────────────────────────────────────────────────────────────────

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

// ── Tool loading ──────────────────────────────────────────────────────────────

export function loadCachedTools() {
  loadServerSettings();
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

// ── Render ────────────────────────────────────────────────────────────────────

export function renderToolList() {
  loadServerSettings();
  const container = document.getElementById('tool-list');
  if (!state.mcpTools.length) {
    container.innerHTML = '<div class="no-tools-label">No tools loaded — click Reload Tools</div>';
    return;
  }

  // Group tools by server name
  const byServer = {};
  for (const tool of state.mcpTools) {
    if (!byServer[tool.server]) byServer[tool.server] = [];
    byServer[tool.server].push(tool);
  }

  container.innerHTML = Object.entries(byServer).map(([server, tools]) => {
    const s           = getServerSetting(server);
    const enabledCls  = s.enabled     ? 'mcp-toggle-on' : '';
    const approveCls  = s.autoApprove ? 'mcp-toggle-on' : '';
    const disabledCls = s.enabled     ? '' : ' server-disabled';

    return `
    <div class="server-group${disabledCls}" data-server="${escapeHtml(server)}">
      <div class="server-group-header">
        <span class="server-group-name">${escapeHtml(server)}</span>
        <div class="server-group-controls">
          <label class="mcp-toggle-label" title="Enable / disable all tools from this server">
            <span class="mcp-toggle-text">Enabled</span>
            <button class="mcp-toggle ${enabledCls}" data-server="${escapeHtml(server)}" data-action="enabled"
                    aria-pressed="${s.enabled}" aria-label="Toggle server enabled">
              <span class="mcp-toggle-thumb"></span>
            </button>
          </label>
          <label class="mcp-toggle-label" title="Auto-approve tool calls from this server without confirmation">
            <span class="mcp-toggle-text">Auto-approve</span>
            <button class="mcp-toggle ${approveCls}" data-server="${escapeHtml(server)}" data-action="autoApprove"
                    aria-pressed="${s.autoApprove}" aria-label="Toggle auto-approve">
              <span class="mcp-toggle-thumb"></span>
            </button>
          </label>
        </div>
      </div>
      <div class="server-tools">
        ${tools.map(tool => `
          <div class="tool-card">
            <div class="tool-card-header">
              <span class="tool-card-name">${escapeHtml(tool.name)}</span>
            </div>
            <div class="tool-card-desc">${escapeHtml(tool.description)}</div>
          </div>`).join('')}
      </div>
    </div>`;
  }).join('');

  // Wire up toggle buttons
  container.querySelectorAll('.mcp-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const server  = btn.dataset.server;
      const action  = btn.dataset.action;
      const setting = getServerSetting(server);
      setting[action] = !setting[action];
      saveServerSettings();
      renderToolList();
    });
  });
}

// ── Tool execution ────────────────────────────────────────────────────────────

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