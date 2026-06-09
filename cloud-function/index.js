// CloudBase 云函数 — 代理 GitHub API 读写课程文件
// 部署: cloudbase functions:deploy save-course --env <envId>

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = 'TaiBai801/scau-knowledge-base';
const BRANCH = 'main';

exports.main = async (event) => {
  const { path, content, message, file } = event;
  
  if (!path) return { code: 400, message: 'path is required' };

  // --- 保存 Markdown 文件 ---
  if (content) {
    const sha = await getSha(path);
    const base64 = Buffer.from(content, 'utf-8').toString('base64');
    
    await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: message || `更新 ${path}`, content: base64, sha, branch: BRANCH }),
    });

    return { code: 200, message: 'saved' };
  }

  // --- 上传二进制文件 ---
  if (file) {
    const { name, data, filePath } = file;
    const sha = await getSha(filePath);
    
    await fetch(`https://api.github.com/repos/${REPO}/contents/${filePath}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: `上传 ${name}`, content: data, sha, branch: BRANCH }),
    });

    return { code: 200, message: 'uploaded', url: `/${filePath}` };
  }

  return { code: 400, message: 'need content or file' };
};

async function getSha(path) {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/contents/${path}?ref=${BRANCH}`,
      { headers: { Authorization: `Bearer ${GITHUB_TOKEN}` } }
    );
    if (res.ok) {
      const data = await res.json();
      return data.sha || null;
    }
    return null;
  } catch {
    return null;
  }
}
