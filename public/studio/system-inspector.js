function text(value) {
  return value == null ? '—' : String(value);
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function add(parent, tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value != null) node.textContent = text(value);
  parent.appendChild(node);
  return node;
}

function addRows(parent, rows) {
  const grid = add(parent, 'div', 'inspect-grid');
  rows.forEach(([label, value]) => {
    const row = add(grid, 'div', 'inspect-row');
    add(row, 'span', '', label);
    add(row, 'span', '', value);
  });
}

function addPageButtons(parent, pageIds, system, onSelectPage) {
  const list = add(parent, 'div', 'usage-list');
  pageIds.forEach((id) => {
    const page = system.pages.find((item) => item.id === id);
    const button = add(list, 'button', '', page?.route || id);
    button.type = 'button';
    button.addEventListener('click', () => onSelectPage(id));
  });
}

function addRebuildDetails(parent, rebuild, reportUrl) {
  if (!rebuild) return;
  const manifest = rebuild.manifest || rebuild;
  const report = rebuild.report || null;
  const metrics = report?.metrics || {};
  const unresolvedDependencies = (manifest.diagnostics?.unresolvedComponents?.length || 0)
    + (report?.brokenResources?.length || 0);

  add(parent, 'span', 'inspect-kicker rebuild-kicker', 'REBUILD');
  addRows(parent, [
    ['Verification', manifest.verification?.status || report?.status],
    ['Archetype ID', manifest.archetypeId],
    ['Components', `${metrics.componentsResolved ?? manifest.componentIds?.length ?? 0} / ${metrics.componentsExpected ?? manifest.componentIds?.length ?? 0}`],
    ['Assets', `${metrics.assetsResolved ?? manifest.assetIds?.length ?? 0} / ${metrics.assetsReferenced ?? manifest.assetIds?.length ?? 0}`],
    ['Unresolved', unresolvedDependencies],
  ]);

  if (reportUrl) {
    const link = add(parent, 'a', 'report-link', 'Open fidelity report');
    link.href = reportUrl;
    link.target = '_blank';
    link.rel = 'noopener';
  }
}

export function renderInspector({ container, selection, system, onSelectPage, rebuild = null, reportUrl = '' }) {
  clear(container);
  if (!selection) {
    add(container, 'p', 'empty', 'Sélectionne une page, un archétype ou un composant.');
    return;
  }

  const item = selection.value;
  add(container, 'span', 'inspect-kicker', selection.type.toUpperCase());
  add(container, 'h2', 'inspect-title', item.title || item.label || item.route || item.id);
  add(container, 'div', 'inspect-sub', item.route || item.id || '');

  if (selection.type === 'page') {
    const archetype = system.archetypes.find((entry) => entry.id === item.archetypeId);
    addRows(container, [
      ['Archetype', archetype?.label], ['Sections', item.sectionSequence?.length || 0],
      ['Components', item.componentIds?.length || 0], ['Signature', item.signature],
      ['HTML', item.html], ['Screenshot', item.screenshot],
    ]);
    const pills = add(container, 'div', 'pill-list');
    (item.sectionSequence || []).forEach((value) => add(pills, 'span', 'pill', value));
    return;
  }

  if (selection.type === 'archetype') {
    addRows(container, [
      ['Pages', item.pageIds.length], ['Confidence', item.confidence],
      ['Representative', item.representativePageId],
    ]);
    addRebuildDetails(container, rebuild, reportUrl);
    addPageButtons(container, item.pageIds, system, onSelectPage);
    return;
  }

  addRows(container, [
    ['Kind', item.kind], ['Role', item.role], ['Pages', item.pageIds.length],
    ['Occurrences', item.occurrences.length], ['Variants', item.variants.length],
    ['Confidence', item.confidence],
  ]);
  addPageButtons(container, item.pageIds, system, onSelectPage);
}
