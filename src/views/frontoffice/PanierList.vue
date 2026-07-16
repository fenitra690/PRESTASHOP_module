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

<style scoped>
/* PAGE */
.page { min-height: 100vh; background: #f5f5f5; font-family: Georgia, serif; }

/* HEADER */
.header { background: #1a1a2e; color: white; padding: 15px 30px; }
.header-contenu { display: flex; align-items: center; gap: 20px; max-width: 1100px; margin: 0 auto; }
.titre-header { margin: 0; font-size: 1.4rem; }
.btn-retour { background: none; border: 1px solid rgba(255,255,255,0.4); color: white; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 0.9rem; }
.btn-retour:hover { background: rgba(255,255,255,0.1); }

/* CONTENU */
.contenu { max-width: 1100px; margin: 0 auto; padding: 30px 20px; }

/* VIDE */
.vide { text-align: center; padding: 80px 20px; }
.vide p { font-size: 1.4rem; color: #666; margin-bottom: 20px; }

/* LAYOUT 2 COLONNES */
.layout { display: grid; grid-template-columns: 1fr 350px; gap: 30px; align-items: start; }
@media (max-width: 768px) {
  .layout { grid-template-columns: 1fr; }
}

/* LISTE */
.liste { background: white; border-radius: 12px; padding: 25px; box-shadow: 0 2px 10px rgba(0,0,0,0.06); }
.liste-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.liste-header h2 { margin: 0; color: #1a1a2e; }
.btn-vider { background: none; border: 1px solid #e94560; color: #e94560; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; }
.btn-vider:hover { background: #e94560; color: white; }

/* ARTICLE */
.article { display: flex; align-items: center; justify-content: space-between; padding: 15px 0; border-bottom: 1px solid #f0f0f0; gap: 15px; }
.article:last-child { border-bottom: none; }
.article-info { flex: 1; }
.article-nom { margin: 0 0 4px; font-weight: bold; color: #1a1a2e; }
.article-prix-unit { margin: 0; color: #888; font-size: 0.9rem; }
.article-controls { display: flex; align-items: center; gap: 10px; }
.btn-qte { background: #f0f0f0; border: none; width: 30px; height: 30px; border-radius: 6px; cursor: pointer; font-size: 1.1rem; font-weight: bold; }
.btn-qte:hover { background: #e0e0e0; }
.qte { font-size: 1rem; font-weight: bold; min-width: 25px; text-align: center; }
.article-total { text-align: right; }
.article-total p { font-weight: bold; font-size: 1.05rem; color: #1a1a2e; margin: 0 0 6px; }
.btn-supprimer { background: none; border: none; color: #aaa; cursor: pointer; font-size: 1rem; }
.btn-supprimer:hover { color: #e94560; }

/* RECAP */
.recap { background: white; border-radius: 12px; padding: 25px; box-shadow: 0 2px 10px rgba(0,0,0,0.06); position: sticky; top: 20px; }
.recap h2 { margin: 0 0 20px; color: #1a1a2e; font-size: 1.2rem; }
.recap-ligne { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f0f0f0; color: #555; }
.gratuit { color: #27ae60; font-weight: bold; }
.recap-total { font-weight: bold; font-size: 1.1rem; color: #1a1a2e; border-bottom: none; margin-top: 5px; }
.btn-commander { background: #e94560; color: white; border: none; padding: 15px; border-radius: 8px; cursor: pointer; width: 100%; font-size: 1.1rem; margin-top: 20px; }
.btn-commander:hover { background: #c73652; }
.note { text-align: center; font-size: 0.8rem; color: #888; margin-top: 12px; }

/* BOUTON GÉNÉRIQUE */
.btn-primaire { background: #1a1a2e; color: white; border: none; padding: 12px 25px; border-radius: 8px; cursor: pointer; font-size: 1rem; }
.btn-primaire:hover { background: #2d2d4e; }
</style>
