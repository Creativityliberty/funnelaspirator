import { setPreview, setViewport } from './preview.js';
import { renderInspector } from './system-inspector.js';

const els = {
  form: document.querySelector('#domain-form'),
  input: document.querySelector('#domain-input'),
  compile: document.querySelector('#compile-btn'),
  stats: document.querySelector('#system-stats'),
  tree: document.querySelector('#system-tree'),
  inspector: document.querySelector('#system-inspector'),
  frame: document.querySelector('#preview-frame'),
  device: document.querySelector('#preview-device'),
  previewTitle: document.querySelector('#preview-title'),
  switcher: document.querySelector('#viewport-switcher'),
  status: document.querySelector('#status-text'),
};

let state = { domain: '', system: null, selection: null };

function setStatus(value) { els.status.textContent = value; }
function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
function add(parent, tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value != null) node.textContent = String(value);
  parent.appendChild(node);
  return node;
}

function itemButton(parent, label, count, selection) {
  const button = add(parent, 'button', 'tree-item');
  button.type = 'button';
  add(button, 'span', 'dot');
  add(button, 'span', '', label);
  if (count != null) add(button, 'small', '', count);
  button.addEventListener('click', () => select(selection, button));
  return button;
}

function group(title, items, factory) {
  const wrapper = add(els.tree, 'section', 'tree-group');
  const heading = add(wrapper, 'div', 'tree-heading');
  add(heading, 'span', '', title);
  add(heading, 'span', '', items.length);
  items.forEach((item) => factory(wrapper, item));
}

function renderTree() {
  clear(els.tree);
  const system = state.system;
  if (!system) return;
  group('Pages', system.pages || [], (parent, page) => itemButton(parent, page.title || page.route, page.route, { type: 'page', value: page }));
  group('Archetypes', system.archetypes || [], (parent, item) => itemButton(parent, item.label, item.pageIds.length, { type: 'archetype', value: item }));
  group('Components', system.components || [], (parent, item) => itemButton(parent, item.label, item.pageIds.length, { type: 'component', value: item }));
  group('Assets', system.assets || [], (parent, item) => itemButton(parent, item.path, item.kind, { type: 'asset', value: item }));
}

function select(selection, button) {
  state.selection = selection;
  els.tree.querySelectorAll('.tree-item').forEach((node) => node.classList.remove('active'));
  if (button) button.classList.add('active');

  if (selection.type === 'page') {
    setPreview({ frame: els.frame, device: els.device, title: els.previewTitle, domain: state.domain, page: selection.value });
  } else if (selection.type === 'archetype') {
    const page = state.system.pages.find((item) => item.id === selection.value.representativePageId);
    if (page) setPreview({ frame: els.frame, device: els.device, title: els.previewTitle, domain: state.domain, page });
  } else if (selection.type === 'component') {
    const firstPage = state.system.pages.find((item) => item.id === selection.value.pageIds[0]);
    if (firstPage) setPreview({ frame: els.frame, device: els.device, title: els.previewTitle, domain: state.domain, page: firstPage });
  }

  if (selection.type === 'asset') {
    clear(els.inspector);
    add(els.inspector, 'span', 'inspect-kicker', 'ASSET');
    add(els.inspector, 'h2', 'inspect-title', selection.value.path);
    add(els.inspector, 'div', 'inspect-sub', `${selection.value.kind} · ${selection.value.bytes} bytes`);
    return;
  }

  renderInspector({ container: els.inspector, selection, system: state.system, onSelectPage: selectPageById });
}

function selectPageById(pageId) {
  const page = state.system.pages.find((item) => item.id === pageId);
  if (!page) return;
  const buttons = [...els.tree.querySelectorAll('.tree-item')];
  const index = state.system.pages.indexOf(page);
  select({ type: 'page', value: page }, buttons[index] || null);
}

async function loadSystem(domain) {
  const clean = domain.trim();
  if (!clean) return;
  setStatus('LOADING');
  const response = await fetch(`/exports/${encodeURIComponent(clean)}/system/site-system.json`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Système compilé introuvable. Lance la compilation du domaine.');
  const system = await response.json();
  state = { domain: clean, system, selection: null };
  els.input.value = clean;
  els.stats.textContent = `${system.stats.pages} pages · ${system.stats.archetypes} archétypes · ${system.stats.components} composants · ${system.stats.assets} assets`;
  renderTree();
  history.replaceState(null, '', `${location.pathname}?domain=${encodeURIComponent(clean)}`);
  if (system.pages?.length) selectPageById(system.pages[0].id);
  setStatus('SYSTEM READY');
}

els.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  try { await loadSystem(els.input.value); }
  catch (error) { setStatus('ERROR'); alert(error.message); }
});

els.compile.addEventListener('click', async () => {
  const domain = els.input.value.trim();
  if (!domain) return;
  setStatus('COMPILING');
  try {
    const response = await fetch(`/api/results/${encodeURIComponent(domain)}/compile`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || 'Compilation impossible');
    await loadSystem(domain);
  } catch (error) {
    setStatus('COMPILE ERROR');
    alert(error.message);
  }
});

els.switcher.addEventListener('click', (event) => {
  const button = event.target.closest('[data-width]');
  if (!button) return;
  setViewport({ device: els.device, switcher: els.switcher, width: button.dataset.width });
});

window.addEventListener('message', (event) => {
  if (event.data?.type !== 'aspirator:navigate' || !state.system) return;
  const route = event.data.route;
  const page = state.system.pages.find((item) => item.route === route);
  if (page) selectPageById(page.id);
});

const initialDomain = new URLSearchParams(location.search).get('domain');
if (initialDomain) loadSystem(initialDomain).catch((error) => { setStatus('ERROR'); console.error(error); });
