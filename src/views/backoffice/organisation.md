for (const p of filtrés) {
  // 4. Récupérer le stock actuel
  const resS = await api.get(`stock_availables?filter[id_product]=${p.id}&filter[id_product_attribute]=0&display=full`)
  const rawS = resS?.stock_availables || resS?.prestashop?.stock_availables?.stock_available
  const s = Array.isArray(rawS) ? rawS[0] : rawS

  if (s?.id) {
    const qteActuelle = parseInt(s.quantity) || 0
    const voulu = quantiteARetirer.value
    const reel = Math.min(qteActuelle, voulu) // On ne retire pas plus que ce qu'on a
    const nouvelleQte = qteActuelle - reel

    await api.put('stock_availables', s.id, {
      // ... données de mise à jour du stock ...
      quantity: nouvelleQte,
    })

    logRetrait.value.push({
      nom: typeof p.name === 'string' ? p.name : (p.name?.language?.[0]?.value || p.reference),
      reel: reel,
      voulu: voulu
    })
  }
}



<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Popup Login</title>

<style>
body{
    font-family: Arial, sans-serif;
}

#popupLogin{
    display:none;
    position:fixed;
    top:20px;
    left:50%;
    transform:translateX(-50%);
    background:white;
    padding:20px;
    border-radius:10px;
    box-shadow:0 0 10px rgba(0,0,0,0.3);
    width:300px;
    z-index:1000;
}

#popupLogin input{
    width:100%;
    margin-top:10px;
    padding:10px;
    box-sizing:border-box;
}

#popupLogin button{
    width:100%;
    margin-top:15px;
    padding:10px;
    cursor:pointer;
}
</style>
</head>

<body>

<a href="#" id="monLien">Ouvrir le login</a>

<div id="popupLogin">
    <h3>Connexion</h3>

    <input type="text" id="adresse" placeholder="Adresse">

    <input type="password" id="motdepasse" placeholder="Mot de passe">

    <button id="valider">Valider</button>
</div>

<script>
document.getElementById("monLien").addEventListener("click", function(e){
    e.preventDefault();
    document.getElementById("popupLogin").style.display = "block";
});

document.getElementById("valider").addEventListener("click", function(){

    let adresse = document.getElementById("adresse").value;
    let motdepasse = document.getElementById("motdepasse").value;

    alert("Adresse : " + adresse + "\nMot de passe : " + motdepasse);
});
</script>

</body>
</html>