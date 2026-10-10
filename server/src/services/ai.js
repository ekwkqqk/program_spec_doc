import { config, SECTION_TEMPLATE } from '../config.js';

function buildPrompt(projectName, analysis, sectionIds) {
  const meta = analysis.structureMeta;
  const excerpts = (analysis.excerpts || [])
    .slice(0, 12)
    .map((e) => `### ${e.path} (${e.kind})\n\`\`\`\n${e.excerpt}\n\`\`\``)
    .join('\n\n');

  const targets = SECTION_TEMPLATE.filter((s) => sectionIds.includes(s.sectionId));

  return `당신은 소프트웨어 분석가입니다. Java/Vue/XML 코드 분석을 바탕으로 프로그램 사양서 초안을 한국어로 작성합니다.
문서는 AI 생성 초안이며 검수가 필요함을 전제로, 불확실한 내용은 명시하세요.

프로젝트명: ${projectName}

분석 요약(JSON):
${JSON.stringify(
    {
      counts: meta.counts,
      packages: meta.packages?.slice(0, 40),
      layers: meta.layers,
      javaSample: meta.java?.slice(0, 40),
      vueSample: meta.vue?.slice(0, 40),
      xmlSample: meta.xml?.slice(0, 40),
    },
    null,
    2,
  )}

코드 발췌:
${excerpts || '(발췌 없음)'}

작성할 섹션:
${targets.map((t) => `- ${t.sectionId}: ${t.title}`).join('\n')}

응답 형식(JSON만, 설명 문구 금지):
{
  "sections": [
    { "sectionId": "S01", "title": "...", "body": "마크다운 본문" }
  ]
}`;
}

async function callOpenAI(prompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.aiTimeoutMs);
  try {
    const res = await fetch(`${config.openaiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: config.openaiModel,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You write Korean software specification drafts as JSON.' },
          { role: 'user', content: prompt },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AI API 오류 (${res.status}): ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('AI 응답이 비어 있습니다.');
    return JSON.parse(content);
  } finally {
    clearTimeout(timer);
  }
}

function heuristicDraft(projectName, analysis, sectionIds) {
  const m = analysis.structureMeta;
  const controllers = m.layers?.controller || [];
  const services = m.layers?.service || [];
  const vueNames = (m.vue || []).map((v) => v.name);
  const mappers = (m.xml || []).filter((x) => x.kind === 'mybatis-mapper');

  const bodies = {
    S01: [
      `# ${projectName}`,
      '',
      '> AI/규칙 기반 생성 초안 — 검수 필요',
      '',
      `${projectName}은(는) 소스 분석 결과 기준으로 Java ${m.counts.java}개, Vue ${m.counts.vue}개, XML ${m.counts.xml}개 파일을 포함하는 프로그램으로 추정됩니다.`,
      '',
      '## 주요 패키지',
      ...(m.packages?.slice(0, 20).map((p) => `- ${p}`) || ['- (패키지 정보 없음)']),
    ].join('\n'),
    S02: [
      '코드 구조에서 추정한 기능 목록입니다.',
      '',
      '## 추정 기능',
      ...controllers.map((c) => `- ${c} 관련 API/화면 연동 기능`),
      ...vueNames.slice(0, 15).map((n) => `- 화면: ${n}`),
      ...(controllers.length + vueNames.length === 0 ? ['- (자동 추정된 기능이 제한적입니다. 수동 보완이 필요합니다.)'] : []),
    ].join('\n'),
    S03: [
      'Vue 컴포넌트/화면 후보 목록입니다.',
      '',
      '| 화면/컴포넌트 | 경로 |',
      '|---|---|',
      ...(m.vue || []).slice(0, 40).map((v) => `| ${v.name} | ${v.path} |`),
      m.vue?.length ? '' : '| (Vue 파일 없음) | - |',
    ].join('\n'),
    S04: [
      '추정 처리 흐름입니다.',
      '',
      '1. 사용자가 Vue 화면에서 요청을 수행한다.',
      '2. 프론트엔드가 백엔드 API를 호출한다.',
      '3. Controller → Service → Repository/Mapper 순으로 처리한다.',
      '4. 결과를 화면에 반영한다.',
      '',
      '## 관련 계층',
      `- Controller: ${controllers.join(', ') || '(없음)'}`,
      `- Service: ${services.join(', ') || '(없음)'}`,
    ].join('\n'),
    S05: [
      'Java API·서비스 후보입니다.',
      '',
      '## Controllers',
      ...(m.java || [])
        .filter((j) => j.layer === 'controller')
        .slice(0, 30)
        .map((j) => `- **${j.className}** (\`${j.package}\`)\n  - methods: ${(j.methods || []).slice(0, 8).join(', ') || '(미검출)'}`),
      '',
      '## Services',
      ...(m.java || [])
        .filter((j) => j.layer === 'service')
        .slice(0, 30)
        .map((j) => `- **${j.className}** (\`${j.package}\`)`),
      !controllers.length && !services.length ? '- (Controller/Service 명명 규칙으로 검출된 항목이 없습니다.)' : '',
    ].join('\n'),
    S06: [
      'XML 및 데이터 접근 설정 요약입니다.',
      '',
      '## MyBatis Mapper',
      ...mappers.slice(0, 30).map((x) => `- \`${x.path}\` namespace=\`${x.namespace || '-'}\` ids=${(x.sqlIds || []).slice(0, 8).join(', ') || '-'}`),
      mappers.length ? '' : '- (mapper로 추정되는 XML이 없습니다.)',
      '',
      '## 기타 XML',
      ...(m.xml || [])
        .filter((x) => x.kind !== 'mybatis-mapper')
        .slice(0, 20)
        .map((x) => `- \`${x.path}\``),
    ].join('\n'),
    S07: [
      '다음 항목은 자동 분석으로 확인하지 못했습니다. 검수 시 보완하세요.',
      '',
      '- 실제 업무 규칙·권한·예외 처리',
      '- 외부 연동(결제, 인증, 메시징 등)',
      '- 운영 환경·배포 구성',
      `- AI API ${config.openaiApiKey ? '사용' : '미설정(규칙 기반 초안)'} 상태`,
      '',
      '> 본 문서는 AI/규칙 기반 초안이며 사용자 검수가 필수입니다.',
    ].join('\n'),
  };

  return {
    sections: SECTION_TEMPLATE.filter((s) => sectionIds.includes(s.sectionId)).map((s) => ({
      sectionId: s.sectionId,
      title: s.title,
      body: bodies[s.sectionId] || '(내용 없음)',
    })),
    provider: config.openaiApiKey ? 'openai-fallback-heuristic' : 'heuristic',
  };
}

export async function generateSections(projectName, analysis, sectionIds) {
  const ids = sectionIds?.length ? sectionIds : SECTION_TEMPLATE.map((s) => s.sectionId);

  if (!config.openaiApiKey) {
    return heuristicDraft(projectName, analysis, ids);
  }

  try {
    const prompt = buildPrompt(projectName, analysis, ids);
    const parsed = await callOpenAI(prompt);
    const byId = new Map((parsed.sections || []).map((s) => [s.sectionId, s]));
    const sections = ids.map((id) => {
      const tmpl = SECTION_TEMPLATE.find((t) => t.sectionId === id);
      const got = byId.get(id);
      return {
        sectionId: id,
        title: got?.title || tmpl?.title || id,
        body: got?.body || '(생성 실패 — 수동 작성 필요)',
      };
    });
    return { sections, provider: 'openai' };
  } catch (err) {
    const fallback = heuristicDraft(projectName, analysis, ids);
    fallback.provider = 'heuristic-after-error';
    fallback.error = err.message;
    return fallback;
  }
}
