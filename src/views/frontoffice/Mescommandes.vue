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

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Lato:wght@300;400;700&display=swap');

.page { min-height: 100vh; background: #f8f6f1; font-family: 'Lato', sans-serif; }
.header { background: #1a1a2e; padding: 0 30px; }
.header-int { max-width: 1100px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; height: 60px; }
.logo { font-family: 'Playfair Display', serif; color: white; font-size: 1.2rem; }
.btn-retour { background: none; border: 1px solid rgba(255,255,255,0.3); color: white; padding: 7px 14px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; }
.btn-retour:hover { background: rgba(255,255,255,0.1); }
.user { color: rgba(255,255,255,0.55); font-size: 0.85rem; }

.contenu { max-width: 900px; margin: 0 auto; padding: 40px 20px; }
.titre { font-family: 'Playfair Display', serif; font-size: 2rem; color: #1a1a2e; margin: 0 0 30px; }

.vide { text-align: center; padding: 80px; }
.vide p { font-size: 1.1rem; color: #888; margin-bottom: 20px; }
.btn-primaire { background: #e94560; color: white; border: none; padding: 12px 28px; border-radius: 8px; cursor: pointer; font-size: 1rem; }
.btn-primaire:hover { background: #c73652; }

.liste { display: flex; flex-direction: column; gap: 20px; }

.cmd-card { background: white; border-radius: 14px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.06); }

.cmd-header { display: flex; justify-content: space-between; align-items: center; padding: 18px 24px; border-bottom: 1px solid #f0ece4; }
.cmd-ref { font-weight: 700; color: #1a1a2e; font-size: 0.95rem; margin-right: 12px; }
.cmd-date { color: #aaa; font-size: 0.82rem; }
.statut { background: #e8f5e9; color: #27ae60; padding: 4px 12px; border-radius: 20px; font-size: 0.78rem; font-weight: 700; }

.cmd-articles { padding: 16px 24px; display: flex; flex-direction: column; gap: 10px; }
.cmd-art { display: flex; align-items: center; gap: 12px; }
.cmd-art-img { width: 44px; height: 44px; border-radius: 6px; background: #f0ece4; overflow: hidden; flex-shrink: 0; }
.cmd-art-img img { width: 100%; height: 100%; object-fit: cover; }
.cmd-art-info { flex: 1; font-size: 0.88rem; color: #444; display: flex; flex-direction: column; gap: 2px; }
.tag { font-size: 0.72rem; background: #f0ece4; color: #888; padding: 1px 6px; border-radius: 8px; width: fit-content; }
.cmd-art-prix { color: #1a1a2e; font-size: 0.85rem; font-weight: 700; white-space: nowrap; }

.cmd-footer { background: #fafafa; padding: 14px 24px; display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; border-top: 1px solid #f0ece4; }
.cmd-footer-infos { display: flex; flex-direction: column; gap: 4px; font-size: 0.82rem; color: #666; }
.cmd-totaux { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; font-size: 0.82rem; color: #888; }
.cmd-total { color: #1a1a2e; font-size: 1rem; }
</style>