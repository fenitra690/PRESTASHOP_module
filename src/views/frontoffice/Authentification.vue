<script setup>
import api from '@/utils/api.js'
import db from '@/utils/db.js'
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const session = db.session('utilisateur', null)

const clients = ref([])
const chargement = ref(true)

// --- CHARGER TOUS LES CLIENTS PRESTASHOP ---
onMounted(async () => {
  const result = await api.get('customers?display=full')
  if (result) {
    const raw = result.customers || result.prestashop?.customers?.customer
    if (raw) {
      clients.value = Array.isArray(raw) ? raw : [raw]
    }
  }
  chargement.value = false
})

// --- SE CONNECTER EN TANT QU'UN CLIENT ---
const seConnecter = (client) => {
  session.value = {
    id: client.id,
    prenom: client.firstname,
    nom: client.lastname,
    email: client.email,
    id_default_group: client.id_default_group,
    anonyme: false
  }
  router.push('/frontoffice/ListProduct')
}

// --- INVITÉ ANONYME ---
const continuerAnonyme = () => {
  session.value = {
    id: null,
    prenom: 'Invité',
    nom: '',
    email: '',
    anonyme: true
  }
  router.push('/frontoffice/ListProduct')
}

// --- INITIALES AVATAR ---
const initiales = (c) => ((c.firstname?.[0] || '') + (c.lastname?.[0] || '')).toUpperCase()

// --- COULEUR PAR ID ---
const couleurs = ['#e94560', '#0f3460', '#533483', '#2d6a4f', '#b5451b', '#1a6b8a']
const couleurAvatar = (id) => couleurs[Number(id) % couleurs.length]
</script>

<template>
  <div class="page">
    <div class="fond-deco">
      <div class="cercle c1"></div>
      <div class="cercle c2"></div>
      <div class="cercle c3"></div>
    </div>

    <main class="contenu">
      <div class="entete">
        <div class="logo-box">🛍️</div>
        <h1>Ma Boutique</h1>
        <p class="sous-titre">Choisissez votre profil pour continuer</p>
      </div>

      <div v-if="chargement" class="chargement">
        <div class="spinner"></div>
        <p>Chargement des profils...</p>
      </div>

      <div v-else class="grille-users">
        <!-- INVITÉ -->
        <button class="carte-user carte-invite" @click="continuerAnonyme">
          <div class="avatar avatar-invite">👤</div>
          <div class="user-info">
            <strong>Utilisateur anonyme</strong>
            <span>Continuer sans compte</span>
          </div>
          <span class="fleche">→</span>
        </button>

        <!-- CLIENTS PRESTASHOP -->
        <button
          v-for="client in clients"
          :key="client.id"
          class="carte-user"
          @click="seConnecter(client)"
        >
          <div class="avatar" :style="{ background: couleurAvatar(client.id) }">
            {{ initiales(client) }}
          </div>
          <div class="user-info">
            <strong>{{ client.firstname }} {{ client.lastname }}</strong>
            <span>{{ client.email }}</span>
          </div>
          <span class="fleche">→</span>
        </button>

        <p v-if="clients.length === 0" class="aucun">Aucun client trouvé.</p>
      </div>
    </main>
  </div>
</template>

<style scoped src="@/assets/front/Authentification.css"></style>