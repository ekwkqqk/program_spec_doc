import fs from 'node:fs';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import { config } from '../config.js';

const TARGET_EXTS = new Set(['.java', '.vue', '.xml']);

export function isPathAllowed(inputPath) {
  const resolved = path.resolve(inputPath);
  return config.allowedRoots.some((root) => {
    const normalizedRoot = path.resolve(root);
    const rel = path.relative(normalizedRoot, resolved);
    // root 하위(또는 동일)이면 relative에 .. 가 없고 절대경로로 바뀌지 않음
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  });
}

export function validateLocalPath(localPath) {
  if (!localPath || typeof localPath !== 'string') {
    return { ok: false, message: '로컬 경로를 입력하세요.' };
  }
  const resolved = path.resolve(localPath);
  if (!isPathAllowed(resolved)) {
    return {
      ok: false,
      message: `허용된 루트 밖의 경로입니다. 허용 루트: ${config.allowedRoots.join('; ')}`,
    };
  }
  if (!fs.existsSync(resolved)) {
    return { ok: false, message: '경로가 존재하지 않습니다.' };
  }
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    return { ok: false, message: '디렉터리 경로여야 합니다.' };
  }
  return { ok: true, resolved };
}

export function validateGitUrl(url) {
  if (!url || typeof url !== 'string') {
    return { ok: false, message: 'Git URL을 입력하세요.' };
  }
  const trimmed = url.trim();
  const ok =
    /^https?:\/\/.+\.git$/i.test(trimmed) ||
    /^https?:\/\/(github\.com|gitlab\.com|bitbucket\.org)\/.+/i.test(trimmed) ||
    /^git@.+:.+\.git$/i.test(trimmed) ||
    /^https?:\/\/.+/i.test(trimmed);
  if (!ok) {
    return { ok: false, message: '유효한 Git URL 형식이 아닙니다.' };
  }
  return { ok: true, url: trimmed };
}

function injectToken(url, token) {
  if (!token) return url;
  try {
    const u = new URL(url);
    if (u.username || u.password) return url;
    u.username = 'oauth2';
    u.password = token;
    return u.toString();
  } catch {
    return url;
  }
}

export async function prepareWorkspace(projectId, source) {
  const workspacePath = path.join(config.workspaceDir, projectId);
  fs.rmSync(workspacePath, { recursive: true, force: true });
  fs.mkdirSync(workspacePath, { recursive: true });

  if (source.type === 'local') {
    const v = validateLocalPath(source.localPath);
    if (!v.ok) throw new Error(v.message);
    return { workspacePath: v.resolved, sourceRoot: v.resolved, cloned: false };
  }

  if (source.type === 'git') {
    const v = validateGitUrl(source.gitUrl);
    if (!v.ok) throw new Error(v.message);
    const cloneUrl = injectToken(v.url, config.gitToken || source.token);
    const git = simpleGit({
      timeout: { block: config.cloneTimeoutMs },
    });
    const options = ['--depth', '1'];
    if (source.branch) options.push('--branch', source.branch);
    await git.clone(cloneUrl, workspacePath, options);
    return { workspacePath, sourceRoot: workspacePath, cloned: true };
  }

  throw new Error('source.type은 git 또는 local 이어야 합니다.');
}

export function hasTargetFiles(rootDir) {
  let found = false;
  walk(rootDir, (filePath) => {
    if (TARGET_EXTS.has(path.extname(filePath).toLowerCase())) {
      found = true;
      return false;
    }
    return true;
  });
  return found;
}

const SKIP_DIRS = new Set(['node_modules', 'target', '.git', 'dist', 'build', '.idea', '.vscode']);

export function walk(dir, onFile) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.vue') {
      if (entry.isDirectory() && entry.name === '.git') continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, onFile);
    } else if (entry.isFile()) {
      const cont = onFile(full);
      if (cont === false) return;
    }
  }
}

export { TARGET_EXTS, SKIP_DIRS };
