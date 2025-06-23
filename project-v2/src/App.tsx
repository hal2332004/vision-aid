import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, Settings, Image, AlertCircle, CheckCircle, Loader2, Play, Square, Sparkles, Eye, Volume2, VolumeX, Pause } from 'lucide-react';
import { TypeAnimation } from 'react-type-animation';

interface CaptureSettings {
  serverUrl: string;
  instruction: string;
  ttsServerUrl: string;
  enableTTS: boolean;
  ttsLanguage: string;
}

type ProcessingState = 'idle' | 'loading' | 'enhancing' | 'generating-speech' | 'success' | 'error';

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [processingState, setProcessingState] = useState<ProcessingState>('idle');
  const [originalResult, setOriginalResult] = useState<string>('');
  const [enhancedResult, setEnhancedResult] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioBase64, setAudioBase64] = useState<string>('');
  const [settings, setSettings] = useState<CaptureSettings>({
    serverUrl: 'http://localhost:8080',
    instruction: 'Giả sử tôi là một người không nhìn thấy gì, hãy mô tả những gì bạn đang thấy một cách càng chi tiết càng tốt.',
    ttsServerUrl: 'http://localhost:5000',
    enableTTS: true,
    ttsLanguage: 'vi'
  });

  const [showSettings, setShowSettings] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const initCamera = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480 }, 
        audio: false 
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setIsCameraActive(true);
      setError('');
    } catch (err) {
      console.error('Error accessing camera:', err);
      setError('Không thể truy cập camera. Vui lòng cấp quyền và thử lại.');
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsCameraActive(false);
  }, [stream]);

  const captureImage = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (!video || !canvas || !video.videoWidth) {
      return null;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    
    if (!context) return null;
    
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8);
  }, []);

  const sendToAI = useCallback(async (imageBase64: string) => {
    try {
      const response = await fetch(`${settings.serverUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          max_tokens: 128,
          temperature: 0,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: {
                    url: imageBase64,
                  }
                },
                {
                  type: 'text',
                  text: settings.instruction
                }
              ]
            }
          ]
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Server error: ${response.status} - ${errorData}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Không thể kết nối đến server AI');
    }
  }, [settings]);

  const generateSpeech = useCallback(async (text: string) => {
    if (!settings.enableTTS || !text.trim()) {
      return null;
    }

    try {
      const response = await fetch(`${settings.ttsServerUrl}/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: text,
          language: settings.ttsLanguage
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('TTS API error:', errorData);
        throw new Error(`TTS API error: ${response.status}`);
      }

      const data = await response.json();
      if (data.success && data.audio_base64) {
        return data.audio_base64;
      } else {
        throw new Error(data.error || 'TTS generation failed');
      }
    } catch (err) {
      console.error('Error generating speech:', err);
      // Don't throw error, just log it - TTS is optional.
      return null;
    }
  }, [settings]);

  const playAudio = useCallback(() => {
    if (audioRef.current && audioBase64) {
      audioRef.current.play();
      setIsPlaying(true);
    }
  }, [audioBase64]);

  const pauseAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  const handleCapture = useCallback(async () => {
    const imageBase64 = captureImage();
    if (!imageBase64) {
      setError('Không thể chụp ảnh. Vui lòng thử lại.');
      return;
    }
    setPreviewImage(imageBase64); // Show captured image
    setProcessingState('loading');
    setError('');
    setOriginalResult('');
    setEnhancedResult('');
    setAudioBase64('');
    setIsPlaying(false);

    try {
      // Step 1: Get result from main AI
      const aiResult = await sendToAI(imageBase64);
      setOriginalResult(aiResult);
      setEnhancedResult(aiResult);

      // Step 3: Generate speech if enabled
      if (settings.enableTTS) {
        setProcessingState('generating-speech');
        const audioData = await generateSpeech(aiResult);
        if (audioData) {
          setAudioBase64(audioData);
        }
      }

      setProcessingState('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra');
      setProcessingState('error');
    }
  }, [captureImage, sendToAI, generateSpeech, settings]);

  const handleUploadImage = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const imageBase64 = event.target?.result as string;
      if (!imageBase64) {
        setError('Không thể đọc file ảnh.');
        return;
      }
      setPreviewImage(imageBase64); // Show uploaded image
      setProcessingState('loading');
      setError('');
      setOriginalResult('');
      setEnhancedResult('');
      setAudioBase64('');
      setIsPlaying(false);

      try {
        // Step 1: Get result from main AI
        const aiResult = await sendToAI(imageBase64);
        setOriginalResult(aiResult);
        setEnhancedResult(aiResult);

        // Step 3: Generate speech if enabled
        if (settings.enableTTS) {
          setProcessingState('generating-speech');
          const audioData = await generateSpeech(aiResult);
          if (audioData) {
            setAudioBase64(audioData);
          }
        }

        setProcessingState('success');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Có lỗi xảy ra');
        setProcessingState('error');
      }
    };
    reader.readAsDataURL(file);
  }, [sendToAI, generateSpeech, settings]);

  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => setIsPlaying(false);
    const handlePause = () => setIsPlaying(false);
    const handlePlay = () => setIsPlaying(true);

    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('play', handlePlay);

    return () => {
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('play', handlePlay);
    };
  }, [audioBase64]);

  // Update audio source when audioBase64 changes
  useEffect(() => {
    if (audioRef.current && audioBase64) {
      audioRef.current.src = `data:audio/wav;base64,${audioBase64}`;
    }
  }, [audioBase64]);

  // Auto play audio when audioBase64 changes and is set
  useEffect(() => {
    if (audioRef.current && audioBase64) {
      audioRef.current.src = `data:audio/wav;base64,${audioBase64}`;
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  }, [audioBase64]);

  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  // Scroll to demo section when clicking Demo in navbar
  const handleDemoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const demoSection = document.getElementById('demo');
    if (demoSection) {
      demoSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-0">
      {/* Navbar */}
      <nav className="w-full bg-white shadow-md fixed top-0 left-0 z-50">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-3">
          <div className="font-bold text-xl text-blue-700 tracking-tight">VisionAid Flatform</div>
          <ul className="flex items-center gap-6">
            <li>
              <a href="#" className="text-gray-700 hover:text-blue-600 font-medium transition-colors">About us</a>
            </li>
            <li>
              <a href="#" className="text-gray-700 hover:text-blue-600 font-medium transition-colors">App</a>
            </li>
            <li>
              <a href="#" className="text-gray-700 hover:text-blue-600 font-medium transition-colors">Pricing</a>
            </li>
            <li>
              <a href="#" className="text-gray-700 hover:text-blue-600 font-medium transition-colors">Help & FAQ</a>
            </li>
            <li>
              <a
                href="#demo"
                onClick={handleDemoClick}
                className="text-white bg-blue-600 hover:bg-blue-700 font-semibold px-4 py-2 rounded-lg shadow transition-colors"
              >
                Demo
              </a>
            </li>
          </ul>
        </div>
      </nav>

      {/* Add top padding to avoid overlap with fixed navbar */}
      <div className="pt-20">
        <section id="demo">
          <div className="max-w-6xl mx-auto">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="p-3 bg-blue-600 rounded-full">
                  <Camera className="w-8 h-8 text-white" />
                </div>
                <h1 className="text-3xl font-bold text-gray-800">AI Camera Capture</h1>
                <div className="p-2 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div className="p-2 bg-gradient-to-r from-green-500 to-blue-500 rounded-full">
                  <Volume2 className="w-6 h-6 text-white" />
                </div>
              </div>
              <p className="text-gray-600">Chụp ảnh, nhận phân tích AI {/*được cải thiện bởi Gemini và*/} nghe kết quả bằng giọng nói</p>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              {/* Camera Section */}
              <div className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
                    <Image className="w-5 h-5" />
                    Camera
                  </h2>
                  <button
                    onClick={() => setShowSettings(!showSettings)}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <Settings className="w-5 h-5 text-gray-600" />
                  </button>
                </div>

                {/* Camera Display */}
                <div className="relative bg-gray-900 rounded-lg overflow-hidden mb-4">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-64 object-cover"
                  />
                  {!isCameraActive && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                      <div className="text-center text-white">
                        <Camera className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p className="text-sm opacity-75">Camera chưa được khởi động</p>
                      </div>
                    </div>
                  )}
                  {/* Show preview image if available */}
                  {previewImage && (
                    <img
                      src={previewImage}
                      alt="Preview"
                      className="absolute inset-0 w-full h-full object-contain bg-black bg-opacity-60"
                      style={{ zIndex: 10 }}
                    />
                  )}
                </div>

                <canvas ref={canvasRef} className="hidden" />
                <audio ref={audioRef} className="hidden" />

                {/* Camera Controls */}
                <div className="flex gap-3">
                  {!isCameraActive ? (
                    <>
                      <button
                        onClick={initCamera}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                      >
                        <Play className="w-5 h-5" />
                        Khởi động Camera
                      </button>
                      {/* Upload Image Button */}
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex-1 bg-purple-600 hover:bg-purple-700 text-white px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                      >
                        <Image className="w-5 h-5" />
                        Tải ảnh lên
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleUploadImage}
                      />
                    </>
                  ) : (
                    <>
                      <button
                        onClick={handleCapture}
                        disabled={processingState === 'loading' || processingState === 'enhancing' || processingState === 'generating-speech'}
                        className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                      >
                        {processingState === 'loading' ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Đang phân tích...
                          </>
                        ) : processingState === 'enhancing' ? (
                          <>
                            <Sparkles className="w-5 h-5 animate-pulse" />
                            Đang cải thiện...
                          </>
                        ) : processingState === 'generating-speech' ? (
                          <>
                            <Volume2 className="w-5 h-5 animate-pulse" />
                            Đang tạo giọng nói...
                          </>
                        ) : (
                          <>
                            <Camera className="w-5 h-5" />
                            Chụp ảnh
                          </>
                        )}
                      </button>
                      <button
                        onClick={stopCamera}
                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                      >
                        <Square className="w-4 h-4" />
                        Dừng
                      </button>
                      {/* Upload Image Button (still allow upload while camera is active) */}
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex-1 bg-purple-600 hover:bg-purple-700 text-white px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                      >
                        <Image className="w-5 h-5" />
                        Tải ảnh lên
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleUploadImage}
                      />
                    </>
                  )}
                </div>

                {/* Settings Panel */}
                {showSettings && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg border-t">
                    <h3 className="font-medium text-gray-800 mb-3">Cài đặt</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Server URL (AI Vision)
                        </label>
                        <input
                          type="text"
                          value={settings.serverUrl}
                          onChange={(e) => setSettings(prev => ({ ...prev, serverUrl: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Câu lệnh AI chính
                        </label>
                        <textarea
                          value={settings.instruction}
                          onChange={(e) => setSettings(prev => ({ ...prev, instruction: e.target.value }))}
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                        />
                      </div>

                      {/* Gemini Settings */}
                      {/* 
                      <div className="border-t pt-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Sparkles className="w-4 h-4 text-purple-600" />
                          <h4 className="font-medium text-gray-800">Cải thiện với Gemini</h4>
                        </div>
                        
                        <div className="flex items-center gap-2 mb-3">
                          <input
                            type="checkbox"
                            id="enableGemini"
                            checked={settings.enableGeminiEnhancement}
                            onChange={(e) => setSettings(prev => ({ ...prev, enableGeminiEnhancement: e.target.checked }))}
                            className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                          />
                          <label htmlFor="enableGemini" className="text-sm text-gray-700">
                            Bật cải thiện với Gemini
                          </label>
                        </div>

                        {settings.enableGeminiEnhancement && (
                          <>
                            <div className="mb-3">
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Gemini API Key
                              </label>
                              <input
                                type="password"
                                value={settings.geminiApiKey}
                                onChange={(e) => setSettings(prev => ({ ...prev, geminiApiKey: e.target.value }))}
                                placeholder="Nhập API key của Gemini"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Prompt cải thiện
                              </label>
                              <textarea
                                value={settings.geminiPrompt}
                                onChange={(e) => setSettings(prev => ({ ...prev, geminiPrompt: e.target.value }))}
                                rows={3}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none"
                              />
                            </div>
                          </>
                        )}
                      </div>
                      */}

                      {/* TTS Settings */}
                      <div className="border-t pt-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Volume2 className="w-4 h-4 text-green-600" />
                          <h4 className="font-medium text-gray-800">Text-to-Speech</h4>
                        </div>
                        
                        <div className="flex items-center gap-2 mb-3">
                          <input
                            type="checkbox"
                            id="enableTTS"
                            checked={settings.enableTTS}
                            onChange={(e) => setSettings(prev => ({ ...prev, enableTTS: e.target.checked }))}
                            className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                          />
                          <label htmlFor="enableTTS" className="text-sm text-gray-700">
                            Bật chuyển văn bản thành giọng nói
                          </label>
                        </div>

                        {settings.enableTTS && (
                          <>
                            <div className="mb-3">
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                TTS Server URL
                              </label>
                              <input
                                type="text"
                                value={settings.ttsServerUrl}
                                onChange={(e) => setSettings(prev => ({ ...prev, ttsServerUrl: e.target.value }))}
                                placeholder="http://localhost:5000"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Ngôn ngữ
                              </label>
                              <select
                                value={settings.ttsLanguage}
                                onChange={(e) => setSettings(prev => ({ ...prev, ttsLanguage: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                              >
                                <option value="vi">Tiếng Việt</option>
                                <option value="en">English</option>
                              </select>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Results Section */}
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <div className="flex items-center gap-2">
                    {processingState === 'success' && <CheckCircle className="w-5 h-5 text-green-600" />}
                    {processingState === 'error' && <AlertCircle className="w-5 h-5 text-red-600" />}
                    {processingState === 'loading' && <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />}
                    {processingState === 'enhancing' && <Sparkles className="w-5 h-5 text-purple-600 animate-pulse" />}
                    {processingState === 'generating-speech' && <Volume2 className="w-5 h-5 text-green-600 animate-pulse" />}
                    Kết quả AI
                  </div>
                </h2>

                {/* Status Messages */}
                {error && (
                  <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <p className="text-red-800 text-sm">{error}</p>
                    </div>
                  </div>
                )}

                {processingState === 'loading' && (
                  <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                      <p className="text-blue-800 text-sm">Đang gửi ảnh đến AI để phân tích...</p>
                    </div>
                  </div>
                )}

                {processingState === 'enhancing' && (
                  <div className="mb-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Sparkles className="w-5 h-5 text-purple-600 animate-pulse" />
                      <p className="text-purple-800 text-sm">Đang cải thiện kết quả với Gemini...</p>
                    </div>
                  </div>
                )}

                {processingState === 'generating-speech' && (
                  <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Volume2 className="w-5 h-5 text-green-600 animate-pulse" />
                      <p className="text-green-800 text-sm">Đang tạo giọng nói từ văn bản...</p>
                    </div>
                  </div>
                )}

                {/* Results Display */}
                <div className="space-y-4">
                  {/* Enhanced Result (Main Display) */}
                  <div className="min-h-[200px] bg-gray-50 rounded-lg p-4">
                    {enhancedResult ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-green-700 font-medium">
                            <CheckCircle className="w-4 h-4" />
                            {/* {settings.enableGeminiEnhancement && settings.geminiApiKey ? 'Kết quả đã được cải thiện' : 'Phân tích hoàn thành'}
                            {settings.enableGeminiEnhancement && settings.geminiApiKey && (
                              <Sparkles className="w-4 h-4 text-purple-600" />
                            )} */}
                            Phân tích hoàn thành
                          </div>
                          
                          {/* Audio Controls */}
                          {audioBase64 && settings.enableTTS && (
                            <div className="flex items-center gap-2">
                              {!isPlaying ? (
                                <button
                                  onClick={playAudio}
                                  className="flex items-center gap-1 px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm transition-colors"
                                >
                                  <Volume2 className="w-4 h-4" />
                                  Phát
                                </button>
                              ) : (
                                <button
                                  onClick={pauseAudio}
                                  className="flex items-center gap-1 px-3 py-1 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm transition-colors"
                                >
                                  <Pause className="w-4 h-4" />
                                  Tạm dừng
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="prose prose-sm max-w-none">
                          <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">{enhancedResult}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full text-gray-500">
                        <div className="text-center">
                          <Image className="w-12 h-12 mx-auto mb-3 opacity-30" />
                          <p className="text-sm">Chụp ảnh để nhận phân tích từ AI</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Original Result (Collapsible) */}
                  {/* {originalResult && settings.enableGeminiEnhancement && settings.geminiApiKey && originalResult !== enhancedResult && (
                    <details className="bg-gray-100 rounded-lg">
                      <summary className="p-3 cursor-pointer text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-2">
                        <Eye className="w-4 h-4" />
                        Xem kết quả gốc
                      </summary>
                      <div className="p-4 pt-0">
                        <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-wrap">{originalResult}</p>
                      </div>
                    </details>
                  )} */}
                </div>
              </div>
            </div>

            {/* Instructions */}
            <div className="mt-8 bg-white rounded-xl shadow-lg p-6">
              <h3 className="font-semibold text-gray-800 mb-3">Hướng dẫn sử dụng</h3>
              <div className="grid md:grid-cols-5 gap-4 text-sm text-gray-600">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-blue-600 font-bold">1</span>
                  </div>
                  <p>Nhấn "Khởi động Camera" để bắt đầu</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-blue-600 font-bold">2</span>
                  </div>
                  <p>Cấu hình Gemini API key trong Settings</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-blue-600 font-bold">3</span>
                  </div>
                  <p>Cấu hình TTS server URL (mặc định: localhost:5000)</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-blue-600 font-bold">4</span>
                  </div>
                  <p>Điều chỉnh góc máy và nhấn "Chụp ảnh"</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-blue-600 font-bold">5</span>
                  </div>
                  <p>Xem kết quả và nghe giọng nói AI</p>
                </div>
              </div>
              
              <div className="mt-4 grid md:grid-cols-2 gap-4">
                {/* 
                <div className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200">
                  <div className="flex items-start gap-3">
                    <Sparkles className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-purple-800 font-medium text-sm mb-1">Tính năng Gemini Enhancement</p>
                      <p className="text-purple-700 text-xs">
                        Khi bật, kết quả từ AI chính sẽ được Gemini viết lại để chuẩn chỉnh hơn về ngữ pháp, từ vựng và cấu trúc câu.
                        Bạn cần API key của Google Gemini để sử dụng tính năng này.
                      </p>
                    </div>
                  </div>
                </div>
                */}
                <div className="p-4 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg border border-green-200">
                  <div className="flex items-start gap-3">
                    <Volume2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-green-800 font-medium text-sm mb-1">Tính năng Text-to-Speech</p>
                      <p className="text-green-700 text-xs">
                        Chuyển đổi kết quả phân tích thành giọng nói tiếng Việt tự nhiên. 
                        Cần chạy TTS server trên localhost:5000 để sử dụng tính năng này.
                      </p>
                    </div>
                  </div>
                </div>
                {/* Donate Section */}
                <div className="mt-8 bg-white rounded-xl shadow-lg p-6">
                  <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-purple-600" />
                    Ủng hộ tác giả
                  </h3>
                  {/* Use TypeAnimation for the donate text */}
                  <TypeAnimation
                    sequence={[
                      'Nếu bạn thấy ứng dụng này hữu ích, hãy ủng hộ mình qua mã QR bên dưới ❤️',
                      2000,
                      '',
                      500,
                      'Nếu bạn thấy ứng dụng này hữu ích, hãy ủng hộ mình qua mã QR bên dưới ❤️',
                    ]}
                    wrapper="span"
                    speed={60}
                    repeat={Infinity}
                    className="text-gray-600 text-sm mb-4 block"
                  />
                  <div className="flex justify-center">
                    <a
                      href="https://facebook.com/hal2332004"
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Liên hệ với tác giả qua Facebook"
                    >
                      <img
                        src="loc.jpg"
                        alt="QR Donate"
                        className="w-48 h-48 object-contain border rounded-lg shadow-md transition-transform duration-300 hover:scale-105 hover:shadow-2xl cursor-pointer"
                      />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default App;