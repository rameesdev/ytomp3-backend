const fs = require('fs');
const path = require('path');
const Song = require('../models/Song');
const Artist = require('../models/Artist');
const Search = require('../models/Search');

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
const SITEMAP_DIR = path.join(PUBLIC_DIR, 'sitemaps');

// Ensure directories exist
if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}
if (!fs.existsSync(SITEMAP_DIR)) {
  fs.mkdirSync(SITEMAP_DIR, { recursive: true });
}

function escapeXml(unsafe) {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}

/**
 * Generate all sitemaps
 */
async function generateSitemaps(domain = 'https://ytomp3.cc') {
  console.log('[Sitemap Generator] Starting sitemap generation...');
  const cleanDomain = domain.endsWith('/') ? domain.slice(0, -1) : domain;
  const now = new Date().toISOString().split('T')[0];

  try {
    // 1. Generate Static / Main pages Sitemap (sitemap-main.xml)
    const staticUrls = [
      '',
      '/trending',
      '/top-downloads',
      '/faq',
      '/blog',
      '/contact',
      '/dmca',
      '/privacy-policy',
      '/terms-of-service'
    ];

    let mainXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    for (const url of staticUrls) {
      mainXml += `  <url>\n    <loc>${cleanDomain}${url}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>${url === '' ? '1.0' : '0.8'}</priority>\n  </url>\n`;
    }
    mainXml += `</urlset>`;
    fs.writeFileSync(path.join(SITEMAP_DIR, 'sitemap-main.xml'), mainXml);

    // 2. Generate Songs Sitemap (sitemap-songs.xml)
    // In a massive programmatic site, we'll fetch up to 45000 songs per sitemap. Let's start by generating one song sitemap.
    const songs = await Song.find({}, 'slug createdAt').sort({ createdAt: -1 }).limit(45000).lean();
    let songsXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    for (const song of songs) {
      const lastmod = song.createdAt ? new Date(song.createdAt).toISOString().split('T')[0] : now;
      songsXml += `  <url>\n    <loc>${cleanDomain}/song/${escapeXml(song.slug)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
    }
    songsXml += `</urlset>`;
    fs.writeFileSync(path.join(SITEMAP_DIR, 'sitemap-songs.xml'), songsXml);

    // 3. Generate Artists Sitemap (sitemap-artists.xml)
    const artists = await Artist.find({}, 'slug').sort({ views: -1 }).limit(45000).lean();
    let artistsXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    for (const artist of artists) {
      artistsXml += `  <url>\n    <loc>${cleanDomain}/artist/${escapeXml(artist.slug)}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>\n`;
    }
    artistsXml += `</urlset>`;
    fs.writeFileSync(path.join(SITEMAP_DIR, 'sitemap-artists.xml'), artistsXml);

    // 4. Generate Searches Sitemap (sitemap-searches.xml)
    const searches = await Search.find({}, 'slug lastSearched').sort({ count: -1 }).limit(45000).lean();
    let searchesXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    for (const search of searches) {
      const lastmod = search.lastSearched ? new Date(search.lastSearched).toISOString().split('T')[0] : now;
      searchesXml += `  <url>\n    <loc>${cleanDomain}/search/${escapeXml(search.slug)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.5</priority>\n  </url>\n`;
    }
    searchesXml += `</urlset>`;
    fs.writeFileSync(path.join(SITEMAP_DIR, 'sitemap-searches.xml'), searchesXml);

    // 5. Generate Index Sitemap (sitemap.xml in root public directory)
    let indexXml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    
    const sitemaps = ['sitemap-main.xml', 'sitemap-songs.xml', 'sitemap-artists.xml', 'sitemap-searches.xml'];
    for (const sm of sitemaps) {
      indexXml += `  <sitemap>\n    <loc>${cleanDomain}/sitemaps/${sm}</loc>\n    <lastmod>${now}</lastmod>\n  </sitemap>\n`;
    }
    indexXml += `</sitemapindex>`;
    fs.writeFileSync(path.join(PUBLIC_DIR, 'sitemap.xml'), indexXml);

    console.log('[Sitemap Generator] Sitemaps generated successfully.');
  } catch (error) {
    console.error('[Sitemap Generator] Error generating sitemaps:', error.message);
  }
}

module.exports = {
  generateSitemaps
};
