# Gouvernance des données géographiques dans les EPCI

Site statique présentant les résultats du sondage : une carte par région et une visualisation pour chaque question du questionnaire. Pas de serveur, pas de clé d'API, pas de bibliothèque externe : du HTML, du CSS et du JavaScript.

## Mettre à jour les données

1. Placer le classeur anonymisé dans `data/sondage.xlsx` (onglets `Donnees` et `Dictionnaire_donnees`).
2. Lancer :

   ```
   pip install -r requirements.txt
   python build.py
   ```

   Le script écrit `docs/data/survey.json` et `docs/data/map.json`.

La colonne région est repérée toute seule : c'est celle dont les valeurs ressemblent à `53 Bretagne`. Les colonnes du dictionnaire qui n'existent plus dans l'onglet `Donnees` (Nom_EPCI, champs texte) sont ignorées. Seul `Poste_occupe` est conservé comme texte, regroupé par famille de métiers.

Si une question à cases à cocher doit être reformulée, c'est le dictionnaire `TITRES_BLOCS` en haut de `build.py`.

## Voir le site en local

```
python -m http.server -d docs
```

puis ouvrir http://localhost:8000.

## Publier sur GitHub Pages

Dépôt GitHub, Settings > Pages, branche `main`, dossier `/docs`. Le site est servi à l'adresse `https://<compte>.github.io/<depot>/`.

## Lecture des résultats

- Beaucoup de questions ne sont posées qu'à une partie des répondants (réponse « oui » à une question précédente). Quand c'est le cas, la carte de la question indique « posée à n répondants sur N » et propose deux bases : les répondants concernés (par défaut) ou l'ensemble des répondants, avec une barre grise « non concerné ». Le réglage « Pourcentages sur » en haut de page agit sur toutes les questions.
- « Comparer par » ventile chaque question par type d'EPCI, taille du territoire ou région. Sur 51 réponses, les petits groupes sont à interpréter avec prudence : l'effectif est affiché à chaque fois.
- Le filtre « CC et CA seulement » reprend le périmètre de l'analyse initiale.

## Attention avant de publier

`docs/data/survey.json` contient les réponses ligne par ligne (sans nom ni texte libre). Le croisement région, type d'EPCI et taille peut suffire à reconnaître une structure : à vérifier avant de rendre le dépôt public.

## Sources

Contours des régions : `data/regions.geojson`, version simplifiée du jeu de données france-geojson de Grégoire David (https://github.com/gregoiredavid/france-geojson), issu des données de l'IGN sous licence ouverte Etalab.
