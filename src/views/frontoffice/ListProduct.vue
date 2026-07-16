<script setup>
import api from '@/utils/api.js'
import { ref, onMounted } from 'vue'

const produits = ref([])
const chargement = ref(true)

onMounted(async () => {
  const result = await api.get('products?display=full');
  console.log("Voici TOUT ce que contient un produit :", result.products[0]);
  
  if (result) {

    const rawData = result.products || result.prestashop?.products?.product;
    
    if (rawData) {
      // Force en tableau : si 1 seul produit, PrestaShop n'envoie pas de liste
      produits.value = Array.isArray(rawData) ? rawData : [rawData];
    }
  }
  
  chargement.value = false;
})
</script>

<template>
  <div style="padding: 20px;">
    <h1>Ma Boutique PrestaShop</h1>

    <div v-if="chargement">🔌 Récupération des détails...</div>

    <div v-else-if="produits.length > 0" class="grille-produits">
      <div v-for="p in produits" :key="p.id" class="carte-produit">
        
        <!-- Nom du produit -->
        <h3>{{ p.name[1].value }}</h3> 
        <p>Prix : <strong>{{ parseFloat(p.price).toFixed(2) }} €</strong></p>
        <small>ID: {{ p.id }} | Réf: {{ p.reference }}</small>
        <p>{{ p.description_short[1].value }}</p>
        <p v-if="p.quantity > 0">✅ En stock ({{ p.quantity }})</p>
        <p v-else>❌ Rupture de stock</p>
        <p v-if="p.manufacturer_name">Marque : {{ p.manufacturer_name }}</p>
        <a :href="`/${p.link_rewrite[1].value}`">Voir la fiche complète</a>

        <hr>
      </div>
    </div>
  </div>
</template>


<style>
.grille-produits {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 20px;
}
.carte-produit {
  border: 1px solid #ddd;
  padding: 15px;
  border-radius: 8px;
}
</style>