import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { getScenes, deleteScene } from '../utils/db';
import useAppStore from '../stores/useAppStore';
import DEFAULT_SCENES, { CATEGORY_NAMES } from '../data/defaultScenes';

function SceneGallery({ onSelect }) {
  const [userScenes, setUserScenes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [activeTab, setActiveTab] = useState('default'); // 'default' or 'custom'
  const [selectedCategory, setSelectedCategory] = useState('all');
  const { selectedScenes } = useAppStore();

  useEffect(() => {
    loadScenes();
  }, []);

  const loadScenes = async () => {
    setIsLoading(true);
    try {
      const loadedScenes = await getScenes();
      setUserScenes(loadedScenes);
    } catch (error) {
      console.error('Failed to load scenes:', error);
      toast.error('Failed to load scenes');
    } finally {
      setIsLoading(false);
    }
  };

  // Get unique categories from default scenes
  const categories = ['all', ...new Set(DEFAULT_SCENES.map(s => s.category))];

  // Filter default scenes by category
  const filteredDefaultScenes = selectedCategory === 'all'
    ? DEFAULT_SCENES
    : DEFAULT_SCENES.filter(s => s.category === selectedCategory);

  // Scenes to display based on active tab
  const scenes = activeTab === 'default' ? filteredDefaultScenes : userScenes;

  const handleDelete = async (e, sceneId) => {
    e.stopPropagation();
    setDeletingId(sceneId);
    try {
      await deleteScene(sceneId);
      setUserScenes(userScenes.filter(s => s.id !== sceneId));
      toast.success('Scene deleted');
    } catch (error) {
      toast.error('Failed to delete scene');
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const truncatePrompt = (prompt, maxLength = 60) => {
    if (prompt.length <= maxLength) return prompt;
    return prompt.substring(0, maxLength) + '...';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/10 pb-2">
        <button
          onClick={() => setActiveTab('default')}
          className={`px-4 py-2 rounded-t-lg font-medium text-sm transition-colors ${
            activeTab === 'default'
              ? 'bg-mint/20 text-mint border-b-2 border-mint'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Default Scenes ({DEFAULT_SCENES.length})
        </button>
        <button
          onClick={() => setActiveTab('custom')}
          className={`px-4 py-2 rounded-t-lg font-medium text-sm transition-colors ${
            activeTab === 'custom'
              ? 'bg-electric/20 text-electric border-b-2 border-electric'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          My Scenes ({userScenes.length})
        </button>
      </div>

      {/* Category filter for default scenes */}
      {activeTab === 'default' && (
        <div className="flex flex-wrap gap-2">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                selectedCategory === cat
                  ? 'bg-mint text-void'
                  : 'bg-slate-medium text-text-secondary hover:bg-slate-light'
              }`}
            >
              {cat === 'all' ? 'All' : CATEGORY_NAMES[cat] || cat}
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {scenes.length === 0 && (
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-medium flex items-center justify-center">
            <svg className="w-8 h-8 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-text-primary mb-2">
            {activeTab === 'custom' ? 'No Custom Scenes' : 'No Scenes in Category'}
          </h3>
          <p className="text-text-secondary text-sm">
            {activeTab === 'custom'
              ? 'Generate your first custom scene to see it here'
              : 'Select a different category'}
          </p>
        </div>
      )}

      {/* Scene grid */}
      {scenes.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {scenes.map((scene, index) => (
            <div
              key={scene.id}
              onClick={() => onSelect(scene)}
              className={`
                glass-card-hover overflow-hidden cursor-pointer animate-fade-in
                ${selectedScenes.some(s => s.id === scene.id) ? 'ring-2 ring-electric' : ''}
              `}
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              {/* Image */}
              <div className="aspect-video relative bg-slate-dark">
                <img
                  src={scene.imageUrl}
                  alt={scene.name || scene.prompt}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.style.display = 'none';
                  }}
                />

                {/* Badges */}
                <div className="absolute top-2 right-2 flex gap-1">
                  {scene.isDefault && (
                    <div className="px-2 py-1 bg-mint/90 text-void text-xs font-medium rounded">
                      Default
                    </div>
                  )}
                  <div className="px-2 py-1 bg-void/80 backdrop-blur-sm rounded text-xs text-text-secondary">
                    {scene.orientation === 'vertical' ? '9:16' : '16:9'}
                  </div>
                </div>

                {/* Selected Indicator with number */}
                {selectedScenes.some(s => s.id === scene.id) && (
                  <div className="absolute inset-0 bg-electric/10 flex items-center justify-center">
                    <div className="bg-electric text-void rounded-full w-10 h-10 flex items-center justify-center font-bold text-lg">
                      {selectedScenes.findIndex(s => s.id === scene.id) + 1}
                    </div>
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="p-4">
                <p className="text-sm text-text-primary mb-2 line-clamp-2">
                  {scene.name || truncatePrompt(scene.prompt)}
                </p>
                <div className="flex items-center justify-between">
                  {scene.isDefault ? (
                    <span className="text-xs text-mint">
                      {CATEGORY_NAMES[scene.category] || scene.category}
                    </span>
                  ) : (
                    <span className="text-xs text-text-muted">
                      {formatDate(scene.timestamp)}
                    </span>
                  )}
                  {!scene.isDefault && (
                    <button
                      onClick={(e) => handleDelete(e, scene.id)}
                      disabled={deletingId === scene.id}
                      className="p-1.5 rounded hover:bg-coral/20 text-text-muted hover:text-coral transition-colors"
                      title="Delete scene"
                    >
                      {deletingId === scene.id ? (
                        <div className="w-4 h-4 border-2 border-coral/30 border-t-coral rounded-full animate-spin" />
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default SceneGallery;






