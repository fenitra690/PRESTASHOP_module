# Import CSV fichier 2 - Declinaisons et stock

Ce document decrit l'ordre d'appel des APIs PrestaShop pour importer le fichier 2 :

```csv
reference,specificite,karazany,stock_initial,prix_vente_ttc
```

Le fichier 2 complete les produits deja crees par le fichier 1. Il sert a :

- creer les groupes de declinaisons, ex: `taille`, `couleur`
- creer les valeurs de declinaisons, ex: `ngoza`, `kely`, `mainty`, `fotsy`
- creer les combinaisons produit
- mettre a jour le stock initial

Les lignes sans `specificite` et sans `karazany` correspondent a des produits simples sans declinaison.

## 1. Ordre global d'appel des APIs

### 1. Retrouver le produit par reference

Pour chaque ligne du CSV :

1. `GET /api/products?filter[reference]=[reference]`
2. Recuperer `id_product`, `price`, `id_tax_rules_group` et les associations existantes.

Exemples :

- `T_01`
- `P_01`
- `C_03`
- `M_02`

Si aucun produit n'est trouve, la ligne doit etre rejetee ou mise en erreur, car le fichier 2 depend du fichier 1.

### 2. Cas produit simple sans declinaison

Si `specificite` est vide et `karazany` est vide :

1. Ne pas appeler `product_options`.
2. Ne pas appeler `product_option_values`.
3. Ne pas appeler `combinations`.
4. Recuperer la ligne stock du produit simple :
   `GET /api/stock_availables?filter[id_product]=[id_product]&filter[id_product_attribute]=0`
5. Mettre a jour la quantite :
   `PUT /api/stock_availables/{id_stock_available}`

Exemples du CSV :

- `C_03,,,10,`
- `M_02,,,11,`

### 3. Cas produit avec declinaison

Si `specificite` et `karazany` sont renseignes :

1. Verifier ou creer le groupe de declinaison :
   `GET /api/product_options?filter[name]=[specificite]`
2. Si le groupe n'existe pas :
   `POST /api/product_options`
3. Verifier ou creer la valeur de declinaison :
   `GET /api/product_option_values?filter[name]=[karazany]`
4. Si la valeur n'existe pas pour ce groupe :
   `POST /api/product_option_values`
5. Verifier si la combinaison existe deja pour ce produit et cette valeur.
6. Si elle n'existe pas :
   `POST /api/combinations`
7. Si elle existe et qu'on veut synchroniser le prix :
   `PUT /api/combinations/{id_product_attribute}`
8. Recuperer la ligne stock de la combinaison :
   `GET /api/stock_availables?filter[id_product]=[id_product]&filter[id_product_attribute]=[id_product_attribute]`
9. Mettre a jour la quantite :
   `PUT /api/stock_availables/{id_stock_available}`

Exemples du CSV :

| Reference | Specificite | Karazany |
|---|---|---|
| `T_01` | `taille` | `ngoza` |
| `T_01` | `taille` | `kely` |
| `P_01` | `couleur` | `mainty` |
| `P_01` | `couleur` | `fotsy` |

## 2. Correspondance CSV vers API et base

| Colonne CSV | Champ API | Colonne(s) DB impactee(s) | Conversion / remarque |
|---|---|---|---|
| `reference` | filtre `products.reference` | `ps_product.reference` | Sert uniquement au lookup du produit. |
| `specificite` | `product_option.name`, `product_option.public_name` | `ps_attribute_group_lang.name`, `ps_attribute_group_lang.public_name` | Cree/trouve le groupe de declinaison. |
| `karazany` | `product_option_value.name` | `ps_attribute_lang.name` | Cree/trouve la valeur de declinaison. |
| `karazany` | association `product_option_values` dans `combinations` | `ps_product_attribute_combination` | Associe la valeur a la combinaison. |
| `stock_initial` | `stock_available.quantity` | `ps_stock_available.quantity` | Mise a jour par `PUT`, jamais par `POST`. |
| `prix_vente_ttc` | `combination.price` | `ps_product_attribute.price`, `ps_product_attribute_shop.price` | Stocke un impact de prix HT, pas le prix final TTC. |

## 3. Conversions a appliquer

### Nombres entiers

`stock_initial` doit etre converti en entier :

```text
"13" -> 13
"10" -> 10
```

### Nombres decimaux

Remplacer la virgule par un point :

```text
"12,5"  -> 12.5
"23,49" -> 23.49
```

### Prix de declinaison TTC vers impact HT

Dans PrestaShop, `combination.price` n'est pas le prix final de la declinaison. C'est un impact HT ajoute au prix HT du produit.

Formule :

```text
prix_declinaison_ht = prix_vente_ttc / (1 + taxe_produit / 100)
impact_ht = prix_declinaison_ht - prix_produit_base_ht
```

Si `prix_vente_ttc` est vide :

```text
impact_ht = 0
```

Exemples, en supposant que les prix de base viennent du fichier 1 :

| Reference | Karazany | Prix TTC declinaison | Prix TTC base | Taxe | Impact HT approx |
|---|---|---:|---:|---:|---:|
| `T_01` | `ngoza` | `12.50` | `12.50` | `11.65` | `0.0000` |
| `T_01` | `kely` | `15.00` | `12.50` | `11.65` | `2.2391` |
| `P_01` | `mainty` | `23.49` | `18.99` | `11.65` | `4.0305` |
| `P_01` | `fotsy` | `18.99` | `18.99` | `11.65` | `0.0000` |

Pour obtenir `taxe_produit`, utiliser le `id_tax_rules_group` du produit et retrouver la taxe via les regles de taxe, ou reutiliser le mapping deja calcule pendant l'import du fichier 1.

## 4. Valeurs par defaut a completer

### Groupes de declinaison - `POST /api/product_options`

| Champ API | Valeur |
|---|---|
| `name` | CSV `specificite` |
| `public_name` | CSV `specificite` |
| `group_type` | `color` si `specificite = couleur`, sinon `select` |
| `position` | prochaine position disponible, sinon `0` et PrestaShop calcule |

Remarque : dans la classe PrestaShop, `is_color_group` est calcule automatiquement selon `group_type`.

### Valeurs de declinaison - `POST /api/product_option_values`

| Champ API | Valeur |
|---|---|
| `id_attribute_group` | id du groupe `product_options` trouve/cree |
| `name` | CSV `karazany` |
| `color` | vide par defaut, sauf si une vraie valeur couleur hexadecimale est disponible |
| `position` | prochaine position disponible, sinon `0` et PrestaShop calcule |

Pour le CSV actuel, aucune valeur hexadecimale n'est fournie pour `mainty` ou `fotsy`. On peut donc laisser `color` vide ou ajouter plus tard un mapping manuel, par exemple `mainty -> #000000`, `fotsy -> #FFFFFF`.

### Combinaisons - `POST /api/combinations` ou `PUT /api/combinations/{id}`

| Champ API | Valeur |
|---|---|
| `id_product` | id du produit trouve via `reference` |
| `reference` | optionnel : `[reference]-[karazany]`, ex: `T_01-ngoza` |
| `price` | impact HT calcule depuis `prix_vente_ttc`, sinon `0` |
| `minimal_quantity` | `1` |
| `default_on` | `1` pour la premiere combinaison du produit, sinon `0` ou vide |
| `available_date` | `0000-00-00` ou vide |
| `low_stock_alert` | `0` |
| `low_stock_threshold` | `null` ou vide |
| association `product_option_values` | id de la valeur `karazany` |

Quand une combinaison est creee, PrestaShop cree automatiquement une ligne `stock_available` pour cette combinaison.

### Stock - `PUT /api/stock_availables/{id_stock_available}`

| Champ API | Valeur |
|---|---|
| `id_product` | id du produit trouve via `reference` |
| `id_product_attribute` | id de la combinaison, ou `0` pour produit simple |
| `quantity` | CSV `stock_initial` |
| `depends_on_stock` | conserver la valeur existante, sinon `0` |
| `out_of_stock` | conserver la valeur existante, sinon valeur config PrestaShop |
| `id_shop` | conserver la valeur existante, souvent `1` |
| `id_shop_group` | conserver la valeur existante, souvent `0` |

Important : la ressource `stock_availables` interdit `POST` dans ce projet. Il faut recuperer l'id existant puis faire un `PUT`.

## 5. Regles de modification

### Si la ligne correspond a une declinaison deja existante

Mettre a jour :

- `combination.price` si `prix_vente_ttc` est renseigne
- `stock_available.quantity` avec `stock_initial`

Ne pas recreer :

- le groupe `product_options`
- la valeur `product_option_values`
- la combinaison

### Si la ligne correspond a un produit simple

Mettre a jour uniquement :

- `stock_available.quantity` avec `id_product_attribute = 0`

Ne pas creer de combinaison.

### Si la combinaison n'existe pas encore

Creer dans cet ordre :

1. groupe de declinaison si necessaire
2. valeur de declinaison si necessaire
3. combinaison
4. stock de la combinaison

## 6. Champs a ne pas traiter dans le fichier 2

Le fichier 2 ne doit pas creer les produits de base. Les produits doivent deja exister via le fichier 1.

Le fichier 2 ne doit pas modifier :

- `ps_product.name`
- `ps_product.reference`
- `ps_product_shop.id_category_default`
- `ps_product_shop.id_tax_rules_group`
- `ps_product_shop.wholesale_price`
- `ps_product_shop.available_date`

Ces champs appartiennent au fichier 1.
