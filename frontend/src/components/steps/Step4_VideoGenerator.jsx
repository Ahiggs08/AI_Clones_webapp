import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import toast from 'react-hot-toast';
import AudioPlayer from '../AudioPlayer';
import { generateVideo, pollVideoStatus, generateVoiceover } from '../../utils/api';
import { stitchVideos, stitchVideosWithTransitions, isFFmpegSupported } from '../../utils/videoStitcher';
import { estimateAudioDuration } from '../../utils/scriptChunker';
import { saveProject } from '../../utils/db';
import useAppStore from '../../stores/useAppStore';

// Split script into sentences for the segment builder
const splitIntoSentences = (text) => {
  if (!text) return [];
  const sentences = [];
  const regex = /[^.!?]*[.!?]+[\s]*/g;
  let match;
  let lastIndex = 0;

  while ((match = regex.exec(text)) !== null) {
    sentences.push(match[0].trim());
    lastIndex = regex.lastIndex;
  }

  // Add remaining text if any
  const remaining = text.slice(lastIndex).trim();
  if (remaining) sentences.push(remaining);

  return sentences.filter(s => s.length > 0);
};

function Step4_VideoGenerator() {
  const navigate = useNavigate();
  const {
    script,
    selectedScenes,
    voiceover,
    generatedVideo,
    setGeneratedVideo,
    segments,
    setSegments,
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
  const [isProcessingDownload, setIsProcessingDownload] = useState(false);

  const isMultiScene = selectedScenes.length > 1;
  const primaryScene = selectedScenes[0] || null;

  // Parse sentences from the script for the segment builder
  const sentences = useMemo(() => splitIntoSentences(script), [script]);

  useEffect(() => {
    setCurrentStep(4);

    if (!canProceedToStep4()) {
      navigate('/step/3');
    }
  }, [setCurrentStep, canProceedToStep4, navigate]);

  // Initialize segments when entering multi-scene mode
  useEffect(() => {
    if (isMultiScene && segments.length === 0 && sentences.length > 0) {
      handleAutoSplit();
    }
  }, [isMultiScene, sentences.length]);

  // Auto-split script into N segments (N = number of scenes)
  const handleAutoSplit = () => {
    const n = selectedScenes.length;
    if (sentences.length === 0 || n === 0) return;

    // Distribute sentences evenly across segments
    const segmentsPerScene = Math.max(1, Math.floor(sentences.length / n));
    const newSegments = [];

    for (let i = 0; i < n; i++) {
      const start = i * segmentsPerScene;
      const end = i === n - 1 ? sentences.length : (i + 1) * segmentsPerScene;
      const segmentText = sentences.slice(start, end).join(' ');

      if (segmentText.trim()) {
        newSegments.push({
          id: `seg-${i}`,
          text: segmentText,
          sceneId: selectedScenes[i].id
        });
      }
    }

    setSegments(newSegments);
  };

  // Add a split point at a sentence boundary
  const handleAddSplit = (segmentIndex, sentenceIndex) => {
    const seg = segments[segmentIndex];
    const segSentences = splitIntoSentences(seg.text);
    if (sentenceIndex <= 0 || sentenceIndex >= segSentences.length) return;

    const firstHalf = segSentences.slice(0, sentenceIndex).join(' ');
    const secondHalf = segSentences.slice(sentenceIndex).join(' ');

    const newSegments = [...segments];
    newSegments.splice(segmentIndex, 1,
      { id: `seg-${Date.now()}-a`, text: firstHalf, sceneId: seg.sceneId },
      { id: `seg-${Date.now()}-b`, text: secondHalf, sceneId: '' }
    );
    setSegments(newSegments);
  };

  // Remove a split (merge segment with the next one)
  const handleRemoveSplit = (segmentIndex) => {
    if (segmentIndex >= segments.length - 1) return;
    const newSegments = [...segments];
    const merged = {
      id: newSegments[segmentIndex].id,
      text: newSegments[segmentIndex].text + ' ' + newSegments[segmentIndex + 1].text,
      sceneId: newSegments[segmentIndex].sceneId
    };
    newSegments.splice(segmentIndex, 2, merged);
    setSegments(newSegments);
  };

  // Assign a scene to a segment
  const handleAssignScene = (segmentIndex, sceneId) => {
    const newSegments = [...segments];
    newSegments[segmentIndex] = { ...newSegments[segmentIndex], sceneId };
    setSegments(newSegments);
  };

  // Edit segment text directly
  const handleSegmentTextChange = (segmentIndex, newText) => {
    const newSegments = [...segments];
    newSegments[segmentIndex] = { ...newSegments[segmentIndex], text: newText };
    setSegments(newSegments);
  };

  // Check if all segments have scenes assigned
  const allSegmentsAssigned = segments.length > 0 && segments.every(s => s.sceneId);

  // ============ GENERATION ============

  const handleGenerate = async () => {
    setIsGeneratingVideo(true);
    setVideoProgress(0);
    setVideoStatusMessage('');
    setGeneratedVideo(null);

    try {
      if (isMultiScene) {
        await handleMultiSceneGeneration();
      } else if (voiceover.isChunked && voiceover.chunks && voiceover.chunks.length > 1) {
        await handleChunkedVideoGeneration();
      } else {
        await handleSingleVideoGeneration();
      }
    } catch (error) {
      console.error('Video generation error:', error?.message || error);
      toast.error(error.message || 'Failed to generate video');
    } finally {
      setIsGeneratingVideo(false);
      setVideoProgress(0);
      setVideoStatusMessage('');
    }
  };

  // Single scene, single video
  const handleSingleVideoGeneration = async () => {
    setVideoStatusMessage('Starting video generation...');

    const scene = primaryScene;
    const { jobId } = await generateVideo({
      sceneImageData: scene.imageData || null,
      sceneImageContentType: scene.imageContentType || 'image/png',
      sceneImageUrl: scene.imageData ? null : scene.imageUrl,
      audioData: voiceover.audioData,
      audioContentType: voiceover.contentType || 'audio/mpeg'
    });

    setVideoStatusMessage('Processing with Kling Avatar v2 Pro...');

    const result = await pollVideoStatus(
      jobId,
      (progress) => setVideoProgress(progress)
    );

    setGeneratedVideo({
      videoUrl: result.videoUrl,
      jobId,
      generatedAt: new Date().toISOString()
    });

    toast.success('Video generated successfully!');
  };

  // Single scene, chunked audio (long script)
  const handleChunkedVideoGeneration = async () => {
    const chunks = voiceover.chunks;
    const totalChunks = chunks.length;
    const videoUrls = [];
    const scene = primaryScene;

    for (let i = 0; i < totalChunks; i++) {
      const chunk = chunks[i];
      const chunkNum = i + 1;

      setVideoStatusMessage(`Generating segment ${chunkNum}/${totalChunks}...`);
      setVideoProgress((i / totalChunks) * 60);

      const { jobId } = await generateVideo({
        sceneImageData: scene.imageData || null,
        sceneImageContentType: scene.imageContentType || 'image/png',
        sceneImageUrl: scene.imageData ? null : scene.imageUrl,
        audioData: chunk.audioData,
        audioContentType: chunk.contentType || 'audio/mpeg'
      });

      setVideoStatusMessage(`Processing segment ${chunkNum}/${totalChunks}...`);

      const result = await pollVideoStatus(
        jobId,
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
    }

    // Stitch
    setVideoStatusMessage('Combining video segments...');
    setVideoProgress(65);

    if (!isFFmpegSupported()) {
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
        setVideoProgress(65 + (progress * 0.35));
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
      toast.error('Failed to combine segments. You can download them individually.');
      setGeneratedVideo({
        videoUrl: videoUrls[0],
        isPartial: true,
        allVideoUrls: videoUrls,
        generatedAt: new Date().toISOString()
      });
    }
  };

  // Multi-scene generation: voiceover per segment -> video per segment -> stitch with transitions
  const handleMultiSceneGeneration = async () => {
    const totalSegments = segments.length;
    const videoUrls = [];

    for (let i = 0; i < totalSegments; i++) {
      const segment = segments[i];
      const scene = selectedScenes.find(s => s.id === segment.sceneId);
      const segNum = i + 1;

      if (!scene) {
        throw new Error(`No scene assigned to segment ${segNum}`);
      }

      // Step 1: Generate voiceover for this segment
      setVideoStatusMessage(`Generating voiceover for segment ${segNum}/${totalSegments}...`);
      setVideoProgress((i / totalSegments) * 70);

      let audioData, audioContentType;
      try {
        const voiceoverResult = await generateVoiceover({
          script: segment.text,
          voiceId: voiceover.voiceId
        });
        audioData = voiceoverResult.audioData;
        audioContentType = voiceoverResult.contentType || 'audio/mpeg';
      } catch (err) {
        throw new Error(`Failed to generate voiceover for segment ${segNum}: ${err.message}`);
      }

      // Step 2: Generate video for this segment
      setVideoStatusMessage(`Generating video for segment ${segNum}/${totalSegments}...`);

      const { jobId } = await generateVideo({
        sceneImageData: scene.imageData || null,
        sceneImageContentType: scene.imageContentType || 'image/png',
        sceneImageUrl: scene.imageData ? null : scene.imageUrl,
        audioData,
        audioContentType
      });

      setVideoStatusMessage(`Processing video for segment ${segNum}/${totalSegments}...`);

      const result = await pollVideoStatus(
        jobId,
        (progress) => {
          const baseProgress = (i / totalSegments) * 70;
          const segProgress = (progress / 100) * (70 / totalSegments);
          setVideoProgress(baseProgress + segProgress);
        }
      );

      if (result.videoUrl) {
        videoUrls.push(result.videoUrl);
      } else {
        throw new Error(`Segment ${segNum} failed: No video URL returned`);
      }
    }

    // Stitch with transitions
    setVideoStatusMessage('Combining segments with transitions...');
    setVideoProgress(72);

    if (!isFFmpegSupported()) {
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
      const combinedBlob = await stitchVideosWithTransitions(videoUrls, (progress) => {
        setVideoProgress(72 + (progress * 0.28));
      });
      const combinedUrl = URL.createObjectURL(combinedBlob);
      setGeneratedVideo({
        videoUrl: combinedUrl,
        videoBlob: combinedBlob,
        isStitched: true,
        isMultiScene: true,
        segmentCount: totalSegments,
        generatedAt: new Date().toISOString()
      });
      toast.success(`Multi-scene video created! ${totalSegments} segments with transitions.`);
    } catch (stitchError) {
      console.error('Transition stitching failed:', stitchError);
      toast.error('Failed to combine segments. You can download them individually.');
      setGeneratedVideo({
        videoUrl: videoUrls[0],
        isPartial: true,
        allVideoUrls: videoUrls,
        generatedAt: new Date().toISOString()
      });
    }
  };

  // ============ POST-GENERATION ============

  const handleDownload = async () => {
    if (!generatedVideo?.videoUrl) return;

    try {
      setIsProcessingDownload(true);
      toast.loading('Downloading video...', { id: 'download-progress' });

      const response = await fetch(generatedVideo.videoUrl);
      const blob = await response.blob();

      toast.dismiss('download-progress');

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ai-clone-video-${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Video downloaded!');
    } catch (error) {
      console.error('Download error:', error);
      toast.dismiss('download-progress');
      toast.error('Failed to download video');
    } finally {
      setIsProcessingDownload(false);
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
        sceneId: primaryScene?.id,
        sceneImageUrl: primaryScene?.imageUrl,
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

  // Get chunk info for display (single-scene chunked mode)
  const chunkInfo = !isMultiScene && voiceover?.isChunked ? {
    count: voiceover.chunks?.length || 0,
    estimatedTime: (voiceover.chunks?.length || 1) * 2
  } : null;

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-text-primary mb-2">
          Generate Video
        </h1>
        <p className="text-text-secondary">
          {isMultiScene
            ? 'Assign scenes to script segments and generate your multi-scene video.'
            : 'Review your selections and generate your AI clone video.'}
        </p>
      </div>

      {/* Chunk Warning (single-scene only) */}
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
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className={`grid ${isMultiScene ? 'md:grid-cols-2' : 'md:grid-cols-3'} gap-4 mb-8`}>
        {/* Scene(s) */}
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-text-secondary">
              {isMultiScene ? `${selectedScenes.length} Scenes` : 'Scene'}
            </h3>
            <button
              onClick={() => navigate('/step/2')}
              className="text-xs text-electric hover:text-electric-dim transition-colors"
            >
              Edit
            </button>
          </div>
          {isMultiScene ? (
            <div className="flex gap-2 flex-wrap">
              {selectedScenes.map((scene, i) => (
                <div key={scene.id} className="relative w-16 h-16 rounded-lg overflow-hidden bg-slate-dark">
                  <img src={scene.imageUrl} alt={`Scene ${i + 1}`} className="w-full h-full object-cover" />
                  <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-electric text-void text-[10px] font-bold flex items-center justify-center">
                    {i + 1}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="aspect-video rounded-lg overflow-hidden bg-slate-dark">
              <img src={primaryScene?.imageUrl} alt="Selected scene" className="w-full h-full object-cover" />
            </div>
          )}
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

        {/* Script (only in single-scene mode) */}
        {!isMultiScene && (
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
            <p className="text-sm text-text-primary line-clamp-4">{script}</p>
            <p className="text-xs text-text-muted mt-2">{script.length} characters</p>
          </div>
        )}
      </div>

      {/* ============ SEGMENT BUILDER (multi-scene only) ============ */}
      {isMultiScene && !generatedVideo && !isGeneratingVideo && (
        <div className="glass-card p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-text-primary">
              Scene Timeline
            </h2>
            <button
              onClick={handleAutoSplit}
              className="btn-secondary text-xs"
            >
              Auto-split into {selectedScenes.length} segments
            </button>
          </div>

          <p className="text-sm text-text-muted mb-4">
            Edit the text in each segment and assign a scene to each. Use Auto-split to reset, or Split/Merge to adjust segments.
          </p>

          {/* Segment cards */}
          <div className="space-y-3">
            {segments.map((segment, segIdx) => {
              const segSentences = splitIntoSentences(segment.text);
              const duration = estimateAudioDuration(segment.text);
              const assignedScene = selectedScenes.find(s => s.id === segment.sceneId);

              return (
                <div key={segment.id}>
                  <div className="border border-white/10 rounded-lg p-4 bg-slate-dark/30">
                    {/* Segment header */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-medium text-electric uppercase tracking-wider">
                        Segment {segIdx + 1}
                      </span>
                      <span className="text-xs text-text-muted">
                        ~{duration}s
                      </span>
                    </div>

                    {/* Editable script text */}
                    <textarea
                      value={segment.text}
                      onChange={(e) => handleSegmentTextChange(segIdx, e.target.value)}
                      rows={Math.max(2, Math.ceil(segment.text.length / 80))}
                      className="w-full text-sm text-text-primary mb-3 leading-relaxed bg-void/50 border border-white/10 rounded-lg p-3 resize-y focus:outline-none focus:border-electric/50 focus:ring-1 focus:ring-electric/30 placeholder-text-muted"
                      placeholder="Enter the script text for this segment..."
                    />

                    {/* Scene selector */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-secondary whitespace-nowrap">Scene:</span>
                      <div className="flex gap-2 flex-wrap">
                        {selectedScenes.map((scene) => (
                          <button
                            key={scene.id}
                            onClick={() => handleAssignScene(segIdx, scene.id)}
                            className={`relative w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${
                              segment.sceneId === scene.id
                                ? 'border-electric ring-1 ring-electric/50'
                                : 'border-white/10 hover:border-white/30'
                            }`}
                          >
                            <img src={scene.imageUrl} alt="" className="w-full h-full object-cover" />
                            {segment.sceneId === scene.id && (
                              <div className="absolute inset-0 bg-electric/20 flex items-center justify-center">
                                <svg className="w-4 h-4 text-electric" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Split actions within segment */}
                    {segSentences.length > 1 && (
                      <div className="mt-3 pt-3 border-t border-white/5">
                        <button
                          onClick={() => handleAddSplit(segIdx, Math.ceil(segSentences.length / 2))}
                          className="text-xs text-text-muted hover:text-electric transition-colors flex items-center gap-1"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          Split this segment
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Merge button between segments */}
                  {segIdx < segments.length - 1 && (
                    <div className="flex items-center justify-center py-1">
                      <button
                        onClick={() => handleRemoveSplit(segIdx)}
                        className="flex items-center gap-1 px-3 py-1 text-xs text-text-muted hover:text-coral transition-colors rounded-full hover:bg-coral/10"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                        Merge
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Total duration estimate */}
          <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
            <span className="text-sm text-text-muted">
              Total estimated duration: ~{segments.reduce((sum, s) => sum + estimateAudioDuration(s.text), 0)}s
            </span>
            {!allSegmentsAssigned && (
              <span className="text-xs text-coral">
                Assign a scene to every segment to continue
              </span>
            )}
          </div>
        </div>
      )}

      {/* ============ VIDEO GENERATION / PREVIEW ============ */}
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
                  {isMultiScene ? 'Creating Multi-Scene Video' : 'Generating Your Video'}
                </h3>
                <p className="text-text-secondary text-sm">
                  {isMultiScene
                    ? `Processing ${segments.length} segments with transitions. This may take a few minutes.`
                    : chunkInfo
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
                {isMultiScene
                  ? `${segments.length} segments with ${selectedScenes.length} different scenes will be stitched with transitions.`
                  : 'Your AI clone video will be created using the scene and voiceover above.'}
              </p>

              <button
                onClick={handleGenerate}
                disabled={isMultiScene && !allSegmentsAssigned}
                className="btn-primary text-lg px-8 py-4"
              >
                {isMultiScene ? 'Generate Multi-Scene Video' : 'Generate Video'}
              </button>

              {isMultiScene && !allSegmentsAssigned && (
                <p className="text-xs text-coral mt-3">
                  Please assign a scene to every segment above.
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="glass-card overflow-hidden mb-8 animate-slide-up">
          {/* Video Player */}
          <div className="max-w-md mx-auto">
            <div className="relative overflow-hidden" style={{ paddingBottom: '177.7%' }}>
              <video
                id="generated-video"
                src={generatedVideo.videoUrl}
                controls
                className="absolute top-0 left-0 w-full h-full"
                poster={primaryScene?.imageUrl}
              >
                Your browser does not support the video tag.
              </video>
            </div>
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

          {/* Success indicator */}
          {generatedVideo.isStitched && (
            <div className="p-3 bg-green-500/10 border-b border-green-500/30">
              <p className="text-sm text-green-300 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {generatedVideo.isMultiScene
                  ? `Multi-scene video: ${generatedVideo.segmentCount} segments with transitions`
                  : `Successfully combined ${generatedVideo.segmentCount} segments`}
              </p>
            </div>
          )}

          <div className="p-3 bg-electric/10 border-b border-electric/30">
            <p className="text-sm text-electric flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Video generated successfully!
            </p>
          </div>

          {/* Actions */}
          <div className="p-6">
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleDownload}
                disabled={isProcessingDownload}
                className="btn-primary flex items-center gap-2"
              >
                {isProcessingDownload ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Downloading...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download Video
                  </>
                )}
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
