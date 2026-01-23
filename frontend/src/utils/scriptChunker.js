/**
 * Utility to split scripts into chunks that will generate ~15 second audio
 * 
 * Average speaking rate: ~150 words/minute = 2.5 words/second
 * Average word length: ~5 characters
 * So roughly: 12-13 characters per second
 * 
 * For 15 seconds max: ~180 characters per chunk (with some buffer)
 */

const CHARS_PER_SECOND = 12;
const MAX_DURATION_SECONDS = 14; // Slightly under 15 to be safe
const MAX_CHARS_PER_CHUNK = CHARS_PER_SECOND * MAX_DURATION_SECONDS; // ~168 chars

/**
 * Estimate audio duration in seconds from text
 */
export const estimateAudioDuration = (text) => {
  if (!text) return 0;
  return Math.ceil(text.trim().length / CHARS_PER_SECOND);
};

/**
 * Check if script needs chunking
 */
export const needsChunking = (text) => {
  return estimateAudioDuration(text) > MAX_DURATION_SECONDS;
};

/**
 * Split text into chunks at sentence boundaries
 */
export const chunkScript = (text) => {
  if (!text || !text.trim()) return [];
  
  const cleanText = text.trim();
  
  // If short enough, return as single chunk
  if (cleanText.length <= MAX_CHARS_PER_CHUNK) {
    return [cleanText];
  }
  
  // Split by sentences (period, exclamation, question mark followed by space or end)
  const sentenceRegex = /[.!?]+[\s]+|[.!?]+$/g;
  const sentences = [];
  let lastIndex = 0;
  let match;
  
  while ((match = sentenceRegex.exec(cleanText)) !== null) {
    sentences.push(cleanText.slice(lastIndex, match.index + match[0].length).trim());
    lastIndex = match.index + match[0].length;
  }
  
  // Add any remaining text
  if (lastIndex < cleanText.length) {
    const remaining = cleanText.slice(lastIndex).trim();
    if (remaining) sentences.push(remaining);
  }
  
  // If no sentences found, split by character count
  if (sentences.length === 0) {
    sentences.push(cleanText);
  }
  
  // Combine sentences into chunks that fit within the limit
  const chunks = [];
  let currentChunk = '';
  
  for (const sentence of sentences) {
    // If single sentence is too long, we need to split it further
    if (sentence.length > MAX_CHARS_PER_CHUNK) {
      // Save current chunk if any
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      
      // Split long sentence by commas or at word boundaries
      const parts = splitLongSentence(sentence);
      for (const part of parts) {
        chunks.push(part.trim());
      }
      continue;
    }
    
    // Check if adding this sentence would exceed the limit
    const potentialChunk = currentChunk ? `${currentChunk} ${sentence}` : sentence;
    
    if (potentialChunk.length <= MAX_CHARS_PER_CHUNK) {
      currentChunk = potentialChunk;
    } else {
      // Save current chunk and start new one
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = sentence;
    }
  }
  
  // Don't forget the last chunk
  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.filter(chunk => chunk.length > 0);
};

/**
 * Split a long sentence by commas or word boundaries
 */
const splitLongSentence = (sentence) => {
  const parts = [];
  
  // Try splitting by commas first
  const commaParts = sentence.split(/,\s*/);
  
  let currentPart = '';
  for (const part of commaParts) {
    const potential = currentPart ? `${currentPart}, ${part}` : part;
    
    if (potential.length <= MAX_CHARS_PER_CHUNK) {
      currentPart = potential;
    } else {
      if (currentPart) parts.push(currentPart);
      
      // If single comma part is still too long, split by words
      if (part.length > MAX_CHARS_PER_CHUNK) {
        const wordParts = splitByWords(part);
        parts.push(...wordParts);
        currentPart = '';
      } else {
        currentPart = part;
      }
    }
  }
  
  if (currentPart) parts.push(currentPart);
  
  return parts;
};

/**
 * Last resort: split by words
 */
const splitByWords = (text) => {
  const words = text.split(/\s+/);
  const parts = [];
  let currentPart = '';
  
  for (const word of words) {
    const potential = currentPart ? `${currentPart} ${word}` : word;
    
    if (potential.length <= MAX_CHARS_PER_CHUNK) {
      currentPart = potential;
    } else {
      if (currentPart) parts.push(currentPart);
      currentPart = word;
    }
  }
  
  if (currentPart) parts.push(currentPart);
  
  return parts;
};

/**
 * Get chunk info for display
 */
export const getChunkInfo = (text) => {
  const chunks = chunkScript(text);
  return {
    totalChunks: chunks.length,
    chunks: chunks.map((chunk, index) => ({
      index,
      text: chunk,
      charCount: chunk.length,
      estimatedDuration: estimateAudioDuration(chunk)
    })),
    totalEstimatedDuration: chunks.reduce((sum, chunk) => sum + estimateAudioDuration(chunk), 0)
  };
};

export default {
  estimateAudioDuration,
  needsChunking,
  chunkScript,
  getChunkInfo
};
