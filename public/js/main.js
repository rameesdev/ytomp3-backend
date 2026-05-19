/**
 * Client-side script for YTMP3 converter interactions
 */

function slugifyKeyword(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
    .replace(/\-\-+/g, '-')         // Replace multiple - with single -
    .replace(/^-+/, '')             // Trim - from start of text
    .replace(/-+$/, '');            // Trim - from end of text
}

function isYoutubeUrl(url) {
  const regExp = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/;
  return regExp.test(url.trim());
}

/**
 * Handle homepage converter form submission
 */
async function handleConvertSubmit(event) {
  event.preventDefault();

  const inputEl = document.getElementById('video-input');
  const query = inputEl.value.trim();
  
  if (!query) return;

  const qualityRadio = document.querySelector('input[name="quality"]:checked');
  const quality = qualityRadio ? qualityRadio.value : '128kbps';

  // 1. If it's NOT a YouTube URL, treat as keyword search and redirect to SEO search landing page
  if (!isYoutubeUrl(query)) {
    const slug = slugifyKeyword(query);
    if (slug) {
      window.location.href = `/search/${slug}`;
    } else {
      alert('Please enter a valid search phrase or YouTube URL.');
    }
    return;
  }

  // 2. If it is a YouTube URL, trigger standard inline AJAX conversion
  const statusCard = document.getElementById('status-card');
  statusCard.style.display = 'block';

  const phaseEl = document.getElementById('status-phase');
  const percentEl = document.getElementById('status-percent');
  const progressEl = document.getElementById('status-progress');
  const downloadWrap = document.getElementById('status-download-btn-wrap');
  const errorWrap = document.getElementById('status-error-wrap');

  // Reset UI elements
  phaseEl.innerText = 'Analyzing YouTube URL...';
  percentEl.innerText = '0%';
  progressEl.style.width = '0%';
  downloadWrap.style.display = 'none';
  errorWrap.style.display = 'none';

  try {
    // 2. Send POST request to /convert endpoint
    const response = await fetch('/api/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: query, quality })
    });

    const result = await response.json();
    if (response.ok && result.downloadUrl) {
      // Update UI to show completion
      phaseEl.innerText = 'Completed! Downloading...';
      percentEl.innerText = '100%';
      progressEl.style.width = '100%';
      downloadWrap.style.display = 'block';
      
      const downloadLinkEl = document.getElementById('status-download-link');
      if (downloadLinkEl) {
        downloadLinkEl.href = result.downloadUrl;
      }
      
      // Auto-trigger removed as requested by user
    } else {
      alert(result.error || 'Conversion failed. Please try again.');
    }

    inputEl.value = ''; // Clear input box after submission

  } catch (error) {
    console.error('Conversion trigger failed:', error);
    phaseEl.innerText = 'Failed';
    errorWrap.style.display = 'block';
    errorWrap.innerText = error.message || 'An error occurred during video analysis.';
  }
}

/**
 * Poll job status and animate progress bar
 */
function trackHomepageStatus(jobId) {
  const phaseEl = document.getElementById('status-phase');
  const percentEl = document.getElementById('status-percent');
  const progressEl = document.getElementById('status-progress');
  const downloadWrap = document.getElementById('status-download-btn-wrap');
  const errorWrap = document.getElementById('status-error-wrap');

  const interval = setInterval(async () => {
    try {
      const response = await fetch(`/api/status/${jobId}`);
      const data = await response.json();

      if (data.error) {
        clearInterval(interval);
        phaseEl.innerText = 'Failed';
        errorWrap.style.display = 'block';
        errorWrap.innerText = data.error;
        return;
      }

      const progress = data.progress || 0;
      percentEl.innerText = `${progress}%`;
      progressEl.style.width = `${progress}%`;
      phaseEl.innerText = data.phase === 'downloading' ? 'Downloading audio streams...' : 'Encoding to MP3 audio...';

      if (data.status === 'completed') {
        clearInterval(interval);
        phaseEl.innerText = 'Completed!';
        percentEl.innerText = '100%';
        progressEl.style.width = '100%';
        downloadWrap.style.display = 'block';
        document.getElementById('status-download-link').href = data.downloadUrl;
      }
    } catch (err) {
      clearInterval(interval);
      phaseEl.innerText = 'Failed';
      errorWrap.style.display = 'block';
      errorWrap.innerText = 'Lost telemetry connection with background workers.';
    }
  }, 2000);
}
