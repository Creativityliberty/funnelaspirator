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
 * /api/results/{domain}/design-system:
 *   get:
 *     summary: Get extracted Design System tokens (palette, typography, :root CSS variables, shadows)
 *     parameters:
 *       - in: path
 *         name: domain
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Design System tokens
 */
app.get('/api/results/:domain/design-system', async (req, res) => {
  const { domain } = req.params;
  const dsPath = path.join(EXPORTS_DIR, domain, 'design-system.json');
  try {
    const data = await fs.readFile(dsPath, 'utf8');
    res.json({ success: true, domain, designSystem: JSON.parse(data) });
  } catch (error) {
    // Fallback: look in first page data file
    try {
      const dataDir = path.join(EXPORTS_DIR, domain, 'data');
      const files = await fs.readdir(dataDir);
      if (files.length > 0) {
        const pageData = JSON.parse(await fs.readFile(path.join(dataDir, files[0]), 'utf8'));
        return res.json({ success: true, domain, designSystem: pageData.designTokens || {} });
      }
    } catch (e) {}
    res.status(404).json({ success: false, error: 'Design system data not found' });
  }
});

/**
 * @swagger
 * /api/results/{domain}/motion:
 *   get:
 *     summary: Get motion and animation specs (keyframes, transitions, libraries)
 *     parameters:
 *       - in: path
 *         name: domain
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Motion and animation specifications
 */
app.get('/api/results/:domain/motion', async (req, res) => {
  const { domain } = req.params;
  try {
    const dataDir = path.join(EXPORTS_DIR, domain, 'data');
    const files = await fs.readdir(dataDir);
    const motionList = [];
    for (const file of files) {
      if (file.endsWith('.json')) {
        const pageData = JSON.parse(await fs.readFile(path.join(dataDir, file), 'utf8'));
        if (pageData.motion) {
          motionList.push({ page: file.replace('.json', ''), motion: pageData.motion });
        }
      }
    }
    res.json({ success: true, domain, motion: motionList });
  } catch (error) {
    res.status(404).json({ success: false, error: 'Motion data not found' });
  }
});

/**
 * @swagger
 * /api/results/{domain}/components:
 *   get:
 *     summary: Get segmented UI components and section blueprints
 *     parameters:
 *       - in: path
 *         name: domain
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Component blueprints
 */
app.get('/api/results/:domain/components', async (req, res) => {
  const { domain } = req.params;
  try {
    const dataDir = path.join(EXPORTS_DIR, domain, 'data');
    const files = await fs.readdir(dataDir);
    const allComponents = [];
    for (const file of files) {
      if (file.endsWith('.json')) {
        const pageData = JSON.parse(await fs.readFile(path.join(dataDir, file), 'utf8'));
        if (pageData.components) {
          allComponents.push({ page: file.replace('.json', ''), components: pageData.components });
        }
      }
    }
    res.json({ success: true, domain, components: allComponents });
  } catch (error) {
    res.status(404).json({ success: false, error: 'Component data not found' });
  }
});

/**
 * @swagger
 * /api/results/{domain}/interactions:
 *   get:
 *     summary: Get micro-interactions, button hover states and accordion states
 *     parameters:
 *       - in: path
 *         name: domain
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Micro-interactions and interactive states
 */
app.get('/api/results/:domain/interactions', async (req, res) => {
  const { domain } = req.params;
  try {
    const dataDir = path.join(EXPORTS_DIR, domain, 'data');
    const files = await fs.readdir(dataDir);
    const interactionsList = [];
    for (const file of files) {
      if (file.endsWith('.json')) {
        const pageData = JSON.parse(await fs.readFile(path.join(dataDir, file), 'utf8'));
        if (pageData.microInteractions) {
          interactionsList.push({ page: file.replace('.json', ''), microInteractions: pageData.microInteractions });
        }
      }
    }
    res.json({ success: true, domain, interactions: interactionsList });
  } catch (error) {
    res.status(404).json({ success: false, error: 'Interaction data not found' });
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

function createMcpServer() {
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

  // Tool 4: get_crawled_file
  mcpServer.registerTool(
    "get_crawled_file",
    {
      description: "Read the text content of a crawled page (such as the HTML code or extracted JSON metadata).",
      inputSchema: z.object({
        domain: z.string().describe("The domain name folder where the crawled files are located (e.g. 'joelerway.com')"),
        filePath: z.string().describe("The relative file path inside the domain folder (e.g. 'pages/index.html' or 'data/index.json')"),
      }),
      annotations: {
        readOnlyHint: true
      }
    },
    async ({ domain, filePath }) => {
      const domainDir = path.resolve(EXPORTS_DIR, domain);
      const fullPath = path.resolve(domainDir, filePath);
      if (!fullPath.startsWith(domainDir)) {
        return {
          isError: true,
          content: [{ type: "text", text: "Access denied: path traversal detected" }]
        };
      }
      try {
        const content = await fs.readFile(fullPath, 'utf8');
        return {
          structuredContent: { success: true, domain, filePath, content },
          content: [{ type: "text", text: content }]
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to read file: ${error.message}` }]
        };
      }
    }
  );

  // Tool 5: get_funnel_design_system
  mcpServer.registerTool(
    "get_funnel_design_system",
    {
      description: "Retrieve complete Design System tokens (:root CSS variables, color palettes, typography scale, shadows, border radii) for a crawled domain.",
      inputSchema: z.object({
        domain: z.string().describe("The domain name folder to get the design system for"),
      }),
      annotations: {
        readOnlyHint: true
      }
    },
    async ({ domain }) => {
      const dsPath = path.join(EXPORTS_DIR, domain, 'design-system.json');
      try {
        const data = JSON.parse(await fs.readFile(dsPath, 'utf8'));
        return {
          structuredContent: { success: true, domain, designSystem: data },
          content: [{ type: "text", text: JSON.stringify({ success: true, domain, designSystem: data }, null, 2) }]
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: `Design system not found for ${domain}: ${error.message}` }]
        };
      }
    }
  );

  // Tool 6: get_funnel_motion_specs
  mcpServer.registerTool(
    "get_funnel_motion_specs",
    {
      description: "Extract motion specs, active CSS transitions, @keyframes animations, and detected JS libraries (GSAP, ScrollTrigger, Framer Motion, etc.) for a domain.",
      inputSchema: z.object({
        domain: z.string().describe("The domain name folder to inspect motion for"),
      }),
      annotations: {
        readOnlyHint: true
      }
    },
    async ({ domain }) => {
      try {
        const dataDir = path.join(EXPORTS_DIR, domain, 'data');
        const files = await fs.readdir(dataDir);
        const motions = [];
        for (const file of files) {
          if (file.endsWith('.json')) {
            const pageData = JSON.parse(await fs.readFile(path.join(dataDir, file), 'utf8'));
            if (pageData.motion) motions.push({ page: file.replace('.json', ''), motion: pageData.motion });
          }
        }
        return {
          structuredContent: { success: true, domain, motions },
          content: [{ type: "text", text: JSON.stringify({ success: true, domain, motions }, null, 2) }]
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to get motion specs for ${domain}: ${error.message}` }]
        };
      }
    }
  );

  // Tool 7: get_funnel_components
  mcpServer.registerTool(
    "get_funnel_components",
    {
      description: "Get segmented UI component blueprints (Hero, Pricing, FAQ, Testimonials, Lead Forms) with isolated HTML structures and styles.",
      inputSchema: z.object({
        domain: z.string().describe("The domain name folder to extract components for"),
      }),
      annotations: {
        readOnlyHint: true
      }
    },
    async ({ domain }) => {
      try {
        const dataDir = path.join(EXPORTS_DIR, domain, 'data');
        const files = await fs.readdir(dataDir);
        const components = [];
        for (const file of files) {
          if (file.endsWith('.json')) {
            const pageData = JSON.parse(await fs.readFile(path.join(dataDir, file), 'utf8'));
            if (pageData.components) components.push({ page: file.replace('.json', ''), components: pageData.components });
          }
        }
        return {
          structuredContent: { success: true, domain, components },
          content: [{ type: "text", text: JSON.stringify({ success: true, domain, components }, null, 2) }]
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to get components for ${domain}: ${error.message}` }]
        };
      }
    }
  );

  // Tool 8: get_funnel_micro_interactions
  mcpServer.registerTool(
    "get_funnel_micro_interactions",
    {
      description: "Extract micro-interactions: CTA button hover state diffs, accordion collapsed/expanded states, and sticky/fixed headers.",
      inputSchema: z.object({
        domain: z.string().describe("The domain name folder to extract micro-interactions for"),
      }),
      annotations: {
        readOnlyHint: true
      }
    },
    async ({ domain }) => {
      try {
        const dataDir = path.join(EXPORTS_DIR, domain, 'data');
        const files = await fs.readdir(dataDir);
        const interactions = [];
        for (const file of files) {
          if (file.endsWith('.json')) {
            const pageData = JSON.parse(await fs.readFile(path.join(dataDir, file), 'utf8'));
            if (pageData.microInteractions) interactions.push({ page: file.replace('.json', ''), microInteractions: pageData.microInteractions });
          }
        }
        return {
          structuredContent: { success: true, domain, interactions },
          content: [{ type: "text", text: JSON.stringify({ success: true, domain, interactions }, null, 2) }]
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to get micro-interactions for ${domain}: ${error.message}` }]
        };
      }
    }
  );

  return mcpServer;
}

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

  const sessionServer = createMcpServer();
  await sessionServer.connect(transport);
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
const mcpSessions = new Map();

async function getOrCreateTransport(req) {
  const sessionId = req.headers['mcp-session-id'] || req.query['sessionId'];
  
  if (sessionId && mcpSessions.has(sessionId)) {
    return mcpSessions.get(sessionId).transport;
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    enableJsonResponse: true,
    onsessioninitialized: (id) => {
      console.log(`[MCP] New Streamable HTTP session initialized: ${id}`);
      mcpSessions.set(id, { transport, server });
    }
  });

  transport.onclose = () => {
    if (transport.sessionId) {
      console.log(`[MCP] Streamable HTTP session closed: ${transport.sessionId}`);
      mcpSessions.delete(transport.sessionId);
    }
  };

  const server = createMcpServer();
  await server.connect(transport);
  return transport;
}

app.post("/mcp", async (req, res) => {
  console.log(`[Server] POST /mcp req.body:`, JSON.stringify(req.body));
  try {
    const transport = await getOrCreateTransport(req);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('[Server] POST /mcp failed:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

app.get("/mcp", async (req, res) => {
  try {
    const transport = await getOrCreateTransport(req);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('[Server] GET /mcp failed:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running at http://0.0.0.0:${PORT}`);
  console.log(`📄 Swagger UI available at http://0.0.0.0:${PORT}/api/docs`);
  console.log(`🔌 MCP SSE Endpoint active at http://0.0.0.0:${PORT}/sse`);
  console.log(`🔌 MCP Streamable HTTP Endpoint active at http://0.0.0.0:${PORT}/mcp`);
});
