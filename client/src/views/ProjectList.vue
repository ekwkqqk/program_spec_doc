<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';

const router = useRouter();
const projects = ref([]);
const name = ref('');
const error = ref('');
const loading = ref(false);

function statusClass(status) {
  if (status === '실패') return 'fail';
  if (['초안완료', '편집중', '내보내기완료'].includes(status)) return 'ok';
  if (['분석중', '초안생성중'].includes(status)) return 'warn';
  return '';
}

function sourceLabel(p) {
  if (p.sourceType === 'git') return `Git · ${p.gitUrl || '-'}${p.branch ? ` (${p.branch})` : ''}`;
  if (p.sourceType === 'local') return `로컬 · ${p.localPath || '-'}`;
  return '미설정';
}

function openProject(p) {
  if (!p.sourceType || p.status === '초안대기') {
    router.push(`/projects/${p.id}/source`);
    return;
  }
  if (['분석중', '초안생성중'].includes(p.status)) {
    router.push(`/projects/${p.id}/progress`);
    return;
  }
  if (['초안완료', '편집중', '내보내기완료'].includes(p.status)) {
    router.push(`/projects/${p.id}/edit`);
    return;
  }
  if (p.status === '실패') {
    router.push(`/projects/${p.id}/source`);
    return;
  }
  router.push(`/projects/${p.id}/source`);
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    projects.value = await api.list();
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function create() {
  error.value = '';
  try {
    const p = await api.create(name.value.trim());
    name.value = '';
    router.push(`/projects/${p.id}/source`);
  } catch (e) {
    error.value = e.message;
  }
}

async function remove(id) {
  if (!confirm('작업을 삭제할까요? 관련 문서도 함께 삭제됩니다.')) return;
  try {
    await api.remove(id);
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

onMounted(load);
</script>

<template>
  <section class="panel">
    <div class="row" style="justify-content: space-between; margin-bottom: 16px">
      <h2 style="margin: 0">작업 목록</h2>
      <form class="row" @submit.prevent="create">
        <input v-model="name" type="text" placeholder="새 작업명" required style="width: 220px" />
        <button class="btn" type="submit">새 작업</button>
      </form>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="loading" class="muted">불러오는 중…</p>

    <table v-else class="table">
      <thead>
        <tr>
          <th>작업명</th>
          <th>소스</th>
          <th>상태</th>
          <th>수정일</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in projects" :key="p.id">
          <td>
            <a href="#" @click.prevent="openProject(p)"><strong>{{ p.name }}</strong></a>
          </td>
          <td class="muted" style="max-width: 320px; word-break: break-all">{{ sourceLabel(p) }}</td>
          <td><span class="badge" :class="statusClass(p.status)">{{ p.status }}</span></td>
          <td class="muted">{{ new Date(p.updatedAt).toLocaleString() }}</td>
          <td>
            <button class="btn secondary" type="button" @click="openProject(p)">열기</button>
            <button class="btn danger" type="button" @click="remove(p.id)">삭제</button>
          </td>
        </tr>
        <tr v-if="!projects.length">
          <td colspan="5" class="muted">아직 작업이 없습니다. 새 작업을 만들어 시작하세요.</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
