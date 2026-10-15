"""Builds the Cloud Foundation Ad Grants account as Google Ads Editor CSVs.

    python3 ads/build/build_campaigns.py

Writes ads/campaigns/*.csv and fails loudly if any headline, description,
path or keyword breaks a Google Ads or Ad Grants limit. Edit the data in
CAMPAIGNS below, re-run, re-import. Import order in Google Ads Editor:
campaigns → keywords → negatives → ads → sitelinks → callouts.
"""
import csv
import pathlib
import sys

SITE = "https://cloudfoundation.us"
OUT = pathlib.Path(__file__).resolve().parents[1] / "campaigns"
DAILY_BUDGET = 329  # $10,000 / 30.4; each campaign may use the whole grant day
BRAND_ONE_WORD_OK = {"cloudfoundation", "fundacioncloud"}

TRUST_HEADLINES = [
    "Tax-Deductible 501(c)(3)",
    "See What Every Dollar Buys",
    "Candid Transparency Seal",
    "Run by Colombians, Locally",
]
TRUST_DESCRIPTIONS = [
    "US 501(c)(3), EIN 88-2337360. Gifts are tax-deductible. See what every dollar buys.",
    "Programmes run on the ground by Fundación Cloud, our Colombian partner since 2018.",
]

# Each ad group: keywords (phrase "..." or exact [...]), page, two RSAs (A = price/specific,
# B = story/emotion), so the guard always has a challenger to compare against.
CAMPAIGNS = [
    {
        "name": "01 Brand | Cloud Foundation",
        "geo": "United States",
        "groups": [
            {
                "name": "Brand - Core",
                "url": "/",
                "path": ("Official", ""),
                "keywords": ['[cloud foundation inc]', '"cloud foundation charity"', '"cloud foundation nonprofit"',
                             '"cloud foundation colombia"', '[cloudfoundation]', '"cloud foundation donate"',
                             '"cloud foundation hialeah"', '"cloud foundation 501c3"'],
                "a": ["Cloud Foundation Inc.", "Official Site", "Feeding & Schooling Colombia",
                      "$5 Feeds One Person in Cali", "$20,000 Builds a School"],
                "b": ["Cloud Foundation Inc.", "Small Charity, Specific Gifts", "Every Gift Buys Something Real",
                      "Food, School & Relief", "Working in Colombia"],
                "d": ["Cloud Foundation funds food, schooling, training and relief in Colombia.",
                      "A hot meal costs $5. A complete school building costs $20,000. Pick one."],
            },
            {
                "name": "Brand - Fundacion Cloud",
                "url": "/about/",
                "path": ("About", "Fundacion"),
                "keywords": ['"fundacion cloud"', '[fundacioncloud]', '"fundacion cloud colombia"',
                             '"fundación cloud"', '"fundacion cloud medellin"'],
                "a": ["Fundación Cloud Colombia", "Our US Partner Charity", "Since 2018 in Colombia",
                      "Leadership in Medellín", "Who We Are & How We Work"],
                "b": ["Fundación Cloud", "Meet the People Behind It", "Six Accountability Promises",
                      "Colombia-Led, US-Funded", "Read How We Handle Money"],
                "d": ["Fundación Cloud delivers every programme; Cloud Foundation Inc. funds it from the US.",
                      "Meet our leadership, our two entities and the commitments we hold ourselves to."],
            },
        ],
    },
    {
        "name": "02 Hunger | Street Kitchen Cali",
        "geo": "United States",
        "groups": [
            {
                "name": "Feed the Hungry Colombia",
                "url": "/kitchen/",
                "path": ("Kitchen", "Cali"),
                "keywords": ['"feed the hungry in colombia"', '"hunger in colombia charity"', '"help hungry people colombia"',
                             '"feed hungry children colombia"', '[donate food to colombia]', '"colombia hunger relief"',
                             '"food charity colombia"', '"feed the poor in colombia"'],
                "a": ["$5 Buys One Hot Meal", "Feed the Hungry in Colombia", "450 Meals a Week in Cali",
                      "$75 Feeds 15 People", "Fund a Full Serving Day"],
                "b": ["A Hot Meal in El Calvario", "Cooked by Local Volunteers", "Feed Someone Tonight",
                      "150 Neighbours, 3 Days a Week", "Hunger in Cali, Colombia"],
                "d": ["A hot meal in El Calvario, Cali costs $5. We serve 150 people three days a week.",
                      "Cooked by volunteers, funded by donors. Your gift buys the part nobody donates."],
            },
            {
                "name": "Donate Meals",
                "url": "/kitchen/",
                "path": ("Kitchen", "Donate-Meals"),
                "keywords": ['"donate a meal"', '"sponsor a meal for the hungry"', '"donate meals to the homeless"',
                             '"buy a meal for someone in need"', '"feed a hungry child"', '"donate meals overseas"',
                             '[donate a meal to a child]'],
                "a": ["Donate a Meal: $5", "One Gift, One Hot Meal", "$750 Feeds 150 People",
                      "Sponsor a Serving Day", "$2,250 Runs a Full Week"],
                "b": ["Buy a Meal for Someone", "Street Kitchen in Cali", "Feed a Neighbour in Need",
                      "Meals That Arrive Tonight", "Hot Food, Real Neighbours"],
                "d": ["Pick a meal, a serving day or a full week. Every option has its price attached.",
                      "Our street kitchen in El Calvario, Cali serves 150 people three days a week."],
            },
            {
                "name": "Soup Kitchen Abroad",
                "url": "/kitchen/",
                "path": ("Kitchen", "Street"),
                "keywords": ['"support a soup kitchen"', '"donate to a soup kitchen"', '"street kitchen charity"',
                             '"soup kitchen in colombia"', '"international soup kitchen donation"'],
                "a": ["Support a Street Kitchen", "Soup Kitchen in Cali", "$5 Per Hot Meal",
                      "Fund 450 Meals a Week", "Serving 3 Days a Week"],
                "b": ["El Calvario Street Kitchen", "Volunteers Cook, You Fund", "Firewood, Pots & Plates",
                      "Feed 150 People a Day", "Keep the Fires Lit"],
                "d": ["Volunteers cook over open fires in one of Cali's hardest neighbourhoods. $5 a meal.",
                      "Some ingredients are donated. Your gift buys the rest, at a price we publish."],
            },
        ],
    },
    {
        "name": "03 Education | Transformation Centers",
        "geo": "United States",
        "groups": [
            {
                "name": "Build a School",
                "url": "/centers/",
                "path": ("Centers", "Build-School"),
                "keywords": ['"build a school in colombia"', '"donate to build a school"', '"fund a school building"',
                             '"build a school abroad"', '"sponsor a school in colombia"', '"help build a school"',
                             '[build a school charity]'],
                "a": ["Build a School: $20,000", "Desks, Roof & Supplies", "School + Feeding Point",
                      "La Guajira & Cali Centers", "One Gift, One Building"],
                "b": ["Build a School in Colombia", "See the Last One We Built", "A Building That Lasts",
                      "Classroom, Kitchen & Hub", "Name the School You Fund"],
                "d": ["A complete rural Transformation Center costs $20,000, every exercise book included.",
                      "Cane walls, a metal roof, a poured slab and desks. Built in La Guajira and Cali."],
            },
            {
                "name": "Education Charity Colombia",
                "url": "/centers/",
                "path": ("Centers", "Education"),
                "keywords": ['"education charity colombia"', '"help children in colombia"', '"children education colombia"',
                             '"donate school supplies colombia"', '"colombia children charity"',
                             '"education for poor children in colombia"', '"la guajira children"'],
                "a": ["Schooling for Colombian Kids", "Donate School Supplies", "Classrooms in La Guajira",
                      "Help Children in Colombia", "Desks, Books & Teachers"],
                "b": ["Children Learn Here Now", "A School, Not a Promise", "From Dirt Floor to Desks",
                      "Learning in La Guajira", "Education That Stays"],
                "d": ["Transformation Centers are a school, a feeding point and a leadership hub in one.",
                      "Help children in La Guajira and Cali learn at real desks with real supplies."],
            },
        ],
    },
    {
        "name": "04 Relief | Colombia Earthquake",
        "geo": "United States",
        "groups": [
            {
                "name": "Colombia Earthquake Relief",
                "url": "/colombia/",
                "path": ("Colombia", "Earthquake"),
                "keywords": ['"colombia earthquake relief"', '"donate colombia earthquake"', '"help colombia earthquake victims"',
                             '"pereira earthquake relief"', '"risaralda earthquake donation"', '"colombia earthquake charity"',
                             '[how to help colombia earthquake]'],
                "a": ["Colombia Earthquake Relief", "$50 Feeds a Family", "11 Tons Delivered in Pereira",
                      "10 kg Family Food Packages", "Give Securely by Card"],
                "b": ["Help Earthquake Families", "Pereira & Chocó Relief", "On the Ground in Risaralda",
                      "Rice, Oil, Beans, Panela", "Families Still Rebuilding"],
                "d": ["One $50 package: ten kilos of rice, oil, pasta, beans and panela for a family.",
                      "11 tons of food and medicine already delivered in Pereira with local partners."],
            },
            {
                "name": "Family Relief Packages",
                "url": "/colombia/",
                "path": ("Colombia", "Relief"),
                "keywords": ['"family relief package"', '"send food to colombia"', '"disaster relief colombia donation"',
                             '"emergency food colombia"', '"sponsor a family in colombia"', '"humanitarian aid colombia"'],
                "a": ["Send a Relief Package: $50", "Food for a Family in Need", "Emergency Food, Colombia",
                      "1,000 Packages Underway", "Give by Card in Minutes"],
                "b": ["Feed a Family This Week", "Ten Kilos of Staples", "Disaster Relief in Colombia",
                      "Delivered by Local Teams", "Quibdó & Pereira Families"],
                "d": ["1,000 family packages for villages around Pereira; 120 families already reached in Quibdó.",
                      "Each package is ten kilos of staples delivered by local teams. $50, by secure card form."],
            },
        ],
    },
    {
        "name": "05 Volunteer | Serve",
        "geo": "United States",
        "groups": [
            {
                "name": "Volunteer in Colombia",
                "url": "/serve/",
                "path": ("Serve", "Colombia"),
                "keywords": ['"volunteer in colombia"', '"volunteer opportunities colombia"', '"mission trip colombia"',
                             '"volunteer abroad colombia"', '"teach in colombia volunteer"', '"volunteer medellin"',
                             '"volunteer cali colombia"'],
                "a": ["Volunteer in Colombia", "Distribution & Teaching Teams", "Serve in Cali or Medellín",
                      "Mission Trips to Colombia", "Tell Us What You Can Do"],
                "b": ["Serve Where It's Needed", "Honest Answer in a Week", "Colombia Needs Your Skills",
                      "Join a Distribution Team", "Mentor Young Leaders"],
                "d": ["Join distribution teams, teach or mentor in Colombia. We reply honestly within a week.",
                      "Tell us your skills and we will tell you, straight, whether and where we need them."],
            },
            {
                "name": "Remote Skilled Volunteering",
                "url": "/serve/",
                "path": ("Serve", "Remote"),
                "keywords": ['"remote volunteer nonprofit"', '"grant writing volunteer"', '"volunteer translator spanish"',
                             '"virtual volunteer opportunities"', '"skilled volunteer nonprofit"', '"volunteer from home nonprofit"'],
                "a": ["Volunteer From Home", "Grant Writing Volunteers", "Spanish Translators Needed",
                      "Design, Web & Accounting", "Skilled Volunteering"],
                "b": ["Use Your Skills for Good", "Remote Roles, Real Impact", "Help a Small Charity Grow",
                      "Translate, Write, Design", "We Read Every Application"],
                "d": ["Grant writing, translation, design, accounting and legal help — all from home.",
                      "A short, specific note about what you can do is all it takes to start."],
            },
        ],
    },
    {
        "name": "06 Faith | Missions Colombia",
        "geo": "United States",
        "groups": [
            {
                "name": "Christian Charity Colombia",
                "url": "/about/",
                "path": ("About", "Mission"),
                "keywords": ['"christian charity colombia"', '"christian missions colombia"', '"support missions in colombia"',
                             '"church planting colombia"', '"christian nonprofit latin america"', '"missionary work colombia"'],
                "a": ["Christian Missions Colombia", "Church Planting & Training", "Food, School & Leadership",
                      "Help Without Conditions", "Fund Ministry in Colombia"],
                "b": ["Faith in Action in Colombia", "Leaders Trained in Medellín", "Prison & Street Ministry",
                      "Serving the Hardest Places", "Local Churches, Real Help"],
                "d": ["We fund church planting, leadership training and practical help across Colombia.",
                      "Help is given on the basis of need. No one must take part in religious activity."],
            },
            {
                "name": "Prison & Leadership Ministry",
                "url": "/about/",
                "path": ("About", "Ministry"),
                "keywords": ['"prison ministry colombia"', '"support prison ministry"', '"youth leadership training colombia"',
                             '"leadership training latin america"', '"donate to prison ministry"'],
                "a": ["Prison Ministry in Colombia", "Inside Eight Prisons", "12-Week Leader Cohorts",
                      "40 Young Leaders in Medellín", "Restoration & Re-entry"],
                "b": ["Second Chances in Colombia", "Train the Next Leaders", "Men & Women Coming Home",
                      "Catalyst Leader Programme", "Faith That Rebuilds Lives"],
                "d": ["We work inside eight Colombian prisons with people preparing to return home.",
                      "Twelve-week Catalyst Leader cohorts train young leaders in Manrique, Medellín."],
            },
        ],
    },
]

SITELINKS = [  # inner pages, unique URLs (Ad Grants: at least 2 per campaign; we attach all at account level)
    ("Feed Someone for $5", "A hot meal in Cali", "150 people, 3 days a week", "/kitchen/"),
    ("Build a School", "$20,000, complete", "Desks, roof and supplies", "/centers/"),
    ("Earthquake Relief", "$50 family package", "Pereira and Chocó", "/colombia/"),
    ("Volunteer With Us", "In Colombia or remote", "Reply within a week", "/serve/"),
    ("Ways to Give", "Card, Zelle or cheque", "Every option priced", "/give/"),
    ("How We Handle Money", "Six commitments", "Candid transparency seal", "/about/"),
]
CALLOUTS = ["Tax-Deductible", "501(c)(3) Charity", "Candid Transparency Seal", "Run Locally in Colombia",
            "Prices Published", "Since 2018"]

NEGATIVES = {  # shared across all campaigns
    "Brand collisions": ["vmware", "vcf", "broadcom", "vsphere", "vcenter", "nsx", "vsan", "aria", "tanzu",
                         "cloud foundry", "software", "download", "license", "certification", "aws", "azure",
                         "google cloud", "openstack", "kubernetes", "linux foundation", "cncf", "saas", "hosting",
                         "storage", "computing", "server", "api", "devops", "architecture", "cloudflare"],
    "Not a donor": ["jobs", "job", "salary", "careers", "hiring", "internship", "paid", "scholarship",
                    "grant application", "apply for grant", "loan", "free food near me", "food bank near me",
                    "food stamps", "snap", "wic", "homework", "essay", "pdf", "wikipedia", "statistics"],
    "Wrong Colombia intent": ["travel", "flights", "hotel", "visa", "tour", "vacation", "dating", "girls",
                              "cartel", "narcos", "map", "weather", "coffee", "football", "soccer",
                              "news", "magnitude", "usgs", "live", "real estate", "nomad"],
}

ALL_HEADLINE_LIMIT, DESC_LIMIT, PATH_LIMIT = 30, 90, 15


def check(cond, msg):
    if not cond:
        sys.exit("LIMIT BROKEN: " + msg)


def kw_parts(k):
    if k.startswith("["):
        return k[1:-1], "Exact"
    if k.startswith('"'):
        return k[1:-1], "Phrase"
    return k, "Broad"


def write(name, header, rows):
    OUT.mkdir(parents=True, exist_ok=True)
    with open(OUT / name, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)
    print(f"{name}: {len(rows)} rows")


def main():
    camp_rows, kw_rows, ad_rows, neg_rows = [], [], [], []
    seen_kw = set()
    for c in CAMPAIGNS:
        check(len(c["groups"]) >= 2, f"{c['name']} needs >= 2 ad groups")
        camp_rows.append([c["name"], "Search", "Google search", DAILY_BUDGET, "Daily",
                          "Maximize conversions", "en", c["geo"], "Location of presence", "Enabled"])
        for g in c["groups"]:
            url = SITE + g["url"]
            for p in g["path"]:
                check(len(p) <= PATH_LIMIT, f"path '{p}' > {PATH_LIMIT}")
            for k in g["keywords"]:
                text, match = kw_parts(k)
                check(match != "Broad", f"broad keyword '{k}' — use phrase or exact")
                words = text.split()
                check(len(words) > 1 or text in BRAND_ONE_WORD_OK, f"single-word keyword '{k}'")
                check((text, match) not in seen_kw, f"duplicate keyword '{k}'")
                seen_kw.add((text, match))
                kw_rows.append([c["name"], g["name"], text, match, url, "Enabled"])
            for variant in ("a", "b"):
                heads = g[variant] + TRUST_HEADLINES + [h for h in g["b" if variant == "a" else "a"]][:6]
                heads = list(dict.fromkeys(heads))[:15]
                descs = g["d"] + TRUST_DESCRIPTIONS
                check(len(heads) >= 10, f"{g['name']} needs >= 10 headlines")
                for h in heads:
                    check(len(h) <= ALL_HEADLINE_LIMIT, f"headline '{h}' is {len(h)} chars")
                for d in descs:
                    check(len(d) <= DESC_LIMIT, f"description '{d}' is {len(d)} chars")
                # Ad A leads with the price angle, Ad B with the story angle, so the guard can compare them.
                ad_rows.append([c["name"], g["name"], "Responsive search ad", url, *g["path"],
                                *(heads + [""] * (15 - len(heads))), *descs, "Enabled"])
    for list_name, terms in NEGATIVES.items():
        for t in terms:
            neg_rows.append([list_name, t, "Phrase"])

    write("1-campaigns.csv", ["Campaign", "Campaign Type", "Networks", "Budget", "Budget type",
                              "Bid Strategy Type", "Languages", "Location", "Location targeting method", "Campaign Status"],
          camp_rows)
    write("2-keywords.csv", ["Campaign", "Ad group", "Keyword", "Criterion Type", "Final URL", "Status"], kw_rows)
    write("3-negative-keyword-lists.csv", ["Shared set name", "Keyword", "Match type"], neg_rows)
    write("4-responsive-search-ads.csv",
          ["Campaign", "Ad group", "Ad type", "Final URL", "Path 1", "Path 2"]
          + [f"Headline {i}" for i in range(1, 16)] + [f"Description {i}" for i in range(1, 5)]
          + ["Status"], ad_rows)
    for t, d1, d2, u in SITELINKS:
        check(len(t) <= 25 and len(d1) <= 35 and len(d2) <= 35, f"sitelink '{t}' too long")
    write("5-sitelinks-account.csv", ["Sitelink text", "Description line 1", "Description line 2", "Final URL"],
          [[t, d1, d2, SITE + u] for t, d1, d2, u in SITELINKS])
    for co in CALLOUTS:
        check(len(co) <= 25, f"callout '{co}' too long")
    write("6-callouts-account.csv", ["Callout text"], [[c] for c in CALLOUTS])


if __name__ == "__main__":
    main()
