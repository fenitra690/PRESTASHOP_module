<script setup>
import api from '@/utils/api.js'
import db from '@/utils/db.js'
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
// Session backoffice séparée du frontoffice
const sessionBack = db.session('admin', null)

// Pré-remplir avec les credentials par défaut
const email    = ref('admin@testepourfront.com')  // ← mettre votre email admin ici
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
  router.push('/frontoffice/Alea')
  
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

<style scoped src="@/assets/Back/Login.css"></style>
