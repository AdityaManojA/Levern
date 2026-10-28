// Runs before the page is drawn (a plain script in <head>): puts back the last theme used on this device,
// so a dark-mode user never sees a flash of the light theme. js/theme.js takes over once the app starts.
try {
  const t = localStorage.getItem('taskflow-theme');
  if (t === 'dark' || t === 'mono' || t === 'mono-dark' || t === 'mono-light') {
    const want = (t === 'mono-dark') ? 'mono-dark' : (t === 'mono-light' ? 'mono' : t);
    document.documentElement.dataset.theme = want;
    const color = (want === 'dark') ? '#0E1014' : (want === 'mono-dark' ? '#121212' : '#F5F5F4');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  }
} catch (e) {}
