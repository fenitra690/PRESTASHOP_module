import { ref, watch } from 'vue'

export default {
  // s, g, d restent pour les besoins ponctuels (LocalStorage)
  s: (k, d) => localStorage.setItem(k, JSON.stringify(d)),
  g: (k) => JSON.parse(localStorage.getItem(k)),
  d: (k) => localStorage.removeItem(k),

  /**
   * TA MÉTHODE MAGIQUE ACTUELLE (LocalStorage - Persistant)
   */
  live: (k, def = []) => {
    const saved = JSON.parse(localStorage.getItem(k))
    const data = ref(saved || def)

    watch(data, (newVal) => {
      localStorage.setItem(k, JSON.stringify(newVal))
    }, { deep: true })

    return data
  },

  /**
   * LA NOUVELLE MÉTHODE (SessionStorage - S'efface à la fermeture de l'onglet)
   * Parfait pour la connexion utilisateur (sécurité)
   */
  session: (k, def = []) => {
    // 1. On récupère dans sessionStorage au lieu de localStorage
    const saved = JSON.parse(sessionStorage.getItem(k))
    const data = ref(saved || def)

    // 2. Le surveillant sauvegarde dans sessionStorage
    watch(data, (newVal) => {
      sessionStorage.setItem(k, JSON.stringify(newVal))
    }, { deep: true })

    return data
  }
}