(function () {
  fetch('/api/meta', { headers: { accept: 'application/json' } })
    .then(r => r.ok ? r.json() : null)
    .then(meta => {
      if (!meta || !meta.enterprise) return;
      document.querySelectorAll('a[href="app.html"]').forEach(a => {
        a.setAttribute('href', 'login.html');
        if (/open/i.test(a.textContent)) a.textContent = 'Sign in';
      });
      const note = document.querySelector('.hero-note');
      if (note) {
        note.textContent = meta.auth === 'dev'
          ? 'This host is the local enterprise app. Keycloak is not required — sign in with any email. The first person becomes admin.'
          : 'This host is the shared enterprise app. Sign in to open the planner. Access is decided after login.';
      }
    })
    .catch(() => {});
})();
