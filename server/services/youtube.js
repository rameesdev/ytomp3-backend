const { search } = require('yt-search');
const { exec } = require('child_process');
const slugify = require('slugify');

/**
 * Clean up artist names and titles from typical YouTube noise
 */
function cleanSongTitle(title) {
  if (!title) return { songTitle: '', artistName: '' };
  
  // Remove common YouTube tags
  let clean = title
    .replace(/\[(Official Video|Official Music Video|Music Video|Lyrics|Audio|HD|4K)\]/gi, '')
    .replace(/\((Official Video|Official Music Video|Music Video|Lyrics|Audio|HD|4K)\)/gi, '')
    .replace(/\((Official|Lyric Video|Lyrical|HQ|Visualizer)\)/gi, '')
    .replace(/\[(Official|Lyric Video|Lyrical|HQ|Visualizer)\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Try to split artist and song if hyphen present
  const splitters = [' - ', ' – ', ' | '];
  for (const splitter of splitters) {
    if (clean.includes(splitter)) {
      const parts = clean.split(splitter);
      const artistName = parts[0].trim();
      const songTitle = parts.slice(1).join(splitter).trim();
      return { songTitle, artistName };
    }
  }

  return { songTitle: clean, artistName: 'Unknown Artist' };
}

/**
 * Extracts Youtube ID from URL
 */
function extractYoutubeId(url) {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

/**
 * Fetch detailed info for a single video
 */
async function getVideoInfo(youtubeUrlOrId) {
  const id = extractYoutubeId(youtubeUrlOrId) || youtubeUrlOrId;
  if (!id || id.length !== 11) {
    throw new Error('Invalid YouTube ID or URL');
  }

  const url = `https://www.youtube.com/watch?v=${id}`;
  
  try {
    const { getCookiesArgs } = require('../utils/cookies');
    const cookiesArg = getCookiesArgs();

    const ytDlpCmd = process.platform === 'win32' 
      ? `"${require('path').resolve(__dirname, '../../yt-dlp.exe')}"` 
      : `"${require('path').resolve(__dirname, '../../yt-dlp')}"`;
    const command = `${ytDlpCmd} ${cookiesArg} --js-runtimes node --dump-json "${url}"`;
    
    const details = await new Promise((resolve, reject) => {
      exec(command, { maxBuffer: 1024 * 1024 * 5 }, (error, stdout) => {
        if (error) return reject(error);
        try {
          resolve(JSON.parse(stdout));
        } catch (err) {
          reject(err);
        }
      });
    });
    
    const { songTitle, artistName } = cleanSongTitle(details.title);
    
    // Choose the best thumbnail
    let thumbnail = details.thumbnail || `https://img.youtube.com/vi/${id}/hqdefault.jpg`;

    return {
      youtubeId: id,
      title: songTitle || details.title,
      artist: artistName || details.uploader || details.channel || 'Unknown Artist',
      duration: parseInt(details.duration) || 0,
      thumbnail: thumbnail,
      slug: slugify(songTitle || details.title, { lower: true, strict: true })
    };
  } catch (error) {
    console.error('Error fetching video info:', error.message);
    throw new Error('Failed to fetch video details. Please check the URL and try again.');
  }
}

/**
 * Search YouTube for songs using keyword using yt-search
 */
async function searchVideos(query, limit = 10) {
  if (!query || query.trim() === '') {
    return [];
  }

  try {
    const r = await search(query);
    const videos = r.videos.slice(0, limit);
    
    return videos.map(video => {
      const { songTitle, artistName } = cleanSongTitle(video.title);
      return {
        youtubeId: video.videoId,
        title: songTitle || video.title,
        fullTitle: video.title,
        artist: artistName || video.author.name || 'Unknown Artist',
        duration: video.seconds || 0,
        thumbnail: video.thumbnail || video.image || `https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg`,
        channel: video.author.name || 'YouTube Channel',
        slug: slugify(songTitle || video.title, { lower: true, strict: true })
      };
    });
  } catch (error) {
    console.error('yt-search searchVideos error:', error.message);
    throw new Error(`YouTube search failed: ${error.message}`);
  }
}

module.exports = {
  getVideoInfo,
  searchVideos,
  extractYoutubeId,
  cleanSongTitle
};
