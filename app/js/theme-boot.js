// Runs before the page is drawn (a plain script in <head>): puts back the last theme used on this device,
// so a dark-mode user never sees a flash of the light theme. js/theme.js takes over once the app starts.
try {
  const d = new Date(), y = d.getFullYear();
  // Halloween week (31 Oct to 6 Nov) is everyone's default unless they switched it off this year (see js/theme.js)
  const halloween = d >= new Date(y, 9, 31) && d < new Date(y, 10, 7) && localStorage.getItem('taskflow-halloween-off') !== String(y);
  const t = halloween ? 'dark' : localStorage.getItem('taskflow-theme');
  const valid = ['dark', 'mono', 'mono-dark', 'mono-light', 'mono-light-accent', 'mono-dark-accent'];
  if (valid.includes(t)) {
    const want = (t === 'mono-light') ? 'mono' : t;
    document.documentElement.dataset.theme = want;
    if (halloween) document.documentElement.dataset.season = 'halloween';
    const color = halloween ? '#120D1A' : (want === 'dark') ? '#0E1014' : (want === 'mono-dark' || want === 'mono-dark-accent') ? '#121212' : '#F5F5F4';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  }
} catch (e) {}
