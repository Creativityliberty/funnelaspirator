export function setPreview({ frame, device, title, domain, page, mode = 'original', archetypeId = null }) {
  if (!page) {
    frame.removeAttribute('src');
    title.innerHTML = '<strong>Preview</strong><small>—</small>';
    return;
  }

  const label = mode === 'rebuilt' ? 'REBUILT' : 'ORIGINAL';
  title.innerHTML = `<strong>${escapeHtml(page.title || page.route)}</strong><small>${label} · ${escapeHtml(page.route)}</small>`;

  if (mode === 'rebuilt' && archetypeId) {
    frame.src = `/api/results/${encodeURIComponent(domain)}/system/rebuild/archetypes/${encodeURIComponent(archetypeId)}/preview?page=${encodeURIComponent(page.id)}`;
    return;
  }

  frame.src = `/exports/${encodeURIComponent(domain)}/${page.preview}`;
}

export function setViewport({ device, switcher, width }) {
  const numeric = Number(width) || 1440;
  device.style.width = `${numeric}px`;
  switcher.querySelectorAll('button').forEach((button) => {
    button.classList.toggle('active', Number(button.dataset.width) === numeric);
  });
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
