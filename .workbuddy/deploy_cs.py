#!/usr/bin/env python3
"""CloudStudio 部署脚本 — 上传构建产物并启动静态服务"""
import os
import sys
import time
import requests
import zipfile
import tempfile
from pathlib import Path

# === 配置 ===
API_TOKEN = os.environ.get("CS_API_KEY", "")
SPACE_KEY = "6f92c87784b6436fbe8dcdef4a5291ec"
REGION = "ap-shanghai"
DIST_DIR = r"D:\培养方案拓展\.vitepress\dist"
PORT = 3000

if not API_TOKEN:
    print("❌ CS_API_KEY 环境变量未设置")
    sys.exit(1)

def upload_directory(api_token, space_key, region, directory):
    """使用 CloudStudio filesystem API 上传整个目录"""
    server_url = f"https://{space_key}--api.{region}.cloudstudio.club"
    
    if not os.path.isdir(directory):
        raise FileNotFoundError(f"目录不存在: {directory}")
    
    print(f"📦 压缩目录: {directory}...")
    
    # 创建临时zip
    tmp = tempfile.NamedTemporaryFile(suffix='.zip', delete=False)
    tmp_path = tmp.name
    tmp.close()
    
    try:
        with zipfile.ZipFile(tmp_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            base = Path(directory)
            file_count = 0
            for fp in base.rglob('*'):
                if fp.is_file():
                    rel = fp.relative_to(base)
                    zf.write(fp, arcname=rel)
                    file_count += 1
        print(f"  ✅ 已打包 {file_count} 个文件")
        
        zip_size = os.path.getsize(tmp_path) / (1024*1024)
        print(f"  📏 压缩包大小: {zip_size:.1f} MB")
        
        # 上传zip
        upload_path = "temp_upload.zip"
        upload_url = f"{server_url}/filesystem/workspace/{upload_path}"
        
        print(f"📤 上传到 CloudStudio...")
        with open(tmp_path, 'rb') as f:
            resp = requests.post(
                upload_url, data=f.read(),
                headers={
                    "Content-Type": "application/octet-stream",
                    "Authorization": f"Bearer {api_token}"
                },
                timeout=120
            )
        resp.raise_for_status()
        print(f"  ✅ 上传成功 ({resp.status_code})")
        
        # 清理旧文件 + 解压
        print(f"🔧 解压并部署...")
        unzip_cmd = (
            "rm -rf /workspace/* 2>/dev/null; "
            f"unzip -o /workspace/temp_upload.zip -d /workspace/ && "
            "rm /workspace/temp_upload.zip"
        )
        
        exec_url = f"{server_url}/console"
        exec_resp = requests.post(
            exec_url,
            json={"command": unzip_cmd},
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_token}"
            },
            timeout=120
        )
        exec_resp.raise_for_status()
        result = exec_resp.json()
        print(f"  ✅ 解压完成: {result}")
        
        return True
        
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)

def execute_command(api_token, space_key, region, command):
    """在 CloudStudio 工作空间执行命令"""
    server_url = f"https://{space_key}--api.{region}.cloudstudio.club"
    
    resp = requests.post(
        f"{server_url}/console",
        json={"command": command, "timeoutMs": 300000, "maxOutputSize": 10000000},
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_token}"
        },
        timeout=300
    )
    resp.raise_for_status()
    return resp.json()

def create_share_link(api_token, space_key, port):
    """创建端口分享链接"""
    resp = requests.post(
        f"https://bpi.cloudstudio.net/workspaces/{space_key}/links",
        json={"port": port},
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_token}"
        },
        timeout=30
    )
    resp.raise_for_status()
    return resp.json()

def restart_workspace(api_token, space_key):
    """重启工作空间"""
    resp = requests.get(
        f"https://bpi.cloudstudio.net/workspaces/{space_key}/restart",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_token}"
        },
        timeout=30
    )
    resp.raise_for_status()
    return resp.json()

# === 主流程 ===
def main():
    print("=" * 60)
    print("  机电学院知识库 — CloudStudio 部署")
    print("=" * 60)
    
    # Step 1: 上传构建产物
    print("\n[1/4] 上传构建产物到 CloudStudio...")
    try:
        upload_directory(API_TOKEN, SPACE_KEY, REGION, DIST_DIR)
    except Exception as e:
        print(f"  ❌ 上传失败: {e}")
        # 尝试重启工作空间后重试
        print("  🔄 尝试重启工作空间...")
        try:
            restart_workspace(API_TOKEN, SPACE_KEY)
            print("  ⏳ 等待 10 秒...")
            time.sleep(10)
            upload_directory(API_TOKEN, SPACE_KEY, REGION, DIST_DIR)
        except Exception as e2:
            print(f"  ❌ 重试仍失败: {e2}")
            sys.exit(1)
    
    # Step 2: 终止已有服务
    print("\n[2/4] 终止已有服务...")
    try:
        execute_command(API_TOKEN, SPACE_KEY, REGION, 
                       "pkill -f 'python.*http.server' 2>/dev/null; pkill -f 'python.*SimpleHTTPServer' 2>/dev/null; pkill -f 'npx.*serve' 2>/dev/null; echo 'done'")
    except:
        pass  # 没有运行的服务也没关系
    
    # Step 3: 启动静态文件服务
    print(f"\n[3/4] 启动静态文件服务 (端口 {PORT})...")
    serve_cmd = f"cd /workspace && nohup python3 -m http.server {PORT} > /tmp/server.log 2>&1 & sleep 2 && echo 'Server PID:' && pgrep -f 'http.server'"
    try:
        result = execute_command(API_TOKEN, SPACE_KEY, REGION, serve_cmd)
        print(f"  ✅ 服务已启动: {result}")
    except Exception as e:
        print(f"  ⚠️ 启动命令返回错误（可能已启动）: {e}")
    
    # Step 4: 创建分享链接
    print(f"\n[4/4] 创建分享链接...")
    try:
        link_resp = create_share_link(API_TOKEN, SPACE_KEY, PORT)
        print(f"  ✅ 分享链接创建成功")
        share_url = link_resp.get("data", {}).get("host", "")
        print(f"\n{'='*60}")
        print(f"  🌐 部署地址: {share_url}")
        print(f"{'='*60}")
    except Exception as e:
        print(f"  ⚠️ 分享链接创建失败: {e}")
        # 使用固定格式的 URL
        fallback_url = f"https://{SPACE_KEY}.app.codebuddy.work"
        print(f"\n  🌐 回退地址: {fallback_url}")

if __name__ == "__main__":
    main()
