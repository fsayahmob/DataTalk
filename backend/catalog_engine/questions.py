"""
Génération des questions suggérées.

Appels LLM pour génération, persistence.
"""

import logging
from typing import Any

logger = logging.getLogger(__name__)

from catalog import get_schema_for_llm
from db import get_connection
from llm_config import get_active_prompt
from llm_service import call_llm
from llm_utils import QuestionGenerationError, call_with_retry, parse_llm_json

from .models import ExtractedCatalog


def generate_suggested_questions(
    catalog: ExtractedCatalog, max_retries: int = 2
) -> list[dict[str, str]]:
    """
    Génère des questions suggérées basées sur le catalogue enrichi.

    Utilise le LLM pour analyser le schéma et proposer des questions
    pertinentes que l'utilisateur métier pourrait poser.

    Args:
        catalog: Catalogue enrichi avec descriptions
        max_retries: Nombre de tentatives en cas d'échec

    Returns:
        Liste de questions avec catégorie et icône

    Raises:
        QuestionGenerationError: Si la génération échoue après tous les retries
    """
    # catalog est passé mais non utilisé directement - on utilise get_schema_for_llm()
    # qui lit depuis PostgreSQL (après que les descriptions aient été sauvegardées)
    _ = catalog  # Pour éviter l'avertissement unused

    logger.info("Génération des questions suggérées")

    # Récupérer le schéma formaté
    schema = get_schema_for_llm()

    # Récupérer le prompt depuis la DB
    prompt_data = get_active_prompt("catalog_questions")
    if not prompt_data or not prompt_data.get("content"):
        raise QuestionGenerationError("Prompt 'catalog_questions' non trouvé")

    # Injecter le schéma dans le prompt (replace au lieu de format pour éviter
    # les conflits avec les accolades JSON dans le schéma)
    prompt = prompt_data["content"].replace("{schema}", schema)

    def _call_questions_llm() -> list[dict[str, Any]]:
        # Appeler le LLM
        response = call_llm(
            prompt=prompt,
            system_prompt="Tu es un expert en analyse de données. Réponds UNIQUEMENT en JSON valide.",
            source="catalog",
            temperature=0.7,  # Un peu de créativité pour varier les questions
        )

        # Parser avec le parser centralisé
        result = parse_llm_json(response.content, context="questions")
        questions: list[dict[str, Any]] = result.get("questions", [])

        # Vérifier qu'on a des questions
        if not questions:
            raise QuestionGenerationError("Aucune question dans la réponse JSON")

        logger.info("  %d questions générées", len(questions))
        return questions

    return call_with_retry(
        _call_questions_llm,
        max_retries=max_retries,
        error_class=QuestionGenerationError,
        context="Questions",
    )


def save_suggested_questions(questions: list[dict[str, str]]) -> dict[str, int]:
    """
    Sauvegarde les questions suggérées dans PostgreSQL.

    Args:
        questions: Liste de questions avec category et icon

    Returns:
        Stats de sauvegarde
    """
    if not questions:
        return {"questions": 0}

    conn = get_connection()
    cursor = conn.cursor()

    stats = {"questions": 0}

    # Vider les anciennes questions
    cursor.execute("DELETE FROM suggested_questions")

    # Insérer les nouvelles
    for i, q in enumerate(questions):
        try:
            cursor.execute(
                """
                INSERT INTO suggested_questions (question, category, icon, display_order, is_enabled)
                VALUES (%s, %s, %s, %s, TRUE)
            """,
                (q.get("question"), q.get("category"), q.get("icon"), i),
            )
            stats["questions"] += 1
        except Exception as e:
            logger.warning("Erreur sauvegarde question: %s", e)

    conn.commit()
    conn.close()
    return stats
