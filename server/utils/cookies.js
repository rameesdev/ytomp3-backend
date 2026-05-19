const fs = require('fs');
const path = require('path');

/**
 * Checks for YT_COOKIES environment variable, writes it to a temp file,
 * and returns the appropriate --cookies argument for yt-dlp.
 */
function getCookiesArgs() {
  if (process.env.YT_COOKIES) {
    const cookiesPath = process.platform === 'win32' 
      ? path.join(__dirname, '../../temp/cookies.txt') 
      : '/tmp/cookies.txt';
    
    try {
      const dir = path.dirname(cookiesPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      let cookiesContent = process.env.YT_COOKIES.trim();
      if (cookiesContent.startsWith('"') && cookiesContent.endsWith('"')) {
        cookiesContent = cookiesContent.slice(1, -1);
      }
      // Replace literal escaped \n with actual newlines
      cookiesContent = cookiesContent.replace(/\\n/g, '\n');

      // Write Netscape cookies content to a file
      fs.writeFileSync(cookiesPath, cookiesContent, 'utf8');
      return `--cookies "${cookiesPath}"`;
    } catch (err) {
      console.error('Failed to write yt-dlp cookies file:', err.message);
      return '';
    }
  }
  return '';
}

module.exports = { getCookiesArgs };
