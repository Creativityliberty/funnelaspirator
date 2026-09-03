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
  rebuildControls: document.querySelector('#rebuild-controls'),
  rebuild: document.querySelector('#rebuild-btn'),
  status: document.querySelector('#status-text'),
};

let state = {
  domain: '',
  system: null,
  selection: null,
  previewMode: 'original',
  rebuilds: new Map(),
  previewPageId: null,
};

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

function selectedArchetype() {
  return state.selection?.type === 'archetype' ? state.selection.value : null;
}

function currentPreviewPage() {
  if (!state.selection || !state.system) return null;
  if (state.selection.type === 'page') return state.selection.value;
  if (state.selection.type === 'component') {
    return state.system.pages.find((item) => item.id === state.selection.value.pageIds[0]) || null;
  }
  if (state.selection.type === 'archetype') {
    const archetype = state.selection.value;
    const pageId = archetype.pageIds.includes(state.previewPageId)
      ? state.previewPageId
      : archetype.representativePageId;
    return state.system.pages.find((item) => item.id === pageId) || null;
  }
  return null;
}

function rebuildForSelection() {
  const archetype = selectedArchetype();
  return archetype ? state.rebuilds.get(archetype.id) || null : null;
}

function reportUrl(archetypeId) {
  return `/api/results/${encodeURIComponent(state.domain)}/system/rebuild/archetypes/${encodeURIComponent(archetypeId)}/report`;
}

function updateRebuildControls() {
  const archetype = selectedArchetype();
  const rebuild = rebuildForSelection();
  if (!archetype && state.previewMode === 'rebuilt') state.previewMode = 'original';
  if (archetype && !rebuild && state.previewMode === 'rebuilt') state.previewMode = 'original';

  els.rebuild.disabled = !archetype;
  els.rebuildControls.querySelectorAll('[data-preview-mode]').forEach((button) => {
    const mode = button.dataset.previewMode;
    button.classList.toggle('active', mode === state.previewMode);
    if (mode === 'rebuilt') button.disabled = !archetype || !rebuild;
    else button.disabled = false;
  });
}

function renderCurrentPreview() {
  const page = currentPreviewPage();
  if (!page) {
    setPreview({ frame: els.frame, device: els.device, title: els.previewTitle, domain: state.domain, page: null });
    return;
  }

  const archetype = selectedArchetype();
  const canShowRebuilt = state.previewMode === 'rebuilt' && archetype && rebuildForSelection();
  setPreview({
    frame: els.frame,
    device: els.device,
    title: els.previewTitle,
    domain: state.domain,
    page,
    mode: canShowRebuilt ? 'rebuilt' : 'original',
    archetypeId: canShowRebuilt ? archetype.id : null,
  });
}

function renderCurrentInspector() {
  const selection = state.selection;
  if (!selection) {
    renderInspector({ container: els.inspector, selection, system: state.system, onSelectPage: selectPageById });
    return;
  }

  if (selection.type === 'asset') {
    clear(els.inspector);
    add(els.inspector, 'span', 'inspect-kicker', 'ASSET');
    add(els.inspector, 'h2', 'inspect-title', selection.value.path);
    add(els.inspector, 'div', 'inspect-sub', `${selection.value.kind} · ${selection.value.bytes} bytes`);
    return;
  }

  const archetype = selectedArchetype();
  renderInspector({
    container: els.inspector,
    selection,
    system: state.system,
    onSelectPage: selectPageById,
    rebuild: rebuildForSelection(),
    reportUrl: archetype ? reportUrl(archetype.id) : '',
  });
}

function select(selection, button) {
  state.selection = selection;
  state.previewPageId = selection.type === 'archetype' ? selection.value.representativePageId : null;
  if (selection.type !== 'archetype') state.previewMode = 'original';

  els.tree.querySelectorAll('.tree-item').forEach((node) => node.classList.remove('active'));
  if (button) button.classList.add('active');

  updateRebuildControls();
  renderCurrentPreview();
  renderCurrentInspector();
}

function selectPageById(pageId) {
  const page = state.system?.pages.find((item) => item.id === pageId);
  if (!page) return;

  const archetype = selectedArchetype();
  if (archetype && state.previewMode === 'rebuilt' && archetype.pageIds.includes(pageId)) {
    state.previewPageId = pageId;
    renderCurrentPreview();
    return;
  }

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
  state = {
    domain: clean,
    system,
    selection: null,
    previewMode: 'original',
    rebuilds: new Map(),
    previewPageId: null,
  };
  els.input.value = clean;
  els.stats.textContent = `${system.stats.pages} pages · ${system.stats.archetypes} archétypes · ${system.stats.components} composants · ${system.stats.assets} assets`;
  renderTree();
  updateRebuildControls();
  history.replaceState(null, '', `${location.pathname}?domain=${encodeURIComponent(clean)}`);
  if (system.pages?.length) selectPageById(system.pages[0].id);
  setStatus('SYSTEM READY');
}

async function buildSelectedArchetype() {
  const archetype = selectedArchetype();
  if (!archetype || !state.domain) return;
  setStatus('REBUILDING');
  els.rebuild.disabled = true;

  try {
    const base = `/api/results/${encodeURIComponent(state.domain)}/system/rebuild/archetypes/${encodeURIComponent(archetype.id)}`;
    const response = await fetch(base, { method: 'POST' });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || 'Reconstruction impossible');

    const reportResponse = await fetch(`${base}/report`, { cache: 'no-store' });
    const reportData = await reportResponse.json();
    if (!reportResponse.ok || !reportData.success) throw new Error(reportData.error || 'Rapport de reconstruction introuvable');

    state.rebuilds.set(archetype.id, { manifest: data.manifest, report: reportData.report });
    state.previewMode = 'rebuilt';
    state.previewPageId = data.manifest.representativePageId || archetype.representativePageId;
    updateRebuildControls();
    renderCurrentPreview();
    renderCurrentInspector();
    setStatus('REBUILD READY');
  } catch (error) {
    state.previewMode = 'original';
    updateRebuildControls();
    renderCurrentPreview();
    setStatus('REBUILD ERROR');
    alert(error.message);
  }
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

els.rebuild.addEventListener('click', buildSelectedArchetype);

els.rebuildControls.addEventListener('click', (event) => {
  const button = event.target.closest('[data-preview-mode]');
  if (!button || button.disabled) return;
  const mode = button.dataset.previewMode;
  if (mode === 'rebuilt' && !rebuildForSelection()) return;
  state.previewMode = mode === 'rebuilt' ? 'rebuilt' : 'original';
  updateRebuildControls();
  renderCurrentPreview();
  renderCurrentInspector();
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
  if (!page) return;
  const archetype = selectedArchetype();
  if (state.previewMode === 'rebuilt' && archetype?.pageIds.includes(page.id)) {
    state.previewPageId = page.id;
    renderCurrentPreview();
    return;
  }
  selectPageById(page.id);
});

const initialDomain = new URLSearchParams(location.search).get('domain');
updateRebuildControls();
if (initialDomain) loadSystem(initialDomain).catch((error) => { setStatus('ERROR'); console.error(error); });
