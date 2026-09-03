import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPreviewAssetMap } from '../../src/compiler/asset-map.mjs';

test('asset map rewrites captured same-domain root URLs and preserves external URL identity', () => {
  const pages = [{ data: { assets: [
    {
      url: 'https://www.brandappart.com/keychain/sobry-1.avif',
      localPath: 'exports/www.brandappart.com/assets/www.brandappart.com/keychain/sobry-1.avif',
    },
    {
      url: 'https://www.brandappart.com/_next/static/chunks/app.css?dpl=abc',
      localPath: 'exports/www.brandappart.com/assets/www.brandappart.com/_next/static/chunks/app-x.css',
    },
    {
      url: 'https://cdn.example.net/widget.js',
      localPath: 'exports/www.brandappart.com/assets/cdn.example.net/widget.js',
    },
  ] } }];

  const map = buildPreviewAssetMap(pages, 'www.brandappart.com');
  assert.equal(
    map['/keychain/sobry-1.avif'],
    '/exports/www.brandappart.com/assets/www.brandappart.com/keychain/sobry-1.avif',
  );
  assert.equal(
    map['/_next/static/chunks/app.css?dpl=abc'],
    '/exports/www.brandappart.com/assets/www.brandappart.com/_next/static/chunks/app-x.css',
  );
  assert.equal(
    map['https://cdn.example.net/widget.js'],
    '/exports/www.brandappart.com/assets/cdn.example.net/widget.js',
  );
  assert.equal(map['/widget.js'], undefined);
});
