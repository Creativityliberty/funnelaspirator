import http from 'http';

console.log('🧪 Starting MCP Streamable HTTP Integration Test against running server...');

const PORT = 3000;

const postRequest = (path, payload, headers = {}) => {
  return new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: 'localhost',
      port: PORT,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Accept': 'application/json, text/event-stream',
        ...headers
      }
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
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: parsedBody
        });
      });
    });

    req.on('error', (err) => { reject(err); });
    req.write(payload);
    req.end();
  });
};

try {
  // Step 1: Send initialize request
  console.log('Step 1: Sending initialize request...');
  const initPayload = JSON.stringify({
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'test-client',
        version: '1.0.0'
      }
    },
    id: 1
  });

  const initResponse = await postRequest('/mcp', initPayload);
  console.log(`Init Response Status: ${initResponse.statusCode}`);
  console.log('Init Response Headers:', initResponse.headers);
  console.log('Init Response Body:', JSON.stringify(initResponse.body, null, 2));

  const sessionId = initResponse.headers['mcp-session-id'];
  if (!sessionId) {
    throw new Error('No mcp-session-id returned in initialization response headers.');
  }

  // Step 2: Send tools/list request
  console.log(`\nStep 2: Sending tools/list request with session ID: ${sessionId}...`);
  const toolsPayload = JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/list',
    id: 2
  });

  const toolsResponse = await postRequest('/mcp', toolsPayload, {
    'mcp-session-id': sessionId
  });

  console.log(`Tools Response Status: ${toolsResponse.statusCode}`);
  console.log('Tools Response Body:', JSON.stringify(toolsResponse.body, null, 2));

  if (toolsResponse.statusCode !== 200) {
    throw new Error(`Expected status code 200, got ${toolsResponse.statusCode}`);
  }

  const tools = toolsResponse.body.result.tools;
  if (!tools || tools.length !== 4) {
    throw new Error(`Expected 4 tools, got ${tools ? tools.length : 0}`);
  }

  const crawlFunnel = tools.find(t => t.name === 'crawl_funnel');
  const listCrawled = tools.find(t => t.name === 'list_crawled_domains');
  const getCrawl = tools.find(t => t.name === 'get_crawl_details');
  const getCrawledFile = tools.find(t => t.name === 'get_crawled_file');

  if (!crawlFunnel || !listCrawled || !getCrawl || !getCrawledFile) {
    throw new Error('Could not find all expected tools by name.');
  }

  // Assert annotations
  console.log('Checking annotations...');
  if (
    crawlFunnel.annotations?.readOnlyHint !== false ||
    crawlFunnel.annotations?.openWorldHint !== true ||
    crawlFunnel.annotations?.destructiveHint !== false
  ) {
    throw new Error('crawl_funnel annotations incorrect');
  }

  if (listCrawled.annotations?.readOnlyHint !== true) {
    throw new Error('list_crawled_domains annotations incorrect');
  }

  if (getCrawl.annotations?.readOnlyHint !== true) {
    throw new Error('get_crawl_details annotations incorrect');
  }

  if (getCrawledFile.annotations?.readOnlyHint !== true) {
    throw new Error('get_crawled_file annotations incorrect');
  }

  // Step 3: Send tools/call for get_crawled_file (expect error or not found, but it should return clean JSON error instead of crashing)
  console.log(`\nStep 3: Sending tools/call for get_crawled_file (expecting not found error)...`);
  const callPayload = JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: 'get_crawled_file',
      arguments: {
        domain: 'nonexistent.com',
        filePath: 'pages/index.html'
      }
    },
    id: 3
  });

  const callResponse = await postRequest('/mcp', callPayload, {
    'mcp-session-id': sessionId
  });

  console.log(`Call Response Status: ${callResponse.statusCode}`);
  console.log('Call Response Body:', JSON.stringify(callResponse.body, null, 2));

  if (callResponse.statusCode !== 200) {
    throw new Error(`Expected call response status code 200, got ${callResponse.statusCode}`);
  }

  if (!callResponse.body.result?.isError) {
    throw new Error('Expected call response to indicate an error for nonexistent file.');
  }

  console.log('✅ MCP streamable endpoint, tool annotations, and get_crawled_file error behavior verified successfully!');
  process.exit(0);

} catch (error) {
  console.error('❌ Test failed:', error);
  process.exit(1);
}
