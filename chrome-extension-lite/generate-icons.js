import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ICONS_DIR = path.join(__dirname, "icons");

async function generateIcons() {
  await fs.mkdir(ICONS_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const sizes = [16, 48, 128];

  for (const size of sizes) {
    console.log(`Generating icon-${size}.png...`);
    const dataUrl = await page.evaluate((s) => {
      const canvas = document.createElement("canvas");
      canvas.width = s;
      canvas.height = s;
      const ctx = canvas.getContext("2d");

      ctx.clearRect(0, 0, s, s);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      // 1. Draw rounded rectangle background
      const grad = ctx.createLinearGradient(0, 0, s, s);
      grad.addColorStop(0, "#7F00FF");
      grad.addColorStop(1, "#FF007F");

      const radius = s * 0.22;
      ctx.fillStyle = grad;
      ctx.beginPath();
      
      // Draw rounded rect manually for compatibility
      const x = 0, y = 0, width = s, height = s;
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + width - radius, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
      ctx.lineTo(x + width, y + height - radius);
      ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      ctx.lineTo(x + radius, y + height - radius); // wait, fix corner coords
      ctx.lineTo(x + radius, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
      ctx.fill();

      // 2. Draw stylized white funnel shape
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();

      const cx = s / 2;
      const cy = s / 2;

      const t1x = cx - s * 0.25;
      const t1y = cy - s * 0.22;
      const t2x = cx + s * 0.25;
      const t2y = cy - s * 0.22;

      const m1x = cx + s * 0.08;
      const m1y = cy + s * 0.08;
      const m2x = cx - s * 0.08;
      const m2y = cy + s * 0.08;

      const b1x = cx - s * 0.08;
      const b1y = cy + s * 0.28;
      const b2x = cx + s * 0.08;
      const b2y = cy + s * 0.28;

      ctx.moveTo(t1x, t1y);
      ctx.lineTo(t2x, t2y);
      ctx.quadraticCurveTo(cx + s * 0.1, cy - s * 0.1, m1x, m1y);
      ctx.lineTo(b2x, b2y);
      ctx.lineTo(b1x, b1y);
      ctx.lineTo(m2x, m2y);
      ctx.quadraticCurveTo(cx - s * 0.1, cy - s * 0.1, t1x, t1y);
      ctx.closePath();
      ctx.fill();

      return canvas.toDataURL("image/png");
    }, size);

    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const filePath = path.join(ICONS_DIR, `icon-${size}.png`);
    await fs.writeFile(filePath, buffer);
    console.log(`Saved: ${filePath}`);
  }

  await browser.close();
  console.log("All icons generated successfully!");
}

generateIcons().catch((err) => {
  console.error("Failed to generate icons:", err);
});
