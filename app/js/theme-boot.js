// Runs before the page is drawn (a plain script in <head>): puts back the last theme used on this device,
// so a dark-mode user never sees a flash of the light theme. js/theme.js takes over once the app starts.
try {
  const t = localStorage.getItem('taskflow-theme');
  if (t === 'dark' || t === 'mono') {
    document.documentElement.dataset.theme = t;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#0E1014' : '#F5F5F4');
  }
} catch (e) {}
