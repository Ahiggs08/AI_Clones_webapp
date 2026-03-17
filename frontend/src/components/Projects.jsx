import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getProjects, deleteProject, getScene } from '../utils/db';
import useAppStore from '../stores/useAppStore';

function Projects() {
  const navigate = useNavigate();
  const { setScript, setSelectedScene, setVoiceover, setCurrentStep } = useAppStore();
  
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    setIsLoading(true);
    try {
      const loadedProjects = await getProjects();
      setProjects(loadedProjects);
    } catch (error) {
      console.error('Failed to load projects:', error);
      toast.error('Failed to load projects');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (e, projectId) => {
    e.stopPropagation();
    setDeletingId(projectId);
    try {
      await deleteProject(projectId);
      setProjects(projects.filter(p => p.id !== projectId));
      toast.success('Project deleted');
    } catch (error) {
      toast.error('Failed to delete project');
    } finally {
      setDeletingId(null);
    }
  };

  const handleResume = async (project) => {
    try {
      // Load the scene
      let scene = null;
      if (project.sceneId) {
        scene = await getScene(project.sceneId);
      }
      
      // If scene not found, create a minimal scene object
      if (!scene && project.sceneImageUrl) {
        scene = {
          id: project.sceneId,
          imageUrl: project.sceneImageUrl,
          prompt: 'Loaded from project'
        };
      }

      // Set state
      setScript(project.script || '');
      setSelectedScene(scene);
      
      if (project.voiceoverUrl) {
        setVoiceover({
          audioUrl: project.voiceoverUrl,
          voiceId: project.voiceId
        });
      }

      // Navigate to appropriate step
      if (project.videoUrl) {
        setCurrentStep(4);
        navigate('/step/4');
      } else if (project.voiceoverUrl) {
        setCurrentStep(4);
        navigate('/step/4');
      } else if (scene) {
        setCurrentStep(3);
        navigate('/step/3');
      } else {
        setCurrentStep(2);
        navigate('/step/2');
      }

      toast.success('Project loaded');
    } catch (error) {
      console.error('Failed to resume project:', error);
      toast.error('Failed to load project');
    }
  };

  const handleExport = (project) => {
    try {
      const exportData = {
        version: 1,
        exportedAt: new Date().toISOString(),
        project: {
          name: project.name,
          script: project.script,
          sceneImageUrl: project.sceneImageUrl,
          voiceoverUrl: project.voiceoverUrl,
          voiceId: project.voiceId,
          videoUrl: project.videoUrl,
          createdAt: project.createdAt
        }
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name.replace(/[^a-z0-9]/gi, '_')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Project exported');
    } catch (error) {
      toast.error('Failed to export project');
    }
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold text-text-primary mb-2">
            My Projects
          </h1>
          <p className="text-text-secondary">
            {projects.length} saved project{projects.length !== 1 ? 's' : ''}
          </p>
        </div>
        
        <button
          onClick={() => navigate('/step/1')}
          className="btn-primary flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Video
        </button>
      </div>

      {/* Projects Grid */}
      {projects.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-medium flex items-center justify-center">
            <svg className="w-8 h-8 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-text-primary mb-2">No Projects Yet</h3>
          <p className="text-text-secondary mb-6">
            Create your first AI clone video to see it here
          </p>
          <button
            onClick={() => navigate('/step/1')}
            className="btn-primary"
          >
            Create Your First Video
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project, index) => (
            <div
              key={project.id}
              className="glass-card-hover overflow-hidden animate-fade-in"
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              {/* Thumbnail */}
              <div className="aspect-video relative bg-slate-dark">
                {project.sceneImageUrl ? (
                  <img
                    src={project.sceneImageUrl}
                    alt={project.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <svg className="w-12 h-12 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
                
                {/* Video indicator */}
                {project.videoUrl && (
                  <div className="absolute top-2 right-2 px-2 py-1 bg-mint/20 text-mint rounded text-xs font-medium">
                    Video Ready
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="p-4">
                <h3 className="font-medium text-text-primary mb-1 truncate">
                  {project.name}
                </h3>
                <p className="text-sm text-text-muted mb-3">
                  {formatDate(project.createdAt)}
                </p>
                
                {project.script && (
                  <p className="text-sm text-text-secondary mb-4 line-clamp-2">
                    {project.script}
                  </p>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleResume(project)}
                    className="btn-primary text-sm py-2 flex-1"
                  >
                    {project.videoUrl ? 'View' : 'Resume'}
                  </button>
                  
                  <button
                    onClick={() => handleExport(project)}
                    className="p-2 rounded-lg hover:bg-slate-medium text-text-muted hover:text-text-primary transition-colors"
                    title="Export project"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                  </button>
                  
                  <button
                    onClick={(e) => handleDelete(e, project.id)}
                    disabled={deletingId === project.id}
                    className="p-2 rounded-lg hover:bg-coral/20 text-text-muted hover:text-coral transition-colors"
                    title="Delete project"
                  >
                    {deletingId === project.id ? (
                      <div className="w-5 h-5 border-2 border-coral/30 border-t-coral rounded-full animate-spin" />
                    ) : (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Projects;





