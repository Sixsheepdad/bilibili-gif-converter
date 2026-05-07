const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');

// Resolve ffmpeg binary - prefer bundled, fallback to system
function getFfmpegPath() {
  const appDir = path.dirname(require.main.filename);
  const candidates = [
    // Packaged: asarUnpack
    path.join(appDir, '..', 'app.asar.unpacked', 'node_modules', '@ffmpeg-installer', 'win32-x64', 'ffmpeg.exe'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'node_modules', '@ffmpeg-installer', 'win32-x64', 'ffmpeg.exe'),
    // Dev: node_modules
    path.join(appDir, '..', 'node_modules', '@ffmpeg-installer', 'win32-x64', 'ffmpeg.exe'),
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  try { return require('@ffmpeg-installer/ffmpeg').path; } catch(e) {}
  return 'ffmpeg';
}
const ffmpegPath = getFfmpegPath();

// Resolve yt-dlp binary - prefer bundled, fallback to system
function getYtdlpPath() {
  const appDir = path.dirname(require.main.filename);
  const candidates = [
    // Packaged: asarUnpack
    path.join(appDir, '..', 'app.asar.unpacked', 'bin', 'yt-dlp.exe'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'bin', 'yt-dlp.exe'),
    // Dev: project bin/
    path.join(appDir, '..', 'bin', 'yt-dlp.exe'),
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return 'yt-dlp';
}
const ytdlpPath = getYtdlpPath();

console.log('FFmpeg path:', ffmpegPath);
console.log('yt-dlp path:', ytdlpPath);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Bilibili GIF Converter',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

// ============ IPC Handlers ============

// Check for cached video
ipcMain.handle('check-cached', async (event, url) => {
  const downloadsDir = path.join(os.tmpdir(), 'bilibili-gif-converter');
  if (!fs.existsSync(downloadsDir)) return { cached: false };
  const files = fs.readdirSync(downloadsDir).filter(f => /\.(mp4|mkv|webm)$/i.test(f));
  if (files.length > 0) {
    // Return the most recently modified file
    let newest = null, newestTime = 0;
    for (const f of files) {
      const stat = fs.statSync(path.join(downloadsDir, f));
      if (stat.mtimeMs > newestTime) { newestTime = stat.mtimeMs; newest = f; }
    }
    if (newest) {
      return { cached: true, filePath: path.join(downloadsDir, newest), fileName: newest };
    }
  }
  return { cached: false };
});

// Download video via yt-dlp
ipcMain.handle('download-video', async (event, url) => {
  const downloadsDir = path.join(os.tmpdir(), 'bilibili-gif-converter');
  // Clear old downloads
  if (fs.existsSync(downloadsDir)) {
    fs.readdirSync(downloadsDir).forEach(f => {
      try { fs.unlinkSync(path.join(downloadsDir, f)); } catch(e) {}
    });
  }
  fs.mkdirSync(downloadsDir, { recursive: true });

  // Use video ID only to avoid Chinese filename issues
  const outputPath = path.join(downloadsDir, '%(id)s.%(ext)s');

  return new Promise((resolve, reject) => {
    const args = [
      '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '--merge-output-format', 'mp4',
      '-o', outputPath,
      '--no-playlist',
      '--restrict-filenames',
      '--socket-timeout', '30',
      url,
    ];

    // Send progress updates
    const proc = execFile(ytdlpPath, args, { maxBuffer: 1024 * 1024 * 50 });

    let downloadedFile = '';
    let errorOutput = '';

    proc.stdout.on('data', (data) => {
      const line = data.toString();
      // Parse download progress: [download] XX.X% of ...
      const match = line.match(/(\d+\.?\d*)%/);
      if (match) {
        event.sender.send('download-progress', parseFloat(match[1]));
      }
      // Parse destination line to get filename
      const destMatch = line.match(/Destination: (.+)/);
      if (destMatch) {
        downloadedFile = destMatch[1].trim();
      }
      // Also check for merged output
      const mergeMatch = line.match(/Merging formats into "(.+)"/);
      if (mergeMatch) {
        downloadedFile = mergeMatch[1].trim();
      }
    });

    proc.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        // Find the most recent mp4 file in downloads dir
        const files = fs.readdirSync(downloadsDir);
        const videoFiles = files.filter(f => /\.(mp4|mkv|webm)$/i.test(f));
        if (videoFiles.length > 0) {
          let newest = null, newestTime = 0;
          for (const f of videoFiles) {
            const stat = fs.statSync(path.join(downloadsDir, f));
            if (stat.mtimeMs > newestTime) { newestTime = stat.mtimeMs; newest = f; }
          }
          if (newest) {
            resolve({ success: true, filePath: path.join(downloadsDir, newest) });
            return;
          }
        }
        reject(new Error('下载完成但找不到视频文件'));
      } else {
        reject(new Error(`下载失败 (code ${code}): ${errorOutput || '未知错误'}`));
      }
    });
  });
});

// Get video info
ipcMain.handle('get-video-info', async (event, url) => {
  return new Promise((resolve, reject) => {
    const args = [
      '--dump-json',
      '--no-playlist',
      '--socket-timeout', '30',
      url,
    ];

    execFile(ytdlpPath, args, { maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`获取视频信息失败: ${err.message}`));
        return;
      }
      try {
        const info = JSON.parse(stdout);
        resolve({
          title: info.title,
          duration: info.duration,
          thumbnail: info.thumbnail,
          url: info.webpage_url,
        });
      } catch (e) {
        reject(new Error('解析视频信息失败'));
      }
    });
  });
});

// Convert video to GIF (direct FFmpeg call)
ipcMain.handle('convert-to-gif', async (event, options) => {
  const { inputPath, startTime, duration, width, fps, quality, cropArea } = options;

  const outputDir = path.dirname(inputPath);
  const baseName = path.basename(inputPath, path.extname(inputPath));
  const outputPath = path.join(outputDir, `${baseName}_gif_${Date.now()}.gif`);

  // Build FFmpeg args manually
  const args = [];

  // Input seek (start time)
  if (startTime !== undefined && startTime > 0) {
    args.push('-ss', String(startTime));
  }

  args.push('-i', inputPath);

  // Duration limit
  if (duration !== undefined && duration > 0) {
    args.push('-t', String(duration));
  }

  // Build filter chain
  // Use comma to chain sequential filters, semicolon only after split
  const chainParts = [];

  // Crop
  if (cropArea && cropArea.w > 0 && cropArea.h > 0) {
    const { x, y, w, h } = cropArea;
    chainParts.push(`crop=${Math.round(w)}:${Math.round(h)}:${Math.round(x)}:${Math.round(y)}`);
  }

  // FPS (put before scale for speed)
  const targetFps = fps || 10;
  chainParts.push(`fps=${targetFps}`);

  // Scale (skip if width is 0 = original size)
  if (width && width > 0) {
    chainParts.push(`scale=${width}:-1:flags=lanczos`);
  }

  // Split + palette for high quality GIF
  const filterStr = chainParts.join(',') + ',split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse';
  args.push('-filter_complex', filterStr);
  args.push('-y', outputPath);

  console.log('FFmpeg args:', args.join(' '));

  return new Promise((resolve, reject) => {
    const proc = execFile(ffmpegPath, args, { maxBuffer: 1024 * 1024 * 50 });

    let stderr = '';
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
      // Parse time progress
      const timeMatch = data.toString().match(/time=(\d+):(\d+):(\d+\.\d+)/);
      if (timeMatch && duration) {
        const elapsed = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseFloat(timeMatch[3]);
        const pct = Math.min((elapsed / duration) * 100, 100);
        event.sender.send('convert-progress', pct);
      }
    });

    proc.on('close', (code) => {
      console.log('FFmpeg exit code:', code);
      if (code === 0 && fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        resolve({ success: true, filePath: outputPath, fileSize: stats.size });
      } else {
        reject(new Error(`GIF转换失败:\n${stderr.slice(-500)}`));
      }
    });
  });
});

// Save file dialog
ipcMain.handle('save-gif', async (event, sourcePath) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '保存 GIF',
    defaultPath: path.basename(sourcePath),
    filters: [{ name: 'GIF Images', extensions: ['gif'] }],
  });

  if (!result.canceled && result.filePath) {
    fs.copyFileSync(sourcePath, result.filePath);
    return { success: true, savedPath: result.filePath };
  }
  return { success: false };
});

// Open external link in system browser
ipcMain.handle('open-external', async (event, url) => {
  await shell.openExternal(url);
});

// Get app paths
ipcMain.handle('get-paths', async () => {
  return {
    tempDir: path.join(os.tmpdir(), 'bilibili-gif-converter'),
  };
});
