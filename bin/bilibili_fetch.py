#!/usr/bin/env python3
"""
Bilibili video info fetcher - replaces yt-dlp --dump-json for Bilibili URLs.
Outputs yt-dlp compatible JSON format.
"""
import json
import re
import sys

import requests


def fetch_bilibili_info(url):
    """Fetch video info from Bilibili using requests (which handles 412 properly)."""
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com',
        'Origin': 'https://www.bilibili.com',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
    }

    # Step 1: Get webpage to extract initial state
    r = requests.get(url, headers=headers, timeout=30)
    if r.status_code != 200:
        return {'error': f'Failed to fetch webpage: HTTP {r.status_code}'}

    # Extract __INITIAL_STATE__ from page
    m = re.search(r'window\.__INITIAL_STATE__\s*=\s*(\{.*?\});', r.text, re.DOTALL)
    if not m:
        return {'error': 'Could not find initial state in page'}

    state = json.loads(m.group(1))
    video_data = state.get('videoData') or state.get('videoInfo') or {}

    bvid = video_data.get('bvid', '')
    cid = video_data.get('cid')
    if not cid:
        pages = video_data.get('pages', [])
        if pages:
            cid = pages[0].get('cid')

    if not bvid or not cid:
        return {'error': 'Could not extract video ID from page'}

    # Step 2: Get play info (video formats)
    params = {'bvid': bvid, 'cid': cid, 'fnval': '4048', 'platform': 'web'}
    r2 = requests.get('https://api.bilibili.com/x/player/wbi/playurl', params=params, headers=headers, timeout=30)
    if r2.status_code != 200:
        return {'error': f'Failed to fetch play info: HTTP {r2.status_code}'}

    play_data = r2.json()
    if play_data.get('code') != 0:
        return {'error': f'API error: {play_data.get("message", "unknown")}'}

    dash = play_data.get('data', {}).get('dash', {})
    formats = []

    # Process video streams
    for v in dash.get('video', []):
        fmt = {
            'format_id': f'dash-video-{v["id"]}',
            'ext': 'mp4',
            'vcodec': v.get('codecid', 'avc1'),
            'acodec': 'none',
            'filesize': v.get('size', 0),
            'width': v.get('width', 0),
            'height': v.get('height', 0),
            'tbr': v.get('bandwidth', 0) / 1000.0,
            'fps': v.get('frameRate', 0),
            'url': v.get('baseUrl', ''),
            'protocol': 'https',
            'resolution': f'{v.get("width", 0)}x{v.get("height", 0)}',
        }
        formats.append(fmt)

    # Process audio streams
    for a in dash.get('audio', []):
        if formats and 'baseUrl' in a:
            formats[0]['acodec'] = 'mp4a'

    # Build result matching yt-dlp output
    result = {
        'id': bvid,
        'title': video_data.get('title', ''),
        'formats': formats,
        'thumbnail': video_data.get('pic', ''),
        'description': video_data.get('desc', ''),
        'duration': play_data.get('data', {}).get('timelength', 0) / 1000.0,
        'webpage_url': url,
        'extractor': 'BiliBili',
        'extractor_key': 'BiliBili',
        'view_count': video_data.get('stat', {}).get('view', 0),
        'like_count': video_data.get('stat', {}).get('like', 0),
        'uploader': video_data.get('owner', {}).get('name', ''),
    }

    return result


if __name__ == '__main__':
    # Check if we're being called as --dump-json with a Bilibili URL
    if '--dump-json' in sys.argv:
        # Find the URL argument (last positional arg or after --)
        urls = [a for a in sys.argv[1:] if a.startswith('http') or a.startswith('www.')]
        if urls and ('bilibili.com' in urls[-1] or 'b23.tv' in urls[-1]):
            result = fetch_bilibili_info(urls[-1])
            if 'error' in result:
                print(json.dumps(result), file=sys.stderr)
                sys.exit(1)
            print(json.dumps(result, ensure_ascii=False))
            sys.exit(0)

    # Not a Bilibili URL or not --dump-json: delegate to real yt-dlp
    import subprocess
    import os

    # Find the real yt-dlp
    real_path = os.path.join(os.path.dirname(sys.argv[0]), 'yt-dlp_real.exe')
    if not os.path.exists(real_path):
        # Try to find it in PATH
        real_path = 'yt-dlp'

    sys.exit(subprocess.call([real_path] + sys.argv[1:]))
