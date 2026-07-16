<script setup>
import { useRoute } from 'vue-router'
const route = useRoute()
</script>

<template>
  <!--
    App.vue est juste le conteneur du router.
    La page d'accueil / redirige vers /accueil (choix front/back)
    défini dans index.js
  -->
  <router-view></router-view>
</template>