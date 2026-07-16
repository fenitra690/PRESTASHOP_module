<script setup>
import api from '@/utils/api.js'
import db from '@/utils/db.js'
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
// Session backoffice séparée du frontoffice
const sessionBack = db.session('admin', null)

// Pré-remplir avec les credentials par défaut
const email    = ref('admin@prestashop.com')  // ← mettre votre email admin ici
const password = ref('admin')                  // ← mot de passe admin
const erreur   = ref('')
const chargement = ref(false)

const seConnecter = async () => {
  erreur.value = ''
  if (!email.value || !password.value) {
    erreur.value = 'Remplissez les deux champs.'
    return
  }
  chargement.value = true

  // Vérifier dans la liste des employés PrestaShop
  const res = await api.get('employees?display=full')
  if (!res) {
    erreur.value = 'Impossible de joindre PrestaShop.'
    chargement.value = false
    return
  }

  const raw = res.employees || res.prestashop?.employees?.employee
  const liste = raw ? (Array.isArray(raw) ? raw : [raw]) : []

  // Chercher l'employé par email (PrestaShop stocke le mdp hashé,
  // en dev local on accepte l'email seul — à sécuriser en prod)
  const employe = liste.find(e => e.email === email.value)

  if (!employe) {
    erreur.value = 'Email inconnu dans PrestaShop.'
    chargement.value = false
    return
  }

  sessionBack.value = {
    id: employe.id,
    prenom: employe.firstname,
    nom: employe.lastname,
    email: employe.email
  }

  chargement.value = false
  router.push('/backoffice/dashboard')
}
</script>

<template>
  <div class="page">
    <div class="fond-deco">
      <div class="c1"></div><div class="c2"></div>
    </div>

    <div class="carte">
      <div class="entete">
        <span class="icone">⚙️</span>
        <h1>Administration</h1>
        <p>Connexion espace backoffice</p>
      </div>

      <div class="champ">
        <label>Email</label>
        <input v-model="email" type="email" @keyup.enter="seConnecter" />
      </div>
      <div class="champ">
        <label>Mot de passe</label>
        <input v-model="password" type="password" @keyup.enter="seConnecter" />
      </div>

      <p v-if="erreur" class="erreur">⚠️ {{ erreur }}</p>

      <button class="btn-connexion" :disabled="chargement" @click="seConnecter">
        {{ chargement ? '⏳ Vérification...' : 'Se connecter' }}
      </button>

      <button class="btn-retour" @click="$router.push('/')">← Retour à l'accueil</button>
    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Lato:wght@300;400;700&display=swap');

.page {
  min-height: 100vh; background: #0d0d1a;
  font-family: 'Lato', sans-serif;
  display: flex; align-items: center; justify-content: center;
  position: relative; overflow: hidden;
}
.fond-deco { position: absolute; inset: 0; pointer-events: none; }
.c1 { position: absolute; width: 400px; height: 400px; background: #0f3460; border-radius: 50%; filter: blur(100px); opacity: 0.2; top: -100px; right: -100px; }
.c2 { position: absolute; width: 300px; height: 300px; background: #533483; border-radius: 50%; filter: blur(100px); opacity: 0.15; bottom: -80px; left: -80px; }

.carte {
  position: relative; z-index: 1;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 20px; padding: 40px;
  width: 100%; max-width: 400px; margin: 20px;
}
.entete { text-align: center; margin-bottom: 28px; }
.icone { font-size: 2.5rem; }
h1 { font-family: 'Playfair Display', serif; color: white; font-size: 1.8rem; margin: 10px 0 4px; }
.entete p { color: rgba(255,255,255,0.4); font-size: 0.88rem; margin: 0; }

.champ { margin-bottom: 16px; }
.champ label { display: block; color: rgba(255,255,255,0.55); font-size: 0.83rem; margin-bottom: 6px; }
.champ input {
  width: 100%; padding: 11px 14px; box-sizing: border-box;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 8px; color: white; font-size: 0.95rem;
}
.champ input:focus { outline: none; border-color: rgba(255,255,255,0.35); }

.erreur { color: #e94560; background: rgba(233,69,96,0.1); border: 1px solid rgba(233,69,96,0.3); border-radius: 6px; padding: 9px 12px; font-size: 0.85rem; margin-bottom: 12px; }

.btn-connexion {
  width: 100%; padding: 13px; border: none;
  background: #0f3460; color: white;
  border-radius: 10px; cursor: pointer; font-size: 1rem; font-weight: 700;
  margin-bottom: 12px; transition: background 0.15s;
}
.btn-connexion:hover:not(:disabled) { background: #1a4a8a; }
.btn-connexion:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-retour {
  width: 100%; padding: 11px; border: 1px solid rgba(255,255,255,0.1);
  background: none; color: rgba(255,255,255,0.45);
  border-radius: 10px; cursor: pointer; font-size: 0.88rem;
}
.btn-retour:hover { background: rgba(255,255,255,0.05); }
</style>
