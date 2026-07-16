#1 -> redirecting method
        <script setup>
        import { useRouter } from 'vue-router'
        const router = useRouter()

        // 1. La logique (JavaScript)
        const saluer = () => {
        router.push('/Apropos')
        };
        </script>

<template>
  <!-- 2. La vue (HTML) -->
  <div v-if="$route.path === '/'">
    <h1>Test de base Vue.js</h1>
    
    <!-- @click est le raccourci pour écouter un clic -->
    <button @click="saluer">Clique ici</button>
  </div>
  <router-view></router-view>
</template>




#2 comment utiliser session storage en tableau responcive
<script setup>
import db from '@/utils/db.js'

// Une seule ligne : crée le tableau ET gère le localStorage
const produits = db.live('mes_produits')

// On manipule le tableau normalement, la sauvegarde est invisible
const ajouter = () => {
  produits.value.push({ id: Date.now(), nom: "Produit " + (produits.value.length + 1) })
}

const supprimer = (idx) => produits.value.splice(idx, 1)

const vider = () => produits.value = []
</script>

<template>
  <button @click="ajouter">Ajouter</button>
  <button @click="vider">Vider</button>

  <li v-for="(p, i) in produits" :key="p.id">
    {{ p.nom }} <button @click="supprimer(i)">X</button>
  </li>
</template>




#3 comment recuperer des donnees 
<script setup>
import db from '@/utils/db.js'

// 1. On crée la variable liée au stockage 'mon_texte'
// Si le storage est vide, on met un texte vide "" par défaut
const texteSaisi = db.live('mon_texte', "")
</script>

<template>
  <div>
    <!-- 2. v-model fait tout le travail : 
         Ce que tu tapes ici va DIRECTEMENT dans texteSaisi (et donc dans le storage) -->
    <input v-model="texteSaisi" placeholder="Tape quelque chose..." />

    <p>Valeur actuellement sauvegardée : {{ texteSaisi }}</p>
  </div>
</template>




#4 comment recuperer des donnees et les stoquer
<script setup>
import db from '@/utils/db.js'
import { ref } from 'vue'

// --- CONFIGURATION ---
// 1. La source de données (Persistante)
const DATA_LISTE = db.live('CLE_UNIQUE', []) 

// 2. Le formulaire (Temporaire pour les inputs)
const nouveau = ref({ champ1: '', champ2: '' })

// --- ACTIONS ---
const ajouter = () => {
  if (nouveau.value.champ1) {
    // On ajoute une copie (...) à la liste persistante
    DATA_LISTE.value.push({ ...nouveau.value, id: Date.now() })
    
    // Reset des inputs
    nouveau.value.champ1 = ''
    nouveau.value.champ2 = ''
  }
}

const supprimer = (index) => {
  DATA_LISTE.value.splice(index, 1) // Sauvegarde auto via db.js
}
</script>

<template>
  <!-- FORMULAIRE -->
  <input v-model="nouveau.champ1" placeholder="Champ 1" />
  <input v-model="nouveau.champ2" placeholder="Champ 2" />
  <button @click="ajouter">Ajouter</button>

  <!-- AFFICHAGE -->
  <ul>
    <li v-for="(item, index) in DATA_LISTE" :key="item.id">
      {{ item.champ1 }} - {{ item.champ2 }}
      <button @click="supprimer(index)">X</button>
    </li>
  </ul>
</template>




#5 recuperation et fonction
<script setup>
import db from '@/utils/db.js'
import { ref } from 'vue'

// L'input de test sur ta nouvelle page
const nomATester = ref('')

const verifierNom = () => {
  // 1. On récupère TOUTE la liste sauvegardée
  const maListe = db.g('CLE_UNIQUE') || []

  // 2. On cherche si le nom saisi existe dans le "champ2" de l'un des objets
  // .some() renvoie true ou false
  const estValide = maListe.some(item => item.champ2 === nomATester.value)

  if (estValide) {
    alert("C'est OK, le nom est dans le storage !")
    // Tadam ! Tu peux rediriger ou débloquer un bouton ici
  } else {
    alert("Accès refusé : nom inconnu.")
  }
}
</script>

<template>
  <div>
    <h3>Vérification d'identité</h3>
    <input v-model="nomATester" placeholder="Tape le nom à vérifier" />
    <button @click="verifierNom">Tester</button>
  </div>
</template>



#6 les api & call
Ressources disponibles
addresses (adresses clients)
carriers (transporteurs)
cart_rules (règles panier / promotions)
carts (paniers)
categories (catégories produits)
combinations (déclinaisons produits)
configurations (paramètres de configuration)
contacts (contacts service client)
countries (pays)
currencies (devises)
customers (clients)
customer_messages (messages clients)
customer_threads (conversations clients)
deliveries (livraisons)
employees (employés)
groups (groupes clients)
guests (visiteurs non inscrits)
images (images produits)
languages (langues)
manufacturers (fabricants)
messages (messages divers)
order_carriers (transporteurs liés aux commandes)
order_details (détails de commande)
order_histories (historique des commandes)
order_invoices (factures)
order_payments (paiements)
order_slip (avoirs)
order_states (états de commande)
orders (commandes)
price_ranges (plages de prix)
product_feature_values (valeurs de caractéristiques)
product_features (caractéristiques produits)
product_option_values (valeurs d’options)
product_options (options produits)
products (produits)
shops (boutiques)
shop_groups (groupes de boutiques)
shop_urls (URLs de boutiques)
specific_prices (prix spécifiques)
states (états/régions)
stock_availables (stocks disponibles)
stock_movements (mouvements de stock)
stock_movement_reasons (raisons de mouvement de stock)
stocks (stocks)
suppliers (fournisseurs)
tags (tags produits)
taxes (taxes)
tax_rule_groups (groupes de règles fiscales)
translated_configurations (configurations traduites)
warehouse_product_locations (emplacements produits en entrepôt)
warehouses (entrepôts)
weight_ranges (plages de poids)
zones (zones géographiques)

⚙️ Actions possibles pour chaque ressource
GET → Lire / récupérer les données
POST → Créer un nouvel enregistrement
PUT → Mettre à jour un enregistrement existant
DELETE → Supprimer un enregistrement
HEAD → Vérifier l’existence / métadonnées
OPTIONS → Voir les méthodes disponibles pour la ressource



#7 exmple d'usage
<script setup>
import api from '@/utils/api.js'
import { ref, onMounted } from 'vue'

const produits = ref([])
const chargement = ref(true)

onMounted(async () => {
  //const result = await api.get('products');
  const result = await api.get('products?display=full');
  console.log("Voici TOUT ce que contient un produit :", result.products[0]);
  
  if (result) {
    // Analyse de la structure (PrestaShop varie entre JSON et XML parsé)
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
        <!-- PrestaShop range souvent le nom dans une structure multilingue -->
        <h3>{{ p.name }}</h3> 
        <p>Prix : <strong>{{ parseFloat(p.price).toFixed(2) }} €</strong></p>
        <small>ID: {{ p.id }}</small>
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


#8 delete (effacer)
<script setup>
const supprimerProduit = async (id) => {
  // 1. Appel API
  const succes = await api.delete('products', id);
  
  if (succes) {
    // 2. Mise à jour locale (pour que la ligne disparaisse de l'écran)
    produits.value = produits.value.filter(p => p.id !== id);
    alert("Produit supprimé !");
  }
}

#9 post (Ajouter)
async function ajouterUnClient() {
  const nouveauClient = {
    firstname: "Jean",
    lastname: "Dupont",
    email: "jean.dupont@email.com",
    passwd: "motdepasse1234",
    active: 1
  }

  // On utilise .post() car c'est une création
  await api.post('customers', nouveauClient)
}

#10 put (modifier)
// Écriture classique et directe
async function modifierPrix(idDuProduit, nouveauPrix) {
  
  const reponse = await api.put('products', idDuProduit, { price: nouveauPrix })

  if (reponse != null) {
    alert("Prix mis à jour avec succès !")
  }
}
//exemple
<button @click="modifierPrix(4, 25.00)">Mettre le produit n°4 à 25€</button>

utils->
  api.js
  db.js
App.vue
views->
    HomeView.vue
    frontoffice->
      Authentification.vue
      ListProduct.vue
      PanierList.vue
      Payment.vue

</script>

#11 ref simple pour input usage
<script setup>

<template>  
import api from '@/utils/api.js'
import { ref } from 'vue'

// On crée des boîtes vides au départ
const nomSaisi = ref('')
const prixSaisi = ref(0)

<template>
  <div class="mon-formulaire">
    <h3>Ajouter un nouveau produit</h3>

    <label>Nom du produit :</label>
    <input type="text" v-model="nomSaisi" placeholder="Ex: Super carnet" />

    <label>Prix (€) :</label>
    <input type="number" v-model="prixSaisi" placeholder="Ex: 15.99" />

    <button @click="ajouterMonProduitReel()">Créer le produit sur PrestaShop</button>
  </div>
</template>

// Fonction classique à l'ancienne
async function ajouterMonProduitReel() {
  
  // 1. On vérifie que l'utilisateur n'a pas laissé le champ vide
  if (nomSaisi.value.trim() == "") {
    alert("Hé oh ! Tu as oublié de donner un nom au produit.")
    return
  }

  // 2. On fabrique l'objet PLAT demandé par le script de ton pote
  // On va chercher ce qu'il y a à l'intérieur des inputs avec .value
  const donneesFormulaire = {
    active: 1,
    name: nomSaisi.value,             // <--- Prends la valeur de l'input Nom
    price: parseFloat(prixSaisi.value), // <--- Prends la valeur de l'input Prix
    id_category_default: 2, 
    link_rewrite: "produit-depuis-formulaire"
  }

  // 3. On envoie l'objet à l'API (le script de ton pote s'occupe du XML)
  const reponse = await api.post('products', donneesFormulaire)

  // 4. Si ça a marché
  if (reponse != null) {
    alert("Nickel ! Le produit a été créé dans le vrai PrestaShop.")
    
    // Optionnel : On vide le formulaire pour le prochain coup
    nomSaisi.value = ""
    prixSaisi.value = 0
  } else {
    alert("Mince, le serveur PrestaShop a renvoyé une erreur.")
  }
}
</script>

#12 json manivel
// Pour voir tous les champs possibles d'un produit
const structure = await api.get('products?schema=blank')
console.log(structure)

ou

// Le "null, 2" force un affichage espacé et super lisible dans les logs
console.log(JSON.stringify(laReponseDeLapi, null, 2)) 