<script setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';

const route = useRoute();
const router = useRouter();
const id = route.params.id;

const tab = ref('local');
const gitUrl = ref('');
const branch = ref('');
const localPath = ref('');
const allowedRoots = ref([]);
const project = ref(null);
const error = ref('');
const busy = ref(false);

onMounted(async () => {
  try {
    const meta = await api.meta();
    allowedRoots.value = meta.allowedRoots || [];
    const data = await api.get(id);
    project.value = data.project;
    if (data.project.sourceType === 'git') {
      tab.value = 'git';
      gitUrl.value = data.project.gitUrl || '';
      branch.value = data.project.branch || '';
    } else if (data.project.sourceType === 'local') {
      tab.value = 'local';
      localPath.value = data.project.localPath || '';
    }
  } catch (e) {
    error.value = e.message;
  }
});

async function start() {
  error.value = '';
  busy.value = true;
  try {
    if (tab.value === 'git') {
      await api.setSource(id, { type: 'git', gitUrl: gitUrl.value, branch: branch.value || undefined });
    } else {
      await api.setSource(id, { type: 'local', localPath: localPath.value });
    }
    await api.analyze(id);
    router.push(`/projects/${id}/progress`);
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="panel">
    <div class="row" style="justify-content: space-between; margin-bottom: 8px">
      <div>
        <h2 style="margin: 0 0 4px">소스 입력</h2>
        <p class="muted" style="margin: 0">{{ project?.name || '…' }}</p>
      </div>
      <router-link class="btn secondary" to="/">목록</router-link>
    </div>

    <div class="tabs">
      <button type="button" class="tab" :class="{ active: tab === 'local' }" @click="tab = 'local'">로컬 경로</button>
      <button type="button" class="tab" :class="{ active: tab === 'git' }" @click="tab = 'git'">Git URL</button>
    </div>

    <div v-if="tab === 'local'">
      <div class="field">
        <label>로컬 절대 경로</label>
        <input v-model="localPath" type="text" placeholder="예: C:\work\my-app" />
      </div>
      <p class="muted">
        허용 루트:
        <code>{{ allowedRoots.join(' ; ') || '-' }}</code>
      </p>
    </div>

    <div v-else>
      <div class="field">
        <label>Git 저장소 URL</label>
        <input v-model="gitUrl" type="text" placeholder="https://github.com/org/repo.git" />
      </div>
      <div class="field">
        <label>브랜치 (선택)</label>
        <input v-model="branch" type="text" placeholder="main" />
      </div>
      <p class="muted">비공개 저장소는 서버 <code>GIT_TOKEN</code> 환경변수를 사용합니다.</p>
    </div>

    <p v-if="error" class="error">{{ error }}</p>

    <div class="row" style="margin-top: 16px">
      <button class="btn" type="button" :disabled="busy" @click="start">
        {{ busy ? '시작 중…' : '분석 시작' }}
      </button>
      <router-link v-if="project?.status === '초안완료' || project?.status === '편집중' || project?.status === '내보내기완료'" class="btn secondary" :to="`/projects/${id}/edit`">
        편집으로 이동
      </router-link>
    </div>
  </section>
</template>
