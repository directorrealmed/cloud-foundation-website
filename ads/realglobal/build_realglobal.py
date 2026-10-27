"""Real Global (Iglesia Real) Ad Grants rescue: campaign files for Google Ads Editor
or Google Ads web → Tools → Bulk actions → Uploads.

    python3 ads/realglobal/build_realglobal.py

Writes ads/realglobal/csv/*.csv and stops if any text breaks a Google Ads limit
or an Ad Grants rule (single words only for brand terms, 2+ ad groups per
campaign, 2 ads per ad group). Everything is built Paused: review, then enable.
"""
import csv
import pathlib
import sys

OUT = pathlib.Path(__file__).resolve().parent / "csv"
SITE = "https://realglobal.org/"
APP = "https://40dias.realglobal.org/biblia/40-dias"  # final URL already used by the live Real 4 ad
BRAND_ONE_WORD_OK = {"realglobal"}

CAMPAIGNS = [
    {
        "name": "Real 0 - Marca",
        "budget": 30,
        "geo": "Colombia; Argentina; Mexico; United States; Chile; Peru; Ecuador; Venezuela",
        "groups": [
            {
                "name": "Iglesia Real",
                "url": SITE,
                "path": ("Iglesia-Real", ""),
                "keywords": ['"iglesia real"', '"iglesia real medellin"', '"iglesia real medellín"',
                             '"iglesia real colombia"', '[realglobal]', '"real global iglesia"', '"real global medellin"'],
                "a": ["Iglesia Real Medellín", "Sitio Oficial", "Conoce Iglesia Real",
                      "Grupos de Conexión", "Lee la Biblia con Nosotros"],
                "b": ["Iglesia Real", "Una Familia en Medellín", "Conoce Nuestra Familia",
                      "Oración y Esperanza", "Fe Para la Vida Diaria"],
                "d": ["Iglesia Real en Medellín: grupos, oración y planes de lectura bíblica.",
                      "Conoce a nuestra familia y encuentra un grupo de conexión cerca de ti."],
            },
            {
                "name": "40 Dias Iglesia Real",
                "url": APP,
                "path": ("40-Dias", "Biblia"),
                "keywords": ['"40 dias iglesia real"', '"40 días iglesia real"', '"40 dias real global"',
                             '"40 días realglobal"', '"reto 40 dias iglesia real"'],
                "a": ["40 Días de Iglesia Real", "Lee Toda la Biblia", "Tres Lecturas al Día",
                      "Únete al Reto de 40 Días", "Recordatorios Diarios"],
                "b": ["Reto 40 Días · Iglesia Real", "La Biblia en 40 Días", "Lee y Ora en Comunidad",
                      "Muro de Oración", "Tu Avance Día a Día"],
                "d": ["Tres lecturas de 30 minutos al día y oración en comunidad. Únete hoy.",
                      "Recibe la lectura del día por correo y lleva tu avance en la app."],
            },
        ],
    },
]

# New exact-match ad group for the existing "Real 4 - 40 Días Biblia" campaign.
REAL4_EXACT = {
    "campaign": "Real 4 - 40 Días Biblia",
    "name": "40 Dias - Exacta",
    "url": APP,
    "path": ("40-Dias", "Plan"),
    "keywords": ['[leer la biblia en 40 dias]', '[leer toda la biblia en 40 dias]', '[biblia en 40 dias]',
                 '[plan para leer la biblia en 40 dias]', '[reto de 40 dias biblia]',
                 '[leer la biblia completa en 40 dias]', '[plan de lectura biblica 40 dias]'],
    "a": ["Lee la Biblia en 40 Días", "Plan Diario de Lectura", "Tres Lecturas de 30 Min",
          "Únete al Reto de 40 Días", "Recordatorio Cada Mañana"],
    "b": ["La Biblia Completa en 40 Días", "Reto Bíblico de 40 Días", "Lee en Comunidad",
          "Lectura del Día por Correo", "Tu Avance, Día a Día"],
    "d": ["Toda la Biblia en 40 días: tres lecturas de 30 minutos al día y oración.",
          "Recibe la lectura diaria por correo, recordatorios y un muro de oración."],
}

CALLOUTS = ["Plan de 40 Días", "Lectura Diaria", "Oración en Comunidad", "Recordatorios",
            "Iglesia Real Medellín"]


def check(ok, msg):
    if not ok:
        sys.exit("LÍMITE: " + msg)


def kw(k):
    if k.startswith("["):
        return k[1:-1], "Exact"
    if k.startswith('"'):
        return k[1:-1], "Phrase"
    sys.exit(f"broad keyword not allowed: {k}")


def group_rows(campaign, g, kw_rows, ad_rows):
    for p in g["path"]:
        check(len(p) <= 15, f"path {p}")
    for k in g["keywords"]:
        text, match = kw(k)
        check(len(text.split()) > 1 or text in BRAND_ONE_WORD_OK, f"single word {k}")
        kw_rows.append([campaign, g["name"], text, match, g["url"], "Paused"])
    for first, second in (("a", "b"), ("b", "a")):
        heads = list(dict.fromkeys(g[first] + g[second]))[:15]
        check(len(heads) >= 10, f"{g['name']} needs 10 headlines")
        for h in heads:
            check(len(h) <= 30, f"headline '{h}' {len(h)}")
        for d in g["d"]:
            check(len(d) <= 90, f"description '{d}' {len(d)}")
        ad_rows.append([campaign, g["name"], "Responsive search ad", g["url"], *g["path"],
                        *(heads + [""] * (15 - len(heads))), *g["d"], "", "", "Paused"])


def write(name, header, rows):
    OUT.mkdir(exist_ok=True)
    with open(OUT / name, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)
    print(f"{name}: {len(rows)} rows")


def main():
    camp_rows, kw_rows, ad_rows = [], [], []
    for c in CAMPAIGNS:
        check(len(c["groups"]) >= 2, "2 ad groups per campaign")
        camp_rows.append([c["name"], "Search", "Google search", c["budget"], "Daily",
                          "Maximize conversions", "es", c["geo"], "Location of presence", "Paused"])
        for g in c["groups"]:
            group_rows(c["name"], g, kw_rows, ad_rows)
    group_rows(REAL4_EXACT["campaign"], REAL4_EXACT, kw_rows, ad_rows)
    for co in CALLOUTS:
        check(len(co) <= 25, f"callout {co}")

    write("1-campaigns.csv", ["Campaign", "Campaign Type", "Networks", "Budget", "Budget type",
                              "Bid Strategy Type", "Languages", "Location", "Location targeting method",
                              "Campaign Status"], camp_rows)
    write("2-keywords.csv", ["Campaign", "Ad group", "Keyword", "Criterion Type", "Final URL", "Status"], kw_rows)
    write("3-responsive-search-ads.csv",
          ["Campaign", "Ad group", "Ad type", "Final URL", "Path 1", "Path 2"]
          + [f"Headline {i}" for i in range(1, 16)] + [f"Description {i}" for i in range(1, 5)] + ["Status"],
          ad_rows)
    write("4-callouts-account.csv", ["Callout text"], [[c] for c in CALLOUTS])


if __name__ == "__main__":
    main()
