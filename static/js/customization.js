// Customization — UI preferences persisted to localStorage.

import { state, CUSTOMIZATION_DEFAULTS, STORAGE_KEYS } from './state.js';
import { storage } from './storage.js';
import { showToast } from './ui.js';

// ── Apply ─────────────────────────────────────────────────────────────────────
// Reads from `state` and pushes every setting into the live DOM.
// Called on boot (after load) and immediately on every control change.

export function applyCustomization() {
  // Font size
  const sizes = { small: '13px', medium: '15px', large: '17px' };
  document.documentElement.style.setProperty('--font-size-base', sizes[state.fontSize] || sizes.medium);

  // Accent color — update all derived CSS variables
  _applyAccent(state.accentColor || CUSTOMIZATION_DEFAULTS.accentColor);

  // Timestamps visibility
  document.documentElement.classList.toggle('hide-timestamps', !state.showTimestamps);

  // Suggestion chips visibility
  document.documentElement.classList.toggle('hide-suggestion-chips', !state.showSuggestionChips);
}

function _applyAccent(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return;
  document.documentElement.style.setProperty('--accent',            hex);
  document.documentElement.style.setProperty('--accent-dim',        `rgba(${rgb},0.12)`);
  document.documentElement.style.setProperty('--accent-glow',       `rgba(${rgb},0.06)`);
  document.documentElement.style.setProperty('--accent-border',     `rgba(${rgb},0.4)`);
  document.documentElement.style.setProperty('--accent-border-dim', `rgba(${rgb},0.25)`);
}

// ── Load ──────────────────────────────────────────────────────────────────────

export function loadCustomization() {
  // Merge: defaults first, then saved values overwrite them
  const saved = storage.get(STORAGE_KEYS.customization, {});
  Object.assign(state, { ...CUSTOMIZATION_DEFAULTS, ...saved });
  applyCustomization();
  syncCustomizationUI();
}

// ── Save ──────────────────────────────────────────────────────────────────────

export function saveCustomization() {
  // Flush DOM → state
  _readControlsIntoState();

  // Persist
  storage.set(STORAGE_KEYS.customization, {
    sidebarDefaultOpen:  state.sidebarDefaultOpen,
    showSuggestionChips: state.showSuggestionChips,
    showTimestamps:      state.showTimestamps,
    fontSize:            state.fontSize,
    accentColor:         state.accentColor,
    charWarnThreshold:   state.charWarnThreshold,
  });

  applyCustomization();
  showToast('Customization saved');
}

// ── Reset ─────────────────────────────────────────────────────────────────────

export function resetCustomization() {
  Object.assign(state, CUSTOMIZATION_DEFAULTS);
  storage.remove(STORAGE_KEYS.customization);
  applyCustomization();
  syncCustomizationUI();
  showToast('Customization reset to defaults');
}

// ── Init live listeners ───────────────────────────────────────────────────────
// Every control immediately updates state + applies to DOM so changes are
// visible before the user clicks Save. Save only persists to localStorage.

export function initSwatchPicker() {
  // Toggles — update state + apply immediately on change
  _liveToggle('cust-sidebar-open',    v => { state.sidebarDefaultOpen  = v; });
  _liveToggle('cust-suggestion-chips',v => { state.showSuggestionChips = v; applyCustomization(); });
  _liveToggle('cust-timestamps',      v => { state.showTimestamps       = v; applyCustomization(); });

  // Font size select — apply immediately
  const fsEl = document.getElementById('cust-font-size');
  if (fsEl) {
    fsEl.addEventListener('change', () => {
      state.fontSize = fsEl.value;
      applyCustomization();
    });
  }

  // Char warn threshold — update state immediately (no visual effect until next keystroke)
  const warnEl = document.getElementById('cust-char-warn');
  if (warnEl) {
    warnEl.addEventListener('input', () => {
      state.charWarnThreshold = parseInt(warnEl.value, 10) || 3000;
    });
  }

  // Colour swatches — live preview + state update
  document.querySelectorAll('.cust-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      document.querySelectorAll('.cust-swatch').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
      state.accentColor = sw.dataset.color;
      _applyAccent(sw.dataset.color);
    });
  });
}

// ── Sync UI controls → current state (called on load and reset) ───────────────

function syncCustomizationUI() {
  _setCheckbox('cust-sidebar-open',    state.sidebarDefaultOpen);
  _setCheckbox('cust-suggestion-chips',state.showSuggestionChips);
  _setCheckbox('cust-timestamps',      state.showTimestamps);

  const fs = document.getElementById('cust-font-size');
  if (fs) fs.value = state.fontSize;

  const warn = document.getElementById('cust-char-warn');
  if (warn) warn.value = state.charWarnThreshold;

  document.querySelectorAll('.cust-swatch').forEach(sw => {
    sw.classList.toggle('active', sw.dataset.color === state.accentColor);
  });
}

// ── Read DOM controls → state (used by saveCustomization) ────────────────────

function _readControlsIntoState() {
  state.sidebarDefaultOpen  = document.getElementById('cust-sidebar-open')?.checked  ?? state.sidebarDefaultOpen;
  state.showSuggestionChips = document.getElementById('cust-suggestion-chips')?.checked ?? state.showSuggestionChips;
  state.showTimestamps      = document.getElementById('cust-timestamps')?.checked    ?? state.showTimestamps;
  state.fontSize            = document.getElementById('cust-font-size')?.value       ?? state.fontSize;
  state.charWarnThreshold   = parseInt(document.getElementById('cust-char-warn')?.value, 10) || state.charWarnThreshold;

  const activeSwatch = document.querySelector('.cust-swatch.active');
  if (activeSwatch) state.accentColor = activeSwatch.dataset.color;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _liveToggle(id, onChange) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('change', () => onChange(el.checked));
}

function _setCheckbox(id, value) {
  const el = document.getElementById(id);
  if (el) el.checked = !!value;
}

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? `${parseInt(m[1],16)},${parseInt(m[2],16)},${parseInt(m[3],16)}` : null;
}
