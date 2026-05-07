const { ipcRenderer } = require('electron');
const { useState, useRef, useEffect, useCallback } = React;

// ============ CropBox Component ============
function CropBox({ videoRef, cropEnabled, onCropChange }) {
  const overlayRef = useRef(null);
  const [dragging, setDragging] = useState(null); // 'create' | 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w'
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [crop, setCrop] = useState(null); // { x, y, w, h } in display pixels
  const startCropRef = useRef(null);

  const getOverlayRect = useCallback(() => {
    if (!overlayRef.current) return { left: 0, top: 0, width: 0, height: 0 };
    return overlayRef.current.getBoundingClientRect();
  }, []);

  const clampCrop = (c, maxW, maxH) => {
    let { x, y, w, h } = c;
    if (w < 20) w = 20;
    if (h < 20) h = 20;
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x + w > maxW) x = maxW - w;
    if (y + h > maxH) y = maxH - h;
    if (x < 0) { w += x; x = 0; }
    if (y < 0) { h += y; y = 0; }
    return { x, y, w, h };
  };

  const handleMouseDown = (e) => {
    if (!cropEnabled) return;
    e.preventDefault();
    const rect = getOverlayRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (crop) {
      // Check resize handles (8px border)
      const b = 8;
      const inTop = Math.abs(my - crop.y) < b && mx > crop.x && mx < crop.x + crop.w;
      const inBot = Math.abs(my - (crop.y + crop.h)) < b && mx > crop.x && mx < crop.x + crop.w;
      const inLeft = Math.abs(mx - crop.x) < b && my > crop.y && my < crop.y + crop.h;
      const inRight = Math.abs(mx - (crop.x + crop.w)) < b && my > crop.y && my < crop.y + crop.h;

      if (inTop && inLeft) setDragging('nw');
      else if (inTop && inRight) setDragging('ne');
      else if (inBot && inLeft) setDragging('sw');
      else if (inBot && inRight) setDragging('se');
      else if (inTop) setDragging('n');
      else if (inBot) setDragging('s');
      else if (inLeft) setDragging('w');
      else if (inRight) setDragging('e');
      else if (mx > crop.x && mx < crop.x + crop.w && my > crop.y && my < crop.y + crop.h) {
        setDragging('move');
      } else {
        setDragging('create');
        setCrop({ x: mx, y: my, w: 0, h: 0 });
      }
    } else {
      setDragging('create');
      setCrop({ x: mx, y: my, w: 0, h: 0 });
    }
    setStartPos({ x: mx, y: my });
    startCropRef.current = crop ? { ...crop } : null;
  };

  const handleMouseMove = useCallback((e) => {
    if (!dragging || !overlayRef.current) return;
    const rect = getOverlayRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const maxW = rect.width;
    const maxH = rect.height;
    const dx = mx - startPos.x;
    const dy = my - startPos.y;
    const sc = startCropRef.current;

    if (dragging === 'create') {
      const x1 = Math.max(0, Math.min(startPos.x, mx));
      const y1 = Math.max(0, Math.min(startPos.y, my));
      const x2 = Math.min(maxW, Math.max(startPos.x, mx));
      const y2 = Math.min(maxH, Math.max(startPos.y, my));
      const newCrop = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
      setCrop(newCrop);
    } else if (dragging === 'move' && sc) {
      const c = clampCrop({ x: sc.x + dx, y: sc.y + dy, w: sc.w, h: sc.h }, maxW, maxH);
      setCrop(c);
    } else if (sc) {
      let { x, y, w, h } = sc;
      if (dragging.includes('e')) w = Math.max(30, sc.w + dx);
      if (dragging.includes('w')) { x = sc.x + dx; w = sc.w - dx; }
      if (dragging.includes('s')) h = Math.max(30, sc.h + dy);
      if (dragging.includes('n')) { y = sc.y + dy; h = sc.h - dy; }
      if (dragging === 'nw' || dragging === 'ne' || dragging === 'sw' || dragging === 'se') {
        // Handle corner resize
        if (dragging === 'nw') { x = sc.x + dx; y = sc.y + dy; w = sc.w - dx; h = sc.h - dy; }
        if (dragging === 'ne') { y = sc.y + dy; w = sc.w + dx; h = sc.h - dy; }
        if (dragging === 'sw') { x = sc.x + dx; w = sc.w - dx; h = sc.h + dy; }
        if (dragging === 'se') { w = sc.w + dx; h = sc.h + dy; }
      }
      if (w < 30) w = 30;
      if (h < 30) h = 30;
      setCrop(clampCrop({ x, y, w, h }, maxW, maxH));
    }
  }, [dragging, startPos, getOverlayRect]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
    startCropRef.current = null;
  }, []);

  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragging, handleMouseMove, handleMouseUp]);

  // Notify parent of crop changes
  useEffect(() => {
    if (crop && overlayRef.current) {
      const video = videoRef.current;
      if (video && video.videoWidth && video.videoHeight) {
        // Calculate actual displayed video area (accounting for object-fit: contain)
        const el = overlayRef.current; // same size as video element
        const containerW = el.offsetWidth;
        const containerH = el.offsetHeight;
        const vidRatio = video.videoWidth / video.videoHeight;
        const containerRatio = containerW / containerH;
        let displayW, displayH, offsetX, offsetY;
        if (vidRatio > containerRatio) {
          // Video is wider than container - width fits, height has bars
          displayW = containerW;
          displayH = containerW / vidRatio;
          offsetX = 0;
          offsetY = (containerH - displayH) / 2;
        } else {
          // Video is taller - height fits, width has bars
          displayH = containerH;
          displayW = containerH * vidRatio;
          offsetX = (containerW - displayW) / 2;
          offsetY = 0;
        }
        const scaleX = video.videoWidth / displayW;
        const scaleY = video.videoHeight / displayH;
        onCropChange({
          x: Math.round((crop.x - offsetX) * scaleX),
          y: Math.round((crop.y - offsetY) * scaleY),
          w: Math.round(crop.w * scaleX),
          h: Math.round(crop.h * scaleY),
        });
      }
    } else {
      onCropChange(null);
    }
  }, [crop, videoRef, onCropChange]);

  if (!cropEnabled) return null;

  const handleStyle = (pos) => ({
    position: 'absolute',
    ...pos,
    width: 8,
    height: 8,
    background: '#00a1d6',
    border: '1px solid #fff',
    borderRadius: 2,
    zIndex: 12,
    cursor: 'pointer',
  });

  return (
    <div
      ref={overlayRef}
      onMouseDown={handleMouseDown}
      style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 10,
        cursor: crop ? 'default' : 'crosshair',
      }}
    >
      {crop && crop.w > 0 && crop.h > 0 && (
        <>
          {/* Darkened area outside crop */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', pointerEvents: 'none' }} />
          {/* Crop window */}
          <div style={{
            position: 'absolute',
            left: crop.x, top: crop.y,
            width: crop.w, height: crop.h,
            border: '2px solid #00a1d6',
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
            pointerEvents: 'none',
          }}>
            {/* Size label */}
            <div style={{
              position: 'absolute', bottom: -22, left: '50%', transform: 'translateX(-50%)',
              fontSize: 11, color: '#00a1d6', whiteSpace: 'nowrap',
              background: 'rgba(0,0,0,0.7)', padding: '2px 6px', borderRadius: 3,
            }}>
              {Math.round(crop.w)}×{Math.round(crop.h)}
            </div>
          </div>
          {/* Resize handles */}
          <div style={handleStyle({ left: crop.x - 4, top: crop.y - 4, cursor: 'nw-resize' })} data-handle="nw" />
          <div style={handleStyle({ left: crop.x + crop.w - 4, top: crop.y - 4, cursor: 'ne-resize' })} data-handle="ne" />
          <div style={handleStyle({ left: crop.x - 4, top: crop.y + crop.h - 4, cursor: 'sw-resize' })} data-handle="sw" />
          <div style={handleStyle({ left: crop.x + crop.w - 4, top: crop.y + crop.h - 4, cursor: 'se-resize' })} data-handle="se" />
          <div style={handleStyle({ left: crop.x + crop.w / 2 - 4, top: crop.y - 4, cursor: 'n-resize' })} data-handle="n" />
          <div style={handleStyle({ left: crop.x + crop.w / 2 - 4, top: crop.y + crop.h - 4, cursor: 's-resize' })} data-handle="s" />
          <div style={handleStyle({ left: crop.x - 4, top: crop.y + crop.h / 2 - 4, cursor: 'w-resize' })} data-handle="w" />
          <div style={handleStyle({ left: crop.x + crop.w - 4, top: crop.y + crop.h / 2 - 4, cursor: 'e-resize' })} data-handle="e" />
        </>
      )}
    </div>
  );
}

// ============ App ============
function App() {
  const [url, setUrl] = useState('');
  const [videoInfo, setVideoInfo] = useState(null);
  const [videoPath, setVideoPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [step, setStep] = useState('input');

  // Trim settings
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Crop settings
  const [cropEnabled, setCropEnabled] = useState(false);
  const [cropArea, setCropArea] = useState(null); // actual video pixels

  // GIF settings
  const [gifWidth, setGifWidth] = useState(480);
  const [gifFps, setGifFps] = useState(10);
  const [gifQuality, setGifQuality] = useState('medium');

  // Result
  const [gifResult, setGifResult] = useState(null);
  const [convertProgress, setConvertProgress] = useState(0);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const videoRef = useRef(null);

  // Listen for progress events
  useEffect(() => {
    const handleDownloadProgress = (e, pct) => setDownloadProgress(pct);
    const handleConvertProgress = (e, pct) => setConvertProgress(pct);
    ipcRenderer.on('download-progress', handleDownloadProgress);
    ipcRenderer.on('convert-progress', handleConvertProgress);
    return () => {
      ipcRenderer.removeListener('download-progress', handleDownloadProgress);
      ipcRenderer.removeListener('convert-progress', handleConvertProgress);
    };
  }, []);

  const showError = (msg) => setStatus({ type: 'error', text: msg });
  const showInfo = (msg) => setStatus({ type: 'info', text: msg });
  const showSuccess = (msg) => setStatus({ type: 'success', text: msg });

  // Step 1: Fetch video info
  const handleFetchInfo = async () => {
    if (!url.trim()) { showError('请输入视频链接'); return; }
    if (!url.includes('bilibili.com') && !url.includes('b23.tv')) {
      showError('请输入有效的B站视频链接'); return;
    }
    setLoading(true);
    setStatus(null);
    try {
      const info = await ipcRenderer.invoke('get-video-info', url.trim());
      setVideoInfo(info);
      setDuration(info.duration);
      setEndTime(info.duration);
      const cached = await ipcRenderer.invoke('check-cached', url.trim());
      if (cached.cached) {
        setVideoPath(cached.filePath);
        showSuccess(`已找到缓存视频: ${cached.fileName}，可直接选择片段`);
      } else {
        showInfo('视频信息获取成功！点击"下载视频"继续');
      }
    } catch (err) {
      showError(err.message || '获取视频信息失败');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Download video
  const handleDownload = async () => {
    setLoading(true);
    setDownloadProgress(0);
    showInfo('正在下载视频...');
    try {
      const result = await ipcRenderer.invoke('download-video', url.trim());
      setVideoPath(result.filePath);
      setStep('trim');
      showSuccess('下载完成！请选择GIF片段');
    } catch (err) {
      showError(err.message || '下载失败');
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Go to settings
  const handleGoSettings = () => {
    if (endTime <= startTime) { showError('结束时间必须大于开始时间'); return; }
    setStep('settings');
  };

  // Step 4: Convert
  const handleConvert = async () => {
    setStep('converting');
    setConvertProgress(0);
    setStatus(null);

    const clipDuration = endTime - startTime;
    const qualityMap = { low: 5, medium: 10, high: 15 };
    const fps = gifQuality === 'custom' ? gifFps : qualityMap[gifQuality];

    const options = {
      inputPath: videoPath,
      startTime: startTime,
      duration: clipDuration,
      width: 0,
      fps: fps,
      cropArea: cropEnabled ? cropArea : null,
    };

    try {
      const result = await ipcRenderer.invoke('convert-to-gif', options);
      setGifResult(result);
      setStep('result');
      showSuccess('GIF 生成成功！');
    } catch (err) {
      showError(err.message || '转换失败');
      setStep('settings');
    }
  };

  // Save GIF
  const handleSave = async () => {
    if (!gifResult) return;
    await ipcRenderer.invoke('save-gif', gifResult.filePath);
  };

  // Reset
  const handleReset = () => {
    setStep('input');
    setUrl('');
    setVideoInfo(null);
    setVideoPath('');
    setGifResult(null);
    setStatus(null);
    setStartTime(0);
    setEndTime(0);
    setCropEnabled(false);
    setCropArea(null);
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div>
      <div className="header">
        <span className="logo">🎬</span>
        <h1>Bilibili GIF Converter</h1>
      </div>

      <div className="container">
        {status && (
          <div className={`status status-${status.type}`}>
            {status.type === 'error' && '❌ '}{status.type === 'success' && '✅ '}{status.type === 'info' && 'ℹ️ '}
            {status.text}
          </div>
        )}

        {/* Step 1: Input */}
        {step === 'input' && (
          <div>
            <div className="input-section">
              <div className="section-title">📎 输入B站视频链接</div>
              <div className="input-row">
                <input
                  type="text"
                  placeholder="粘贴B站视频链接，如 https://www.bilibili.com/video/BV1xx411c7mD"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleFetchInfo()}
                  disabled={loading}
                />
                <button className="btn btn-primary" onClick={handleFetchInfo} disabled={loading}>
                  {loading ? '解析中...' : '解析'}
                </button>
              </div>
              <div className="help-tip">
                💡 从浏览器地址栏复制视频链接，或使用B站App的分享链接
              </div>
            </div>

            {videoInfo && (
              <div className="video-section">
                <div className="video-title">📺 {videoInfo.title}</div>
                {videoInfo.thumbnail && (
                  <img src={videoInfo.thumbnail} alt="thumbnail"
                    style={{ width: '100%', borderRadius: 'var(--radius)', marginBottom: 12, maxHeight: 300, objectFit: 'cover' }} />
                )}
                <div style={{ display: 'flex', gap: 16, marginBottom: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
                  <span>⏱ 时长: {formatTime(videoInfo.duration)}</span>
                </div>
                <button className="btn btn-primary" onClick={handleDownload} disabled={loading}>
                  {loading ? `下载中 ${downloadProgress.toFixed(0)}%...` : '⬇️ 下载视频'}
                </button>
                {videoPath && (
                  <button className="btn btn-success" onClick={() => setStep('trim')} style={{ marginLeft: 8 }}>
                    ✅ 使用缓存视频 →
                  </button>
                )}
                {loading && downloadProgress > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${downloadProgress}%` }}></div>
                    </div>
                    <div className="progress-text">{downloadProgress.toFixed(1)}%</div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Trim & Crop */}
        {step === 'trim' && (
          <div>
            <div className="video-section">
              <div className="section-title">✂️ 选择GIF片段</div>

              {/* Crop toggle */}
              <div className="crop-toggle">
                <input type="checkbox" id="crop-toggle" checked={cropEnabled}
                  onChange={(e) => { setCropEnabled(e.target.checked); if (!e.target.checked) setCropArea(null); }} />
                <label htmlFor="crop-toggle" style={{ cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>
                  启用画面裁剪（在视频上拖拽选框）
                </label>
                {cropEnabled && cropArea && (
                  <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 11, marginLeft: 8 }}
                    onClick={() => setCropArea(null)}>
                    清除裁剪
                  </button>
                )}
              </div>

              {/* Video with crop overlay */}
              <div className="video-container" style={{ position: 'relative' }}>
                <video ref={videoRef} src={`file:///${videoPath}`} controls preload="metadata"
                  style={{ display: 'block', width: '100%', maxHeight: 450, objectFit: 'contain' }}
                  onLoadedMetadata={() => {
                    if (videoRef.current) {
                      const dur = videoRef.current.duration;
                      setDuration(dur);
                      setEndTime(dur);
                    }
                  }}
                />
                <CropBox
                  videoRef={videoRef}
                  cropEnabled={cropEnabled}
                  onCropChange={setCropArea}
                />
              </div>

              {/* Crop info */}
              {cropEnabled && cropArea && (
                <div className="crop-info">
                  🖼️ 裁剪区域: {cropArea.w}×{cropArea.h}px（原始分辨率）
                </div>
              )}

              <div className="timeline-section">
                <div className="trim-row">
                  <label>开始时间</label>
                  <input type="number" value={startTime.toFixed(1)} step="0.1" min="0" max={duration}
                    onChange={(e) => { const v = parseFloat(e.target.value) || 0; setStartTime(v); if (videoRef.current) videoRef.current.currentTime = v; }}
                  />
                  <span className="time-display">{formatTime(startTime)}</span>
                  <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }}
                    onClick={() => { if (videoRef.current) setStartTime(videoRef.current.currentTime); }}>
                    设为当前
                  </button>
                </div>
                <div className="trim-row">
                  <label>结束时间</label>
                  <input type="number" value={endTime.toFixed(1)} step="0.1" min="0" max={duration}
                    onChange={(e) => { const v = parseFloat(e.target.value) || 0; setEndTime(v); if (videoRef.current) videoRef.current.currentTime = v; }}
                  />
                  <span className="time-display">{formatTime(endTime)}</span>
                  <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }}
                    onClick={() => { if (videoRef.current) setEndTime(videoRef.current.currentTime); }}>
                    设为当前
                  </button>
                </div>
                <div className="trim-row">
                  <label>GIF 时长</label>
                  <span className="time-display" style={{ color: 'var(--success)' }}>
                    {(endTime - startTime).toFixed(1)}s
                  </span>
                  {endTime - startTime > 10 && (
                    <span style={{ color: 'var(--warning)', fontSize: 12 }}>⚠️ GIF超过10秒文件会很大</span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                <button className="btn btn-secondary" onClick={handleReset}>← 返回</button>
                <button className="btn btn-primary" onClick={handleGoSettings}>下一步 →</button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Settings */}
        {step === 'settings' && (
          <div>
            <div className="video-section">
              <div className="section-title">⚙️ GIF 设置</div>
              <div className="settings-grid">
                <div className="setting-item">
                  <label>画质/帧率</label>
                  <select value={gifQuality} onChange={(e) => setGifQuality(e.target.value)}>
                    <option value="low">低 (5fps, 小文件)</option>
                    <option value="medium">中 (10fps, 推荐)</option>
                    <option value="high">高 (15fps, 大文件)</option>
                    <option value="custom">自定义</option>
                  </select>
                </div>
                {gifQuality === 'custom' && (
                  <div className="setting-item">
                    <label>帧率 (FPS): {gifFps}</label>
                    <input type="range" min="3" max="30" value={gifFps}
                      onChange={(e) => setGifFps(parseInt(e.target.value))} />
                  </div>
                )}
                <div className="setting-item">
                  <label>片段信息</label>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.8 }}>
                    <div>{formatTime(startTime)} → {formatTime(endTime)} ({(endTime - startTime).toFixed(1)}s)</div>
                    <div>帧率: {gifQuality === 'custom' ? gifFps : { low: 5, medium: 10, high: 15 }[gifQuality]}fps</div>
                    {cropArea && <div>裁剪: {cropArea.w}×{cropArea.h}px</div>}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button className="btn btn-secondary" onClick={() => setStep('trim')}>← 返回</button>
                <button className="btn btn-primary" onClick={handleConvert}>🎬 生成 GIF</button>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Converting */}
        {step === 'converting' && (
          <div className="progress-section">
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔄</div>
            <div className="section-title">正在生成 GIF...</div>
            <div className="progress-bar" style={{ maxWidth: 400, margin: '16px auto' }}>
              <div className="progress-fill" style={{ width: `${convertProgress}%` }}></div>
            </div>
            <div className="progress-text">{convertProgress.toFixed(1)}%</div>
          </div>
        )}

        {/* Step 5: Result */}
        {step === 'result' && gifResult && (
          <div className="result-section">
            <div className="section-title">🎉 GIF 生成成功！</div>
            <img className="result-preview" src={`file:///${gifResult.filePath}`} alt="Generated GIF" />
            <div className="result-info">文件大小: {formatSize(gifResult.fileSize)}</div>
            <div className="result-actions">
              <button className="btn btn-success" onClick={handleSave}>💾 保存到...</button>
              <button className="btn btn-secondary" onClick={handleReset}>🔄 再来一个</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
