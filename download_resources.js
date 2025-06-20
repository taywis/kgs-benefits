const fs = require('fs');
const path = require('path');
const axios = require('axios');
const mkdirp = require('mkdirp');

const INPUT_FILE = 'all_links_by_domain.txt';
const OUTPUT_DIR = 'downloaded_resources';
const SUCCESS_LOG = 'download_success.txt';
const FAIL_LOG = 'download_fail.txt';

async function downloadFile(url, dest) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    await mkdirp.mkdirp(path.dirname(dest));
    fs.writeFileSync(dest, response.data);
    console.log('Downloaded:', url, '->', dest);
    fs.appendFileSync(SUCCESS_LOG, `${url} -> ${dest}\n`);
  } catch (err) {
    console.error('Failed:', url, err.message);
    fs.appendFileSync(FAIL_LOG, `${url} -> ${err.message}\n`);
  }
}

function parseUrlsFromFile(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const urls = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      urls.push(trimmed);
    }
  }
  return urls;
}

async function main() {
  const urls = parseUrlsFromFile(INPUT_FILE);
  for (const url of urls) {
    // Skip FlipHTML5 links
    if (url.startsWith('https://online.fliphtml5.com/')) {
      continue;
    }
    try {
      const u = new URL(url);
      // Remove query string for file path, but keep for download
      const cleanPath = u.pathname.replace(/^\//, '');
      const filePath = path.join(OUTPUT_DIR, u.host, cleanPath || 'index');
      await downloadFile(url, filePath);
    } catch (e) {
      console.error('Invalid URL:', url);
      fs.appendFileSync(FAIL_LOG, `${url} -> Invalid URL\n`);
    }
  }
}

main(); 