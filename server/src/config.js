import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

function parseRoots(raw) {
  const defaults = [process.cwd(), path.parse(process.cwd()).root];
  if (!raw || !raw.trim()) return defaults;
  return raw
    .split(/[;|]/)
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean)
    .map((p) => path.resolve(p));
}

export const config = {
  port: Number(process.env.PORT || 3001),
  dataDir: path.join(__dirname, '..', 'data'),
  workspaceDir: path.join(__dirname, '..', 'data', 'workspaces'),
  dbPath: path.join(__dirname, '..', 'data', 'app.db'),
  allowedRoots: parseRoots(process.env.ALLOWED_ROOTS),
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiBaseUrl: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  gitToken: process.env.GIT_TOKEN || '',
  maxFiles: Number(process.env.MAX_FILES || 5000),
  maxTotalBytes: Number(process.env.MAX_TOTAL_BYTES || 209715200),
  cloneTimeoutMs: Number(process.env.CLONE_TIMEOUT_MS || 120000),
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS || 180000),
};

export const STATUSES = {
  DRAFT_WAIT: '초안대기',
  ANALYZING: '분석중',
  GENERATING: '초안생성중',
  DRAFT_DONE: '초안완료',
  EDITING: '편집중',
  EXPORTED: '내보내기완료',
  FAILED: '실패',
};

export const SECTION_TEMPLATE = [
  { sectionId: 'S01', title: '시스템/프로그램 개요' },
  { sectionId: 'S02', title: '기능 목록' },
  { sectionId: 'S03', title: '화면 구성' },
  { sectionId: 'S04', title: '처리/업무 흐름' },
  { sectionId: 'S05', title: 'API·서비스 명세' },
  { sectionId: 'S06', title: '데이터/설정' },
  { sectionId: 'S07', title: '비고/미확인 항목' },
];
