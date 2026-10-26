// Old address → getlevern.web.app, keeping the path, query and #route (TaskFlow is now Levern).
// A separate file because the site's CSP blocks inline scripts.
(function () {
  var to = 'https://getlevern.web.app' + location.pathname + location.search + location.hash;
  location.replace(to);
  document.addEventListener('DOMContentLoaded', function () { var a = document.getElementById('to'); if (a) a.href = to; });
})();
