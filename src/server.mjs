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

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running at http://0.0.0.0:${PORT}`);
  console.log(`📄 Swagger UI available at http://0.0.0.0:${PORT}/api/docs`);
});
