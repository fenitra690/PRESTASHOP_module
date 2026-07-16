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

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Lato:wght@300;400;700&display=swap');

.page {
  min-height: 100vh;
  background: #0d0d1a;
  font-family: 'Lato', sans-serif;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}
.fond-deco { position: absolute; inset: 0; pointer-events: none; }
.cercle { position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0.15; }
.c1 { width: 500px; height: 500px; background: #e94560; top: -150px; right: -150px; }
.c2 { width: 400px; height: 400px; background: #0f3460; bottom: -100px; left: -100px; }
.c3 { width: 300px; height: 300px; background: #533483; top: 40%; left: 40%; }

.contenu { position: relative; z-index: 1; width: 100%; max-width: 580px; padding: 40px 20px; }
.entete { text-align: center; margin-bottom: 40px; }
.logo-box { font-size: 3rem; margin-bottom: 12px; }
.entete h1 { font-family: 'Playfair Display', serif; font-size: 2.5rem; color: white; margin: 0 0 8px; }
.sous-titre { color: rgba(255,255,255,0.5); font-size: 1rem; margin: 0; }

.chargement { text-align: center; color: rgba(255,255,255,0.5); padding: 40px; }
.spinner {
  width: 40px; height: 40px;
  border: 3px solid rgba(255,255,255,0.1);
  border-top-color: #e94560;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 15px;
}
@keyframes spin { to { transform: rotate(360deg); } }

.grille-users { display: flex; flex-direction: column; gap: 12px; }

.carte-user {
  display: flex; align-items: center; gap: 16px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 14px; padding: 16px 20px;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s, transform 0.15s;
  text-align: left; width: 100%;
}
.carte-user:hover {
  background: rgba(255,255,255,0.1);
  border-color: rgba(233,69,96,0.5);
  transform: translateX(4px);
}
.carte-invite { border-style: dashed; border-color: rgba(255,255,255,0.25); }

.avatar {
  width: 48px; height: 48px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 1.1rem; color: white; flex-shrink: 0;
}
.avatar-invite { background: rgba(255,255,255,0.1); font-size: 1.5rem; }

.user-info { flex: 1; display: flex; flex-direction: column; gap: 3px; }
.user-info strong { color: white; font-size: 1rem; }
.user-info span { color: rgba(255,255,255,0.45); font-size: 0.82rem; }

.fleche { color: rgba(255,255,255,0.25); font-size: 1.1rem; }
.carte-user:hover .fleche { color: #e94560; }
.aucun { color: rgba(255,255,255,0.4); text-align: center; padding: 30px; }
</style>