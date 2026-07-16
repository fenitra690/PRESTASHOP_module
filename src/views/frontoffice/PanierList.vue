<script setup>
import db from '@/utils/db.js'
import { computed } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const panier = db.live('panier', [])

// --- CALCULS ---
const totalArticles = computed(() => {
  let total = 0
  for (let i = 0; i < panier.value.length; i++) {
    total += panier.value[i].quantite
  }
  return total
})

const totalPrix = computed(() => {
  let total = 0
  for (let i = 0; i < panier.value.length; i++) {
    total += panier.value[i].prix * panier.value[i].quantite
  }
  return total.toFixed(2)
})

// --- ACTIONS ---
const augmenter = (index) => {
  panier.value[index].quantite++
}

const diminuer = (index) => {
  if (panier.value[index].quantite > 1) {
    panier.value[index].quantite--
  } else {
    supprimer(index)
  }
}

const supprimer = (index) => {
  panier.value.splice(index, 1)
}

const viderPanier = () => {
  if (confirm('Vider tout le panier ?')) {
    panier.value = []
  }
}

// --- NAVIGATION ---
const retourBoutique = () => {
  router.push('/frontoffice/ListProduct')
}

const allerPaiement = () => {
  if (panier.value.length === 0) {
    alert('Votre panier est vide !')
    return
  }
  router.push('/frontoffice/Payment')
}
</script>

<template>
  <div class="page">
    <!-- HEADER -->
    <header class="header">
      <div class="header-contenu">
        <button class="btn-retour" @click="retourBoutique">← Continuer mes achats</button>
        <h1 class="titre-header">🛒 Mon Panier</h1>
      </div>
    </header>

    <main class="contenu">

      <!-- PANIER VIDE -->
      <div v-if="panier.length === 0" class="vide">
        <p>🛒 Votre panier est vide.</p>
        <button class="btn-primaire" @click="retourBoutique">Voir les produits</button>
      </div>

      <!-- PANIER REMPLI -->
      <div v-else class="layout">

        <!-- LISTE DES ARTICLES -->
        <div class="liste">
          <div class="liste-header">
            <h2>Articles ({{ totalArticles }})</h2>
            <button class="btn-vider" @click="viderPanier">🗑️ Tout vider</button>
          </div>

          <div v-for="(article, index) in panier" :key="article.id" class="article">
            <div class="article-info">
              <p class="article-nom">{{ article.nom }}</p>
              <p class="article-prix-unit">{{ article.prix.toFixed(2) }} € / unité</p>
            </div>

            <div class="article-controls">
              <button class="btn-qte" @click="diminuer(index)">−</button>
              <span class="qte">{{ article.quantite }}</span>
              <button class="btn-qte" @click="augmenter(index)">+</button>
            </div>

            <div class="article-total">
              <p>{{ (article.prix * article.quantite).toFixed(2) }} €</p>
              <button class="btn-supprimer" @click="supprimer(index)">✕</button>
            </div>
          </div>
        </div>

        <!-- RÉCAPITULATIF -->
        <div class="recap">
          <h2>Récapitulatif</h2>

          <div class="recap-ligne">
            <span>Sous-total</span>
            <span>{{ totalPrix }} €</span>
          </div>
          <div class="recap-ligne">
            <span>Livraison</span>
            <span class="gratuit">Gratuite</span>
          </div>
          <div class="recap-ligne recap-total">
            <span>Total</span>
            <span>{{ totalPrix }} €</span>
          </div>

          <button class="btn-commander" @click="allerPaiement">
            Passer la commande →
          </button>

          <p class="note">💳 Paiement à la livraison · 🚚 Livraison gratuite</p>
        </div>

      </div>
    </main>
  </div>
</template>

<style scoped src="@/assets/Front/PanierList.css"></style>
