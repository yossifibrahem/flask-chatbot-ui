// Inline icons kept in one place so renderers stay focused on behavior.

const icon = (body, attrs = '') => `<svg ${attrs} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS = {
  user: icon('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
  ai: icon('<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>'),
  tool: icon('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>'),
  info: icon('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'),
  check: icon('<polyline points="20 6 9 17 4 12"/>', 'stroke-width="2.5"'),
  close: icon('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>', 'stroke-width="2.5"'),
  copy: icon('<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  chevronRight: icon('<polyline points="9 18 15 12 9 6"/>', 'width="10" height="10" stroke-width="2.5"'),
  chevronDown: icon('<polyline points="6 9 12 15 18 9"/>', 'width="10" height="10" stroke-width="2.5"'),
  brain: icon('<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12c0 1.5.5 2 1 3h6c.5-1 1-1.5 1-3a7 7 0 0 0-4-12z"/>', 'width="13" height="13"'),
  toolSmall: icon('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>', 'width="13" height="13"'),
  edit: icon('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>'),
  refresh: icon('<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>'),
};
