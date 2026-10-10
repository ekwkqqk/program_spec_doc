import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  PageBreak,
} from 'docx';

function mdToParagraphs(body) {
  const lines = String(body || '').split(/\r?\n/);
  const paragraphs = [];
  for (const line of lines) {
    if (!line.trim()) {
      paragraphs.push(new Paragraph({ text: '' }));
      continue;
    }
    if (line.startsWith('### ')) {
      paragraphs.push(
        new Paragraph({
          text: line.replace(/^###\s+/, ''),
          heading: HeadingLevel.HEADING_3,
        }),
      );
    } else if (line.startsWith('## ')) {
      paragraphs.push(
        new Paragraph({
          text: line.replace(/^##\s+/, ''),
          heading: HeadingLevel.HEADING_2,
        }),
      );
    } else if (line.startsWith('# ')) {
      paragraphs.push(
        new Paragraph({
          text: line.replace(/^#\s+/, ''),
          heading: HeadingLevel.HEADING_2,
        }),
      );
    } else if (line.startsWith('> ')) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: line.replace(/^>\s+/, ''), italics: true, color: '555555' })],
        }),
      );
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      paragraphs.push(
        new Paragraph({
          text: line.replace(/^[-*]\s+/, ''),
          bullet: { level: 0 },
        }),
      );
    } else if (/^\|.+\|$/.test(line.trim()) || /^\|?[\s:-]+\|/.test(line.trim())) {
      // 간단한 표 라인은 텍스트로 유지
      paragraphs.push(new Paragraph({ children: [new TextRun({ text: line, font: 'Consolas', size: 18 })] }));
    } else {
      paragraphs.push(new Paragraph({ children: [new TextRun(line)] }));
    }
  }
  return paragraphs;
}

export async function buildDocxBuffer({ projectName, sections, confirmed }) {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10);

  const children = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [new TextRun({ text: '프로그램 사양서', bold: true, size: 48 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: projectName, size: 32 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 200 },
      children: [new TextRun({ text: `작성일: ${dateStr}`, size: 22 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: confirmed ? '상태: 확정' : '상태: 초안 (AI 생성 — 검수 필요)',
          italics: true,
          size: 20,
          color: '666666',
        }),
      ],
    }),
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({ text: '목차', heading: HeadingLevel.HEADING_1 }),
    ...sections.map(
      (s, i) =>
        new Paragraph({
          text: `${i + 1}. ${s.title}`,
          spacing: { after: 80 },
        }),
    ),
    new Paragraph({ children: [new PageBreak()] }),
  ];

  for (const section of sections) {
    children.push(
      new Paragraph({
        text: section.title,
        heading: HeadingLevel.HEADING_1,
      }),
    );
    children.push(...mdToParagraphs(section.body));
    children.push(new Paragraph({ text: '' }));
  }

  const doc = new Document({
    creator: 'program-spec-doc',
    title: `${projectName} 프로그램 사양서`,
    description: 'AI 생성 초안 — 검수 필요',
    sections: [{ children }],
  });

  return Packer.toBuffer(doc);
}

export function buildExportFileName(projectName) {
  const safe = String(projectName || 'project')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80);
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `${safe}_프로그램사양서_${ymd}.docx`;
}
