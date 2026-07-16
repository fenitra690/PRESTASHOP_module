import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import db from '@/utils/db.js'

// Guard backoffice : redirige vers login si pas connecté
function gardeAdmin(to, from, next) {
  // db.session retourne un ref, on lit .value via localStorage directement
  const raw = sessionStorage.getItem('utilisateur_admin') || sessionStorage.getItem('admin')
  // Vérification simple : si la clé session 'admin' existe
  const session = JSON.parse(sessionStorage.getItem('admin') || 'null')
  if (!session) {
    next('/backoffice/login')
  } else {
    next()
  }
}

function gardeAdmin2(to, from, next) {
  // db.session retourne un ref, on lit .value via localStorage directement
  const raw = sessionStorage.getItem('utilisateur_admin') || sessionStorage.getItem('admin')
  // Vérification simple : si la clé session 'admin' existe
  const session = JSON.parse(sessionStorage.getItem('admin') || 'null')
  if (!session) {
    next('/frontoffice/login')
  } else {
    next()
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/about',
      name: 'about',
      component: () => import('../views/AboutView.vue'),
    },
    {
      path: '/UserLog',
      name: 'UserLog',
      component: () => import('../views/UserLog.vue'),
    },
    {
      path: '/',
      name: 'accueil',
      component: () => import('../views/Accueil.vue'),
    },
    // --- FRONT OFFICE ---
    {
      path: '/frontoffice/ListProduct',
      name: 'ListProduct',
      component: () => import('../views/frontoffice/ListProduct.vue'),
    },
    {
      path: '/frontoffice/Panier',
      name: 'Panier',
      component: () => import('../views/frontoffice/PanierList.vue'),
    },
    {
      path: '/frontoffice/Payment',
      name: 'Payment',
      component: () => import('../views/frontoffice/Payment.vue'),
    },
    {
      path: '/frontoffice/Authentification',
      name: 'Authentification',
      component: () => import('../views/frontoffice/Authentification.vue'),
    },
    {
      path: '/frontoffice/Mescommandes',
      name: 'Mescommandes',
      component: () => import('../views/frontoffice/Mescommandes.vue'),
    },
    {
      path: '/frontoffice/login',
      name: '/frontoffice/login',
      component: () => import('../views/frontoffice/Login.vue'),
    },
    {
      path: '/frontoffice/Alea',
      name: '/frontoffice/Alea',
      component: () => import('../views/frontoffice/Alea.vue'),
      beforeEnter: gardeAdmin2,
    },

     // ========================
    // BACK OFFICE (protégé)
    // ========================
    {
      path: '/backoffice/login',
      name: 'BackLogin',
      component: () => import('../views/backoffice/Login.vue'),
    },
    {
      path: '/backoffice/dashboard',
      name: 'Dashboard',
      component: () => import('../views/backoffice/Dashboard.vue'),
      beforeEnter: gardeAdmin,
    },
    {
      path: '/backoffice/import',
      name: 'ImportData',
      component: () => import('../views/backoffice/ImportData.vue'),
      beforeEnter: gardeAdmin,
    },
 
    // Catch-all : renvoie à l'accueil
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },

  ],
})

export default router
