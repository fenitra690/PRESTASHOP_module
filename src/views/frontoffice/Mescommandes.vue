<script setup>
import db from '@/utils/db.js'
import { useRouter } from 'vue-router'

const router = useRouter()
const mesCommandes = db.live('mes_commandes', [])
const session = db.session('utilisateur', null)

const retourBoutique = () => router.push('/frontoffice/ListProduct')
</script>

<template>
  <div class="page">
    <header class="header">
      <div class="header-int">
        <button class="btn-retour" @click="retourBoutique">← Boutique</button>
        <span class="logo">🛍️ Ma Boutique</span>
        <span class="user">{{ session?.prenom || 'Invité' }}</span>
      </div>
    </header>

    <main class="contenu">
      <h1 class="titre">📋 Mes Commandes</h1>

      <div v-if="mesCommandes.length === 0" class="vide">
        <p>Vous n'avez pas encore de commandes.</p>
        <button class="btn-primaire" @click="retourBoutique">Faire mes achats</button>
      </div>

      <div v-else class="liste">
        <div v-for="cmd in [...mesCommandes].reverse()" :key="cmd.id" class="cmd-card">

          <div class="cmd-header">
            <div>
              <span class="cmd-ref">{{ cmd.ref || 'Commande #' + cmd.id }}</span>
              <span class="cmd-date">{{ cmd.date }}</span>
            </div>
            <span class="statut">{{ cmd.statut }}</span>
          </div>

          <div class="cmd-articles">
            <div v-for="art in cmd.articles" :key="art.id" class="cmd-art">
              <div class="cmd-art-img">
                <img :src="art.image" :alt="art.nom" @error="$event.target.style.opacity='0'" />
              </div>
              <div class="cmd-art-info">
                <span>{{ art.nom }}</span>
                <span v-if="art.taille" class="tag">{{ art.taille }}</span>
                <span v-if="art.couleur" class="tag">{{ art.couleur }}</span>
              </div>
              <span class="cmd-art-prix">× {{ art.quantite }} — {{ (art.prix * art.quantite).toFixed(2) }} €</span>
            </div>
          </div>

          <div class="cmd-footer">
            <div class="cmd-footer-infos">
              <span>🚚 {{ cmd.transporteur }}</span>
              <span>💳 {{ cmd.paiement }}</span>
              <span v-if="cmd.adresse">📍 {{ cmd.adresse.adresse1 }}, {{ cmd.adresse.code_postal }} {{ cmd.adresse.ville }}</span>
            </div>
            <div class="cmd-totaux">
              <span class="cmd-sous-total">Sous-total : {{ cmd.sous_total }} €</span>
              <span class="cmd-livraison">Livraison : {{ parseFloat(cmd.livraison) === 0 ? 'Gratuite' : cmd.livraison + ' €' }}</span>
              <strong class="cmd-total">Total : {{ cmd.total }} €</strong>
            </div>
          </div>

        </div>
      </div>
    </main>
  </div>
</template>

<style scoped src="@/assets/front/Mescommandes.css"></style>