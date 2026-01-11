"""
Script d'enrichissement des commentaires avec Gemini 2.0 Flash.
Phase 3 du pipeline : Classification multi-label + Sentiment

Catégories (définies dans CLAUDE.md):
- PRIX_FACTURATION: écarts compteur, forfaits, tarifs
- CHAUFFEUR_COMPORTEMENT: politesse, attitude, communication
- CHAUFFEUR_CONDUITE: sécurité, vitesse, style de conduite
- VEHICULE_PROPRETE: odeur, saleté, hygiène
- VEHICULE_CONFORT: climatisation, espace, équipements
- PONCTUALITE: attente, retard, respect horaires
- TRAJET_ITINERAIRE: GPS, détours, choix du chemin
- APPLICATION: bugs, paiement, réservation app
- SERVICE_CLIENT: réclamation, contact, support
- ACCESSIBILITE: PMR, bagages, langue étrangère
"""

import json
import logging
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

import duckdb
from dotenv import load_dotenv

# Charger le .env du dossier backend
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

# Configuration logging avec flush automatique
LOG_DIR = os.path.join(os.path.dirname(__file__), "logs")
os.makedirs(LOG_DIR, exist_ok=True)
LOG_FILE = os.path.join(LOG_DIR, f"enrichment_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log")

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE, encoding='utf-8'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

def log(msg: str, level: str = "info"):
    """Log avec flush immédiat."""
    getattr(logger, level)(msg)
    sys.stdout.flush()

# Configuration
BATCH_SIZE = 20  # Commentaires par requête
PARALLEL_WORKERS = 5  # Nombre de requêtes API en parallèle
MAX_RETRIES = 3
RETRY_DELAY = 2  # secondes

CATEGORIES = [
    "PRIX_FACTURATION",
    "CHAUFFEUR_COMPORTEMENT",
    "CHAUFFEUR_CONDUITE",
    "VEHICULE_PROPRETE",
    "VEHICULE_CONFORT",
    "PONCTUALITE",
    "TRAJET_ITINERAIRE",
    "APPLICATION",
    "SERVICE_CLIENT",
    "ACCESSIBILITE"
]

SYSTEM_PROMPT = """Tu es un expert en analyse de verbatims clients pour une société de taxis (G7).

CATÉGORIES DISPONIBLES:
- PRIX_FACTURATION: tarifs, compteur, forfaits, écarts de prix, pourboire
- CHAUFFEUR_COMPORTEMENT: politesse, attitude, amabilité, communication, accueil
- CHAUFFEUR_CONDUITE: conduite, sécurité, vitesse, freinage, style au volant
- VEHICULE_PROPRETE: propreté, odeur, hygiène, saleté du véhicule
- VEHICULE_CONFORT: climatisation, espace, sièges, équipements, musique
- PONCTUALITE: attente, retard, arrivée à l'heure, respect des horaires
- TRAJET_ITINERAIRE: GPS, itinéraire, détours, connaissance de la ville
- APPLICATION: app mobile, réservation en ligne, paiement digital, bugs
- SERVICE_CLIENT: réclamation, contact, support, suivi dossier
- ACCESSIBILITE: PMR, bagages, animaux, langue étrangère, enfants

RÈGLES:
1. Un commentaire peut avoir PLUSIEURS catégories (multi-label)
2. Si le commentaire est positif général sans détail, utilise la catégorie principale évoquée
3. Le sentiment est entre -1 (très négatif) et +1 (très positif)
4. verbatim_cle = extrait le plus représentatif (max 50 mots)
5. Si pas de catégorie claire, retourne une liste vide

IMPORTANT: Réponds UNIQUEMENT en JSON valide, sans markdown ni commentaires."""

USER_PROMPT_TEMPLATE = """Analyse ces {count} commentaires clients et retourne un tableau JSON.

COMMENTAIRES:
{comments_json}

RÉPONSE ATTENDUE (JSON strict):
[
  {{
    "id": <id_commentaire>,
    "categories": ["CAT1", "CAT2"],
    "sentiment_global": <float -1 à +1>,
    "sentiment_par_categorie": {{"CAT1": <float>, "CAT2": <float>}},
    "verbatim_cle": "<extrait pertinent>"
  }},
  ...
]

Réponds UNIQUEMENT avec le JSON, sans aucun texte avant ou après."""


@dataclass
class EnrichmentResult:
    id: int
    categories: list[str]
    sentiment_global: float
    sentiment_par_categorie: dict[str, float]
    verbatim_cle: str


def check_llm_ready() -> bool:
    """Vérifie que le LLM est configuré."""
    from llm_service import check_llm_status
    status = check_llm_status()
    if status["status"] != "ok":
        log(f"LLM non configuré: {status.get('message')}", "error")
        return False
    log(f"LLM prêt: {status.get('model')}")
    return True


def enrich_batch(comments: list[dict]) -> list[EnrichmentResult]:
    """Enrichit un batch de commentaires via llm_service."""
    from llm_service import call_llm

    comments_json = json.dumps(
        [{"id": c["id"], "commentaire": c["commentaire"], "note": float(c["note"])}
         for c in comments],
        ensure_ascii=False,
        indent=2
    )

    prompt = USER_PROMPT_TEMPLATE.format(
        count=len(comments),
        comments_json=comments_json
    )

    for attempt in range(MAX_RETRIES):
        try:
            response = call_llm(
                prompt=prompt,
                system_prompt=SYSTEM_PROMPT,
                source="enrich_comments",
                temperature=0.1,
                max_tokens=4096
            )

            # Parser le JSON
            text = response.content.strip()
            # Nettoyer si markdown
            if text.startswith("```"):
                text = text.split("\n", 1)[1]
                if text.endswith("```"):
                    text = text.rsplit("```", 1)[0]

            results = json.loads(text)

            # Convertir en EnrichmentResult
            return [
                EnrichmentResult(
                    id=r["id"],
                    categories=r.get("categories", []),
                    sentiment_global=r.get("sentiment_global", 0.0),
                    sentiment_par_categorie=r.get("sentiment_par_categorie", {}),
                    verbatim_cle=r.get("verbatim_cle", "")
                )
                for r in results
            ]

        except json.JSONDecodeError as e:
            log(f"  Erreur JSON (tentative {attempt + 1}): {e}", "warning")
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY)
        except Exception as e:
            log(f"  Erreur API (tentative {attempt + 1}): {e}", "warning")
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY * 2)

    # Fallback: retourner des résultats vides
    return [
        EnrichmentResult(
            id=c["id"],
            categories=[],
            sentiment_global=0.0,
            sentiment_par_categorie={},
            verbatim_cle=""
        )
        for c in comments
    ]


DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "g7_analytics.duckdb")


def run_enrichment(
    db_path: str = DB_PATH,
    limit: Optional[int] = None,
    dry_run: bool = False
):
    """
    Lance l'enrichissement des commentaires.

    Args:
        db_path: Chemin vers la base DuckDB
        limit: Nombre max de commentaires à traiter (None = tous)
        dry_run: Si True, affiche les stats sans traiter
    """
    log("=" * 60)
    log("ENRICHISSEMENT DES COMMENTAIRES AVEC GEMINI 2.0 FLASH")
    log("=" * 60)
    log(f"Log file: {LOG_FILE}")

    # Connexion DuckDB (read-only pour dry_run)
    try:
        conn = duckdb.connect(db_path, read_only=dry_run)
    except Exception as e:
        if "lock" in str(e).lower():
            log("La base DuckDB est verrouillée par un autre processus.", "error")
            log("Arrêtez le backend FastAPI: pkill -f 'uvicorn main:app'", "error")
            return
        raise

    # Vérifier les colonnes existantes
    existing_cols = [r[0] for r in conn.execute("DESCRIBE evaluations").fetchall()]

    new_cols = [
        ("categories", "VARCHAR"),  # JSON array
        ("sentiment_global", "FLOAT"),
        ("sentiment_par_categorie", "VARCHAR"),  # JSON object
        ("verbatim_cle", "VARCHAR")
    ]

    # En dry_run, on affiche juste ce qu'il faudrait ajouter
    if dry_run:
        for col_name, col_type in new_cols:
            if col_name not in existing_cols:
                log(f"  [À ajouter] {col_name} ({col_type})")
    else:
        for col_name, col_type in new_cols:
            if col_name not in existing_cols:
                log(f"  Ajout colonne: {col_name} ({col_type})")
                conn.execute(f"ALTER TABLE evaluations ADD COLUMN {col_name} {col_type}")

    # Récupérer les commentaires à traiter
    # En dry_run, on vérifie si les colonnes existent déjà pour adapter la requête
    if "categories" in existing_cols:
        query = """
            SELECT num_course as id, commentaire, note_eval as note
            FROM evaluations
            WHERE commentaire IS NOT NULL
              AND LENGTH(commentaire) > 10
              AND (categories IS NULL OR categories = '' OR categories = '[]')
        """
    else:
        query = """
            SELECT num_course as id, commentaire, note_eval as note
            FROM evaluations
            WHERE commentaire IS NOT NULL
              AND LENGTH(commentaire) > 10
        """

    if limit:
        query += f" LIMIT {limit}"

    comments = conn.execute(query).fetchall()
    total = len(comments)
    num_batches = (total + BATCH_SIZE - 1) // BATCH_SIZE

    log(f"Commentaires à traiter: {total}")
    log(f"Taille des batchs: {BATCH_SIZE}")
    log(f"Nombre de requêtes API: {num_batches}")
    log(f"Coût estimé: ~{total * 0.00003:.2f} EUR (Gemini 2.0 Flash)")

    if dry_run:
        log("Mode DRY RUN - Aucune modification")
        conn.close()
        return

    # Vérifier que le LLM est prêt
    log("Vérification du LLM...")
    if not check_llm_ready():
        conn.close()
        return

    # Préparer tous les batches
    all_batches = []
    for i in range(0, total, BATCH_SIZE):
        batch = comments[i:i + BATCH_SIZE]
        batch_dicts = [
            {"id": c[0], "commentaire": c[1], "note": c[2]}
            for c in batch
        ]
        all_batches.append((i // BATCH_SIZE, batch_dicts))

    # Traiter en parallèle
    processed = 0
    errors = 0
    start_time = time.time()

    log(f"Lancement avec {PARALLEL_WORKERS} workers en parallèle...")

    def process_batch(batch_info):
        """Traite un batch et retourne (batch_num, results)."""
        batch_num, batch_dicts = batch_info
        results = enrich_batch(batch_dicts)
        return (batch_num, results)

    with ThreadPoolExecutor(max_workers=PARALLEL_WORKERS) as executor:
        futures = {executor.submit(process_batch, batch): batch[0] for batch in all_batches}

        for future in as_completed(futures):
            batch_num = futures[future]
            try:
                _, results = future.result()

                # Sauvegarder les résultats (séquentiel pour DuckDB)
                for r in results:
                    try:
                        conn.execute("""
                            UPDATE evaluations
                            SET categories = ?,
                                sentiment_global = ?,
                                sentiment_par_categorie = ?,
                                verbatim_cle = ?
                            WHERE num_course = ?
                        """, (
                            json.dumps(r.categories),
                            r.sentiment_global,
                            json.dumps(r.sentiment_par_categorie),
                            r.verbatim_cle,
                            r.id
                        ))
                        processed += 1
                    except Exception as e:
                        log(f"  Erreur sauvegarde ID {r.id}: {e}", "error")
                        errors += 1

                elapsed = time.time() - start_time
                batches_done = processed // BATCH_SIZE + 1
                eta = (elapsed / batches_done * num_batches - elapsed) if batches_done > 0 else 0
                log(f"Batch {batches_done}/{num_batches} terminé | {processed} traités | ETA: {eta:.0f}s")

            except Exception as e:
                log(f"  Erreur batch {batch_num}: {e}", "error")
                errors += BATCH_SIZE

    elapsed = time.time() - start_time

    log("=" * 60)
    log("RÉSUMÉ")
    log("=" * 60)
    log(f"Traités: {processed}")
    log(f"Erreurs: {errors}")
    log(f"Durée: {elapsed:.1f}s ({elapsed/total*1000:.0f}ms/commentaire)")

    # Stats finales
    stats = conn.execute("""
        SELECT
            COUNT(*) as enrichis,
            AVG(sentiment_global) as sentiment_moyen
        FROM evaluations
        WHERE categories IS NOT NULL AND categories != ''
    """).fetchone()

    if stats:
        log(f"Total enrichis: {stats[0]}")
        log(f"Sentiment moyen: {stats[1]:.2f}" if stats[1] else "Sentiment moyen: N/A")

    conn.close()
    log("Enrichissement terminé!")


def test_batch():
    """Test rapide sur 5 commentaires."""
    log("Test sur 5 commentaires...")

    # Vérifier que le LLM est prêt
    if not check_llm_ready():
        return

    conn = duckdb.connect(DB_PATH, read_only=True)

    samples = conn.execute("""
        SELECT num_course as id, commentaire, note_eval as note
        FROM evaluations
        WHERE commentaire IS NOT NULL
          AND LENGTH(commentaire) > 20
        ORDER BY RANDOM()
        LIMIT 5
    """).fetchall()

    conn.close()

    batch = [{"id": s[0], "commentaire": s[1], "note": float(s[2])} for s in samples]

    log("Commentaires à analyser:")
    for c in batch:
        log(f"  [{c['note']}] {c['commentaire'][:80]}...")

    log("Appel LLM...")
    results = enrich_batch(batch)

    log("Résultats:")
    for r in results:
        log(f"  ID: {r.id}")
        log(f"  Catégories: {r.categories}")
        log(f"  Sentiment: {r.sentiment_global:+.2f}")
        log(f"  Verbatim: {r.verbatim_cle[:60]}...")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        if sys.argv[1] == "test":
            test_batch()
        elif sys.argv[1] == "dry":
            run_enrichment(dry_run=True)
        elif sys.argv[1].isdigit():
            run_enrichment(limit=int(sys.argv[1]))
        else:
            log("Usage: python enrich_comments.py [test|dry|<limit>]")
    else:
        # Par défaut, traiter tous les commentaires
        run_enrichment()
