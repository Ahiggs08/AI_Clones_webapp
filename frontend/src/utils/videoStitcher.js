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
 * Get video duration by running ffmpeg -i and parsing output
 */
const getVideoDuration = async (ff, filename) => {
  return new Promise((resolve) => {
    let duration = 0;
    const handler = ({ message }) => {
      const match = message.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
      if (match) {
        const hours = parseInt(match[1]);
        const minutes = parseInt(match[2]);
        const seconds = parseInt(match[3]);
        const centiseconds = parseInt(match[4]);
        duration = hours * 3600 + minutes * 60 + seconds + centiseconds / 100;
      }
    };

    ff.on('log', handler);

    // Run a quick probe — ffmpeg will error since there's no output, but we get duration from logs
    ff.exec(['-i', filename]).catch(() => {}).finally(() => {
      ff.off('log', handler);
      resolve(duration);
    });
  });
};

/**
 * Stitch multiple video URLs with crossfade transitions
 * @param {string[]} videoUrls - Array of video URLs to stitch
 * @param {function} onProgress - Progress callback (0-100)
 * @param {number} transitionDuration - Crossfade duration in seconds (default: 0.5)
 * @returns {Promise<Blob>} - Combined video as a Blob
 */
export const stitchVideosWithTransitions = async (videoUrls, onProgress, transitionDuration = 0.5) => {
  if (!videoUrls || videoUrls.length === 0) {
    throw new Error('No videos to stitch');
  }

  if (videoUrls.length === 1) {
    const response = await fetch(videoUrls[0]);
    return await response.blob();
  }

  const { fetchFile } = await import('@ffmpeg/util');

  if (onProgress) onProgress(5);
  const ff = await loadFFmpeg();

  try {
    // Download all videos
    const videoFiles = [];
    for (let i = 0; i < videoUrls.length; i++) {
      const filename = `trans_video${i}.mp4`;
      console.log(`[FFmpeg] Downloading video ${i + 1}/${videoUrls.length} for transition stitching`);
      if (onProgress) onProgress(5 + Math.round((i / videoUrls.length) * 25)); // 5-30%

      const videoData = await fetchFile(videoUrls[i]);
      await ff.writeFile(filename, videoData);
      videoFiles.push(filename);
    }

    // Get durations for each video
    if (onProgress) onProgress(35);
    console.log('[FFmpeg] Getting video durations...');
    const durations = [];
    for (let i = 0; i < videoFiles.length; i++) {
      const dur = await getVideoDuration(ff, videoFiles[i]);
      durations.push(dur);
      console.log(`[FFmpeg] Video ${i}: ${dur}s`);
    }

    // Build xfade filter chain
    if (onProgress) onProgress(40);
    const n = videoUrls.length;

    // Build video xfade chain
    let videoFilter = '';
    let audioFilter = '';
    let cumulativeOffset = 0;

    for (let i = 0; i < n - 1; i++) {
      const inputA = i === 0 ? `[${i}:v]` : `[v${i}]`;
      const inputB = `[${i + 1}:v]`;
      const outputLabel = i === n - 2 ? '[vout]' : `[v${i + 1}]`;

      // Offset = cumulative duration of all previous segments minus cumulative transition overlaps
      if (i === 0) {
        cumulativeOffset = durations[0] - transitionDuration;
      } else {
        cumulativeOffset += durations[i] - transitionDuration;
      }

      videoFilter += `${inputA}${inputB}xfade=transition=fade:duration=${transitionDuration}:offset=${cumulativeOffset.toFixed(2)}${outputLabel}`;
      if (i < n - 2) videoFilter += ';';
    }

    // Build audio acrossfade chain
    cumulativeOffset = 0;
    for (let i = 0; i < n - 1; i++) {
      const inputA = i === 0 ? `[${i}:a]` : `[a${i}]`;
      const inputB = `[${i + 1}:a]`;
      const outputLabel = i === n - 2 ? '[aout]' : `[a${i + 1}]`;

      audioFilter += `${inputA}${inputB}acrossfade=d=${transitionDuration}${outputLabel}`;
      if (i < n - 2) audioFilter += ';';
    }

    const filterComplex = `${videoFilter};${audioFilter}`;
    console.log('[FFmpeg] Filter complex:', filterComplex);

    // Build ffmpeg command
    const inputArgs = videoFiles.flatMap(f => ['-i', f]);

    if (onProgress) onProgress(45);
    console.log('[FFmpeg] Starting transition stitching (re-encoding)...');

    // Set up progress tracking for encoding
    const totalDuration = durations.reduce((sum, d) => sum + d, 0) - (transitionDuration * (n - 1));
    const progressHandler = ({ progress }) => {
      if (onProgress && progress > 0) {
        onProgress(45 + Math.round(progress * 45)); // 45-90%
      }
    };
    ff.on('progress', progressHandler);

    await ff.exec([
      ...inputArgs,
      '-filter_complex', filterComplex,
      '-map', '[vout]',
      '-map', '[aout]',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      'trans_output.mp4'
    ]);

    ff.off('progress', progressHandler);
    if (onProgress) onProgress(92);

    const data = await ff.readFile('trans_output.mp4');

    // Clean up
    for (const file of videoFiles) {
      try { await ff.deleteFile(file); } catch (e) {}
    }
    try { await ff.deleteFile('trans_output.mp4'); } catch (e) {}

    if (onProgress) onProgress(100);
    return new Blob([data.buffer], { type: 'video/mp4' });

  } catch (error) {
    console.error('[FFmpeg] Transition stitching failed:', error);
    // Fallback to simple concatenation
    console.log('[FFmpeg] Falling back to simple concatenation...');
    try {
      return await stitchVideos(videoUrls, onProgress);
    } catch (fallbackError) {
      throw new Error('Failed to combine videos: ' + error.message);
    }
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
  stitchVideosWithTransitions,
  isFFmpegSupported
};
