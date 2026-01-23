import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import toast from 'react-hot-toast';
import AudioPlayer from '../AudioPlayer';
import { generateVideo, pollVideoStatus } from '../../utils/api';
import { stitchVideos, isFFmpegSupported } from '../../utils/videoStitcher';
import { saveProject } from '../../utils/db';
import useAppStore from '../../stores/useAppStore';

function Step4_VideoGenerator() {
  const navigate = useNavigate();
  const {
    script,
    selectedScene,
    voiceover,
    generatedVideo,
    setGeneratedVideo,
    apiKeys,
    setCurrentStep,
    canProceedToStep4,
    isGeneratingVideo,
    setIsGeneratingVideo,
    videoProgress,
    setVideoProgress,
    videoStatusMessage,
    setVideoStatusMessage,
    reset
  } = useAppStore();

  const [isSavingProject, setIsSavingProject] = useState(false);
  const [projectSaved, setProjectSaved] = useState(false);

  useEffect(() => {
    setCurrentStep(4);
    
    if (!canProceedToStep4()) {
      navigate('/step/3');
    }
  }, [setCurrentStep, canProceedToStep4, navigate]);

  const handleGenerate = async () => {
    setIsGeneratingVideo(true);
    setVideoProgress(0);
    setVideoStatusMessage('');
    setGeneratedVideo(null);

    try {
      // Check if we have chunked voiceover
      if (voiceover.isChunked && voiceover.chunks && voiceover.chunks.length > 1) {
        await handleChunkedVideoGeneration();
      } else {
        await handleSingleVideoGeneration();
      }
    } catch (error) {
      console.error('Video generation error:', error);
      toast.error(error.message || 'Failed to generate video');
    } finally {
      setIsGeneratingVideo(false);
      setVideoProgress(0);
      setVideoStatusMessage('');
    }
  };

  const handleSingleVideoGeneration = async () => {
    setVideoStatusMessage('Starting video generation...');
    
    const { jobId } = await generateVideo({
      sceneImageUrl: selectedScene.imageUrl,
      audioData: voiceover.audioData,
      audioContentType: voiceover.contentType || 'audio/mpeg',
      kieApiKey: apiKeys.kieApiKey
    });

    setVideoStatusMessage('Processing with InfiniteTalk AI...');
    
    const result = await pollVideoStatus(
      jobId,
      apiKeys.kieApiKey,
      (progress) => setVideoProgress(progress)
    );

    setGeneratedVideo({
      videoUrl: result.videoUrl,
      jobId,
      generatedAt: new Date().toISOString()
    });

    toast.success('Video generated successfully!');
  };

  const handleChunkedVideoGeneration = async () => {
    const chunks = voiceover.chunks;
    const totalChunks = chunks.length;
    const videoUrls = [];

    // Generate video for each chunk
    for (let i = 0; i < totalChunks; i++) {
      const chunk = chunks[i];
      const chunkNum = i + 1;
      
      setVideoStatusMessage(`Generating video segment ${chunkNum}/${totalChunks}...`);
      setVideoProgress((i / totalChunks) * 60); // 0-60% for video generation
      
      try {
        const { jobId } = await generateVideo({
          sceneImageUrl: selectedScene.imageUrl,
          audioData: chunk.audioData,
          audioContentType: chunk.contentType || 'audio/mpeg',
          kieApiKey: apiKeys.kieApiKey
        });

        setVideoStatusMessage(`Processing segment ${chunkNum}/${totalChunks}...`);
        
        const result = await pollVideoStatus(
          jobId,
          apiKeys.kieApiKey,
          (progress) => {
            const baseProgress = (i / totalChunks) * 60;
            const chunkProgress = (progress / 100) * (60 / totalChunks);
            setVideoProgress(baseProgress + chunkProgress);
          }
        );

        if (result.videoUrl) {
          videoUrls.push(result.videoUrl);
        } else {
          throw new Error(`Segment ${chunkNum} failed: No video URL returned`);
        }
      } catch (error) {
        throw new Error(`Failed to generate segment ${chunkNum}: ${error.message}`);
      }
    }

    // Check if we got all videos
    if (videoUrls.length !== totalChunks) {
      throw new Error(`Only ${videoUrls.length} of ${totalChunks} segments completed`);
    }

    // Stitch videos together
    setVideoStatusMessage('Combining video segments...');
    setVideoProgress(65);

    // Check ffmpeg support
    if (!isFFmpegSupported()) {
      // Fallback: just return the first video with a warning
      toast.error('Your browser does not support video stitching. Showing first segment only.');
      setGeneratedVideo({
        videoUrl: videoUrls[0],
        isPartial: true,
        allVideoUrls: videoUrls,
        generatedAt: new Date().toISOString()
      });
      return;
    }

    try {
      const combinedBlob = await stitchVideos(videoUrls, (progress) => {
        setVideoProgress(65 + (progress * 0.35)); // 65-100% for stitching
      });

      const combinedUrl = URL.createObjectURL(combinedBlob);

      setGeneratedVideo({
        videoUrl: combinedUrl,
        videoBlob: combinedBlob,
        isStitched: true,
        segmentCount: totalChunks,
        generatedAt: new Date().toISOString()
      });

      toast.success(`Video generated! Combined ${totalChunks} segments.`);
    } catch (stitchError) {
      console.error('Stitching failed:', stitchError);
      // Fallback: offer individual downloads
      toast.error('Failed to combine segments. You can download them individually.');
      setGeneratedVideo({
        videoUrl: videoUrls[0],
        isPartial: true,
        allVideoUrls: videoUrls,
        generatedAt: new Date().toISOString()
      });
    }
  };

  const handleDownload = async () => {
    if (!generatedVideo?.videoUrl) return;

    try {
      let blob;
      
      if (generatedVideo.videoBlob) {
        blob = generatedVideo.videoBlob;
      } else {
        const response = await fetch(generatedVideo.videoUrl);
        blob = await response.blob();
      }
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ai-clone-video-${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error('Failed to download video');
    }
  };

  const handleDownloadSegment = async (url, index) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `ai-clone-segment-${index + 1}-${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      toast.error(`Failed to download segment ${index + 1}`);
    }
  };

  const handleSaveProject = async () => {
    setIsSavingProject(true);
    try {
      const project = {
        id: uuidv4(),
        name: `Video - ${new Date().toLocaleDateString()}`,
        script,
        sceneId: selectedScene.id,
        sceneImageUrl: selectedScene.imageUrl,
        voiceoverUrl: voiceover.audioUrl,
        voiceId: voiceover.voiceId,
        videoUrl: generatedVideo?.videoUrl,
        createdAt: Date.now()
      };

      await saveProject(project);
      setProjectSaved(true);
      toast.success('Project saved!');
    } catch (error) {
      toast.error('Failed to save project');
    } finally {
      setIsSavingProject(false);
    }
  };

  const handleCreateNew = () => {
    reset();
    navigate('/step/1');
  };

  const handleBack = () => {
    navigate('/step/3');
  };

  // Get chunk info for display
  const chunkInfo = voiceover?.isChunked ? {
    count: voiceover.chunks?.length || 0,
    estimatedTime: (voiceover.chunks?.length || 1) * 2 // ~2 min per segment
  } : null;

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-text-primary mb-2">
          Generate Video
        </h1>
        <p className="text-text-secondary">
          Review your selections and generate your AI clone video.
        </p>
      </div>

      {/* Chunk Warning */}
      {chunkInfo && (
        <div className="glass-card p-4 mb-6 border border-yellow-500/30 bg-yellow-500/5">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-yellow-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm text-yellow-200">
                Your script is long and will be split into <strong>{chunkInfo.count} segments</strong>.
              </p>
              <p className="text-xs text-yellow-200/70 mt-1">
                Each segment will be generated separately and combined automatically.
                Estimated time: {chunkInfo.estimatedTime}-{chunkInfo.estimatedTime * 1.5} minutes.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid md:grid-cols-3 gap-4 mb-8">
        {/* Scene */}
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-text-secondary">Scene</h3>
            <button
              onClick={() => navigate('/step/2')}
              className="text-xs text-electric hover:text-electric-dim transition-colors"
            >
              Edit
            </button>
          </div>
          <div className="aspect-video rounded-lg overflow-hidden bg-slate-dark">
            <img
              src={selectedScene?.imageUrl}
              alt="Selected scene"
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        {/* Voiceover */}
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-text-secondary">
              Voiceover {chunkInfo && <span className="text-xs text-yellow-500">({chunkInfo.count} parts)</span>}
            </h3>
            <button
              onClick={() => navigate('/step/3')}
              className="text-xs text-electric hover:text-electric-dim transition-colors"
            >
              Edit
            </button>
          </div>
          <AudioPlayer src={voiceover?.audioUrl} className="!p-3" />
        </div>

        {/* Script */}
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-text-secondary">Script</h3>
            <button
              onClick={() => navigate('/step/1')}
              className="text-xs text-electric hover:text-electric-dim transition-colors"
            >
              Edit
            </button>
          </div>
          <p className="text-sm text-text-primary line-clamp-4">
            {script}
          </p>
          <p className="text-xs text-text-muted mt-2">
            {script.length} characters
          </p>
        </div>
      </div>

      {/* Video Generation / Preview */}
      {!generatedVideo ? (
        <div className="glass-card p-8 text-center mb-8">
          {isGeneratingVideo ? (
            <div className="space-y-6">
              <div className="w-20 h-20 mx-auto relative">
                <div className="absolute inset-0 rounded-full border-4 border-slate-medium"></div>
                <div 
                  className="absolute inset-0 rounded-full border-4 border-electric border-t-transparent animate-spin"
                  style={{ animationDuration: '1s' }}
                ></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-4 h-4 bg-electric rounded-full animate-pulse"></div>
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-medium text-text-primary mb-2">
                  Generating Your Video
                </h3>
                <p className="text-text-secondary text-sm">
                  {chunkInfo 
                    ? `Processing ${chunkInfo.count} segments. This may take ${chunkInfo.estimatedTime}-${chunkInfo.estimatedTime * 1.5} minutes.`
                    : 'This typically takes 1-3 minutes. Please don\'t close this page.'
                  }
                </p>
                {videoStatusMessage && (
                  <p className="text-electric text-sm mt-2 animate-pulse">
                    {videoStatusMessage}
                  </p>
                )}
              </div>

              {/* Progress Bar */}
              <div className="max-w-md mx-auto">
                <div className="h-2 bg-slate-medium rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-electric to-violet rounded-full transition-all duration-500"
                    style={{ width: `${videoProgress}%` }}
                  />
                </div>
                <p className="text-xs text-text-muted mt-2">{Math.round(videoProgress)}%</p>
              </div>
            </div>
          ) : (
            <div>
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-electric to-violet flex items-center justify-center">
                <svg className="w-10 h-10 text-void" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              
              <h3 className="text-xl font-medium text-text-primary mb-2">
                Ready to Generate
              </h3>
              <p className="text-text-secondary mb-6">
                Your AI clone video will be created using the scene and voiceover above.
              </p>

              <button
                onClick={handleGenerate}
                className="btn-primary text-lg px-8 py-4"
              >
                Generate Video
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="glass-card overflow-hidden mb-8 animate-slide-up">
          {/* Video Player */}
          <div className="aspect-video bg-void">
            <video
              src={generatedVideo.videoUrl}
              controls
              className="w-full h-full"
              poster={selectedScene?.imageUrl}
            >
              Your browser does not support the video tag.
            </video>
          </div>

          {/* Segment downloads if partial */}
          {generatedVideo.isPartial && generatedVideo.allVideoUrls && (
            <div className="p-4 bg-yellow-500/10 border-b border-yellow-500/30">
              <p className="text-sm text-yellow-200 mb-2">
                Video stitching failed. Download segments individually:
              </p>
              <div className="flex flex-wrap gap-2">
                {generatedVideo.allVideoUrls.map((url, i) => (
                  <button
                    key={i}
                    onClick={() => handleDownloadSegment(url, i)}
                    className="btn-secondary text-xs"
                  >
                    Segment {i + 1}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Success indicator for stitched video */}
          {generatedVideo.isStitched && (
            <div className="p-3 bg-green-500/10 border-b border-green-500/30">
              <p className="text-sm text-green-300 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Successfully combined {generatedVideo.segmentCount} segments
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="p-6">
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleDownload}
                className="btn-primary flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Video
              </button>

              <button
                onClick={handleSaveProject}
                disabled={isSavingProject || projectSaved}
                className="btn-secondary flex items-center gap-2"
              >
                {isSavingProject ? (
                  <div className="w-5 h-5 border-2 border-text-muted/30 border-t-text-muted rounded-full animate-spin" />
                ) : projectSaved ? (
                  <svg className="w-5 h-5 text-mint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                  </svg>
                )}
                {projectSaved ? 'Saved' : 'Save to Projects'}
              </button>

              <button
                onClick={handleGenerate}
                disabled={isGeneratingVideo}
                className="btn-secondary flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Regenerate
              </button>

              <button
                onClick={handleCreateNew}
                className="btn-secondary flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create New Video
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      {!generatedVideo && !isGeneratingVideo && (
        <div className="flex justify-start">
          <button onClick={handleBack} className="btn-secondary flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
            </svg>
            Back to Voiceover
          </button>
        </div>
      )}
    </div>
  );
}

export default Step4_VideoGenerator;
