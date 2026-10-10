<template>
  <div class="hello">
    <h1>{{ title }}</h1>
    <button @click="load">인사 불러오기</button>
    <p>{{ message }}</p>
  </div>
</template>

<script>
export default {
  name: 'HelloView',
  data() {
    return { title: '데모 화면', message: '' };
  },
  methods: {
    async load() {
      const res = await fetch('/api/hello');
      this.message = await res.text();
    },
  },
};
</script>
