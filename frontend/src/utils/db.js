import { openDB } from 'idb';

const DB_NAME = 'AICloneVideoDB';
const DB_VERSION = 1;

let dbInstance = null;

/**
 * Initialize the IndexedDB database
 */
export const initDB = async () => {
  if (dbInstance) return dbInstance;
  
  dbInstance = await openDB(DB_NAME, 2, {
    upgrade(db, oldVersion, newVersion) {
      // Scenes store - for generated scene images
      if (!db.objectStoreNames.contains('scenes')) {
        const sceneStore = db.createObjectStore('scenes', { keyPath: 'id' });
        sceneStore.createIndex('timestamp', 'timestamp');
      }
      
      // Projects store - for saved video projects
      if (!db.objectStoreNames.contains('projects')) {
        const projectStore = db.createObjectStore('projects', { keyPath: 'id' });
        projectStore.createIndex('updatedAt', 'updatedAt');
      }
      
      // Settings store - for API keys and preferences
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings');
      }
      
      // Reference images store - for saved user reference photos
      if (!db.objectStoreNames.contains('referenceImages')) {
        db.createObjectStore('referenceImages');
      }
    }
  });
  
  return dbInstance;
};

/**
 * Get the database instance
 */
const getDB = async () => {
  if (!dbInstance) {
    await initDB();
  }
  return dbInstance;
};

// ============ SCENES ============

/**
 * Save a scene to IndexedDB
 */
export const saveScene = async (sceneData) => {
  const db = await getDB();
  const scene = {
    ...sceneData,
    timestamp: sceneData.timestamp || Date.now()
  };
  await db.put('scenes', scene);
  return scene;
};

/**
 * Get all scenes, sorted by timestamp (newest first)
 */
export const getScenes = async () => {
  const db = await getDB();
  const scenes = await db.getAllFromIndex('scenes', 'timestamp');
  return scenes.reverse(); // Newest first
};

/**
 * Get a single scene by ID
 */
export const getScene = async (id) => {
  const db = await getDB();
  return db.get('scenes', id);
};

/**
 * Delete a scene by ID
 */
export const deleteScene = async (id) => {
  const db = await getDB();
  await db.delete('scenes', id);
};

/**
 * Clear all scenes
 */
export const clearAllScenes = async () => {
  const db = await getDB();
  await db.clear('scenes');
};

// ============ PROJECTS ============

/**
 * Save a project to IndexedDB
 */
export const saveProject = async (projectData) => {
  const db = await getDB();
  const now = Date.now();
  const project = {
    ...projectData,
    createdAt: projectData.createdAt || now,
    updatedAt: now
  };
  await db.put('projects', project);
  return project;
};

/**
 * Get all projects, sorted by updatedAt (newest first)
 */
export const getProjects = async () => {
  const db = await getDB();
  const projects = await db.getAllFromIndex('projects', 'updatedAt');
  return projects.reverse(); // Newest first
};

/**
 * Get a single project by ID
 */
export const getProject = async (id) => {
  const db = await getDB();
  return db.get('projects', id);
};

/**
 * Delete a project by ID
 */
export const deleteProject = async (id) => {
  const db = await getDB();
  await db.delete('projects', id);
};

/**
 * Clear all projects
 */
export const clearAllProjects = async () => {
  const db = await getDB();
  await db.clear('projects');
};

// ============ SETTINGS ============

/**
 * Get settings object
 */
export const getSettings = async () => {
  const db = await getDB();
  const settings = await db.get('settings', 'userSettings');
  return settings || {
    heygenApiKey: '',
    elevenLabsApiKey: '',
    lastUsedVoiceId: ''
  };
};

/**
 * Save settings object
 */
export const saveSettings = async (settings) => {
  const db = await getDB();
  await db.put('settings', settings, 'userSettings');
  return settings;
};

/**
 * Clear all settings
 */
export const clearSettings = async () => {
  const db = await getDB();
  await db.delete('settings', 'userSettings');
};

// ============ REFERENCE IMAGES ============

/**
 * Save a reference image
 * @param {Blob} imageBlob - The image blob
 * @param {string} fileName - Original file name
 */
export const saveReferenceImage = async (imageBlob, fileName) => {
  const db = await getDB();
  const data = {
    blob: imageBlob,
    fileName,
    savedAt: Date.now()
  };
  await db.put('referenceImages', data, 'default');
  return data;
};

/**
 * Get the saved reference image
 * @returns {Object|null} { blob, fileName, savedAt } or null if not found
 */
export const getReferenceImage = async () => {
  const db = await getDB();
  const data = await db.get('referenceImages', 'default');
  return data || null;
};

/**
 * Delete the saved reference image
 */
export const deleteReferenceImage = async () => {
  const db = await getDB();
  await db.delete('referenceImages', 'default');
};

/**
 * Check if a reference image exists
 */
export const hasReferenceImage = async () => {
  const db = await getDB();
  const data = await db.get('referenceImages', 'default');
  return !!data;
};

// ============ MULTI-REFERENCE IMAGES ============

/**
 * Save multiple reference images
 * @param {Array} images - Array of { blob, fileName } objects
 */
export const saveReferenceImages = async (images) => {
  const db = await getDB();
  const data = images.map((img, i) => ({
    id: `ref-${i}-${Date.now()}`,
    blob: img.blob,
    fileName: img.fileName,
    savedAt: Date.now()
  }));
  await db.put('referenceImages', data, 'multi');
  return data;
};

/**
 * Get saved reference images (multi)
 * @returns {Array} Array of { id, blob, fileName, savedAt }
 */
export const getReferenceImages = async () => {
  const db = await getDB();
  const data = await db.get('referenceImages', 'multi');
  return data || [];
};

/**
 * Delete all saved reference images (multi)
 */
export const deleteReferenceImages = async () => {
  const db = await getDB();
  await db.delete('referenceImages', 'multi');
};

// ============ CLEANUP ============

/**
 * Clear all data from the database
 */
export const clearAllData = async () => {
  const db = await getDB();
  await Promise.all([
    db.clear('scenes'),
    db.clear('projects'),
    db.clear('settings'),
    db.clear('referenceImages')
  ]);
};

/**
 * Get storage usage estimate
 */
export const getStorageEstimate = async () => {
  if (navigator.storage && navigator.storage.estimate) {
    const estimate = await navigator.storage.estimate();
    return {
      usage: estimate.usage,
      quota: estimate.quota,
      usagePercent: ((estimate.usage / estimate.quota) * 100).toFixed(2)
    };
  }
  return null;
};

