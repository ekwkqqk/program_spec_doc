<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';

const route = useRoute();
const router = useRouter();
const id = route.params.id;

const project = ref(null);
const error = ref('');
let timer;

const percent = computed(() => {
  const p = project.value?.progress;
  if (!p || !p.total) return project.value?.status === '초안완료' ? 100 : 8;
  return Math.min(100, Math.round((p.current / p.total) * 100));
});

async function poll() {
  try {
    const data = await api.get(id);
    project.value = data.project;
    if (['초안완료', '편집중', '내보내기완료'].includes(data.project.status)) {
      clearInterval(timer);
      router.replace(`/projects/${id}/edit`);
    }
    if (data.project.status === '실패') {
      error.value = data.project.errorMessage || '작업 실패';
      clearInterval(timer);
    }
  } catch (e) {
    error.value = e.message;
  }
}

onMounted(() => {
  poll();
  timer = setInterval(poll, 1000);
});

onUnmounted(() => clearInterval(timer));
</script>

<template>
  <section class="panel">
    <div class="row" style="justify-content: space-between">
      <div>
        <h2 style="margin: 0 0 4px">분석·생성 진행</h2>
        <p class="muted" style="margin: 0">{{ project?.name || '…' }}</p>
      </div>
      <span class="badge warn">{{ project?.status || '…' }}</span>
    </div>

    <div style="margin: 28px 0 12px" class="progress-bar">
      <i :style="{ width: percent + '%' }" />
    </div>
    <p class="muted">{{ project?.progress?.message || '준비 중…' }} ({{ percent }}%)</p>

    <ol class="muted">
      <li>소스 확보</li>
      <li>코드 분석 (Java / Vue / XML)</li>
      <li>AI 초안 생성</li>
    </ol>

    <p v-if="error" class="error">{{ error }}</p>
    <div class="row" v-if="project?.status === '실패'">
      <router-link class="btn" :to="`/projects/${id}/source`">소스 다시 설정</router-link>
      <router-link class="btn secondary" to="/">목록</router-link>
    </div>
  </section>
</template>
