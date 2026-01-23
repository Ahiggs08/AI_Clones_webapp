/**
 * Video stitching utility using ffmpeg.wasm
 * Combines multiple video clips into a single seamless video
 */

let ffmpeg = null;
let ffmpegLoaded = false;

/**
 * Load ffmpeg.wasm (lazy loading)
 */
export const loadFFmpeg = async (onProgress) => {
  if (ffmpegLoaded && ffmpeg) {
    return ffmpeg;
  }
  
  try {
    // Dynamically import ffmpeg
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const { fetchFile, toBlobURL } = await import('@ffmpeg/util');
    
    ffmpeg = new FFmpeg();
    
    // Set up progress logging
    ffmpeg.on('log', ({ message }) => {
      console.log('[FFmpeg]', message);
    });
    
    ffmpeg.on('progress', ({ progress }) => {
      if (onProgress) {
        onProgress(Math.round(progress * 100));
      }
    });
    
    // Load ffmpeg core from CDN
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    
    ffmpegLoaded = true;
    console.log('[FFmpeg] Loaded successfully');
    
    return ffmpeg;
  } catch (error) {
    console.error('[FFmpeg] Failed to load:', error);
    throw new Error('Failed to load video processing library');
  }
};

/**
 * Stitch multiple video URLs into a single video
 * @param {string[]} videoUrls - Array of video URLs to stitch
 * @param {function} onProgress - Progress callback (0-100)
 * @returns {Promise<Blob>} - Combined video as a Blob
 */
export const stitchVideos = async (videoUrls, onProgress) => {
  if (!videoUrls || videoUrls.length === 0) {
    throw new Error('No videos to stitch');
  }
  
  // If only one video, just return it
  if (videoUrls.length === 1) {
    const response = await fetch(videoUrls[0]);
    return await response.blob();
  }
  
  const { fetchFile } = await import('@ffmpeg/util');
  
  // Load ffmpeg
  if (onProgress) onProgress(5);
  const ff = await loadFFmpeg((p) => {
    if (onProgress) onProgress(10 + Math.round(p * 0.3)); // 10-40%
  });
  
  try {
    // Download all videos and write to ffmpeg filesystem
    const videoFiles = [];
    for (let i = 0; i < videoUrls.length; i++) {
      const filename = `video${i}.mp4`;
      console.log(`[FFmpeg] Downloading video ${i + 1}/${videoUrls.length}`);
      
      if (onProgress) {
        onProgress(40 + Math.round((i / videoUrls.length) * 20)); // 40-60%
      }
      
      const videoData = await fetchFile(videoUrls[i]);
      await ff.writeFile(filename, videoData);
      videoFiles.push(filename);
    }
    
    // Create concat file
    const concatContent = videoFiles.map(f => `file '${f}'`).join('\n');
    await ff.writeFile('concat.txt', concatContent);
    
    console.log('[FFmpeg] Starting video concatenation...');
    if (onProgress) onProgress(65);
    
    // Run ffmpeg concat
    await ff.exec([
      '-f', 'concat',
      '-safe', '0',
      '-i', 'concat.txt',
      '-c', 'copy',
      '-movflags', '+faststart',
      'output.mp4'
    ]);
    
    if (onProgress) onProgress(90);
    
    // Read the output
    const data = await ff.readFile('output.mp4');
    
    // Clean up
    for (const file of videoFiles) {
      await ff.deleteFile(file);
    }
    await ff.deleteFile('concat.txt');
    await ff.deleteFile('output.mp4');
    
    if (onProgress) onProgress(100);
    
    // Create blob
    return new Blob([data.buffer], { type: 'video/mp4' });
    
  } catch (error) {
    console.error('[FFmpeg] Stitching failed:', error);
    throw new Error('Failed to combine videos: ' + error.message);
  }
};

/**
 * Check if browser supports ffmpeg.wasm
 */
export const isFFmpegSupported = () => {
  return typeof SharedArrayBuffer !== 'undefined';
};

export default {
  loadFFmpeg,
  stitchVideos,
  isFFmpegSupported
};
