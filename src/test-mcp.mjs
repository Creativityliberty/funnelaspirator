import http from 'http';

console.log('🧪 Starting MCP Streamable HTTP Integration Test against running server...');

const PORT = process.env.PORT || 3000;

const postRequest = (path, payload, headers = {}) => new Promise((resolve, reject) => {
  const reqOptions = {
    hostname: 'localhost',
    port: PORT,
    path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      Accept: 'application/json, text/event-stream',
      ...headers,
    },
  };

  const req = http.request(reqOptions, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      let parsedBody = null;
      if (data) {
        if (data.includes('event: message')) {
          const match = data.match(/data:\s*([^\n]+)/);
          parsedBody = match ? JSON.parse(match[1]) : null;
        } else {
          parsedBody = JSON.parse(data);
        }
      }
      resolve({ statusCode: res.statusCode, headers: res.headers, body: parsedBody });
    });
  });

  req.on('error', reject);
  req.write(payload);
  req.end();
});

try {
  console.log('Step 1: Sending initialize request...');
  const initPayload = JSON.stringify({
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' },
    },
    id: 1,
  });

  const initResponse = await postRequest('/mcp', initPayload);
  console.log(`Init Response Status: ${initResponse.statusCode}`);

  const sessionId = initResponse.headers['mcp-session-id'];
  if (!sessionId) throw new Error('No mcp-session-id returned in initialization response headers.');

  console.log(`Step 2: Sending tools/list request with session ID: ${sessionId}...`);
  const toolsResponse = await postRequest('/mcp', JSON.stringify({
    jsonrpc: '2.0', method: 'tools/list', id: 2,
  }), { 'mcp-session-id': sessionId });

  if (toolsResponse.statusCode !== 200) {
    throw new Error(`Expected status code 200, got ${toolsResponse.statusCode}`);
  }

  const tools = toolsResponse.body?.result?.tools || [];
  const expectedToolNames = [
    'crawl_funnel',
    'list_crawled_domains',
    'get_crawl_details',
    'get_crawled_file',
    'get_funnel_design_system',
    'get_funnel_motion_specs',
    'get_funnel_components',
    'get_funnel_micro_interactions',
    'parse_json_to_specs_md',
    'compile_site_system',
    'get_site_system',
    'list_site_pages',
    'get_site_page',
    'list_archetypes',
    'get_archetype',
    'list_components',
    'get_component',
    'rebuild_archetype',
    'get_rebuild_manifest',
    'get_rebuild_report',
  ];
  const toolMap = new Map(tools.map((tool) => [tool.name, tool]));
  const missing = expectedToolNames.filter((name) => !toolMap.has(name));
  if (missing.length) throw new Error(`Missing expected MCP tools: ${missing.join(', ')}`);
  if (tools.length < expectedToolNames.length) {
    throw new Error(`Expected at least ${expectedToolNames.length} tools, got ${tools.length}`);
  }

  const crawlFunnel = toolMap.get('crawl_funnel');
  const listCrawled = toolMap.get('list_crawled_domains');
  const getCrawl = toolMap.get('get_crawl_details');
  const getCrawledFile = toolMap.get('get_crawled_file');
  const compileSiteSystem = toolMap.get('compile_site_system');
  const listArchetypes = toolMap.get('list_archetypes');
  const rebuildArchetype = toolMap.get('rebuild_archetype');
  const rebuildManifest = toolMap.get('get_rebuild_manifest');
  const rebuildReport = toolMap.get('get_rebuild_report');

  console.log('Checking annotations...');
  if (
    crawlFunnel.annotations?.readOnlyHint !== false
    || crawlFunnel.annotations?.openWorldHint !== true
    || crawlFunnel.annotations?.destructiveHint !== false
  ) throw new Error('crawl_funnel annotations incorrect');
  if (listCrawled.annotations?.readOnlyHint !== true) throw new Error('list_crawled_domains annotations incorrect');
  if (getCrawl.annotations?.readOnlyHint !== true) throw new Error('get_crawl_details annotations incorrect');
  if (getCrawledFile.annotations?.readOnlyHint !== true) throw new Error('get_crawled_file annotations incorrect');
  if (compileSiteSystem.annotations?.readOnlyHint !== false) throw new Error('compile_site_system annotations incorrect');
  if (listArchetypes.annotations?.readOnlyHint !== true) throw new Error('list_archetypes annotations incorrect');
  if (
    rebuildArchetype.annotations?.readOnlyHint !== false
    || rebuildArchetype.annotations?.destructiveHint !== false
    || rebuildArchetype.annotations?.openWorldHint !== false
  ) throw new Error('rebuild_archetype annotations incorrect');
  if (rebuildManifest.annotations?.readOnlyHint !== true) throw new Error('get_rebuild_manifest annotations incorrect');
  if (rebuildReport.annotations?.readOnlyHint !== true) throw new Error('get_rebuild_report annotations incorrect');

  console.log('Step 3: Verifying get_crawled_file error behavior...');
  const callResponse = await postRequest('/mcp', JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: 'get_crawled_file',
      arguments: { domain: 'nonexistent.com', filePath: 'pages/index.html' },
    },
    id: 3,
  }), { 'mcp-session-id': sessionId });

  if (callResponse.statusCode !== 200) {
    throw new Error(`Expected call response status code 200, got ${callResponse.statusCode}`);
  }
  if (!callResponse.body?.result?.isError) {
    throw new Error('Expected call response to indicate an error for nonexistent file.');
  }

  console.log(`✅ MCP integration verified: ${expectedToolNames.length} required legacy + M01 + M02 tools present.`);
  process.exit(0);
} catch (error) {
  console.error('❌ Test failed:', error);
  process.exit(1);
}
