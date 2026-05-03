// Thin HTTP client. JSON helpers return parsed payloads; stream() returns raw Response.

const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function request(url, { method = 'GET', body, signal } = {}) {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : JSON_HEADERS,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  return response.json();
}

export const api = {
  get:    url => request(url),
  post:   (url, body, options = {}) => request(url, { method: 'POST', body, signal: options.signal }),
  put:    (url, body) => request(url, { method: 'PUT', body }),
  delete: url => request(url, { method: 'DELETE' }),

  stream(url, body, options = {}) {
    return fetch(url, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
      signal: options.signal,
    });
  },
};
