// Defaults applied both on first load and when resetting settings.
export const SETTINGS_DEFAULTS = {
  apiBase:      'https://api.openai.com/v1',
  apiKey:       '',
  model:        '',
  systemPrompt: '',
};

export const STORAGE_KEYS = {
  settings: 'lumen_settings',
  mcpTools: 'lumen_mcp_tools',
  models:   'lumen_models',
  lastConv: 'lumen_last_conv',
  sidebar:  'lumen_sidebar',
};

// Single mutable state object shared across all modules.
export const state = {
  convId:      null,
  messages:    [],   // OpenAI API message history
  displayLog:  [],   // Serialisable render log (messages + tool results)
  mcpTools:    [],
  isStreaming: false,
  streamId:    null,
  ...SETTINGS_DEFAULTS,
};
