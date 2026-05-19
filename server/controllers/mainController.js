const Song = require('../models/Song');
const Artist = require('../models/Artist');
const Search = require('../models/Search');
const SeoPage = require('../models/SeoPage');
const { searchVideos } = require('../services/youtube');
const { generateSongSeo, generateSongFaq, generateArtistSeo } = require('../utils/seoGenerator');
const slugify = require('slugify');

/**
 * Render Homepage
 */
exports.home = async (req, res) => {
  try {
    res.setAppJsonLd();
    res.setBreadcrumbs([{ name: 'Home', url: '/' }]);
    
    // Custom homepage SEO has already been set as default in middleware,
    // but let's make sure it's set
    res.setSeo({
      title: 'YTMP3 – Free YouTube to MP3 Converter',
      description: 'Convert YouTube videos to MP3 instantly using YTMP3. Fast, free and high-quality YouTube to MP3 downloader.'
    });

    return res.render('home');
  } catch (error) {
    console.error('Home rendering error:', error.message);
    return res.status(500).send('Internal Server Error');
  }
};

/**
 * Programmatic Search Page (Pre-rendered with YouTube results)
 */
exports.searchPage = async (req, res) => {
  try {
    const { slug } = req.params;
    
    // Convert slug to search phrase (e.g. 'on-my-way' -> 'on my way')
    const query = slug.replace(/-/g, ' ');
    
    // Fetch search results from YouTube
    let results = [];
    try {
      results = await searchVideos(query, 6);
    } catch (err) {
      console.error(`Search failed for slug ${slug}:`, err.message);
    }

    // Dynamic SEO configuration for the search term
    const cleanTitle = query.replace(/\b\w/g, c => c.toUpperCase());
    res.setSeo({
      title: `Convert & Download ${cleanTitle} MP3 – YTMP3`,
      description: `Fast and free YouTube to MP3 downloader for "${cleanTitle}". Convert video to high-quality audio files instantly without registration.`,
      keywords: `${slug}, convert ${query}, download ${query} mp3, free yt converter`
    });

    // FAQs for this search term
    const faqs = generateSongFaq(cleanTitle, '');
    res.setFaqJsonLd(faqs);

    res.setBreadcrumbs([
      { name: 'Home', url: '/' },
      { name: `Search: ${cleanTitle}`, url: `/search/${slug}` }
    ]);

    // Store search keyword in DB for sitemaps if results were found
    if (results.length > 0) {
      Search.findOneAndUpdate(
        { slug },
        { 
          $set: { keyword: query },
          $inc: { count: 1 }, 
          $setOnInsert: { lastSearched: new Date() } 
        },
        { upsert: true }
      ).catch(err => console.error('Error logging search page access:', err.message));
    }

    // Dynamic SEO paragraph for search page
    const seoParagraph = generateSongSeo(cleanTitle, '');

    return res.render('search', {
      query,
      results,
      seoParagraph,
      faqs
    });
  } catch (error) {
    console.error('Search page rendering error:', error.message);
    return res.status(500).send('Internal Server Error');
  }
};

/**
 * Programmatic Song Detail Page
 */
exports.songPage = async (req, res) => {
  try {
    const { slug } = req.params;
    
    // Find song in DB
    const song = await Song.findOne({ slug });
    if (!song) {
      // If song not in DB, it could be a programmatic crawl for a valid title.
      // We can try to decode the slug, search it, and save the top result!
      // This makes the site *truly* programmatic. Crawlers hitting /song/any-song-title
      // will trigger an automatic discovery!
      const query = slug.replace(/-/g, ' ');
      const results = await searchVideos(query, 1);
      
      if (results.length > 0) {
        const topResult = results[0];
        const newSong = new Song({
          title: topResult.title,
          slug: slug, // Keep the requested slug
          artist: topResult.artist,
          artistSlug: slugify(topResult.artist, { lower: true, strict: true }),
          duration: topResult.duration,
          thumbnail: topResult.thumbnail,
          youtubeId: topResult.youtubeId,
          views: 1
        });
        await newSong.save();
        
        // Redirect to self to render correctly
        return res.redirect(`/song/${slug}`);
      }
      
      return res.status(404).send('Song not found');
    }

    // Increment song views
    song.views += 1;
    await song.save();

    // Fetch related songs (same artist or similar tags, fallback to recent)
    let relatedSongs = await Song.find({ 
      artistSlug: song.artistSlug, 
      youtubeId: { $ne: song.youtubeId } 
    }).limit(6).lean();

    if (relatedSongs.length < 3) {
      const extraSongs = await Song.find({ youtubeId: { $ne: song.youtubeId } })
        .sort({ views: -1 })
        .limit(6 - relatedSongs.length)
        .lean();
      relatedSongs = [...relatedSongs, ...extraSongs];
    }

    // Set SEO and JSON-LD schema
    const seoTitle = `${song.title} MP3 Download – YTMP3 YouTube Converter`;
    const seoDescription = `Convert and download ${song.title} MP3 from YouTube using YTMP3. Fast and free YouTube to MP3 conversion for ${song.title} by ${song.artist}.`;
    
    // Find or generate SEO paragraphs
    let seoContent = '';
    const seoPage = await SeoPage.findOne({ slug: `song/${slug}` });
    if (seoPage) {
      seoContent = seoPage.content;
    } else {
      seoContent = generateSongSeo(song.title, song.artist);
    }

    res.setSeo({
      title: seoTitle,
      description: seoDescription,
      keywords: `${slug}, download ${song.title} mp3, convert ${song.title} from youtube, ytmp3`,
      image: song.thumbnail
    });

    res.setSongJsonLd(song);
    res.setBreadcrumbs([
      { name: 'Home', url: '/' },
      { name: song.artist, url: `/artist/${song.artistSlug}` },
      { name: song.title, url: `/song/${slug}` }
    ]);

    const faqs = generateSongFaq(song.title, song.artist);

    return res.render('song', {
      song,
      relatedSongs,
      seoContent,
      faqs
    });
  } catch (error) {
    console.error('Song page rendering error:', error.message);
    return res.status(500).send('Internal Server Error');
  }
};

/**
 * Programmatic Artist Page
 */
exports.artistPage = async (req, res) => {
  try {
    const { slug } = req.params;

    const artist = await Artist.findOne({ slug });
    if (!artist) {
      // Auto-generate artist details if slug looks valid
      const name = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const newArtist = new Artist({
        name,
        slug,
        genres: ['Pop', 'Music'],
        views: 1
      });
      await newArtist.save();
      return res.redirect(`/artist/${slug}`);
    }

    artist.views += 1;
    await artist.save();

    // Fetch songs by this artist
    const songs = await Song.find({ artistSlug: slug }).sort({ views: -1 }).limit(12).lean();

    // Set SEO
    const seoTitle = `Download ${artist.name} MP3 Songs Free – YTMP3`;
    const seoDescription = `Convert and download top hits from ${artist.name} in high quality MP3 format. Free YouTube to MP3 converter for ${artist.name} songs.`;
    
    let seoContent = '';
    const artistSeoPage = await SeoPage.findOne({ slug: `artist/${slug}` });
    if (artistSeoPage) {
      seoContent = artistSeoPage.content;
    } else {
      seoContent = generateArtistSeo(artist.name);
    }

    res.setSeo({
      title: seoTitle,
      description: seoDescription,
      keywords: `${slug}, download ${artist.name} mp3, list ${artist.name} songs, convert youtube music`
    });

    res.setBreadcrumbs([
      { name: 'Home', url: '/' },
      { name: artist.name, url: `/artist/${slug}` }
    ]);

    // Format artist schema
    res.locals.seo.jsonLd = {
      "@context": "https://schema.org",
      "@type": "MusicGroup",
      "name": artist.name,
      "image": artist.image || `${req.protocol}://${req.get('host')}/images/og-image.png`,
      "url": `${req.protocol}://${req.get('host')}/artist/${slug}`
    };

    return res.render('artist', {
      artist,
      songs,
      seoContent
    });
  } catch (error) {
    console.error('Artist page rendering error:', error.message);
    return res.status(500).send('Internal Server Error');
  }
};

/**
 * Genre Page
 */
exports.genrePage = async (req, res) => {
  try {
    const { slug } = req.params;
    const cleanGenre = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    // Fetch songs belonging to the artist's genre or fallback to popular songs
    // Querying tags or artist's genres
    const artistsInGenre = await Artist.find({ genres: { $in: [cleanGenre, slug] } }, 'slug');
    const artistSlugs = artistsInGenre.map(a => a.slug);

    const songs = await Song.find({
      $or: [
        { artistSlug: { $in: artistSlugs } },
        { tags: { $in: [cleanGenre, slug] } }
      ]
    }).sort({ views: -1 }).limit(18).lean();

    // SEO
    res.setSeo({
      title: `Free ${cleanGenre} MP3 Music Downloads – YTMP3`,
      description: `Browse and download the best ${cleanGenre} music from YouTube in MP3 format. 100% free high-quality converter.`,
      keywords: `${slug} music, convert ${slug} songs, download ${slug} tracks`
    });

    res.setBreadcrumbs([
      { name: 'Home', url: '/' },
      { name: `${cleanGenre} Genre`, url: `/genre/${slug}` }
    ]);

    return res.render('genre', {
      genre: cleanGenre,
      songs
    });
  } catch (error) {
    console.error('Genre page rendering error:', error.message);
    return res.status(500).send('Internal Server Error');
  }
};

/**
 * Trending Songs Page
 */
exports.trending = async (req, res) => {
  try {
    const songs = await Song.find().sort({ views: -1, downloadsCount: -1 }).limit(20).lean();

    res.setSeo({
      title: 'Top Trending YouTube Music Downloads – YTMP3',
      description: 'Explore and download the most converted trending music from YouTube. Free High-quality 320kbps MP3 downloader.',
      keywords: 'trending mp3, top converted songs, popular music downloads'
    });

    res.setBreadcrumbs([
      { name: 'Home', url: '/' },
      { name: 'Trending Music', url: '/trending' }
    ]);

    return res.render('trending', {
      title: 'Trending Music',
      description: 'The most popular YouTube videos converted to MP3 recently.',
      songs
    });
  } catch (error) {
    console.error('Trending page error:', error.message);
    return res.status(500).send('Internal Server Error');
  }
};

/**
 * Top Downloads Page
 */
exports.topDownloads = async (req, res) => {
  try {
    const songs = await Song.find().sort({ downloadsCount: -1 }).limit(20).lean();

    res.setSeo({
      title: 'Top MP3 Music Downloads – YTMP3',
      description: 'Get the most downloaded MP3 songs converted from YouTube. Free, safe, and fast converter.',
      keywords: 'top downloaded songs, most popular conversions, free music download'
    });

    res.setBreadcrumbs([
      { name: 'Home', url: '/' },
      { name: 'Top Downloads', url: '/top-downloads' }
    ]);

    return res.render('trending', {
      title: 'Top Downloads',
      description: 'The absolute highest downloaded songs on YTMP3.',
      songs
    });
  } catch (error) {
    console.error('Top downloads page error:', error.message);
    return res.status(500).send('Internal Server Error');
  }
};

/**
 * FAQ Page
 */
exports.faq = async (req, res) => {
  const faqs = [
    {
      question: "What is YTMP3?",
      answer: "YTMP3 is a free online multimedia conversion platform that allows you to convert YouTube videos to high-quality MP3 audio files. It is fast, registration-free, and optimized for both desktop and mobile platforms."
    },
    {
      question: "How do I convert a YouTube video to MP3?",
      answer: "Simply copy the YouTube video link, paste it into our search/conversion bar on the homepage, choose your desired quality (64kbps, 128kbps, or 320kbps), and click Convert. Once the progress hits 100%, click the Download button to get your file."
    },
    {
      question: "Is there a limit to the number of conversions?",
      answer: "No, YTMP3 offers unlimited conversions and downloads. You can convert as many videos as you want, completely free."
    },
    {
      question: "Do I need to install any software or register?",
      answer: "No software installation, browser extensions, or registration is required. Everything runs directly in your web browser."
    },
    {
      question: "What audio bitrates are supported?",
      answer: "We support three audio qualities: 320kbps (best quality), 128kbps (standard quality), and 64kbps (small file size, best for voice or slow connections)."
    }
  ];

  res.setFaqJsonLd(faqs);
  res.setBreadcrumbs([
    { name: 'Home', url: '/' },
    { name: 'Frequently Asked Questions', url: '/faq' }
  ]);
  res.setSeo({
    title: 'FAQ – Frequently Asked Questions – YTMP3',
    description: 'Find answers to common questions about YTMP3 YouTube to MP3 converter, file quality, compatibility, and security.'
  });

  return res.render('static/faq', { faqs });
};

/**
 * Blog Index Page
 */
exports.blog = async (req, res) => {
  const articles = [
    {
      title: "Best YouTube to MP3 Converter in 2026: Fast and Safe",
      slug: "best-youtube-to-mp3-converter",
      summary: "Looking for a fast, free, and secure way to download YouTube songs? Read our full breakdown of why YTMP3 is the premier choice.",
      date: "May 15, 2026"
    },
    {
      title: "How to Convert YouTube Videos to MP3 on Android and iPhone",
      slug: "how-to-convert-youtube-to-mp3-mobile",
      summary: "A step-by-step tutorial on converting and saving YouTube audio files directly onto your mobile devices without any apps.",
      date: "May 10, 2026"
    },
    {
      title: "YTMP3 Alternatives: Best Free Audio Downloaders",
      slug: "ytmp3-alternatives-free-downloaders",
      summary: "A comprehensive review of online alternatives to YTMP3 for video conversions, comparison of speed, bitrates, and features.",
      date: "May 03, 2026"
    }
  ];

  res.setBreadcrumbs([
    { name: 'Home', url: '/' },
    { name: 'Blog', url: '/blog' }
  ]);
  res.setSeo({
    title: 'YTMP3 Blog – Guides, Tutorials & Converter Tips',
    description: 'Read the latest tutorials, comparison guides, and tips on YouTube video to MP3 conversions, mobile audio saving, and more.'
  });

  return res.render('static/blog', { articles });
};

/**
 * Blog Article Page
 */
exports.blogArticle = async (req, res) => {
  const { slug } = req.params;
  
  const blogDb = {
    'best-youtube-to-mp3-converter': {
      title: "Best YouTube to MP3 Converter in 2026: Fast and Safe",
      description: "Convert YouTube videos to MP3 safely and quickly. Compare bitrates, file sizes, and learn how to get crystal clear audio.",
      date: "May 15, 2026",
      content: `
        <h2>Why YTMP3 is the Best Choice</h2>
        <p>In 2026, music streaming is bigger than ever, but offline listening remains crucial. Whether you are flying, commuting, or saving cellular data, having your favorite tracks stored locally as MP3s is incredibly useful.</p>
        <p>YTMP3 has established itself as the leading tool for converting YouTube videos to MP3 audio files. Unlike other converters, YTMP3 requires no software, no browser extensions, and zero registrations. It is 100% free and offers speeds that outperform other platforms.</p>
        <h3>Important Converter Features to Look For:</h3>
        <ul>
          <li><strong>Audio Quality:</strong> Choose converters that support up to 320kbps audio bitrates.</li>
          <li><strong>Speed:</strong> A solid server-side queue ensures conversions complete in seconds.</li>
          <li><strong>Mobile Compatibility:</strong> The interface must load fast and respond to mobile taps.</li>
          <li><strong>Safety:</strong> No malware, pop-up redirects, or suspicious file download prompts.</li>
        </ul>
        <p>YTMP3 ticks all these boxes by using advanced queues (BullMQ + Redis) and robust transcoding algorithms (FFmpeg) behind a polished, ad-safe layout.</p>
      `
    },
    'how-to-convert-youtube-to-mp3-mobile': {
      title: "How to Convert YouTube Videos to MP3 on Android and iPhone",
      description: "Step-by-step instructions on saving YouTube music streams as local MP3 files directly onto mobile browsers, iPad, and iOS Safari.",
      date: "May 10, 2026",
      content: `
        <h2>Step-by-Step Mobile Conversion Guide</h2>
        <p>Converting YouTube videos to MP3 files on a phone is easy once you know how to navigate the settings. You do not need dedicated apps which hog memory and send notifications.</p>
        <h3>On Android:</h3>
        <ol>
          <li>Open the YouTube app and search for the song you want.</li>
          <li>Tap the <strong>Share</strong> button under the video and choose <strong>Copy link</strong>.</li>
          <li>Open your Chrome browser and navigate to <strong>ytmp3.cc</strong> (or our current domain).</li>
          <li>Paste the link into the converter box, pick your audio bitrate (128kbps or 320kbps), and tap <strong>Convert</strong>.</li>
          <li>When the download link appears, tap it to download the file directly to your downloads folder.</li>
        </ol>
        <h3>On iOS (iPhone/iPad):</h3>
        <ol>
          <li>Copy the YouTube link similarly from the YouTube app.</li>
          <li>Open the Safari browser and head to YTMP3.</li>
          <li>Paste the link, tap convert.</li>
          <li>In Safari on iOS 13 and above, you will see a download pop-up. Tap <strong>Download</strong>. The file will save directly in your Files app under the Downloads folder.</li>
        </ol>
      `
    },
    'ytmp3-alternatives-free-downloaders': {
      title: "YTMP3 Alternatives: Best Free Audio Downloaders",
      description: "Explore the best alternative YouTube to MP3 converter sites. Check their feature lists, support for high quality audio, and speed differences.",
      date: "May 03, 2026",
      content: `
        <h2>Top Alternatives for YouTube Audio Conversion</h2>
        <p>While YTMP3 is optimized for lightning-fast speeds and high-density keyword search pages, there are other tools available online if you need alternatives.</p>
        <h3>What makes a converter standard?</h3>
        <p>When selecting a backup converter, ensure it maintains strict safety guidelines. Some alternative sites push intrusive pop-up notifications, ask for subscription signups, or download bundleware. YTMP3 stands out by running all processes on clean Linux servers and returning direct file headers.</p>
        <p>Our platform also features dedicated programmatic pages for millions of songs, allowing you to bypass YouTube altogether and browse trending conversions or search for artists and discover their catalog directly from search engines.</p>
      `
    }
  };

  const article = blogDb[slug];
  if (!article) {
    return res.status(404).send('Blog article not found');
  }

  res.setBreadcrumbs([
    { name: 'Home', url: '/' },
    { name: 'Blog', url: '/blog' },
    { name: article.title, url: `/blog/${slug}` }
  ]);
  
  res.setSeo({
    title: `${article.title} – YTMP3 Blog`,
    description: article.description
  });

  return res.render('static/blog-article', { article });
};

/**
 * Static Pages: Privacy, Terms, DMCA, Contact
 */
exports.staticPage = async (req, res) => {
  const path = req.path.replace(/\//g, '');
  
  let viewName = 'static/privacy';
  let title = 'Privacy Policy – YTMP3';
  let description = 'Privacy policy and user data practices for YTMP3 YouTube converter.';

  if (path === 'terms-of-service') {
    viewName = 'static/terms';
    title = 'Terms of Service – YTMP3';
    description = 'Terms and conditions governing the use of YTMP3 conversion utility.';
  } else if (path === 'dmca') {
    viewName = 'static/dmca';
    title = 'DMCA Copyright Compliance – YTMP3';
    description = 'Copyright infringement reporting policy, agent contact, and DMCA claims guidelines for YTMP3.';
  } else if (path === 'contact') {
    viewName = 'static/contact';
    title = 'Contact Support – YTMP3';
    description = 'Reach out to the YTMP3 team for inquiries, bug reports, and support requests.';
  }

  res.setBreadcrumbs([
    { name: 'Home', url: '/' },
    { name: title.split(' – ')[0], url: `/${path}` }
  ]);

  res.setSeo({ title, description });

  return res.render(viewName);
};
