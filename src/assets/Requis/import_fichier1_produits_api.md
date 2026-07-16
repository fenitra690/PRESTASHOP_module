# Import CSV fichier 1 - Produits

Ce document decrit l'ordre d'appel des APIs PrestaShop pour importer le fichier 1 :

```csv
date_availability_produit,nom,reference,prix_ttc,Taxe,categorie,prix_achat
```

Le fichier contient les donnees de base des produits. Le stock initial et les declinaisons ne sont pas traites ici, ils viennent du fichier 2.

## 1. Ordre global d'appel des APIs

### 1. Verifier ou creer les categories

Pour chaque valeur distincte de `categorie` :

1. `GET /api/categories?filter[name]=[categorie]`
2. Si aucune categorie n'existe : `POST /api/categories`

Exemples du CSV :

- `Akanjo`
- `Accessoire`

La categorie doit etre creee avant les produits, car le produit a besoin de `id_category_default` et de l'association `categories`.

### 2. Verifier ou creer les taxes

Pour chaque valeur distincte de `Taxe` :

1. Convertir la valeur CSV en taux numerique.
2. `GET /api/taxes?filter[rate]=[taux]`
3. Si aucune taxe n'existe : `POST /api/taxes`

Exemples :

| Valeur CSV | Valeur API/DB |
|---|---:|
| `11,65%` | `11.65` |
| `5,60%` | `5.60` |

### 3. Verifier ou creer les groupes de regles de taxe

Pour chaque taxe :

1. `GET /api/tax_rule_groups?filter[name]=[nom_groupe]`
2. Si aucun groupe n'existe : `POST /api/tax_rule_groups`

Nom conseille :

- `Taxe 11.65%`
- `Taxe 5.60%`

### 4. Verifier ou creer les regles de taxe

Pour chaque couple `tax_rule_group` + `tax` :

1. Verifier si une regle equivalente existe deja, selon `id_tax_rules_group`, `id_tax` et `id_country`.
2. Si elle n'existe pas : `POST /api/tax_rules`

Cette etape relie le taux de taxe au groupe qui sera affecte au produit.

### 5. Verifier puis creer ou modifier les produits

Pour chaque ligne du CSV :

1. `GET /api/products?filter[reference]=[reference]`
2. Si le produit n'existe pas : `POST /api/products`
3. Si le produit existe et qu'on veut synchroniser les donnees CSV : `PUT /api/products/{id}`

Le champ CSV `reference` est la cle fonctionnelle pour eviter les doublons.

## 2. Correspondance CSV vers API et base

| Colonne CSV | Champ API | Colonne(s) DB impactee(s) | Conversion / remarque |
|---|---|---|---|
| `date_availability_produit` | `available_date` | `ps_product_shop.available_date` | Convertir `DD/MM/YYYY` vers `YYYY-MM-DD`. |
| `nom` | `name` | `ps_product_lang.name` | Valeur directe. |
| `nom` | `link_rewrite` | `ps_product_lang.link_rewrite` | Generer un slug, ex: `Tshirt` -> `tshirt`. |
| `reference` | `reference` | `ps_product.reference` | Valeur directe, utilisee comme cle d'unicite. |
| `prix_ttc` | `price` | `ps_product.price`, `ps_product_shop.price` | PrestaShop stocke le prix HT. Calculer depuis le TTC. |
| `Taxe` | `id_tax_rules_group` | `ps_product_shop.id_tax_rules_group` | Chercher/creer taxe, groupe et regle, puis affecter l'id du groupe. |
| `categorie` | `id_category_default` | `ps_product_shop.id_category_default` | Chercher/creer la categorie. |
| `categorie` | association `categories` | `ps_category_product` | Ajouter l'id de categorie dans l'association du produit. |
| `prix_achat` | `wholesale_price` | `ps_product_shop.wholesale_price` | Convertir la virgule decimale en point. |

## 3. Conversions a appliquer

### Date

Format CSV :

```text
DD/MM/YYYY
```

Format API/DB :

```text
YYYY-MM-DD
```

Exemple :

```text
01/12/2025 -> 2025-12-01
```

### Nombres decimaux

Remplacer la virgule par un point :

```text
"12,5" -> 12.5
"8,5"  -> 8.5
```

### Taux de taxe

Retirer `%`, remplacer la virgule par un point :

```text
"11,65%" -> 11.65
"5,60%"  -> 5.60
```

### Prix TTC vers prix HT

Le CSV fournit `prix_ttc`, mais l'API produit attend `price` en HT.

Formule :

```text
prix_ht = prix_ttc / (1 + taxe / 100)
```

Exemples du fichier :

| Reference | Prix TTC | Taxe | Prix HT approx |
|---|---:|---:|---:|
| `T_01` | `12.50` | `11.65` | `11.1957` |
| `P_01` | `18.99` | `11.65` | `17.0085` |
| `C_03` | `5.00` | `5.60` | `4.7348` |
| `M_02` | `56.00` | `5.60` | `53.0303` |

### Slug `link_rewrite`

Generer une valeur URL-friendly a partir de `nom` ou `categorie` :

| Source | Slug |
|---|---|
| `Tshirt` | `tshirt` |
| `Pantalon` | `pantalon` |
| `Casquette` | `casquette` |
| `Montre` | `montre` |
| `Akanjo` | `akanjo` |
| `Accessoire` | `accessoire` |

## 4. Valeurs par defaut a completer

### Categories - `POST /api/categories`

| Champ API | Valeur |
|---|---|
| `active` | `1` |
| `id_parent` | categorie catalogue par defaut, generalement `2` |
| `name` | valeur CSV `categorie` |
| `link_rewrite` | slug de `categorie` |
| `description` | vide |
| `meta_title` | valeur CSV `categorie` |
| `meta_description` | vide |
| `meta_keywords` | vide |

### Taxes - `POST /api/taxes`

| Champ API | Valeur |
|---|---|
| `rate` | taux converti, ex: `11.65` |
| `name` | ex: `Taxe 11.65%` |
| `active` | `1` |
| `deleted` | `0` |

### Groupes de regles de taxe - `POST /api/tax_rule_groups`

| Champ API | Valeur |
|---|---|
| `name` | ex: `Taxe 11.65%` |
| `active` | `1` |
| `deleted` | `0` |

### Regles de taxe - `POST /api/tax_rules`

| Champ API | Valeur |
|---|---|
| `id_tax_rules_group` | id du groupe cree/trouve |
| `id_tax` | id de la taxe creee/trouvee |
| `id_country` | pays par defaut de la boutique |
| `id_state` | `0` |
| `zipcode_from` | `0` ou vide selon schema API |
| `zipcode_to` | `0` ou vide selon schema API |
| `behavior` | `0` |
| `description` | vide |

### Produits - `POST /api/products` ou `PUT /api/products/{id}`

| Champ API | Valeur |
|---|---|
| `reference` | CSV `reference` |
| `name` | CSV `nom` |
| `link_rewrite` | slug de `nom` |
| `price` | prix HT calcule depuis `prix_ttc` |
| `wholesale_price` | CSV `prix_achat` converti |
| `id_tax_rules_group` | groupe de taxe trouve/cree |
| `id_category_default` | categorie trouvee/creee |
| association `categories` | inclure au minimum `id_category_default` |
| `available_date` | date convertie |
| `active` | `1` |
| `state` | `1` |
| `id_shop_default` | `1` |
| `available_for_order` | `1` |
| `show_price` | `1` |
| `visibility` | `both` |
| `condition` | `new` |
| `minimal_quantity` | `1` |
| `low_stock_alert` | `0` |
| `online_only` | `0` |
| `on_sale` | `0` |
| `is_virtual` | `0` |
| `advanced_stock_management` | `0` |
| `redirect_type` | `404` |
| `additional_delivery_times` | `0` |
| `pack_stock_type` | valeur config PrestaShop par defaut, sinon `3` |
