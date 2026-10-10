import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { TARGET_EXTS, walk } from './source.js';

function readSafe(filePath, max = 80_000) {
  try {
    const buf = fs.readFileSync(filePath);
    const text = buf.toString('utf8');
    return text.length > max ? text.slice(0, max) : text;
  } catch {
    return '';
  }
}

function analyzeJava(content, relPath) {
  const pkg = (content.match(/^\s*package\s+([\w.]+)\s*;/m) || [])[1] || '';
  const classMatch = content.match(/\b(public\s+)?(class|interface|enum)\s+(\w+)/);
  const className = classMatch ? classMatch[3] : path.basename(relPath, '.java');
  const kind = classMatch ? classMatch[2] : 'class';
  const methods = [...content.matchAll(/\bpublic\s+[\w<>\[\],\s]+\s+(\w+)\s*\(/g)]
    .map((m) => m[1])
    .filter((n) => n !== className)
    .slice(0, 20);
  const layer =
    /Controller$/i.test(className) || /\/controller\//i.test(relPath)
      ? 'controller'
      : /Service$/i.test(className) || /\/service\//i.test(relPath)
        ? 'service'
        : /Repository$|Mapper$/i.test(className) || /\/repository\//i.test(relPath)
          ? 'repository'
          : 'other';
  return { package: pkg, className, kind, layer, methods, path: relPath };
}

function analyzeVue(content, relPath) {
  const name =
    (content.match(/name\s*:\s*['"]([^'"]+)['"]/) || [])[1] ||
    path.basename(relPath, '.vue');
  const components = [...content.matchAll(/import\s+(\w+)\s+from\s+['"][^'"]+['"]/g)].map((m) => m[1]).slice(0, 15);
  const hasScriptSetup = /<script\s+setup/i.test(content);
  const routesHint = /path\s*:\s*['"][^'"]+['"]/.test(content);
  const summary = content
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  return { name, path: relPath, components, hasScriptSetup, routesHint, templateHint: summary };
}

function analyzeXml(content, relPath) {
  const isMapper = /namespace\s*=\s*["'][^"']+["']/i.test(content) || /<mapper[\s>]/i.test(content);
  const namespace = (content.match(/namespace\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
  const sqlIds = [...content.matchAll(/<(select|insert|update|delete)\s+[^>]*id\s*=\s*["']([^"']+)["']/gi)].map(
    (m) => `${m[1]}:${m[2]}`,
  );
  const beanIds = [...content.matchAll(/id\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]).slice(0, 30);
  return {
    path: relPath,
    kind: isMapper ? 'mybatis-mapper' : 'config-or-other',
    namespace,
    sqlIds: sqlIds.slice(0, 40),
    beanIds: isMapper ? [] : beanIds,
  };
}

/**
 * @param {string} rootDir
 * @param {(p: object) => void} onProgress
 */
export function analyzeSourceTree(rootDir, onProgress) {
  const files = [];
  let totalBytes = 0;

  walk(rootDir, (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (!TARGET_EXTS.has(ext)) return true;
    let size = 0;
    try {
      size = fs.statSync(filePath).size;
    } catch {
      return true;
    }
    totalBytes += size;
    files.push({ filePath, ext, size });
    if (files.length > config.maxFiles || totalBytes > config.maxTotalBytes) return false;
    return true;
  });

  if (files.length > config.maxFiles) {
    throw new Error(`분석 대상 파일이 ${config.maxFiles}개를 초과합니다.`);
  }
  if (totalBytes > config.maxTotalBytes) {
    throw new Error(`분석 대상 총 용량이 상한(${config.maxTotalBytes} bytes)을 초과합니다.`);
  }
  if (files.length === 0) {
    throw new Error('.java / .vue / .xml 파일이 없습니다. 소스 경로를 확인하세요.');
  }

  const java = [];
  const vue = [];
  const xml = [];
  const fileList = [];

  files.forEach((f, idx) => {
    const rel = path.relative(rootDir, f.filePath).split(path.sep).join('/');
    fileList.push({ path: rel, ext: f.ext, size: f.size });
    const content = readSafe(f.filePath);
    if (f.ext === '.java') java.push(analyzeJava(content, rel));
    else if (f.ext === '.vue') vue.push(analyzeVue(content, rel));
    else if (f.ext === '.xml') xml.push(analyzeXml(content, rel));

    if (onProgress && (idx % 10 === 0 || idx === files.length - 1)) {
      onProgress({
        phase: 'analyze',
        current: idx + 1,
        total: files.length,
        message: `파일 분석 중 (${idx + 1}/${files.length})`,
      });
    }
  });

  const packages = [...new Set(java.map((j) => j.package).filter(Boolean))].sort();
  const structureMeta = {
    counts: {
      java: java.length,
      vue: vue.length,
      xml: xml.length,
      total: files.length,
    },
    packages,
    java: java.slice(0, 300),
    vue: vue.slice(0, 300),
    xml: xml.slice(0, 300),
    layers: {
      controller: java.filter((j) => j.layer === 'controller').map((j) => j.className),
      service: java.filter((j) => j.layer === 'service').map((j) => j.className),
      repository: java.filter((j) => j.layer === 'repository').map((j) => j.className),
    },
  };

  const excerpts = buildExcerpts(rootDir, java, vue, xml);

  return {
    fileSummary: { files: fileList, totalBytes },
    structureMeta,
    excerpts,
  };
}

function buildExcerpts(rootDir, java, vue, xml) {
  const picks = [];
  const take = (list, n) => list.slice(0, n);
  for (const item of take(java.filter((j) => j.layer === 'controller'), 5)) {
    picks.push({ path: item.path, kind: 'java-controller' });
  }
  for (const item of take(java.filter((j) => j.layer === 'service'), 5)) {
    picks.push({ path: item.path, kind: 'java-service' });
  }
  for (const item of take(vue, 8)) {
    picks.push({ path: item.path, kind: 'vue' });
  }
  for (const item of take(xml.filter((x) => x.kind === 'mybatis-mapper'), 5)) {
    picks.push({ path: item.path, kind: 'xml-mapper' });
  }

  return picks.map((p) => {
    const abs = path.join(rootDir, p.path);
    const text = readSafe(abs, 4000);
    return { ...p, excerpt: text };
  });
}
