// Applies the saved theme before first paint, so the page never flashes the
// wrong one. It lives in its own file rather than inline in index.html because
// the API serves the built app under a Content-Security-Policy of
// `script-src 'self'`, which blocks inline scripts — a difference that only
// shows up in a deployed build, never in development.
try {
  const saved = localStorage.getItem('theme');
  const dark = saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', dark);
} catch {
  // Private mode or blocked storage: the default theme is fine.
}
