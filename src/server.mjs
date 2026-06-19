import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import { ZipArchive } from 'archiver';
import { runCrawlerForUrl } from './crawl.mjs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import crypto from 'crypto';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXPORTS_DIR = path.join(__dirname, '..', 'exports');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/exports', express.static(EXPORTS_DIR));

// Create exports directory if it doesn't exist
async function ensureExportsDir() {
  try {
    await fs.mkdir(EXPORTS_DIR, { recursive: true });
  } catch (err) {
    console.error('Error creating exports dir:', err);
  }
}
ensureExportsDir();

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Funnel Scraper MVP API',
      version: '1.0.0',
      description: 'API for crawling and scraping web funnels',
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Local server',
      },
    ],
  },
  apis: ['./src/server.mjs'], // Search for swagger comments in this file
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

/**
 * @swagger
 * /api/crawl:
 *   post:
 *     summary: Launch a new crawl for a specific URL
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               url:
 *                 type: string
 *                 description: The URL to crawl
 *                 example: "https://example.com"
 *     responses:
 *       200:
 *         description: Crawl successful
 *       500:
 *         description: Internal server error
 */
app.post('/api/crawl', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    console.log(`Starting crawl for: ${url}`);
    const result = await runCrawlerForUrl(url);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Crawl failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/results:
 *   get:
 *     summary: Get all previous crawl results
 *     responses:
 *       200:
 *         description: List of crawled domains and their sitemap stats
 */
app.get('/api/results', async (req, res) => {
  try {
    const items = await fs.readdir(EXPORTS_DIR, { withFileTypes: true });
    const results = [];
    
    for (const item of items) {
      if (item.isDirectory()) {
        const sitemapPath = path.join(EXPORTS_DIR, item.name, 'sitemap.json');
        try {
          const sitemapData = await fs.readFile(sitemapPath, 'utf8');
          const pages = JSON.parse(sitemapData);
          let thumbnailUrl = null;
          if (pages.length > 0 && pages[0].screenshot) {
            thumbnailUrl = `/exports/${item.name}/${pages[0].screenshot}`;
          }

          results.push({
            domain: item.name,
            pagesCount: pages.length,
            thumbnailUrl: thumbnailUrl,
            date: pages.length > 0 ? pages[0].title : 'Unknown' // simplified
          });
        } catch (e) {
          // No sitemap or unreadable
          results.push({ domain: item.name, pagesCount: 0, error: 'No sitemap found' });
        }
      }
    }
    res.json({ success: true, results });
  } catch (error) {
    console.error('Failed to read results:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/results/{domain}:
 *   get:
 *     summary: Get detailed crawl results for a specific domain
 *     parameters:
 *       - in: path
 *         name: domain
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Detail of the crawl
 */
app.get('/api/results/:domain', async (req, res) => {
  const { domain } = req.params;
  const sitemapPath = path.join(EXPORTS_DIR, domain, 'sitemap.json');
  
  try {
    const sitemapData = await fs.readFile(sitemapPath, 'utf8');
    res.json({ success: true, domain, pages: JSON.parse(sitemapData) });
  } catch (error) {
    res.status(404).json({ success: false, error: 'Domain or sitemap not found' });
  }
});

/**
 * @swagger
 * /api/download/{domain}:
 *   get:
 *     summary: Download the entire domain export folder as a ZIP file
 *     parameters:
 *       - in: path
 *         name: domain
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: ZIP file stream
 */
app.get('/api/download/:domain', async (req, res) => {
  const { domain } = req.params;
  const domainDir = path.join(EXPORTS_DIR, domain);
  
  try {
    await fs.access(domainDir);
  } catch (error) {
    return res.status(404).json({ success: false, error: 'Domain export not found' });
  }

  res.attachment(`${domain}-export.zip`);
  const archive = new ZipArchive({ zlib: { level: 9 } });

  archive.on('error', (err) => {
    res.status(500).send({ error: err.message });
  });

  archive.pipe(res);
  archive.directory(domainDir, false);
  archive.finalize();
});

// ==========================================
// Native Model Context Protocol (MCP) Setup
// ==========================================

const mcpServer = new McpServer({
  name: "funnel-aspirator-mcp",
  version: "1.0.0",
});

// Tool 1: crawl_funnel
mcpServer.registerTool(
  "crawl_funnel",
  {
    description: "Crawl a website funnel, extract its pages, HTML rendered, and screenshots.",
    inputSchema: z.object({
      url: z.string().url().describe("The full URL of the website funnel to crawl"),
    }),
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false
    }
  },
  async ({ url }) => {
    try {
      console.log(`[MCP] Starting crawl for: ${url}`);
      const result = await runCrawlerForUrl(url);
      return {
        structuredContent: { success: true, result },
        content: [{ type: "text", text: JSON.stringify({ success: true, result }, null, 2) }]
      };
    } catch (error) {
      console.error(`[MCP] Crawl failed for ${url}:`, error);
      return {
        isError: true,
        content: [{ type: "text", text: `Crawl failed: ${error.message}` }]
      };
    }
  }
);

// Tool 2: list_crawled_domains
mcpServer.registerTool(
  "list_crawled_domains",
  {
    description: "List all previously crawled domains along with basic statistics (e.g. number of pages).",
    inputSchema: z.object({}),
    annotations: {
      readOnlyHint: true
    }
  },
  async () => {
    try {
      const items = await fs.readdir(EXPORTS_DIR, { withFileTypes: true });
      const results = [];
      
      for (const item of items) {
        if (item.isDirectory()) {
          const sitemapPath = path.join(EXPORTS_DIR, item.name, 'sitemap.json');
          try {
            const sitemapData = await fs.readFile(sitemapPath, 'utf8');
            const pages = JSON.parse(sitemapData);
            let thumbnailUrl = null;
            if (pages.length > 0 && pages[0].screenshot) {
              thumbnailUrl = `/exports/${item.name}/${pages[0].screenshot}`;
            }

            results.push({
              domain: item.name,
              pagesCount: pages.length,
              thumbnailUrl: thumbnailUrl,
              date: pages.length > 0 ? pages[0].title : 'Unknown'
            });
          } catch (e) {
            results.push({ domain: item.name, pagesCount: 0, error: 'No sitemap found' });
          }
        }
      }
      return {
        structuredContent: { success: true, results },
        content: [{ type: "text", text: JSON.stringify({ success: true, results }, null, 2) }]
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text", text: `Failed to list crawled domains: ${error.message}` }]
      };
    }
  }
);

// Tool 3: get_crawl_details
mcpServer.registerTool(
  "get_crawl_details",
  {
    description: "Get detailed crawl results for a specific domain, including sitemap.json info, lists of HTML files and screenshots.",
    inputSchema: z.object({
      domain: z.string().describe("The hostname/domain name folder to retrieve details for (e.g. 'example.com')"),
    }),
    annotations: {
      readOnlyHint: true
    }
  },
  async ({ domain }) => {
    const sitemapPath = path.join(EXPORTS_DIR, domain, 'sitemap.json');
    try {
      const sitemapData = await fs.readFile(sitemapPath, 'utf8');
      const pages = JSON.parse(sitemapData);
      return {
        structuredContent: { success: true, domain, pages },
        content: [{ type: "text", text: JSON.stringify({ success: true, domain, pages }, null, 2) }]
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text", text: `Domain or sitemap not found for ${domain}: ${error.message}` }]
      };
    }
  }
);

// Multi-client session storage for SSE
const transports = new Map();

// Route to initialize SSE transport session
app.get("/sse", async (req, res) => {
  console.log("[MCP] New SSE connection requested");
  const transport = new SSEServerTransport("/messages", res);
  
  transports.set(transport.sessionId, transport);
  
  res.on("close", () => {
    console.log(`[MCP] SSE connection closed for session: ${transport.sessionId}`);
    transports.delete(transport.sessionId);
  });

  await mcpServer.connect(transport);
  console.log(`[MCP] SSE connection established for session: ${transport.sessionId}`);
});

// Route to process JSON-RPC messages from SSE client
app.post("/messages", async (req, res) => {
  const { sessionId } = req.query;
  const transport = transports.get(sessionId);
  
  if (!transport) {
    console.warn(`[MCP] Messages POST received for unknown session: ${sessionId}`);
    return res.status(400).send("No transport found for sessionId");
  }
  
  await transport.handlePostMessage(req, res, req.body);
});

// ==========================================
// Streamable HTTP Transport (/mcp) Setup
// ==========================================
const streamableTransport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => crypto.randomUUID(),
  enableJsonResponse: true,
});

// Connect server to Streamable HTTP transport
await mcpServer.connect(streamableTransport);

app.post("/mcp", async (req, res) => {
  console.log(`[Server] POST /mcp req.body:`, JSON.stringify(req.body));
  await streamableTransport.handleRequest(req, res, req.body);
});

app.get("/mcp", async (req, res) => {
  await streamableTransport.handleRequest(req, res, req.body);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running at http://0.0.0.0:${PORT}`);
  console.log(`📄 Swagger UI available at http://0.0.0.0:${PORT}/api/docs`);
  console.log(`🔌 MCP SSE Endpoint active at http://0.0.0.0:${PORT}/sse`);
  console.log(`🔌 MCP Streamable HTTP Endpoint active at http://0.0.0.0:${PORT}/mcp`);
});
