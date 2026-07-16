<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/utils/api.js'
import db from '@/utils/db.js'

const router = useRouter()

const emailSaisi = ref("")
const NomSaisi = ref("")
const messageErreur = ref("")
const chargement = ref(false)

const sessionUser = db.session('session_user', {
  id: null,
  nom: '',
  prenom: '',
  estConnecte: false
})

async function connecterUtilisateur() {
  
  if (emailSaisi.value == "" || NomSaisi.value == "") {
    messageErreur.value = "Email et mot de passe requis !";
    return;
  }

  chargement.value = true;
  messageErreur.value = "";

  const reponse = await api.get("customers?display=full");
  console.log("Voici TOUT ce que contient un produit :", reponse.customers[0]);

  if (reponse != null) {
    let listeDesClients = reponse.customers;
    let clientTrouve = null;

    for (let i = 0; i < listeDesClients.length; i++) {
      let c = listeDesClients[i];
      
      if (c.email == emailSaisi.value && c.lastname == NomSaisi.value) {
        clientTrouve = c;
        break;
      }
    }

    // 4. On vérifie le résultat de la boucle
    if (clientTrouve != null) {
      // Sauvegarde dans la session
      sessionUser.value = {
        id: clientTrouve.id,
        nom: clientTrouve.lastname,
        prenom: clientTrouve.firstname,
        estConnecte: true
      };

      router.push('/about');
    } else {
      messageErreur.value = "Email inconnu sur PrestaShop.";
    }

  } else {
    messageErreur.value = "Erreur : Impossible de contacter le serveur.";
  }

  // On remet le chargement à false à la fin
  chargement.value = false;
}
</script>
<script setup>

</script>

<template>
  <div style="max-width: 300px; margin: auto; padding-top: 50px;">
    <h3>Identification</h3>
    <input v-model="emailSaisi" type="email" placeholder="Email client" style="width: 100%" />
    <br>
    <input v-model="NomSaisi" type="text" placeholder="Nom" style="width: 100%" />
    <br>
    <button @click="connecterUtilisateur" :disabled="chargement">
      {{ chargement ? 'Patientez...' : 'Entrer dans la boutique'  }}
    </button>
    <p v-if="messageErreur" style="color: red">{{ messageErreur }}</p>
  </div>
</template>