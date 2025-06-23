import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, Settings, Image, AlertCircle, CheckCircle, Loader2, Play, Square } from 'lucide-react';

interface CaptureSettings {
  serverUrl: string;
  instruction: string;
}

type ProcessingState = 'idle' | 'loading' | 'success' | 'error';

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [processingState, setProcessingState] = useState<ProcessingState>('idle');
  const [result, setResult] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [settings, setSettings] = useState<CaptureSettings>({
    serverUrl: 'http://localhost:8080',
    instruction: 'Giả sử tôi là một người không nhìn thấy gì, hãy mô tả những gì bạn đang thấy một cách càng chi tiết càng tốt.',
  });
  const [showSettings, setShowSettings] = useState(false);

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

  const handleCapture = useCallback(async () => {
    const imageBase64 = captureImage();
    
    if (!imageBase64) {
      setError('Không thể chụp ảnh. Vui lòng thử lại.');
      return;
    }

    setProcessingState('loading');
    setError('');
    setResult('');

    try {
      const aiResult = await sendToAI(imageBase64);
      setResult(aiResult);
      setProcessingState('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra');
      setProcessingState('error');
    }
  }, [captureImage, sendToAI]);

  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="p-3 bg-blue-600 rounded-full">
              <Camera className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-800">AI Camera Capture</h1>
          </div>
          <p className="text-gray-600">Chụp ảnh và nhận phân tích AI chi tiết</p>
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
            </div>

            <canvas ref={canvasRef} className="hidden" />

            {/* Camera Controls */}
            <div className="flex gap-3">
              {!isCameraActive ? (
                <button
                  onClick={initCamera}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <Play className="w-5 h-5" />
                  Khởi động Camera
                </button>
              ) : (
                <>
                  <button
                    onClick={handleCapture}
                    disabled={processingState === 'loading'}
                    className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    {processingState === 'loading' ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Đang xử lý...
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
                </>
              )}
            </div>

            {/* Settings Panel */}
            {showSettings && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg border-t">
                <h3 className="font-medium text-gray-800 mb-3">Cài đặt</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Server URL
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
                      Câu lệnh AI
                    </label>
                    <textarea
                      value={settings.instruction}
                      onChange={(e) => setSettings(prev => ({ ...prev, instruction: e.target.value }))}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                    />
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

            {/* Results Display */}
            <div className="min-h-[200px] bg-gray-50 rounded-lg p-4">
              {result ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-green-700 font-medium">
                    <CheckCircle className="w-4 h-4" />
                    Phân tích hoàn thành
                  </div>
                  <div className="prose prose-sm max-w-none">
                    <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">{result}</p>
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
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-8 bg-white rounded-xl shadow-lg p-6">
          <h3 className="font-semibold text-gray-800 mb-3">Hướng dẫn sử dụng</h3>
          <div className="grid md:grid-cols-3 gap-4 text-sm text-gray-600">
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
              <p>Điều chỉnh góc máy và nhấn "Chụp ảnh"</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-blue-600 font-bold">3</span>
              </div>
              <p>Xem kết quả phân tích từ AI</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;