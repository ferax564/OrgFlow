'use strict';
const readonly = names => Object.fromEntries(names.split(/\s+/).filter(Boolean).map(name=>[name,'readonly']));
module.exports = [
  { ignores:['node_modules/**','dist*/**','out/**','test-results/**','examples/**'] },
  { files:['js/**/*.js','server/**/*.js','desktop/**/*.cjs','scripts/**/*.cjs','tests/**/*.cjs'],
    languageOptions:{ecmaVersion:2023,sourceType:'script'},
    rules:{'constructor-super':'error','for-direction':'error','no-const-assign':'error','no-dupe-args':'error','no-dupe-class-members':'error','no-dupe-keys':'error','no-empty-pattern':'error','no-func-assign':'error','no-invalid-regexp':'error','no-setter-return':'error','no-this-before-super':'error','no-unreachable':'error','no-unsafe-finally':'error','no-unsafe-negation':'error','use-isnan':'error','valid-typeof':'error'} },
  { files:['server/**/*.js','desktop/**/*.cjs','scripts/**/*.cjs','tests/**/*.cjs','js/management-core.js','js/persistence.js','js/orgflow-core.js'],
    languageOptions:{globals:readonly('module require exports __dirname __filename process Buffer console global globalThis structuredClone crypto fetch URL URLSearchParams TextEncoder TextDecoder Blob File AbortController setTimeout clearTimeout setInterval clearInterval setImmediate clearImmediate performance')},
    rules:{'no-undef':'error'} },
  { files:['scripts/browser-qa.cjs','scripts/smoke.cjs','scripts/generate-examples.cjs'],
    languageOptions:{globals:readonly('window document navigator localStorage sessionStorage Image FileReader requestAnimationFrame alert confirm getComputedStyle OrgFlow workspace activeScenario people branding cardDisplay currentView render setView openDrawer closeDialog openDialog updateScenario replaceWorkspace emptyWorkspace today selectedIds syncBulkBar toggleSelected exportWorkspace')},
    rules:{'no-undef':'off'} }
];
