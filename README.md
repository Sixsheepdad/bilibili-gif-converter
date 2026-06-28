# Bilibili GIF Converter 🎬

将 B 站视频下载并转换为 GIF 的桌面应用。

## 下载安装

### 方式一：下载安装程序（推荐）

1. 前往 [Releases](https://github.com/Sixsheepdad/bilibili-gif-converter/releases) 下载最新版安装程序
2. 双击 `Bilibili GIF Converter Setup x.x.x.exe`
3. 按提示完成安装
4. 桌面双击图标启动

### 方式二：从源码运行

```bash
git clone https://github.com/Sixsheepdad/bilibili-gif-converter.git
cd bilibili-gif-converter

# 安装依赖
npm install

# 下载 yt-dlp（放到 bin/ 目录）
mkdir bin
curl -L -o bin/yt-dlp.exe https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe

# 启动
npm start
```

## 使用方法

### 1. 输入链接

- 打开 B 站网站/App，找到想转换的视频
- 复制视频链接（浏览器地址栏，或 App 分享按钮）
- 粘贴到输入框，点击 **解析**

### 2. 下载视频

- 解析成功后会显示视频标题、封面、时长
- 点击 **下载视频**，等待下载完成（进度条实时显示）

### 3. 选择片段

- **时间裁剪**：设置开始时间和结束时间，或点击 **设为当前** 直接在时间线上取点
- **画面裁剪**：勾选「启用画面裁剪」，在视频上 **拖拽画框** 选择区域，可拖拽四角调整大小

### 4. 生成 GIF

- 选择画质/帧率：低(5fps) / 中(10fps) / 高(15fps) / 自定义
- 点击 **生成 GIF**，等待处理完成

### 5. 保存

- 点击 **保存到...**，选择保存位置
- ⚠️ 不保存的话，GIF 会在下次下载视频时被清除

## 技术栈

- **Electron** — 桌面应用框架
- **React 18** — UI 渲染
- **yt-dlp** — B 站视频下载
- **FFmpeg** — 视频转 GIF（palettegen 高质量优化）

## 项目结构

```
bilibili-gif-converter/
├── bin/                    # yt-dlp 二进制（需自行下载，已 .gitignore）
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

## 打包

```bash
npm run build
```

生成的安装程序在 `dist/` 目录。

## 更新日志

### 2026-06-28 v1.1.0
- **修复**：B 站解析失败（HTTP 412）——新增 Python 爬虫脚本 `bin/bilibili_fetch.py`，绕过 yt-dlp 请求限制
- **修复**：B 站下载同样 412 问题——获取信息后通过 `--load-info-json` + `--add-header` 传给 yt-dlp 下载
- **优化**：改用 Python `requests` 库获取视频信息，解析和下载稳定性都提升

## 常见问题

### 解析失败：HTTP 412 Precondition Failed

B 站近期更新了反爬机制，导致 yt-dlp 获取视频信息时返回 412 错误。

**解决方案（v1.1.0+）：**
- 已内置 `bin/bilibili_fetch.py` Python 脚本，自动绕过该问题
- 无需手动操作，检测到 B 站链接会自动使用 Python 脚本解析
- 依赖 Python 3 + `requests` 库（`pip install requests`）

**如果仍报错：** 确保已安装 Python 3 和 requests 库：
```bash
pip install requests
```

## 系统要求

- Windows 10/11 (x64)
