<script setup>
import { useRouter } from 'vue-router'
const router = useRouter()

const allerFront = () => router.push('/frontoffice/ListProduct')
const allerBack  = () => router.push('/backoffice/login')
</script>

<template>
  <div class="page">
    <div class="fond-deco">
      <div class="c1"></div>
      <div class="c2"></div>
    </div>

    <main class="contenu">
      <div class="logo">🛍️</div>
      <h1>Ma Boutique</h1>
      <p class="sous">Choisissez votre espace</p>

      <div class="choix">
        <button class="carte-choix front" @click="allerFront">
          <span class="icone">🛒</span>
          <strong>Boutique</strong>
          <span class="desc">Voir et acheter les produits</span>
        </button>

        <button class="carte-choix back" @click="allerBack">
          <span class="icone">⚙️</span>
          <strong>Administration</strong>
          <span class="desc">Gérer commandes et stocks</span>
        </button>
      </div>
    </main>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Lato:wght@300;400;700&display=swap');

.page {
  min-height: 100vh;
  background: #0d0d1a;
  font-family: 'Lato', sans-serif;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.fond-deco { position: absolute; inset: 0; pointer-events: none; }
.c1 {
  position: absolute; width: 600px; height: 600px;
  background: #e94560; border-radius: 50%;
  filter: blur(120px); opacity: 0.08;
  top: -200px; right: -200px;
}
.c2 {
  position: absolute; width: 500px; height: 500px;
  background: #0f3460; border-radius: 50%;
  filter: blur(120px); opacity: 0.12;
  bottom: -150px; left: -150px;
}

.contenu {
  position: relative; z-index: 1;
  text-align: center;
  padding: 40px 20px;
}

.logo { font-size: 4rem; margin-bottom: 16px; }
h1 {
  font-family: 'Playfair Display', serif;
  font-size: 3rem; color: white; margin: 0 0 8px;
}
.sous { color: rgba(255,255,255,0.45); font-size: 1rem; margin: 0 0 50px; }

.choix {
  display: flex;
  gap: 24px;
  justify-content: center;
  flex-wrap: wrap;
}

.carte-choix {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 200px;
  padding: 36px 24px;
  border-radius: 20px;
  cursor: pointer;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.04);
  transition: transform 0.2s, background 0.2s, border-color 0.2s;
}
.carte-choix:hover {
  transform: translateY(-6px);
  background: rgba(255,255,255,0.09);
}
.carte-choix.front:hover { border-color: rgba(233,69,96,0.6); }
.carte-choix.back:hover  { border-color: rgba(15,52,96,0.9); }

.icone { font-size: 2.5rem; }
.carte-choix strong { color: white; font-size: 1.1rem; }
.carte-choix .desc   { color: rgba(255,255,255,0.4); font-size: 0.8rem; }
</style>