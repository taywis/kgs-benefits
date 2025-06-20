const puppeteer = require('puppeteer');
const axios = require('axios');
const sharp = require('sharp');
const fs = require('fs-extra');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

const INPUT_FILE = 'all_links_by_domain.txt';
const OUTPUT_DIR = path.join('downloaded_resources', 'online.fliphtml5.com');
const SUCCESS_LOG = 'fliphtml5_success.txt';
const FAIL_LOG = 'fliphtml5_fail.txt';

function parseFlipUrlsFromFile(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  return lines
    .map(line => line.trim())
    .filter(line => line.startsWith('https://online.fliphtml5.com/'));
}

async function downloadFlipbookAsPdf(url, code) {
  const tempDir = path.join(OUTPUT_DIR, `${code}_webp`);
  const outPdf = path.join(OUTPUT_DIR, `${code}.pdf`);
  let browser;
  try {
    console.log(`[${code}] Ensuring directories...`);
    await fs.ensureDir(tempDir);
    await fs.ensureDir(OUTPUT_DIR);
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    const webpUrls = new Set();

    // Track network requests to find .webp files
    page.on('requestfinished', (req) => {
      const reqUrl = req.url();
      if (reqUrl.includes('.webp')) {
        webpUrls.add(reqUrl.split('?')[0]); // Strip query params
      }
    });

    console.log(`[${code}] Navigating to ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(res => setTimeout(res, 5000)); // Let page settle, capture any lazy-loads

    console.log(`[${code}] Detected ${webpUrls.size} .webp URLs (including thumbs)`);
    if (webpUrls.size === 0) {
      throw new Error('No .webp files detected on page');
    }

    // Only keep .webp URLs that do NOT include '/thumb/'
    const filteredUrls = Array.from(webpUrls).filter(u => !u.includes('/thumb/')).sort();
    console.log(`[${code}] Filtered out thumbs, ${filteredUrls.length} .webp URLs remain`);

    if (filteredUrls.length === 0) {
      throw new Error('No non-thumb .webp images found for PDF');
    }

    const imageBuffers = [];
    let downloadSuccess = 0;

    for (let i = 0; i < filteredUrls.length; i++) {
      const imgUrl = filteredUrls[i];
      const filename = path.join(tempDir, `page-${String(i + 1).padStart(3, '0')}.webp`);
      try {
        const response = await axios.get(imgUrl, { responseType: 'arraybuffer' });
        await fs.writeFile(filename, response.data);
        imageBuffers.push(response.data);
        downloadSuccess++;
        console.log(`[${code}] Downloaded: ${imgUrl}`);
      } catch (err) {
        console.error(`[${code}] Failed to download image: ${imgUrl} -> ${err.message}`);
      }
    }

    console.log(`[${code}] Successfully downloaded ${downloadSuccess} images out of ${filteredUrls.length}`);
    if (imageBuffers.length === 0) {
      throw new Error('No images downloaded for PDF');
    }

    console.log(`[${code}] Creating PDF from ${imageBuffers.length} images...`);
    const pdfDoc = await PDFDocument.create();
    for (const [idx, imgBuffer] of imageBuffers.entries()) {
      try {
        // Convert WebP to PNG buffer for pdf-lib
        const pngBuffer = await sharp(imgBuffer).png().toBuffer();
        const img = await pdfDoc.embedPng(pngBuffer);
        const page = pdfDoc.addPage([img.width, img.height]);
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
        console.log(`[${code}] Added page ${idx + 1} to PDF (${img.width}x${img.height})`);
      } catch (err) {
        console.error(`[${code}] Failed to add image to PDF: ${err.message}`);
      }
    }
    const pdfBytes = await pdfDoc.save();
    await fs.writeFile(outPdf, pdfBytes);

    console.log(`[${code}] ✅ PDF created at ${outPdf} with ${imageBuffers.length} pages`);
    fs.appendFileSync(SUCCESS_LOG, `${url} -> ${outPdf} (${imageBuffers.length} pages)\n`);
    // Optionally, clean up tempDir
    await fs.remove(tempDir);
    console.log(`[${code}] Cleaned up temp directory`);
  } catch (err) {
    console.error(`[${code}] Failed:`, url, err && (err.message || err));
    fs.appendFileSync(FAIL_LOG, `${url} -> ${err && (err.message || err)}\n`);
  } finally {
    if (browser) await browser.close();
  }
}

async function main() {
  const urls = parseFlipUrlsFromFile(INPUT_FILE);
  for (const url of urls) {
    // Extract the code from the URL (e.g., /sxzzv/alas/ -> alas)
    const match = url.match(/\/([a-z0-9]+)\/?$/i);
    const code = match ? match[1] : 'flipbook';
    await downloadFlipbookAsPdf(url, code);
  }
}

main(); 