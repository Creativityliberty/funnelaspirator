export function setPreview({ frame, device, title, domain, page }) {
  if (!page) {
    frame.removeAttribute('src');
    title.innerHTML = '<strong>Preview</strong><small>—</small>';
    return;
  }
  title.innerHTML = `<strong>${escapeHtml(page.title || page.route)}</strong><small>${escapeHtml(page.route)}</small>`;
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
