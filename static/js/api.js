// Thin HTTP client — all methods return parsed JSON.
// `stream` is the exception: it returns the raw Response so the caller
// can read the SSE body incrementally.

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const api = {
  async get(url) {
    return (await fetch(url)).json();
  },

  async post(url, body, options = {}) {
    return (await fetch(url, {
      method:  'POST',
      headers: JSON_HEADERS,
      body:    JSON.stringify(body),
      signal:  options.signal,
    })).json();
  },

  async put(url, body) {
    return (await fetch(url, {
      method:  'PUT',
      headers: JSON_HEADERS,
      body:    JSON.stringify(body),
    })).json();
  },

  async delete(url) {
    return (await fetch(url, { method: 'DELETE' })).json();
  },

  /** Returns a raw Response whose body is an SSE stream. */
  stream(url, body, options = {}) {
    return fetch(url, {
      method:  'POST',
      headers: JSON_HEADERS,
      body:    JSON.stringify(body),
      signal:  options.signal,
    });
  },
};
