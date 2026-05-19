require('dotenv').config();

module.exports = (req, res, next) => {
  // Determine standard canonical domain
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.get('host');
  const path = req.originalUrl.split('?')[0]; // Strip query params for canonical
  const canonicalUrl = `${protocol}://${host}${path}`;

  // Default SEO settings
  res.locals.seo = {
    title: 'YTMP3 – Free YouTube to MP3 Converter',
    description: 'Convert YouTube videos to MP3 instantly using YTMP3. Fast, free and high-quality YouTube to MP3 downloader.',
    keywords: 'ytomp3, youtube to mp3, yt to mp3, mp3 converter, youtube mp3 downloader, convert youtube to mp3, free youtube converter, music mp3 download',
    canonical: canonicalUrl,
    image: `${protocol}://${host}/images/og-image.png`,
    siteName: 'YTMP3',
    twitterCard: 'summary_large_image',
    robots: 'index, follow',
    breadcrumbs: [],
    jsonLd: null
  };

  // Helper method to set custom SEO values
  res.setSeo = (customSeo) => {
    res.locals.seo = { ...res.locals.seo, ...customSeo };
  };

  // Helper to construct FAQ JSON-LD
  res.setFaqJsonLd = (faqs) => {
    res.locals.seo.jsonLd = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": faqs.map(faq => ({
        "@type": "Question",
        "name": faq.question,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": faq.answer
        }
      }))
    };
  };

  // Helper to construct MusicRecording JSON-LD
  res.setSongJsonLd = (song) => {
    res.locals.seo.jsonLd = {
      "@context": "https://schema.org",
      "@type": "MusicRecording",
      "name": song.title,
      "image": song.thumbnail,
      "duration": `PT${Math.floor(song.duration / 60)}M${song.duration % 60}S`,
      "byArtist": {
        "@type": "MusicGroup",
        "name": song.artist,
        "url": `${protocol}://${host}/artist/${song.artistSlug}`
      },
      "potentialAction": {
        "@type": "DownloadAction",
        "target": canonicalUrl
      }
    };
  };

  // Helper to construct WebApplication (Converter Tool) JSON-LD
  res.setAppJsonLd = () => {
    res.locals.seo.jsonLd = {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      "name": "YTMP3",
      "url": `${protocol}://${host}/`,
      "applicationCategory": "MultimediaApplication",
      "operatingSystem": "All",
      "browserRequirements": "Requires JavaScript. Requires HTML5.",
      "offers": {
        "@type": "Offer",
        "price": "0.00",
        "priceCurrency": "USD"
      }
    };
  };

  // Helper to set Breadcrumbs
  res.setBreadcrumbs = (items) => {
    // items: [{ name: 'Home', url: '/' }, { name: 'Song', url: '/song/...' }]
    const listItems = items.map((item, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "name": item.name,
      "item": `${protocol}://${host}${item.url}`
    }));

    res.locals.seo.breadcrumbs = items;
    
    // Add breadcrumb schema alongside any other schema
    res.locals.seo.breadcrumbJsonLd = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": listItems
    };
  };

  next();
};
