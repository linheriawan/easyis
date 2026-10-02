// flash messages — a notification set right before a redirect (e.g. "form
// submitted successfully") has to survive to the very next request, and
// that next request is a fresh browser-initiated GET with no JS of ours
// running in between — localStorage never enters the picture, since
// nothing client-side reads or writes it. a cookie is the only thing that
// actually crosses that gap: set it on the redirect response, read it (and
// clear it) on the request that follows, so a message shows exactly once.

function parseCookies(req) {
  const header = req.headers.get('cookie') ?? '';
  const cookies = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    cookies[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return cookies;
}

// read the pending messages a previous request left for this one. never
// throws on a malformed/tampered cookie — worst case is just no messages.
export function read(req) {
  const raw = parseCookies(req).flash;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Max-Age=30 is a generous window for "redirect happens basically
// immediately" — long enough to survive a slow network hop, short enough
// that a message never lingers past the page it was meant for.
export function setHeader(messages) {
  return `flash=${encodeURIComponent(JSON.stringify(messages))}; Path=/; Max-Age=30`;
}

// clears the cookie the moment it's been read, so a page reload (or any
// later request) doesn't show the same message again.
export function clearHeader() {
  return 'flash=; Path=/; Max-Age=0';
}
