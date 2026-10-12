/** Sign-in pop-up for the Teams tab when single sign-on is unavailable: start → company sign-in → end,
 *  which hands a signed OrgFlow session back to the tab. The session never leaves this origin otherwise. */
(function () {
  'use strict';
  const step = document.body.dataset.step, out = document.getElementById('message');
  const say = text => { out.textContent = text; };
  async function run() {
    await window.microsoftTeams.app.initialize();
    if (step === 'start') { location.href = '/auth/login?return=' + encodeURIComponent('/teams/auth-end.html'); return; }
    const res = await fetch('/auth/session-token', { method: 'POST', credentials: 'same-origin', headers: { accept: 'application/json' } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { say(body.error || 'Sign-in did not complete.'); window.microsoftTeams.authentication.notifyFailure(body.error || 'Sign-in did not complete.'); return; }
    say('Signed in. You can close this window.');
    window.microsoftTeams.authentication.notifySuccess(body.sessionToken);
  }
  run().catch(error => { say('Open OrgFlow from Microsoft Teams to use this page. ' + (error.message || '')); });
})();
