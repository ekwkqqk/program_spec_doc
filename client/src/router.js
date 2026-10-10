import { createRouter, createWebHistory } from 'vue-router';
import ProjectList from './views/ProjectList.vue';
import SourceInput from './views/SourceInput.vue';
import ProgressView from './views/ProgressView.vue';
import EditorView from './views/EditorView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'list', component: ProjectList },
    { path: '/projects/:id/source', name: 'source', component: SourceInput },
    { path: '/projects/:id/progress', name: 'progress', component: ProgressView },
    { path: '/projects/:id/edit', name: 'edit', component: EditorView },
  ],
});

export default router;
