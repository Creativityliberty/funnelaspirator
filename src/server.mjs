import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { registerSystemRoutes } from './system-http.mjs';
import { registerSystemTools } from './system-mcp.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXPORTS_DIR = path.join(__dirname, '..', 'exports');
const registeredApps = new WeakSet();
const registeredMcpServers = new WeakSet();

const originalListen = express.application?.listen;
if (typeof originalListen !== 'function') {
  throw new Error('Express application.listen hook unavailable');
}

express.application.listen = function aspiratorListen(...args) {
  if (!registeredApps.has(this)) {
    registerSystemRoutes(this, { exportsDir: EXPORTS_DIR });
    registeredApps.add(this);
  }
  return originalListen.apply(this, args);
};

const originalConnect = McpServer.prototype.connect;
if (typeof originalConnect !== 'function') {
  throw new Error('McpServer.connect hook unavailable');
}

McpServer.prototype.connect = async function aspiratorConnect(...args) {
  if (!registeredMcpServers.has(this)) {
    registerSystemTools(this, { exportsDir: EXPORTS_DIR, z });
    registeredMcpServers.add(this);
  }
  return originalConnect.apply(this, args);
};

await import('./server-core.mjs');
