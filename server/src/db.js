import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(config.workspaceDir, { recursive: true });

const storePath = path.join(config.dataDir, 'store.json');

function emptyStore() {
  return {
    projects: [],
    analysis_results: [],
    spec_documents: [],
    spec_sections: [],
    export_history: [],
  };
}

function load() {
  if (!fs.existsSync(storePath)) return emptyStore();
  try {
    return { ...emptyStore(), ...JSON.parse(fs.readFileSync(storePath, 'utf8')) };
  } catch {
    return emptyStore();
  }
}

function save(data) {
  fs.writeFileSync(storePath, JSON.stringify(data, null, 2), 'utf8');
}

export function nowIso() {
  return new Date().toISOString();
}

export function rowToProject(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    sourceType: row.source_type,
    gitUrl: row.git_url,
    branch: row.branch,
    localPath: row.local_path,
    workspacePath: row.workspace_path,
    errorMessage: row.error_message,
    progress: row.progress_json ? JSON.parse(row.progress_json) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 간단한 JSON 저장소 (네이티브 모듈 없이 동작) */
export const db = {
  listProjects() {
    return load().projects.slice().sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  },
  getProject(id) {
    return load().projects.find((p) => p.id === id) || null;
  },
  insertProject(row) {
    const data = load();
    data.projects.push(row);
    save(data);
  },
  updateProject(id, patch) {
    const data = load();
    const idx = data.projects.findIndex((p) => p.id === id);
    if (idx < 0) return null;
    data.projects[idx] = { ...data.projects[idx], ...patch };
    save(data);
    return data.projects[idx];
  },
  deleteProject(id) {
    const data = load();
    const before = data.projects.length;
    data.projects = data.projects.filter((p) => p.id !== id);
    data.analysis_results = data.analysis_results.filter((a) => a.project_id !== id);
    const docs = data.spec_documents.filter((d) => d.project_id === id).map((d) => d.id);
    data.spec_documents = data.spec_documents.filter((d) => d.project_id !== id);
    data.spec_sections = data.spec_sections.filter((s) => !docs.includes(s.document_id));
    data.export_history = data.export_history.filter((e) => e.project_id !== id);
    save(data);
    return before !== data.projects.length;
  },
  getAnalysis(projectId) {
    return load().analysis_results.find((a) => a.project_id === projectId) || null;
  },
  upsertAnalysis(row) {
    const data = load();
    const idx = data.analysis_results.findIndex((a) => a.project_id === row.project_id);
    if (idx >= 0) data.analysis_results[idx] = row;
    else data.analysis_results.push(row);
    save(data);
  },
  getDocument(projectId) {
    return load().spec_documents.find((d) => d.project_id === projectId) || null;
  },
  getDocumentById(id) {
    return load().spec_documents.find((d) => d.id === id) || null;
  },
  insertDocument(row) {
    const data = load();
    data.spec_documents.push(row);
    save(data);
  },
  updateDocument(id, patch) {
    const data = load();
    const idx = data.spec_documents.findIndex((d) => d.id === id);
    if (idx < 0) return null;
    data.spec_documents[idx] = { ...data.spec_documents[idx], ...patch };
    save(data);
    return data.spec_documents[idx];
  },
  listSections(documentId) {
    return load()
      .spec_sections.filter((s) => s.document_id === documentId)
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order);
  },
  getSection(documentId, sectionId) {
    return (
      load().spec_sections.find((s) => s.document_id === documentId && s.section_id === sectionId) ||
      null
    );
  },
  insertSection(row) {
    const data = load();
    data.spec_sections.push(row);
    save(data);
  },
  updateSection(id, patch) {
    const data = load();
    const idx = data.spec_sections.findIndex((s) => s.id === id);
    if (idx < 0) return null;
    data.spec_sections[idx] = { ...data.spec_sections[idx], ...patch };
    save(data);
    return data.spec_sections[idx];
  },
  insertExport(row) {
    const data = load();
    data.export_history.push(row);
    save(data);
  },
};

export default db;
