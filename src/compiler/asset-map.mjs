function capturedAssetPath(localPath = '') {
  const normalized = String(localPath).replace(/\\/g, '/');
  const marker = '/assets/';
  const markerIndex = normalized.indexOf(marker);
  const relative = markerIndex >= 0
    ? normalized.slice(markerIndex + marker.length)
    : normalized.startsWith('assets/')
      ? normalized.slice('assets/'.length)
      : '';

  if (!relative || relative.split('/').includes('..')) return null;
  return relative
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export function buildPreviewAssetMap(pages = [], domain = '') {
  const output = {};
  const encodedDomain = encodeURIComponent(domain);

  for (const page of pages) {
    const assets = Array.isArray(page?.data?.assets) ? page.data.assets : [];
    for (const asset of assets) {
      if (!asset?.url || !asset?.localPath) continue;
      const relative = capturedAssetPath(asset.localPath);
      if (!relative) continue;

      const target = `/exports/${encodedDomain}/assets/${relative}`;
      output[asset.url] = target;

      try {
        const original = new URL(asset.url);
        output[`//${original.host}${original.pathname}${original.search}`] = target;
        if (original.hostname === domain) {
          output[`${original.pathname}${original.search}`] = target;
          output[original.pathname] = target;
        }
      } catch {}
    }
  }

  return output;
}
