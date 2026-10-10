import fs from 'node:fs';
import { v4 as uuid } from 'uuid';
import db, { nowIso, rowToProject } from '../db.js';
import { STATUSES, SECTION_TEMPLATE, config } from '../config.js';
import { prepareWorkspace, hasTargetFiles, validateGitUrl, validateLocalPath } from './source.js';
import { analyzeSourceTree } from './analyzer.js';
import { generateSections } from './ai.js';
import { buildDocxBuffer, buildExportFileName } from './word.js';

const running = new Set();

function setProgress(id, progress) {
  db.updateProject(id, { progress_json: JSON.stringify(progress), updated_at: nowIso() });
}

function setStatus(id, status, errorMessage = null) {
  db.updateProject(id, {
    status,
    error_message: errorMessage,
    updated_at: nowIso(),
  });
}

export function listProjects() {
  return db.listProjects().map(rowToProject);
}

export function getProject(id) {
  return rowToProject(db.getProject(id));
}

export function createProject(name) {
  const id = uuid();
  const ts = nowIso();
  db.insertProject({
    id,
    name: name.trim(),
    status: STATUSES.DRAFT_WAIT,
    source_type: null,
    git_url: null,
    branch: null,
    local_path: null,
    workspace_path: null,
    error_message: null,
    progress_json: null,
    created_at: ts,
    updated_at: ts,
  });
  return getProject(id);
}

export function deleteProject(id) {
  const project = getProject(id);
  if (!project) return false;
  if (project.workspacePath && project.workspacePath.startsWith(config.workspaceDir)) {
    fs.rmSync(project.workspacePath, { recursive: true, force: true });
  }
  return db.deleteProject(id);
}

export function getDocumentBundle(projectId) {
  const doc = db.getDocument(projectId);
  if (!doc) return null;
  const sections = db.listSections(doc.id).map((s) => ({
    id: s.id,
    sectionId: s.section_id,
    title: s.title,
    body: s.body,
    userModified: !!s.user_modified,
    sortOrder: s.sort_order,
    updatedAt: s.updated_at,
  }));
  return {
    id: doc.id,
    projectId: doc.project_id,
    versionLabel: doc.version_label,
    confirmed: !!doc.confirmed,
    updatedAt: doc.updated_at,
    sections,
  };
}

export function getAnalysis(projectId) {
  const row = db.getAnalysis(projectId);
  if (!row) return null;
  return {
    projectId: row.project_id,
    fileSummary: JSON.parse(row.file_summary_json),
    structureMeta: JSON.parse(row.structure_meta_json),
    analyzedAt: row.analyzed_at,
  };
}

function saveAnalysis(projectId, analysis) {
  db.upsertAnalysis({
    project_id: projectId,
    file_summary_json: JSON.stringify(analysis.fileSummary),
    structure_meta_json: JSON.stringify({ ...analysis.structureMeta, excerpts: analysis.excerpts }),
    analyzed_at: nowIso(),
  });
}

function upsertDocumentSections(projectId, sections, { markUnmodified = true } = {}) {
  const ts = nowIso();
  let doc = db.getDocument(projectId);
  if (!doc) {
    const id = uuid();
    db.insertDocument({
      id,
      project_id: projectId,
      version_label: 'v1',
      confirmed: 0,
      updated_at: ts,
    });
    doc = db.getDocumentById(id);
  } else {
    db.updateDocument(doc.id, { updated_at: ts });
  }

  const orderMap = Object.fromEntries(SECTION_TEMPLATE.map((s, i) => [s.sectionId, i]));
  for (const section of sections) {
    const existing = db.getSection(doc.id, section.sectionId);
    if (existing) {
      db.updateSection(existing.id, {
        title: section.title,
        body: section.body,
        user_modified: markUnmodified ? 0 : existing.user_modified,
        updated_at: ts,
      });
    } else {
      db.insertSection({
        id: uuid(),
        document_id: doc.id,
        section_id: section.sectionId,
        title: section.title,
        body: section.body,
        user_modified: 0,
        sort_order: orderMap[section.sectionId] ?? 99,
        updated_at: ts,
      });
    }
  }
  return getDocumentBundle(projectId);
}

export function updateSections(projectId, updates) {
  const doc = getDocumentBundle(projectId);
  if (!doc) throw new Error('사양서 문서가 없습니다. 먼저 초안을 생성하세요.');
  const ts = nowIso();
  for (const u of updates) {
    const row = db.getSection(doc.id, u.sectionId);
    if (!row) continue;
    db.updateSection(row.id, {
      title: u.title ?? row.title,
      body: u.body ?? row.body,
      user_modified: 1,
      updated_at: ts,
    });
  }
  db.updateDocument(doc.id, { updated_at: ts });
  setStatus(projectId, STATUSES.EDITING);
  return getDocumentBundle(projectId);
}

export function confirmDocument(projectId, confirmed = true) {
  const doc = db.getDocument(projectId);
  if (!doc) throw new Error('사양서 문서가 없습니다.');
  db.updateDocument(doc.id, { confirmed: confirmed ? 1 : 0, updated_at: nowIso() });
  setStatus(projectId, confirmed ? STATUSES.EDITING : STATUSES.DRAFT_DONE);
  return getDocumentBundle(projectId);
}

export async function exportDocx(projectId) {
  const project = getProject(projectId);
  if (!project) throw new Error('작업을 찾을 수 없습니다.');
  const doc = getDocumentBundle(projectId);
  if (!doc || !doc.sections.length) {
    throw new Error('초안이 없어 내보낼 수 없습니다.');
  }
  const buffer = await buildDocxBuffer({
    projectName: project.name,
    sections: doc.sections,
    confirmed: doc.confirmed,
  });
  const fileName = buildExportFileName(project.name);
  db.insertExport({
    id: uuid(),
    project_id: projectId,
    file_name: fileName,
    exported_at: nowIso(),
  });
  setStatus(projectId, STATUSES.EXPORTED);
  return { buffer, fileName };
}

export function configureSource(projectId, body) {
  const project = getProject(projectId);
  if (!project) throw new Error('작업을 찾을 수 없습니다.');

  const type = body.type;
  if (type === 'git') {
    const v = validateGitUrl(body.gitUrl);
    if (!v.ok) throw new Error(v.message);
    db.updateProject(projectId, {
      source_type: 'git',
      git_url: v.url,
      branch: body.branch || null,
      local_path: null,
      updated_at: nowIso(),
      error_message: null,
    });
  } else if (type === 'local') {
    const v = validateLocalPath(body.localPath);
    if (!v.ok) throw new Error(v.message);
    if (!hasTargetFiles(v.resolved)) {
      throw new Error('.java / .vue / .xml 파일이 경로에 없습니다.');
    }
    db.updateProject(projectId, {
      source_type: 'local',
      local_path: v.resolved,
      git_url: null,
      branch: null,
      updated_at: nowIso(),
      error_message: null,
    });
  } else {
    throw new Error('type은 git 또는 local 이어야 합니다.');
  }
  return getProject(projectId);
}

export function startPipeline(projectId, { regenerateSections } = {}) {
  if (running.has(projectId)) {
    throw new Error('이미 분석/생성 작업이 진행 중입니다.');
  }
  const project = getProject(projectId);
  if (!project) throw new Error('작업을 찾을 수 없습니다.');
  if (!project.sourceType) throw new Error('소스를 먼저 설정하세요.');

  running.add(projectId);
  setStatus(projectId, regenerateSections ? STATUSES.GENERATING : STATUSES.ANALYZING);
  setProgress(projectId, {
    phase: regenerateSections ? 'generate' : 'source',
    current: 0,
    total: 1,
    message: regenerateSections ? 'AI 초안 생성 중' : '소스 준비 중',
  });

  (async () => {
    try {
      let sourceRoot = project.localPath;
      let workspacePath = project.workspacePath;

      if (!regenerateSections) {
        setProgress(projectId, { phase: 'source', current: 0, total: 1, message: '소스 확보 중' });
        const prepared = await prepareWorkspace(projectId, {
          type: project.sourceType,
          gitUrl: project.gitUrl,
          branch: project.branch,
          localPath: project.localPath,
        });
        sourceRoot = prepared.sourceRoot;
        workspacePath = prepared.workspacePath;
        db.updateProject(projectId, {
          workspace_path: workspacePath,
          updated_at: nowIso(),
        });

        setStatus(projectId, STATUSES.ANALYZING);
        const analysis = analyzeSourceTree(sourceRoot, (p) => setProgress(projectId, p));
        saveAnalysis(projectId, analysis);
      }

      const analysisRow = getAnalysis(projectId);
      if (!analysisRow) throw new Error('분석 결과가 없습니다.');

      const analysis = {
        fileSummary: analysisRow.fileSummary,
        structureMeta: { ...analysisRow.structureMeta },
        excerpts: analysisRow.structureMeta.excerpts || [],
      };

      setStatus(projectId, STATUSES.GENERATING);
      setProgress(projectId, {
        phase: 'generate',
        current: 0,
        total: 1,
        message: 'AI 초안 생성 중',
      });

      const sectionIds = regenerateSections?.length
        ? regenerateSections
        : SECTION_TEMPLATE.map((s) => s.sectionId);

      const result = await generateSections(project.name, analysis, sectionIds);
      upsertDocumentSections(projectId, result.sections, { markUnmodified: true });

      setProgress(projectId, {
        phase: 'done',
        current: 1,
        total: 1,
        message: result.provider?.includes('heuristic')
          ? `초안 생성 완료 (${result.provider}${result.error ? `, AI오류: ${result.error}` : ''})`
          : '초안 생성 완료',
      });
      setStatus(projectId, STATUSES.DRAFT_DONE);
    } catch (err) {
      setStatus(projectId, STATUSES.FAILED, err.message || String(err));
      setProgress(projectId, {
        phase: 'error',
        current: 0,
        total: 1,
        message: err.message || String(err),
      });
    } finally {
      running.delete(projectId);
    }
  })();

  return getProject(projectId);
}

export function getAllowedRoots() {
  return config.allowedRoots;
}
