import fs from 'fs/promises';
import path from 'path';
import * as cheerio from 'cheerio';
import { assertInsideRoot } from '../compiler/schema.mjs';

function jsModuleExport(name, value) {
  return `export const ${name} = ${JSON.stringify(value, null, 2)};\n`;
}

async function writeText(root, relative, content) {
  const target = assertInsideRoot(root, path.join(root, relative));
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
  return relative.split(path.sep).join('/');
}

function buildIndex(shellHtml) {
  const $ = cheerio.load(shellHtml || '<!doctype html><html><head></head><body></body></html>');
  $('script').remove();
  $('link[rel~="stylesheet"]').remove();
  $('link[data-aspirator-runtime]').remove();
  for (const href of [
    './styles/tokens.css',
    './styles/base.css',
    './styles/layout.css',
    './styles/components.css',
  ]) {
    $('head').append(`<link data-aspirator-runtime rel="stylesheet" href="${href}">`);
  }
  $('body').append('<script type="module" src="./app.js"></script>');
  return `<!doctype html>\n${$('html').toString()}\n`;
}

function runtimeSource(representativePageId) {
  return `import { components } from './components/registry.js';
import { pages, schema, excludedPageIds } from './data/registry.js';

const params = new URLSearchParams(location.search);
const requestedPageId = params.get('page');
const pageId = requestedPageId && pages[requestedPageId] ? requestedPageId : ${JSON.stringify(representativePageId)};
const pageData = pages[pageId] || {};

document.documentElement.dataset.aspiratorPageId = pageId;

for (const slot of document.querySelectorAll('[data-aspirator-component]')) {
  const id = slot.getAttribute('data-aspirator-component');
  const occurrence = slot.getAttribute('data-aspirator-occurrence');
  const entry = components[id];
  const markup = typeof entry === 'string'
    ? entry
    : (entry && occurrence != null ? entry[occurrence] : null) || (entry ? Object.values(entry)[0] : null);
  if (!markup) continue;
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  slot.replaceWith(template.content.cloneNode(true));
}

for (const node of document.querySelectorAll('[data-aspirator-bind]')) {
  const key = node.getAttribute('data-aspirator-bind');
  if (key && Object.prototype.hasOwnProperty.call(pageData, key)) node.textContent = String(pageData[key] ?? '');
}

for (const node of document.querySelectorAll('[data-aspirator-bind-attr]')) {
  const bindings = String(node.getAttribute('data-aspirator-bind-attr') || '').split(',');
  for (const binding of bindings) {
    const [attribute, key] = binding.split(':').map((part) => part.trim());
    if (attribute && key && Object.prototype.hasOwnProperty.call(pageData, key)) node.setAttribute(attribute, String(pageData[key] ?? ''));
  }
}

if (pageData.title) document.title = String(pageData.title);
else if (pageData.heading) document.title = String(pageData.heading);

document.addEventListener('click', (event) => {
  const anchor = event.target.closest('a[href]');
  if (!anchor) return;
  const href = anchor.getAttribute('href') || '';
  if (!href.startsWith('/') || href.startsWith('//')) return;
  if (window.parent !== window) {
    event.preventDefault();
    window.parent.postMessage({ type: 'aspirator:navigate', route: href }, '*');
  }
});

window.__ASPIRATOR_REBUILD__ = { pageId, pageData, schema, excludedPageIds };
`;
}

function buildComponentMap(components) {
  const grouped = {};
  for (const component of components) {
    if (!component?.componentId || typeof component.markup !== 'string') continue;
    const id = component.componentId;
    const index = Number.isInteger(component.occurrenceIndex) ? String(component.occurrenceIndex) : null;
    if (index == null && grouped[id] == null) {
      grouped[id] = component.markup;
      continue;
    }
    if (typeof grouped[id] === 'string') grouped[id] = { default: grouped[id] };
    if (!grouped[id] || typeof grouped[id] !== 'object') grouped[id] = {};
    grouped[id][index ?? 'default'] = component.markup;
  }
  return grouped;
}

export async function buildVanillaRuntime({
  rebuildRoot,
  archetype,
  shellHtml,
  components = [],
  data = { schema: [], pages: {}, excludedPageIds: [] },
  styles = {},
} = {}) {
  if (!rebuildRoot) throw new Error('rebuildRoot is required');
  if (!archetype?.id || !archetype?.representativePageId) throw new Error('archetype id and representativePageId are required');
  const root = path.resolve(rebuildRoot);
  await fs.mkdir(root, { recursive: true });

  const componentMap = buildComponentMap(components);
  const generatedFiles = [];
  generatedFiles.push(await writeText(root, 'styles/tokens.css', styles.tokensCss || ''));
  generatedFiles.push(await writeText(root, 'styles/base.css', styles.baseCss || ''));
  generatedFiles.push(await writeText(root, 'styles/layout.css', styles.layoutCss || ''));
  generatedFiles.push(await writeText(root, 'styles/components.css', styles.componentsCss || ''));
  generatedFiles.push(await writeText(root, 'components/registry.js', jsModuleExport('components', componentMap)));
  generatedFiles.push(await writeText(root, 'data/registry.js', [
    jsModuleExport('pages', data.pages || {}),
    jsModuleExport('schema', data.schema || []),
    jsModuleExport('excludedPageIds', data.excludedPageIds || []),
  ].join('\n')));
  generatedFiles.push(await writeText(root, 'data/archetype.json', `${JSON.stringify({
    id: archetype.id,
    representativePageId: archetype.representativePageId,
    pageIds: archetype.pageIds || Object.keys(data.pages || {}),
  }, null, 2)}\n`));

  for (const pageId of Object.keys(data.pages || {}).sort()) {
    generatedFiles.push(await writeText(root, `data/pages/${pageId}.json`, `${JSON.stringify(data.pages[pageId], null, 2)}\n`));
  }

  generatedFiles.push(await writeText(root, 'app.js', runtimeSource(archetype.representativePageId)));
  generatedFiles.push(await writeText(root, 'index.html', buildIndex(shellHtml)));

  generatedFiles.sort();
  return { generatedFiles, entry: 'index.html' };
}
