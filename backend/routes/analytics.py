"""
Routes pour l'analyse Text-to-SQL.

Endpoints:
- POST /analyze - Analyse une question en langage naturel

Helpers exportés:
- call_llm_for_analytics - Appel LLM avec contexte conversationnel
- build_conversation_context - Construction du contexte depuis l'historique
"""

import logging
import time
from typing import Any

from fastapi import APIRouter, HTTPException

from catalog import get_messages
from core.query import build_filter_context, execute_query, should_disable_chart
from core.state import PromptNotConfiguredError, get_system_instruction
from i18n import t
from llm_service import LLMError, call_llm, check_llm_status
from llm_utils import parse_analytics_response
from routes.dependencies import (
    AnalysisFilters,
    AnalysisResponse,
    ChartConfig,
    PerformanceTimings,
    QuestionRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["analytics"])


def build_conversation_context(conversation_id: int | None, max_messages: int = 6) -> str:
    """Construit le contexte conversationnel à partir des messages précédents."""
    if not conversation_id:
        return ""

    messages = get_messages(conversation_id)
    if not messages:
        return ""

    # Limiter aux N derniers messages (paires question/réponse)
    recent_messages = messages[-max_messages:]
    if not recent_messages:
        return ""

    context_parts = ["HISTORIQUE DE LA CONVERSATION:"]
    for msg in recent_messages:
        role = "Utilisateur" if msg["role"] == "user" else "Assistant"
        content = msg["content"]
        # Pour les réponses assistant, inclure le SQL si présent (résumé)
        if msg["role"] == "assistant" and msg.get("sql_query"):
            sql_preview = (
                msg["sql_query"][:100] + "..." if len(msg["sql_query"]) > 100 else msg["sql_query"]
            )
            context_parts.append(f"{role}: {content}\n  SQL: {sql_preview}")
        else:
            context_parts.append(f"{role}: {content}")

    context_parts.append("")  # Ligne vide avant la nouvelle question
    return "\n".join(context_parts)


def call_llm_for_analytics(
    question: str,
    conversation_id: int | None = None,
    filters: AnalysisFilters | None = None,
    use_context: bool = False,
) -> dict[str, Any]:
    """Appelle le LLM pour générer SQL + message + config chart + métadonnées.

    Args:
        use_context: Si True, inclut l'historique de la conversation (stateful).
                    Par défaut False (stateless) pour économiser les tokens.
    """
    # Vérifier le statut LLM
    status = check_llm_status()
    if status["status"] != "ok":
        raise HTTPException(status_code=500, detail=status.get("message", t("llm.not_configured")))

    # Construire le contexte conversationnel (seulement si use_context=True)
    conversation_context = ""
    if use_context and conversation_id:
        conversation_context = build_conversation_context(conversation_id)

    # Construire le prompt avec les filtres
    filter_context = build_filter_context(filters)

    # Assembler le prompt complet
    prompt_parts = []
    if conversation_context:
        prompt_parts.append(conversation_context)
    prompt_parts.append(question)
    if filter_context:
        prompt_parts.append(filter_context)

    full_prompt = "\n".join(prompt_parts)

    # Appeler le LLM via llm_service
    try:
        response = call_llm(
            prompt=full_prompt,
            system_prompt=get_system_instruction(),
            source="analytics",
            conversation_id=conversation_id,
            temperature=0.1,
        )

        # Parser la réponse JSON (via llm_utils centralisé)
        content = response.content.strip() if response.content else ""
        parse_start = time.perf_counter()
        result = parse_analytics_response(content)
        parse_ms = int((time.perf_counter() - parse_start) * 1000)

        result["_metadata"] = {
            "model_name": response.model_name,
            "tokens_input": response.tokens_input,
            "tokens_output": response.tokens_output,
            "response_time_ms": response.response_time_ms,
            "llm_parse_ms": parse_ms,
        }
        return result

    except PromptNotConfiguredError as e:
        # Prompt non configuré en base
        logger.error("Prompt non configuré: %s", e.prompt_key)
        raise HTTPException(
            status_code=503,
            detail=f"Prompt '{e.prompt_key}' non configuré. Exécutez: python seed_prompts.py",
        ) from e

    except LLMError as e:
        # Erreur typée du service LLM - mapper via i18n
        logger.error("LLM Error: %s - %s", e.code.value, e.details)
        detail = t(e.code.value, provider=e.provider, error=e.details)
        raise HTTPException(status_code=500, detail=detail) from e


@router.post("/analyze", response_model=AnalysisResponse)
async def analyze(request: QuestionRequest) -> AnalysisResponse:
    """
    Analyse une question en langage naturel:
    1. Appelle le LLM pour générer SQL + message + config chart
    2. Exécute le SQL sur DuckDB
    3. Vérifie si le chart doit être désactivé (trop de données)
    4. Retourne le tout au frontend avec timings détaillés
    """
    total_start = time.perf_counter()

    try:
        # 1. Appeler le LLM avec les filtres
        llm_response = call_llm_for_analytics(request.question, filters=request.filters)

        sql = llm_response.get("sql", "")
        message = llm_response.get("message", "")
        chart = llm_response.get("chart") or {"type": "none", "x": None, "y": None, "title": ""}
        metadata = llm_response.get("_metadata", {})

        if not sql:
            raise HTTPException(status_code=400, detail=t("llm.no_sql_generated"))

        # 2. Exécuter le SQL avec timing
        sql_start = time.perf_counter()
        data = execute_query(sql)
        sql_exec_ms = int((time.perf_counter() - sql_start) * 1000)

        # 3. Vérifier si le chart doit être désactivé
        chart_disabled, chart_disabled_reason = should_disable_chart(len(data), chart.get("type"))

        # 4. Calculer le temps total
        total_ms = int((time.perf_counter() - total_start) * 1000)

        # 5. Construire les timings détaillés
        timings = PerformanceTimings(
            llm_call_ms=metadata.get("response_time_ms"),
            llm_parse_ms=metadata.get("llm_parse_ms"),
            sql_exec_ms=sql_exec_ms,
            total_ms=total_ms,
        )

        # Log des performances pour monitoring
        logger.info(
            "Performance: LLM=%dms, Parse=%dms, SQL=%dms, Total=%dms",
            timings.llm_call_ms or 0,
            timings.llm_parse_ms or 0,
            sql_exec_ms,
            total_ms,
        )

        # 6. Retourner la réponse complète avec métadonnées et timings
        return AnalysisResponse(
            message=message,
            sql=sql,
            chart=ChartConfig(**chart),
            data=data,
            chart_disabled=chart_disabled,
            chart_disabled_reason=chart_disabled_reason,
            model_name=metadata.get("model_name", "unknown"),
            tokens_input=metadata.get("tokens_input"),
            tokens_output=metadata.get("tokens_output"),
            response_time_ms=metadata.get("response_time_ms"),
            timings=timings,
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
