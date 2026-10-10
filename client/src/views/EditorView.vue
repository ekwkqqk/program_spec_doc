<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../api';

const route = useRoute();
const id = route.params.id;

const project = ref(null);
const document = ref(null);
const activeId = ref('S01');
const error = ref('');
const notice = ref('');
const saving = ref(false);

const activeSection = computed(() =>
  document.value?.sections?.find((s) => s.sectionId === activeId.value),
);

async function load() {
  error.value = '';
  const data = await api.get(id);
  project.value = data.project;
  document.value = data.document;
  if (data.document?.sections?.length) {
    activeId.value = data.document.sections[0].sectionId;
  }
}

onMounted(async () => {
  try {
    await load();
  } catch (e) {
    error.value = e.message;
  }
});

async function save() {
  if (!document.value) return;
  saving.value = true;
  error.value = '';
  notice.value = '';
  try {
    document.value = await api.saveSections(
      id,
      document.value.sections.map((s) => ({
        sectionId: s.sectionId,
        title: s.title,
        body: s.body,
      })),
    );
    notice.value = '임시 저장되었습니다.';
    project.value = (await api.get(id)).project;
  } catch (e) {
    error.value = e.message;
  } finally {
    saving.value = false;
  }
}

async function confirm() {
  try {
    document.value = await api.confirm(id, true);
    notice.value = '문서를 확정 표시했습니다.';
  } catch (e) {
    error.value = e.message;
  }
}

async function regenerate(sectionIds) {
  const force = window.confirm(
    sectionIds
      ? '선택한 섹션을 다시 생성합니다. 수정 내용이 덮어써질 수 있습니다. 계속할까요?'
      : '전체 초안을 다시 생성합니다. 수정 내용이 덮어써질 수 있습니다. 계속할까요?',
  );
  if (!force) return;
  error.value = '';
  notice.value = '재생성 중…';
  try {
    await api.generate(id, { sectionIds, force: true });
    // poll until done
    const wait = async () => {
      const data = await api.get(id);
      project.value = data.project;
      if (['분석중', '초안생성중'].includes(data.project.status)) {
        setTimeout(wait, 800);
        return;
      }
      if (data.project.status === '실패') {
        error.value = data.project.errorMessage || '재생성 실패';
        notice.value = '';
        return;
      }
      document.value = data.document;
      notice.value = '재생성이 완료되었습니다.';
    };
    await wait();
  } catch (e) {
    if (e.status === 409) {
      error.value = e.message;
    } else {
      error.value = e.message;
    }
    notice.value = '';
  }
}

function download() {
  window.location.href = api.exportUrl(id);
}
</script>

<template>
  <section>
    <div class="panel" style="margin-bottom: 16px">
      <div class="row" style="justify-content: space-between">
        <div>
          <h2 style="margin: 0 0 4px">{{ project?.name || '사양서 편집' }}</h2>
          <p class="muted" style="margin: 0">
            AI 생성 초안 — 검수 필요
            <span v-if="document?.confirmed"> · 확정됨</span>
          </p>
        </div>
        <div class="row">
          <router-link class="btn ghost" to="/">목록</router-link>
          <router-link class="btn secondary" :to="`/projects/${id}/source`">소스</router-link>
          <button class="btn secondary" type="button" @click="regenerate()">전체 재생성</button>
          <button class="btn secondary" type="button" @click="confirm">확정</button>
          <button class="btn secondary" type="button" :disabled="saving" @click="save">
            {{ saving ? '저장 중…' : '임시 저장' }}
          </button>
          <button class="btn" type="button" @click="download">Word 다운로드</button>
        </div>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="notice" class="muted">{{ notice }}</p>
    </div>

    <div v-if="document" class="editor-layout">
      <aside class="panel toc">
        <strong style="display: block; margin-bottom: 10px">섹션</strong>
        <button
          v-for="s in document.sections"
          :key="s.sectionId"
          type="button"
          :class="{ active: s.sectionId === activeId }"
          @click="activeId = s.sectionId"
        >
          {{ s.sectionId }} {{ s.title }}
          <span v-if="s.userModified" class="mod">수정됨</span>
        </button>
      </aside>

      <div class="panel" v-if="activeSection">
        <div class="field">
          <label>제목</label>
          <input v-model="activeSection.title" type="text" />
        </div>
        <div class="field">
          <label>본문</label>
          <textarea v-model="activeSection.body" />
        </div>
        <button class="btn secondary" type="button" @click="regenerate([activeSection.sectionId])">
          이 섹션 재생성
        </button>
      </div>
    </div>
    <div v-else class="panel">
      <p class="muted">문서가 없습니다. 소스 입력 후 분석을 실행하세요.</p>
      <router-link class="btn" :to="`/projects/${id}/source`">소스 입력으로</router-link>
    </div>
  </section>
</template>
