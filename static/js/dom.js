// DOM helpers shared by UI modules.

export const $ = (selector, root = document) => root.querySelector(selector);

export function createElement(tag, { className = '', html = '', text = '', attrs = {} } = {}) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (html) element.innerHTML = html;
  if (text) element.textContent = text;
  Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

export function setVisible(element, visible, display = 'block') {
  if (element) element.style.display = visible ? display : 'none';
}

export function remove(selectorOrElement, root = document) {
  const element = typeof selectorOrElement === 'string' ? $(selectorOrElement, root) : selectorOrElement;
  element?.remove();
}

