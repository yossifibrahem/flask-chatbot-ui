// Defaults applied both on first load and when resetting settings.
export const SETTINGS_DEFAULTS = {
  apiBase:      'https://api.openai.com/v1',
  apiKey:       '',
  model:        '',
  systemPrompt: '',
};

export const CUSTOMIZATION_DEFAULTS = {
  sidebarDefaultOpen:    true,
  showSuggestionChips:   true,
  showTimestamps:        true,
  blocksDefaultExpanded: false,
  fontSize:              'medium',   // 'small' | 'medium' | 'large'
  accentColor:           '#c9a96e',  // original gold
};

export const STORAGE_KEYS = {
  settings:          'lumen_settings',
  mcpTools:          'lumen_mcp_tools',
  mcpServerSettings: 'lumen_mcp_server_settings',
  models:            'lumen_models',
  lastConv:          'lumen_last_conv',
  sidebar:           'lumen_sidebar',
  customization:     'lumen_customization',
};

// Single mutable state object shared across all modules.
export const state = {
  convId:            null,
  messages:          [],   // OpenAI API message history
  displayLog:        [],   // Serialisable render log (messages + tool results)
  mcpTools:          [],
  // Per-server settings: { [serverName]: { enabled: bool, autoApprove: bool } }
  mcpServerSettings: {},
  isStreaming:       false,
  streamId:          null,
  ...SETTINGS_DEFAULTS,
  ...CUSTOMIZATION_DEFAULTS,
};