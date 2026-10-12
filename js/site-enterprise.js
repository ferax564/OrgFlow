(function () {
  fetch('/api/meta', { headers: { accept: 'application/json' } })
    .then(r => r.ok ? r.json() : null)
    .then(meta => {
      if (!meta || !meta.enterprise) return;
      document.documentElement.dataset.host = 'enterprise';
      const isDev = meta.auth === 'dev';

      document.querySelectorAll('a[href="app.html"]').forEach(a => {
        a.setAttribute('href', 'login.html');
        if (/open/i.test(a.textContent)) a.textContent = 'Sign in';
      });

      const setText = (sel, text) => {
        const el = document.querySelector(sel);
        if (el) el.textContent = text;
      };

      setText('.kicker', isDev
        ? 'Local enterprise host · no Keycloak'
        : 'Shared enterprise host');
      setText('.hero-note', isDev
        ? 'This host is the local enterprise app. Keycloak is not required — sign in with any email. The first person becomes admin.'
        : 'This host is the shared enterprise app. Sign in to open the planner. Access is decided after login.');
      setText('#how .section-copy', 'The planner is behind sign-in on this host. Members load one shared workspace. Roles and optional subtree scope decide what each person can see and save.');
      setText('#run .section-title', 'You are on the enterprise host');
      setText('#run .section-copy', isDev
        ? 'This URL is the optional Node host (AUTH_MODE=dev), not GitHub Pages. Sign in with any email. The first person is always admin.'
        : 'This URL is the optional Node host, not GitHub Pages. Sign in; an admin grants access.');
      const modes = document.querySelector('.modes');
      if (modes) modes.hidden = true;
      const liveRow = document.querySelector('.live-row');
      if (liveRow) liveRow.hidden = true;
      setText('.privacy h2', 'Access is decided after sign-in.');
      setText('.privacy p', 'This enterprise host stores the workspace in SQLite on the server. Sign-in, roles and subtree scope decide who can load, save or export.');
      setText('.cta-band h2', 'Sign in to the planner.');
      setText('.cta-band p', 'Open the shared workspace on this host. Export still follows your member permissions.');
    })
    .catch(() => {});
})();
