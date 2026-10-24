// Runs before the page is drawn (a plain script in <head>): puts back the last theme used on this device,
// so a dark-mode user never sees a flash of the light theme. js/theme.js takes over once the app starts.
try {
  if (localStorage.getItem('taskflow-theme') === 'dark') {
    document.documentElement.dataset.theme = 'dark';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#0E1014');
  }
} catch (e) {}
