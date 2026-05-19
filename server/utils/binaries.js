const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const BIN_DIR = path.join(__dirname, '..', '..', 'bin');

// Initialize binary directory if it doesn't exist
if (!fs.existsSync(BIN_DIR)) {
  fs.mkdirSync(BIN_DIR, { recursive: true });
}

function getBinaryPath(binaryName) {
  // 1. Check if configured in environment variables
  const envVar = binaryName.toUpperCase().replace(/-/g, '_') + '_PATH';
  if (process.env[envVar]) {
    return process.env[envVar];
  }

  const isWindows = process.platform === 'win32';
  const exeName = isWindows ? `${binaryName}.exe` : binaryName;

  // 2. Check in local bin directory
  const localPath = path.join(BIN_DIR, exeName);
  if (fs.existsSync(localPath)) {
    return localPath;
  }

  // 3. Try to check system PATH using standard command check
  try {
    const cmd = isWindows ? `where ${exeName}` : `which ${binaryName}`;
    const stdout = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (stdout) {
      // Split by newline in case multiple paths are returned, take the first one
      return stdout.split('\n')[0].trim();
    }
  } catch (err) {
    // If not found in PATH, swallow error and fall back
  }

  // 4. Try npm installers as a fallback
  try {
    if (binaryName === 'ffmpeg') {
      return require('@ffmpeg-installer/ffmpeg').path;
    }
    if (binaryName === 'ffprobe') {
      return require('@ffprobe-installer/ffprobe').path;
    }
  } catch (err) {
    // Fail silently if package is not present
  }

  // 5. Default fallback: assume in PATH and hope for the best
  return binaryName;
}

module.exports = {
  getYtDlpPath: () => getBinaryPath('yt-dlp'),
  getFfmpegPath: () => getBinaryPath('ffmpeg'),
  getFfprobePath: () => getBinaryPath('ffprobe'),
  binDir: BIN_DIR
};
