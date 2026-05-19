const synonyms = {
  download: ['download', 'get', 'fetch', 'save', 'grab', 'retrieve', 'extract'],
  convert: ['convert', 'transcode', 'transform', 'change', 'encode'],
  instantly: ['instantly', 'immediately', 'quickly', 'fast', 'without delay', 'in seconds'],
  free: ['free', 'at no cost', '100% free', 'complimentary', 'no charge'],
  quality: ['high-quality', 'excellent quality', 'crystal-clear', 'best quality', 'high-fidelity', 'premium audio'],
  platform: ['converter', 'downloader', 'platform', 'tool', 'service', 'system']
};

const templates = [
  "Looking to {download} {song} MP3 from YouTube? Use YTMP3, the ultimate {free} {platform} to {convert} and download your favorite tunes {instantly}. Our {platform} makes YouTube to MP3 conversion incredibly simple and fast. Enjoy {quality} MP3 files without registration.",
  "Streamline your music library! Easily {convert} and {download} {song} MP3 instantly from YouTube. With YTMP3, enjoy {quality} audio conversion {at no cost}. No software installation or sign-ups required. Just copy, paste, and enjoy your {quality} music track.",
  "Experience the fastest way to {download} {song} MP3 online. Our high-performance YouTube to MP3 {platform} lets you {convert} any video {instantly} and download it in {quality} audio format. YTMP3 is {free}, secure, and fully optimized for mobile and desktop downloads.",
  "Convert and {download} {song} MP3 from YouTube using our {free} {platform}. YTMP3 offers super-fast extraction and encoding, delivering {quality} MP3 sound quality {instantly}. Perfect for offline listening on any device.",
  "Get your hands on the {quality} audio of {song} by converting it from YouTube {instantly}. YTMP3 is the premier {free} {platform} to {convert} YouTube links to MP3 format. Enjoy unlimited conversions with no speed caps."
];

const artistTemplates = [
  "Discover the musical world of {artist} on YTMP3. Browse all popular songs, albums, and releases from {artist} and {convert} their top hits to MP3 {instantly}. Download {quality} audio files of your favorite tracks for offline playback.",
  "Get the latest tracks by {artist} {free} and in {quality} audio format. YTMP3 allows you to {download} and {convert} any {artist} song from YouTube. Start building your offline music collection of {artist} today.",
  "Love listening to {artist}? Our {platform} features an automated YouTube search for all {artist} tracks. Enjoy {free} conversions to 320kbps MP3 format and listen {instantly} on any of your devices."
];

const faqTemplates = [
  {
    q: "How to download {song} from YouTube in MP3 format?",
    a: "To download {song} as an MP3, copy its YouTube URL, paste it into the converter box on the YTMP3 homepage, select your preferred quality (like 320kbps), and click the Convert button. Once the conversion is complete, click Download."
  },
  {
    q: "Is YTMP3 safe and free for converting {song}?",
    a: "Yes, YTMP3 is 100% free and safe to use. You do not need to register an account or install any third-party extensions to convert and download {song}."
  },
  {
    q: "What is the best quality option to convert {song} to MP3?",
    a: "We support multiple qualities: 64kbps, 128kbps, and 320kbps. For the best sound quality, we recommend choosing 320kbps, which offers high-fidelity audio close to original CD quality."
  },
  {
    q: "Can I download {song} directly on my mobile phone?",
    a: "Absolutely! YTMP3 is fully responsive and optimized for mobile devices. You can convert and download {song} on Android, iPhone, or iPad using any standard web browser."
  }
];

function getRandomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function resolveSynonyms(text) {
  let resolved = text;
  
  // Replace placeholders like {download} with a random synonym
  const regex = /\{([a-zA-Z0-9_\-]+)\}/g;
  let match;
  
  while ((match = regex.exec(resolved)) !== null) {
    const key = match[1];
    if (synonyms[key]) {
      const synonym = getRandomElement(synonyms[key]);
      resolved = resolved.replace(`{${key}}`, synonym);
      // Reset regex index because text length changed
      regex.lastIndex = 0;
    }
  }
  
  return resolved;
}

/**
 * Generate SEO paragraph for a specific song
 */
function generateSongSeo(songName, artistName) {
  const songText = `${songName}${artistName && artistName !== 'Unknown Artist' ? ` by ${artistName}` : ''}`;
  
  // Choose 2-3 random templates to form a long block
  const numParagraphs = 2;
  const chosenTemplates = [];
  const tempArray = [...templates];
  
  for (let i = 0; i < numParagraphs; i++) {
    const index = Math.floor(Math.random() * tempArray.length);
    chosenTemplates.push(tempArray.splice(index, 1)[0]);
  }
  
  const paragraphs = chosenTemplates.map(template => {
    let content = template.replace(/\{song\}/g, songText);
    return resolveSynonyms(content);
  });
  
  return paragraphs.join('\n\n');
}

/**
 * Generate SEO paragraph for a specific artist
 */
function generateArtistSeo(artistName) {
  const paragraphs = artistTemplates.map(template => {
    let content = template.replace(/\{artist\}/g, artistName);
    return resolveSynonyms(content);
  });
  
  return paragraphs.join('\n\n');
}

/**
 * Generate FAQ list for a song
 */
function generateSongFaq(songName, artistName) {
  const songText = `${songName}${artistName && artistName !== 'Unknown Artist' ? ` by ${artistName}` : ''}`;
  
  return faqTemplates.map(faq => {
    return {
      question: faq.q.replace(/\{song\}/g, songText),
      answer: faq.a.replace(/\{song\}/g, songText)
    };
  });
}

module.exports = {
  generateSongSeo,
  generateArtistSeo,
  generateSongFaq
};
