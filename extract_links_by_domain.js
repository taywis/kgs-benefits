const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const glob = require('glob');
const { URL } = require('url');

// Helper to extract host from a URL (handles relative URLs)
function getHost(href, base) {
  try {
    const url = new URL(href, base);
    return url.host;
  } catch {
    return null;
  }
}

// Tags and their attributes to extract
const tagAttrs = [
  { tag: 'a', attr: 'href' },
  { tag: 'img', attr: 'src' },
  { tag: 'iframe', attr: 'src' },
  { tag: 'link', attr: 'href' },
  { tag: 'script', attr: 'src' },
  // Add more if needed
];

const baseDir = process.cwd();
const htmlFiles = glob.sync('**/*.html', { cwd: baseDir, absolute: true });
const domainMap = {};

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const $ = cheerio.load(html);
  const baseTag = $('base').attr('href');
  const base = baseTag || 'file://' + path.dirname(file) + '/';

  for (const { tag, attr } of tagAttrs) {
    $(tag).each((_, el) => {
      const val = $(el).attr(attr);
      if (val) {
        const host = getHost(val, base);
        if (host) {
          if (!domainMap[host]) domainMap[host] = new Set();
          domainMap[host].add(new URL(val, base).href);
        }
      }
    });
  }
}

// Sort and write output
const out = [];
const sortedDomains = Object.keys(domainMap).sort();
for (const domain of sortedDomains) {
  out.push(domain);
  const urls = Array.from(domainMap[domain]).sort();
  for (const url of urls) {
    out.push('  ' + url);
  }
}
fs.writeFileSync('all_links_by_domain.txt', out.join('\n'), 'utf8');
console.log('Extracted links written to all_links_by_domain.txt'); 