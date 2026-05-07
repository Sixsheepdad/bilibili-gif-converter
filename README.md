# Bilibili GIF Converter 🎬

将 B 站视频下载并转换为 GIF 的桌面应用。

## 功能

- 📎 粘贴 B 站视频链接即可解析
- ⬇️ 自动下载视频
- ✂️ 时间裁剪（选择起止时间点）
- 🖼️ 画面裁剪（鼠标拖拽选框）
- 🎬 高质量 GIF 生成（palettegen 优化）
- 💾 一键保存 GIF 到本地

## 使用方式

### 运行（开发模式）

```bash
# 安装依赖
npm install

# 下载 yt-dlp（需要放到 bin/ 目录）
mkdir bin
curl -L -o bin/yt-dlp.exe https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe

# 启动
npm start
```

### 打包（生成 Windows 安装程序）

```bash
npm run build
```

打包产物在 `dist/` 目录。

## 技术栈

- **Electron** — 桌面应用框架
- **React** — UI 渲染
- **yt-dlp** — B 站视频下载
- **FFmpeg** — 视频转 GIF

## 项目结构

```
bilibili-gif-converter/
├── bin/                    # yt-dlp 二进制（需自行下载）
├── src/
│   ├── main.js             # Electron 主进程
│   └── renderer/
│       ├── index.html      # 入口 HTML
│       ├── renderer.js     # React 应用
│       └── styles/
│           └── app.css     # 暗色主题样式
├── package.json
└── README.md
```

## 系统要求

- Windows 10/11 (x64)
