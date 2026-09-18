'use strict';

const OrgFlow = require('../../js/orgflow-core.js');

const MAX_BYTES = 12 * 1024 * 1024;
const PALETTES = ['indigo', 'crimson', 'graphite', 'ocean', 'emerald'];

function sanitizeLogo(logo) {
  if (!logo) return null;
  if (typeof logo !== 'object') throw new Error('Invalid logo.');
  if (typeof logo.data !== 'string' || logo.data.length > 400000 || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(logo.data)) {
    throw new Error('Logos must be small PNG data URLs.');
  }
  return {
    data: logo.data,
    name: String(logo.name || 'logo.png').slice(0, 80),
    surface: ['light', 'dark', 'auto'].includes(logo.surface) ? logo.surface : 'auto',
    width: Number.isFinite(logo.width) ? logo.width : 0,
    height: Number.isFinite(logo.height) ? logo.height : 0
  };
}

function cleanBranding(input) {
  const b = input && typeof input === 'object' ? input : {};
  return {
    companyName: OrgFlow.cleanString(b.companyName || '', 'Company name', 120),
    chartTitle: OrgFlow.cleanString(b.chartTitle || 'Organization chart', 'Chart title', 120, true),
    logo: sanitizeLogo(b.logo),
    darkLogo: sanitizeLogo(b.darkLogo),
    includeExports: b.includeExports !== false,
    footer: OrgFlow.cleanString(b.footer || '', 'Footer', 200)
  };
}

function validateDocument(input, rawBytes = 0) {
  if (rawBytes > MAX_BYTES) throw new Error('Workspace file is too large (12 MB maximum).');
  if (!input || input.format !== 'orgflow.workspace' || ![1, 2, 3].includes(input.version)) {
    throw new Error('This is not a supported OrgFlow workspace backup.');
  }
  const planning = OrgFlow.validatePlanning(input.version === 1 ? OrgFlow.migrateLegacy(input.people) : input.planning);
  const branding = cleanBranding(input.branding);
  const palette = PALETTES.includes(input.palette) ? input.palette : (input.palette === 'audi' ? 'crimson' : 'indigo');
  return {
    format: 'orgflow.workspace',
    version: OrgFlow.DOCUMENT_VERSION,
    exportedAt: typeof input.exportedAt === 'string' ? input.exportedAt.slice(0, 40) : new Date().toISOString(),
    planning,
    branding,
    theme: input.theme === 'dark' ? 'dark' : 'light',
    palette,
    view: OrgFlow.sanitizeViewState(input.view, planning, new Date().toISOString().slice(0,10))
  };
}

function emptyDocument(today = new Date().toISOString().slice(0, 10)) {
  return {
    format: 'orgflow.workspace',
    version: OrgFlow.DOCUMENT_VERSION,
    exportedAt: new Date().toISOString(),
    planning: OrgFlow.emptyWorkspace(today),
    branding: {
      companyName: '',
      chartTitle: 'Organization chart',
      logo: null,
      darkLogo: null,
      includeExports: true,
      footer: ''
    },
    theme: 'light',
    palette: 'indigo',
    view: {}
  };
}

module.exports = { MAX_BYTES, validateDocument, emptyDocument, cleanBranding };
