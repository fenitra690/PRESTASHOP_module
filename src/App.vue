<script setup>
import { useRouter } from 'vue-router'
const router = useRouter()

// 1. La logique (JavaScript)
const saluer = () => {
  router.push('/UserLog')
};
</script>

<template>
  <!-- 2. La vue (HTML) -->
  <div v-if="$route.path === '/'">
    <h1>Test de base Vue.js</h1>
    
    <!-- @click est le raccourci pour écouter un clic -->
    <button @click="saluer">Clique ici</button>
  </div>
  <router-view></router-view>
</template>