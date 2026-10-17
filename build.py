#!/usr/bin/env python3
"""Lit le classeur anonymisé et écrit docs/data/survey.json + docs/data/map.json.

Usage :  python build.py [chemin/vers/sondage.xlsx]
Par défaut le script cherche data/sondage.xlsx.
"""
import json
import math
import re
import sys
import unicodedata
from collections import Counter
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

RACINE = Path(__file__).parent
XLSX = Path(sys.argv[1]) if len(sys.argv) > 1 else RACINE / "data" / "sondage.xlsx"
SORTIE = RACINE / "docs" / "data"
FOND_CARTE = RACINE / "data" / "regions.geojson"

REGIONS = {
    "11": "Île-de-France", "24": "Centre-Val de Loire", "27": "Bourgogne-Franche-Comté",
    "28": "Normandie", "32": "Hauts-de-France", "44": "Grand Est", "52": "Pays de la Loire",
    "53": "Bretagne", "75": "Nouvelle-Aquitaine", "76": "Occitanie", "84": "Auvergne-Rhône-Alpes",
    "93": "Provence-Alpes-Côte d'Azur", "94": "Corse",
}
TYPES = ["Communautés de communes", "Communautés d'agglomération", "Métropoles / CU", "Autres"]
TAILLES = ["moins de 50 000 hab.", "50 000 à 100 000 hab.", "100 000 à 200 000 hab.", "200 000 hab. et plus"]

SECTIONS = {
    "Profil": "Profil des répondants", "3.4.2.1": "Organisation des SIG", "3.4.2.2": "Infrastructure et outils",
    "3.4.2.3": "Démarche de gestion des données", "3.4.2.4": "Catalogage et open data",
    "3.4.2.5": "Acteurs et instances", "3.4.2.6": "Documents fédérateurs",
}

# Le dictionnaire ne donne que les options des cases à cocher, pas la question : je les ai reformulées.
TITRES_BLOCS = {
    "Outil_desktop": "Quels outils SIG desktop utilisez-vous ?",
    "Outil_web": "Quels outils de SIG web / webmapping utilisez-vous ?",
    "Outil_dev": "Quels outils ou langages de traitement et de développement utilisez-vous ?",
    "SGBD": "Quels systèmes de gestion de bases de données utilisez-vous ?",
    "Infra": "Quelles solutions d'infrastructure et de partage de données utilisez-vous ?",
    "TypeDemarche": "Quel type de démarche avez-vous engagée ?",
    "OutilCatalogage": "Quels outils de catalogage ou de recensement utilisez-vous ?",
    "Norme": "Quelles normes de métadonnées appliquez-vous ?",
    "ActeurCatalogage": "Qui alimente le catalogue de données ?",
    "CatalogueConnexion": "À quoi le catalogue est-il connecté ?",
    "Metadonnees": "Comment les métadonnées sont-elles obtenues pour les prestations externes ?",
    "InstanceComposition": "Qui compose les instances de pilotage ?",
    "ReseauReferents": "Que fait le réseau de référents SIG / données ?",
    "ReseauUtilisateurs": "Que fait le réseau d'utilisateurs finaux ?",
    "Partenaire": "Avec quels partenaires collaborez-vous ?",
    "Collaboration": "Sous quelles formes collaborez-vous ?",
    "DocumentType": "Quels types de documents fédérateurs possédez-vous ?",
    "DocumentActeur": "Qui est impliqué dans ces documents ?",
    "ConventionType": "Quels types de conventions existent ?",
    "Difficulte": "Quelles difficultés rencontrez-vous ?",
    "Moyen": "Quels moyens la région ou le département met-il à disposition ?",
}
# intitulés trop vagues dans le questionnaire d'origine ("Depuis combien de temps ?")
TITRES_COL = {
    "Poste_occupe": "Poste occupé, regroupé par famille de métiers",
    "Type_direction_rattachement": "Le service SIG transverse est rattaché à une direction de type",
    "Anciennete_demarche_donnees": "Depuis combien de temps la démarche de gestion des données est-elle engagée ?",
    "ReseauReferents_FrequenceReunions": "Fréquence des réunions du réseau de référents",
    "Collaboration_FrequenceReunions": "Fréquence des réunions de collaboration externe",
    "Anciennete_documents_federateurs": "Depuis combien d'années ces documents fédérateurs existent-ils ?",
}
TRANCHES = {  # variables numériques découpées en classes ; None = pas de borne haute
    "Nb_agents_EPCI": ([0, 50, 100, 200, 500, 1000, 2500, None],
                       ["moins de 50", "50 à 99", "100 à 199", "200 à 499", "500 à 999", "1 000 à 2 499", "2 500 et plus"]),
    "Nb_communes_territoire": ([0, 10, 20, 30, 50, 100, None],
                               ["moins de 10", "10 à 19", "20 à 29", "30 à 49", "50 à 99", "100 et plus"]),
    "Nb_habitants_territoire": ([0, 30000, 50000, 75000, 100000, 200000, 300000, None],
                                ["moins de 30 000", "30 000 à 50 000", "50 000 à 75 000", "75 000 à 100 000",
                                 "100 000 à 200 000", "200 000 à 300 000", "300 000 et plus"]),
}
IGNORER = {"Sequentiel", "Nom_EPCI"}


def sans_accent(s):
    s = unicodedata.normalize("NFKD", str(s))
    return "".join(c for c in s if not unicodedata.combining(c)).lower()


def propre(v):
    if v is None or pd.isna(v):
        return None
    if isinstance(v, (float, np.floating)) and float(v).is_integer():
        return str(int(v))
    return str(v).strip() or None


def famille_poste(s):
    t = sans_accent(s or "")
    regles = [
        (r"directeur", "Direction"),
        (r"responsable|chef de service|cheffe de service|\bpole\b", "Responsable de service ou de pôle"),
        (r"chef de projet|cheffe de projet|charge", "Chef de projet, chargé de mission"),
        (r"\badmin", "Administrateur SIG"),
        (r"geomatic", "Géomaticien"),
        (r"technicien|techsig|cartograph", "Technicien, cartographe"),
    ]
    for motif, nom in regles:
        if re.search(motif, t):
            return nom
    return "Autre"


def type_epci(v):
    t = sans_accent(v or "")
    if "communes" in t:
        return 0
    if "agglom" in t:
        return 1
    if "metropole" in t or "urbaine" in t:
        return 2
    return 3


def trouver_colonne_region(df):
    """La colonne région est celle dont les valeurs ressemblent à '53 Bretagne'."""
    meilleure, score = None, 0.0
    for c in df.columns:
        vals = df[c].dropna().astype(str)
        if len(vals) < 5:
            continue
        part = vals.str.match(r"^\s*\d{2}(\s|$|-)").mean()
        if part > score:
            meilleure, score = c, part
    if score < 0.6:
        sys.exit("Colonne région introuvable (valeurs du type '11 Île-de-France'). Colonnes lues : "
                 + ", ".join(map(str, df.columns[:15])) + " ...")
    return meilleure


def prefixe(col):
    t = col.split("_")
    return "_".join(t[:2]) if t[0] == "Outil" else t[0]


def lister_questions(dico, df):
    lignes = [r for r in dico.to_dict("records") if r["Nom_colonne_R"] in df.columns]
    absentes = [r["Nom_colonne_R"] for r in dico.to_dict("records") if r["Nom_colonne_R"] not in df.columns]
    if absentes:
        print(f"{len(absentes)} colonnes du dictionnaire ne sont plus dans l'onglet Donnees (ignorées).")
    qs, i = [], 0
    while i < len(lignes):
        r, col, typ = lignes[i], lignes[i]["Nom_colonne_R"], lignes[i]["Type_de_donnee"]
        sec = r["Section"].split()[0]
        if col in IGNORER or "Identifiant" in typ or "Texte libre" in typ:
            i += 1
            continue
        if "case a cocher" in typ:
            pref, j = prefixe(col), i
            while (j < len(lignes) and "case a cocher" in lignes[j]["Type_de_donnee"]
                   and lignes[j]["Section"].split()[0] == sec and prefixe(lignes[j]["Nom_colonne_R"]) == pref):
                j += 1
            bloc = lignes[i:j]
            qs.append(dict(id=pref, sec=sec, kind="multi", titre=TITRES_BLOCS.get(pref, pref),
                           cols=[b["Nom_colonne_R"] for b in bloc],
                           cats=[re.sub(r"\.\d+$", "", str(b["Intitule_original_du_sondage"])).strip() for b in bloc]))
            i = j
            continue
        q = dict(id=col, sec=sec, cols=[col], titre=TITRES_COL.get(col, str(r["Intitule_original_du_sondage"]).strip()))
        if "Oui/Non" in typ:
            q.update(kind="yesno", cats=["Oui", "Non"])
        elif "Nombre" in typ:
            bornes, noms = TRANCHES[col]
            q.update(kind="number", cats=noms, bornes=bornes, ordre=True)
        else:
            niv = r.get("Niveaux_ordonnes")
            q.update(kind="single", niveaux=[x.strip() for x in niv.split("<")] if isinstance(niv, str) else [])
        qs.append(q)
        i += 1
    return qs


def ajouter_categories(qs, df):
    """Pour les questions à choix unique : niveaux ordonnés, sinon modalités par fréquence ('Autre' en dernier)."""
    for q in qs:
        if q["kind"] != "single":
            continue
        col = q["cols"][0]
        vals = df["_poste"] if col == "Poste_occupe" else df[col].map(propre)
        freq = [c for c, _ in Counter(v for v in vals if isinstance(v, str) and v).most_common()]
        niv = q.pop("niveaux")
        reste = [c for c in freq if c not in niv]
        reste = [c for c in reste if not c.lower().startswith("autre")] + [c for c in reste if c.lower().startswith("autre")]
        q["cats"] = niv + reste
        q["ordre"] = bool(niv)


def reponse(q, ligne):
    col = q["cols"][0]
    if q["kind"] == "yesno":
        v = ligne[col]
        return None if pd.isna(v) else int(bool(v))
    if q["kind"] == "number":
        v = pd.to_numeric(ligne[col], errors="coerce")
        return None if pd.isna(v) else float(v)
    if q["kind"] == "multi":
        vals = [ligne[c] for c in q["cols"]]
        if all(pd.isna(v) for v in vals):
            return None
        return [int(pd.notna(v) and bool(v)) for v in vals]
    v = ligne["_poste"] if col == "Poste_occupe" else propre(ligne[col])
    return q["cats"].index(v) if v in q["cats"] else None


def donnees(xlsx):
    df = pd.read_excel(xlsx, sheet_name="Donnees")
    dico = pd.read_excel(xlsx, sheet_name="Dictionnaire_donnees")
    col_reg = trouver_colonne_region(df)
    print(f"{len(df)} répondants, colonne région : {col_reg}")

    df = df.copy()
    df["_poste"] = df["Poste_occupe"].map(famille_poste) if "Poste_occupe" in df else None
    qs = lister_questions(dico, df)
    ajouter_categories(qs, df)

    connues = {c for q in qs for c in q["cols"]} | set(dico["Nom_colonne_R"]) | {col_reg, "_poste"}
    inconnues = [c for c in df.columns if c not in connues]
    if inconnues:
        print("Colonnes absentes du dictionnaire (non traitées) :", inconnues)

    vides = [q for q in qs if df[q["cols"]].isna().all().all()]
    qs = [q for q in qs if q not in vides]

    hab = pd.to_numeric(df.get("Nb_habitants_territoire"), errors="coerce")
    seuils = [50e3, 100e3, 200e3]
    lignes = []
    for _, l in df.iterrows():
        m = re.match(r"^\s*(\d{2})", str(l[col_reg])) if pd.notna(l[col_reg]) else None
        h = hab.loc[l.name] if hab is not None else np.nan
        lignes.append(dict(
            t=type_epci(l.get("Type_EPCI")) if "Type_EPCI" in df else None,
            s=None if pd.isna(h) else int(sum(h >= x for x in seuils)),
            r=m.group(1) if m else None,
            a=[reponse(q, l) for q in qs]))

    cles = list(dict.fromkeys(q["sec"] for q in qs))
    postes = Counter(propre(v) for v in df["Poste_occupe"] if propre(v)) if "Poste_occupe" in df else {}
    for q in qs:
        q["sec"] = cles.index(q["sec"])
    return dict(
        genere=date.today().isoformat(), n=len(df),
        types=TYPES, tailles=TAILLES, regions=REGIONS,
        sections=[dict(cle=c, nom=SECTIONS.get(c, c)) for c in cles],
        questions=qs, rows=lignes,
        postes=[dict(titre=t, n=n) for t, n in postes.most_common()],
        vides=[q["titre"] for q in vides],
    )


# ---- carte : projection conique conforme de Lambert, dessin en SVG ----
_p1, _p2, _p0, _l0 = (math.radians(x) for x in (44, 49, 46.5, 3))
_n = math.log(math.cos(_p1) / math.cos(_p2)) / math.log(
    math.tan(math.pi / 4 + _p2 / 2) / math.tan(math.pi / 4 + _p1 / 2))
_F = math.cos(_p1) * math.tan(math.pi / 4 + _p1 / 2) ** _n / _n
_rho0 = _F / math.tan(math.pi / 4 + _p0 / 2) ** _n


def lambert(lon, lat):
    rho = _F / math.tan(math.pi / 4 + math.radians(lat) / 2) ** _n
    th = _n * (math.radians(lon) - _l0)
    return rho * math.sin(th), -(_rho0 - rho * math.cos(th))  # y vers le bas pour le SVG


def polygones(geom):
    return geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]


def aire_centroide(anneau):
    a = cx = cy = 0.0
    for (x0, y0), (x1, y1) in zip(anneau, anneau[1:] + anneau[:1]):
        c = x0 * y1 - x1 * y0
        a += c
        cx += (x0 + x1) * c
        cy += (y0 + y1) * c
    a /= 2
    if not a:
        return 0, anneau[0]
    return abs(a), (cx / (6 * a), cy / (6 * a))


def carte():
    gj = json.loads(FOND_CARTE.read_text(encoding="utf-8"))
    feats = [f for f in gj["features"] if f["properties"]["code"] in REGIONS]
    proj = {f["properties"]["code"]: [[[lambert(*p) for p in anneau] for anneau in poly]
                                       for poly in polygones(f["geometry"])] for f in feats}
    pts = [p for polys in proj.values() for poly in polys for an in poly for p in an]
    x0, x1 = min(p[0] for p in pts), max(p[0] for p in pts)
    y0, y1 = min(p[1] for p in pts), max(p[1] for p in pts)
    marge = 10
    largeur = 600
    k = (largeur - 2 * marge) / (x1 - x0)
    haut = round((y1 - y0) * k) + 2 * marge
    sortie = []
    for code, polys in proj.items():
        d, meilleur = [], (0, None)
        for poly in polys:
            ecran = [[((x - x0) * k + marge, (y - y0) * k + marge) for x, y in an] for an in poly]
            for an in ecran:
                d.append("M" + "L".join(f"{x:.1f} {y:.1f}" for x, y in an) + "Z")
            aire, c = aire_centroide(ecran[0])
            if aire > meilleur[0]:
                meilleur = (aire, c)
        sortie.append(dict(code=code, nom=REGIONS[code], d="".join(d),
                           cx=round(meilleur[1][0], 1), cy=round(meilleur[1][1], 1)))
    return dict(largeur=largeur, hauteur=haut, regions=sortie)


if __name__ == "__main__":
    if not XLSX.exists():
        sys.exit(f"Fichier introuvable : {XLSX}")
    SORTIE.mkdir(parents=True, exist_ok=True)
    d = donnees(XLSX)
    (SORTIE / "survey.json").write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (SORTIE / "map.json").write_text(json.dumps(carte(), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    sans_region = sum(r["r"] is None for r in d["rows"])
    print(f"{len(d['questions'])} questions, {sans_region} répondant(s) sans région, "
          f"{len(d['vides'])} question(s) sans aucune réponse.")
