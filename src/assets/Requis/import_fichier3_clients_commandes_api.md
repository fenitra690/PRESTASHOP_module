# Import CSV fichier 3 - Clients et commandes

Ce document decrit l'ordre d'appel des APIs PrestaShop pour importer le fichier 3 :

```csv
date,nom,email,pwd,adresse,achat,etat
```

Le fichier 3 depend des fichiers 1 et 2 :

- les produits doivent deja exister
- les declinaisons doivent deja exister
- les stocks doivent deja etre initialises

Ce fichier sert a creer ou retrouver les clients, creer leurs adresses, creer les paniers, remplir les lignes panier, creer les commandes, puis appliquer les etats de commande.

## 1. Ordre global d'appel des APIs

### 1. Retrouver ou creer le client

Pour chaque ligne du CSV :

1. `GET /api/customers?filter[email]=[email]`
2. Si le client n'existe pas : `POST /api/customers`
3. Si le client existe : reutiliser son `id_customer`

Le champ `email` est la cle fonctionnelle du client.

Exemples :

- `rakoto@yopmail.com`
- `rajao1970@yopmail.com`

### 2. Retrouver ou creer l'adresse du client

Pour chaque commande :

1. `GET /api/addresses?filter[id_customer]=[id_customer]`
2. Chercher une adresse equivalente a `adresse`.
3. Si aucune adresse equivalente n'existe : `POST /api/addresses`
4. Recuperer `id_address`

L'adresse est necessaire pour le panier et pour la commande.

### 3. Parser les achats de la ligne CSV

La colonne `achat` contient une liste de tuples :

```text
[("reference";quantite;"karazany")]
```

Exemples :

```text
[("T_01";3;"ngoza")]
[("T_01";2;"kely"),("C_03";1;"")]
```

Pour chaque article :

1. `GET /api/products?filter[reference]=[reference]`
2. Recuperer `id_product`.
3. Si `karazany` est vide : utiliser `id_product_attribute = 0`.
4. Si `karazany` est renseigne : retrouver la combinaison correspondante.

Pour retrouver une combinaison, utiliser les donnees creees avec le fichier 2 :

1. retrouver la valeur de declinaison dans `product_option_values`
2. retrouver la combinaison du produit associee a cette valeur
3. recuperer `id_product_attribute`

### 4. Creer le panier avec ses lignes

Pour chaque commande :

1. `POST /api/carts`
2. Inclure dans le panier l'association `cart_rows`

L'API `carts` gere directement la table `ps_cart_product` via `cart_rows`. Il ne faut pas inserer les lignes panier manuellement.

### 5. Creer la commande

Pour chaque panier cree :

1. `POST /api/orders`
2. Renseigner `id_cart`, `id_customer`, `id_address_delivery`, `id_address_invoice`, `id_currency`, `id_lang`, `id_carrier`, `module`, `payment`, `total_paid`, etc.

Dans ce projet, `Order::addWs()` appelle `PaymentModule::validateOrder()`. Donc l'API `orders` cree indirectement :

- `ps_orders`
- `ps_order_detail`
- `ps_order_detail_tax`
- `ps_order_carrier`
- parfois `ps_order_payment`
- parfois `ps_order_invoice`
- parfois `ps_product_sale`
- mise a jour du stock selon l'etat

Il ne faut donc pas appeler `order_details` directement pour les lignes commande.

### 6. Appliquer l'etat de commande du CSV

Apres creation de la commande :

1. Convertir `etat` en `id_order_state`.
2. Si l'etat final n'est pas deja applique : `POST /api/order_histories`

Exemples de valeurs CSV :

- `en attente paiement à la livraison`
- `paiement accepté`
- `erreur de paiement`

L'etat doit etre resolu par lookup dans `order_states` / `order_state_lang`.

## 2. Correspondance CSV vers API et base

| Colonne CSV | Champ API | Colonne(s) DB impactee(s) | Conversion / remarque |
|---|---|---|---|
| `date` | `date_add` | `ps_cart.date_add`, `ps_orders.date_add`, `ps_order_history.date_add` | Convertir `DD/MM/YYYY` vers `YYYY-MM-DD HH:MM:SS`. |
| `nom` | `lastname` | `ps_customer.lastname`, `ps_address.lastname` | Direct, mais le CSV ne contient pas de prenom. |
| `nom` | `firstname` | `ps_customer.firstname`, `ps_address.firstname` | Valeur par defaut necessaire. Voir section valeurs par defaut. |
| `email` | `email` | `ps_customer.email` | Cle fonctionnelle client. |
| `pwd` | `passwd` | `ps_customer.passwd` | Ne pas stocker en clair. L'API `customers` hash le mot de passe via `setWsPasswd`. |
| `adresse` | `address1` | `ps_address.address1` | Direct, mais il faut aussi completer `city`, `alias`, `id_country`. |
| `achat` | association `cart_rows` | `ps_cart_product` | Parser les tuples `(reference;quantite;karazany)`. |
| `achat.reference` | `id_product` | `ps_cart_product.id_product`, puis `ps_order_detail.product_id` | Lookup via `ps_product.reference`. |
| `achat.quantite` | `quantity` | `ps_cart_product.quantity`, puis `ps_order_detail.product_quantity` | Convertir en entier. |
| `achat.karazany` | `id_product_attribute` | `ps_cart_product.id_product_attribute`, puis `ps_order_detail.product_attribute_id` | Vide = `0`, sinon lookup combinaison. |
| `etat` | `id_order_state` | `ps_order_history.id_order_state`, `ps_orders.current_state` | Lookup via libelle d'etat. |

## 3. Conversions a appliquer

### Date

Format CSV :

```text
DD/MM/YYYY
```

Format API/DB conseille :

```text
YYYY-MM-DD 00:00:00
```

Exemple :

```text
09/05/2026 -> 2026-05-09 00:00:00
```

### Achat

Format CSV :

```text
[("T_01";3;"ngoza")]
```

Format logique apres parsing :

```text
[
  {
    "reference": "T_01",
    "quantity": 3,
    "karazany": "ngoza"
  }
]
```

Exemple avec plusieurs produits :

```text
[("T_01";2;"kely"),("C_03";1;"")]
```

Devient :

```text
[
  {
    "reference": "T_01",
    "quantity": 2,
    "karazany": "kely"
  },
  {
    "reference": "C_03",
    "quantity": 1,
    "karazany": ""
  }
]
```

### Etat de commande

Le CSV donne un libelle humain. Il faut le convertir vers `id_order_state`.

Mapping a faire par lookup :

1. `GET /api/order_states`
2. Lire les traductions dans `order_state_lang`
3. Trouver l'id dont le nom correspond au libelle CSV

Exemples probables :

| Valeur CSV | Etat PrestaShop attendu |
|---|---|
| `en attente paiement à la livraison` | etat "Awaiting cash on delivery payment" ou traduction equivalente |
| `paiement accepté` | etat "Payment accepted" ou traduction equivalente |
| `erreur de paiement` | etat "Payment error" ou traduction equivalente |

Il faut eviter de coder les ids en dur si la base peut changer.

## 4. Valeurs par defaut a completer

### Clients - `POST /api/customers`

| Champ API | Valeur |
|---|---|
| `lastname` | CSV `nom` |
| `firstname` | `Client` ou meme valeur que `nom`, selon convention choisie |
| `email` | CSV `email` |
| `passwd` | CSV `pwd`, envoye a l'API, pas stocke en clair |
| `active` | `1` |
| `id_default_group` | groupe client par defaut, souvent `3` |
| `id_lang` | langue par defaut de la boutique |
| `newsletter` | `0` |
| `optin` | `0` |
| `is_guest` | `0` |
| `deleted` | `0` |

Remarque : si le client existe deja, ne pas rappeler `POST /api/customers`. Reutiliser `id_customer`.

### Adresses - `POST /api/addresses`

| Champ API | Valeur |
|---|---|
| `id_customer` | id du client trouve/cree |
| `alias` | `Adresse import CSV` ou `Adresse principale` |
| `lastname` | CSV `nom` |
| `firstname` | meme valeur que le client |
| `address1` | CSV `adresse` |
| `city` | valeur par defaut, ex: `Antananarivo` |
| `id_country` | pays par defaut de la boutique |
| `postcode` | vide si non obligatoire pour le pays |
| `phone` | vide |
| `deleted` | `0` |

Le CSV ne fournit pas `city` ni `id_country`, pourtant PrestaShop les exige. Ces valeurs doivent venir de la configuration boutique ou d'une convention d'import.

### Paniers - `POST /api/carts`

| Champ API | Valeur |
|---|---|
| `id_customer` | id du client trouve/cree |
| `id_address_delivery` | id de l'adresse trouvee/creee |
| `id_address_invoice` | meme valeur que `id_address_delivery` |
| `id_currency` | devise par defaut de la boutique |
| `id_lang` | langue par defaut de la boutique |
| `id_carrier` | transporteur par defaut |
| `id_shop` | `1` ou boutique courante |
| `id_shop_group` | groupe boutique courant |
| `date_add` | date CSV convertie |
| `date_upd` | date CSV convertie |
| `secure_key` | secure key du client si necessaire |
| association `cart_rows` | lignes issues de `achat` |

Structure logique de `cart_rows` :

| Champ cart row | Valeur |
|---|---|
| `id_product` | produit trouve via `reference` |
| `id_product_attribute` | combinaison trouvee via `karazany`, ou `0` |
| `id_address_delivery` | adresse client |
| `quantity` | quantite parse depuis `achat` |

### Commandes - `POST /api/orders`

| Champ API | Valeur |
|---|---|
| `id_cart` | id du panier cree |
| `id_customer` | id du client |
| `id_address_delivery` | id de l'adresse |
| `id_address_invoice` | id de l'adresse |
| `id_currency` | devise par defaut |
| `id_lang` | langue par defaut |
| `id_carrier` | transporteur par defaut |
| `module` | module de paiement coherent avec l'etat, ex: `ps_cashondelivery` ou module existant |
| `payment` | libelle paiement, ex: `Paiement a la livraison` |
| `total_paid` | total panier TTC calcule |
| `total_paid_tax_incl` | total panier TTC calcule |
| `total_paid_tax_excl` | total panier HT calcule |
| `total_paid_real` | total paye reel, selon etat |
| `total_products` | total produits HT |
| `total_products_wt` | total produits TTC |
| `conversion_rate` | `1` si devise par defaut |
| `date_add` | date CSV convertie |
| `date_upd` | date CSV convertie |

Remarque : meme si certains totaux sont recalcules par PrestaShop pendant `validateOrder`, il vaut mieux fournir des valeurs coherentes avec le panier.

### Historiques d'etat - `POST /api/order_histories`

| Champ API | Valeur |
|---|---|
| `id_order` | id de la commande creee |
| `id_order_state` | id trouve depuis CSV `etat` |
| `date_add` | date CSV convertie |
| `id_employee` | `0` |

Option :

```http
POST /api/order_histories?sendemail=0
```

Utiliser `sendemail=0` pour eviter d'envoyer des emails pendant l'import.

## 5. Regles de modification

### Si le client existe deja

Ne pas recreer le client.

Reutiliser :

- `id_customer`
- `secure_key`
- groupes client existants

Ne modifier le client que si une strategie de synchronisation est decidee explicitement.

### Si une adresse equivalente existe deja

Reutiliser l'adresse existante si :

- meme `id_customer`
- meme `address1`
- meme `lastname`

Sinon creer une nouvelle adresse.

### Si un produit de `achat` est introuvable

Mettre la commande en erreur d'import.

Ne pas creer la commande tant que tous les produits ne sont pas resolus.

### Si `karazany` est renseigne mais la combinaison est introuvable

Mettre la commande en erreur d'import.

Ne pas utiliser `id_product_attribute = 0`, car cela commanderait le produit simple au lieu de la declinaison demandee.

### Si `karazany` est vide

Utiliser :

```text
id_product_attribute = 0
```

C'est le cas des produits simples comme `C_03`.

### Si la commande existe deja

Le CSV ne contient pas de reference commande externe. Pour eviter les doublons, il faut definir une cle d'idempotence, par exemple :

```text
email + date + achat + etat
```

Sans cette cle, chaque import recreera une nouvelle commande.

## 6. Champs a ne pas traiter directement dans le fichier 3

Le fichier 3 ne doit pas appeler directement :

- `order_details`
- `order_payments`
- `order_carriers`
- `order_invoices`
- `stock_movements`

Ces donnees sont creees ou mises a jour par l'API `orders` et la logique PrestaShop.

Le fichier 3 ne doit pas modifier :

- les produits
- les categories
- les taxes
- les declinaisons
- le stock initial hors effets normaux d'une commande

Ces elements appartiennent aux fichiers 1 et 2.
