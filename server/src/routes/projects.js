import { Router } from 'express';
import {
  listProjects,
  getProject,
  createProject,
  deleteProject,
  configureSource,
  startPipeline,
  getDocumentBundle,
  getAnalysis,
  updateSections,
  confirmDocument,
  exportDocx,
  getAllowedRoots,
} from '../services/projects.js';
import { SECTION_TEMPLATE } from '../config.js';

const router = Router();

router.get('/meta', (_req, res) => {
  res.json({
    allowedRoots: getAllowedRoots(),
    sectionTemplate: SECTION_TEMPLATE,
  });
});

router.get('/', (_req, res) => {
  res.json(listProjects());
});

router.post('/', (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ message: '작업명을 입력하세요.' });
  res.status(201).json(createProject(name));
});

router.get('/:id', (req, res) => {
  const project = getProject(req.params.id);
  if (!project) return res.status(404).json({ message: '작업을 찾을 수 없습니다.' });
  res.json({
    project,
    document: getDocumentBundle(project.id),
    analysis: getAnalysis(project.id),
  });
});

router.delete('/:id', (req, res) => {
  const ok = deleteProject(req.params.id);
  if (!ok) return res.status(404).json({ message: '작업을 찾을 수 없습니다.' });
  res.status(204).end();
});

router.put('/:id/source', (req, res) => {
  try {
    res.json(configureSource(req.params.id, req.body || {}));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/:id/analyze', (req, res) => {
  try {
    res.json(startPipeline(req.params.id));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/:id/generate', (req, res) => {
  try {
    const sectionIds = req.body?.sectionIds;
    const force = !!req.body?.force;
    const doc = getDocumentBundle(req.params.id);
    if (doc && sectionIds?.length && !force) {
      const modified = doc.sections.filter((s) => sectionIds.includes(s.sectionId) && s.userModified);
      if (modified.length) {
        return res.status(409).json({
          message: '수정된 섹션이 포함되어 있습니다. force=true로 덮어쓸 수 있습니다.',
          modifiedSectionIds: modified.map((s) => s.sectionId),
        });
      }
    }
    if (doc && !sectionIds && !force) {
      const modified = doc.sections.filter((s) => s.userModified);
      if (modified.length) {
        return res.status(409).json({
          message: '사용자 수정 섹션이 있습니다. 전체 재생성 시 force=true가 필요합니다.',
          modifiedSectionIds: modified.map((s) => s.sectionId),
        });
      }
    }
    // generate는 기존 분석 결과를 재사용하고 AI만 다시 돌린다 (재클론/재분석 없음)
    const ids = sectionIds?.length ? sectionIds : SECTION_TEMPLATE.map((s) => s.sectionId);
    res.json(startPipeline(req.params.id, { regenerateSections: ids }));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.get('/:id/document', (req, res) => {
  const doc = getDocumentBundle(req.params.id);
  if (!doc) return res.status(404).json({ message: '문서가 없습니다.' });
  res.json(doc);
});

router.put('/:id/document/sections', (req, res) => {
  try {
    const sections = req.body?.sections;
    if (!Array.isArray(sections)) {
      return res.status(400).json({ message: 'sections 배열이 필요합니다.' });
    }
    res.json(updateSections(req.params.id, sections));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/:id/document/confirm', (req, res) => {
  try {
    res.json(confirmDocument(req.params.id, req.body?.confirmed !== false));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.get('/:id/export', async (req, res) => {
  try {
    const { buffer, fileName } = await exportDocx(req.params.id);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.send(buffer);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

export default router;
