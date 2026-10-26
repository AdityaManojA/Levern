// The phone's back button and back gesture close what's open first: the bottom sheet (New quest, quick menus), the
// reminders panel and dialogs. Each one, as it opens, adds a step to the browser's history (same address), so
// "back" lands on that step and closes it instead of leaving the page. Closing it any other way (Close, a tap
// outside, a swipe) takes the step back out, so the next "back" goes to the previous page as before.
// The overlays are watched (their open class or attribute), so none of the code that opens them has to know.
const stack = [];   // what's open, oldest first: { el, close }
let skip = 0;       // our own history.back() calls, whose popstate isn't the person pressing back

function opened(el, close) {
  if (stack.some(o => o.el === el)) return;
  stack.push({ el, close });
  history.pushState({ tfBack: true }, '');
}
function closed(el) {
  const i = stack.findIndex(o => o.el === el);
  if (i < 0) return;   // already closed by "back"
  stack.splice(i, 1);
  // take our step out of the history, unless the page has moved on since (a link inside it was followed)
  if (history.state?.tfBack) { skip++; history.back(); }
}

addEventListener('popstate', () => {
  if (skip) { skip--; return; }
  const top = stack.pop();
  if (top) top.close();
});
// following a link from inside a sheet: the page changes, so nothing open belongs to the new page's history
addEventListener('hashchange', () => { if (!history.state?.tfBack) stack.length = 0; });

// panels: { el, isOpen(el), close() }; dialogs (<dialog>) anywhere are found by their open attribute
export function startBack(panels) {
  const watch = new MutationObserver(records => {
    for (const r of records) {
      const el = r.target;
      if (el.tagName === 'DIALOG') { el.open ? opened(el, () => el.close()) : closed(el); continue; }
      const p = panels.find(x => x.el === el);
      if (p) p.isOpen(el) ? opened(el, p.close) : closed(el);
    }
  });
  panels.forEach(p => watch.observe(p.el, { attributes: true, attributeFilter: ['class'] }));
  watch.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
}
