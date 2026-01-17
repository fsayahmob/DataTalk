"""
Routes pour la gestion des conversations.

Endpoints:
- POST /conversations - Créer une conversation
- GET /conversations - Lister les conversations
- DELETE /conversations/{id} - Supprimer une conversation
- DELETE /conversations - Supprimer toutes les conversations
- GET /conversations/{id}/messages - Messages d'une conversation
- POST /conversations/{id}/analyze - Analyser dans une conversation
"""

import json
import logging
import time
from typing import Any

from fastapi import APIRouter, HTTPException

from catalog import (
    add_message,
    create_conversation,
    delete_all_conversations,
    delete_conversation,
    get_conversations,
    get_messages,
)
from core.error_sanitizer import sanitize_sql_error
from core.pagination import validate_pagination
from core.query import execute_query, should_disable_chart
from i18n import t
from routes.analytics import call_llm_for_analytics
from routes.dependencies import QuestionRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.post("")
async def create_new_conversation() -> dict[str, Any]:
    """Crée une nouvelle conversation."""
    conversation_id = create_conversation()
    return {"id": conversation_id, "message": t("conversation.created")}


@router.get("")
async def list_conversations(limit: int = 20, offset: int = 0) -> dict[str, Any]:
    """Liste les conversations récentes avec pagination."""
    limit, offset = validate_pagination(limit, offset)
    conversations = get_conversations(limit)
    return {"conversations": conversations, "limit": limit, "offset": offset}


@router.delete("/{conversation_id}")
async def remove_conversation(conversation_id: int) -> dict[str, str]:
    """Supprime une conversation et ses messages."""
    deleted = delete_conversation(conversation_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=t("conversation.not_found"))
    return {"message": t("conversation.deleted")}


@router.delete("")
async def remove_all_conversations() -> dict[str, Any]:
    """Supprime toutes les conversations et leurs messages."""
    deleted_count = delete_all_conversations()
    return {"message": f"{deleted_count} conversation(s) supprimée(s)", "count": deleted_count}


@router.get("/{conversation_id}/messages")
async def get_conversation_messages(conversation_id: int) -> dict[str, list[dict[str, Any]]]:
    """Récupère les messages d'une conversation."""
    messages = get_messages(conversation_id)
    return {"messages": messages}


@router.post("/{conversation_id}/analyze")
async def analyze_in_conversation(conversation_id: int, request: QuestionRequest) -> dict[str, Any]:
    """
    Analyse une question dans le contexte d'une conversation.
    Sauvegarde le message user et la réponse assistant.
    Inclut les timings détaillés pour le profiling.
    """
    total_start = time.perf_counter()

    try:
        # Sauvegarder le message user
        add_message(conversation_id=conversation_id, role="user", content=request.question)

        # Appeler le LLM avec les filtres et le mode contexte
        llm_response = call_llm_for_analytics(
            request.question, conversation_id, request.filters, use_context=request.use_context
        )

        sql = llm_response.get("sql", "")
        message = llm_response.get("message", "")
        chart = llm_response.get("chart") or {"type": "none", "x": None, "y": None, "title": ""}
        metadata = llm_response.get("_metadata", {})

        if not sql:
            # Le LLM n'a pas généré de SQL - retourner quand même le message
            total_ms = int((time.perf_counter() - total_start) * 1000)
            message_id = add_message(
                conversation_id=conversation_id,
                role="assistant",
                content=message or "Je n'ai pas compris votre demande.",
                model_name=metadata.get("model_name"),
                tokens_input=metadata.get("tokens_input"),
                tokens_output=metadata.get("tokens_output"),
                response_time_ms=metadata.get("response_time_ms"),
            )
            return {
                "message_id": message_id,
                "message": message or "Je n'ai pas compris votre demande.",
                "sql": "",
                "chart": {"type": "none", "x": None, "y": None, "title": ""},
                "data": [],
                "chart_disabled": False,
                "chart_disabled_reason": None,
                "model_name": metadata.get("model_name", "unknown"),
                "tokens_input": metadata.get("tokens_input"),
                "tokens_output": metadata.get("tokens_output"),
                "response_time_ms": metadata.get("response_time_ms"),
                "timings": {
                    "llm_call_ms": metadata.get("response_time_ms"),
                    "llm_parse_ms": metadata.get("llm_parse_ms"),
                    "sql_exec_ms": None,
                    "total_ms": total_ms,
                },
            }

        # Exécuter le SQL avec timing
        sql_start = time.perf_counter()
        try:
            data = execute_query(sql)
            sql_exec_ms = int((time.perf_counter() - sql_start) * 1000)
        except Exception as sql_exec_error:
            sql_exec_ms = int((time.perf_counter() - sql_start) * 1000)
            total_ms = int((time.perf_counter() - total_start) * 1000)
            # Erreur SQL - sanitizer pour éviter d'exposer des infos sensibles
            error_key = sanitize_sql_error(sql_exec_error)
            sql_error_str = t(error_key)
            message_id = add_message(
                conversation_id=conversation_id,
                role="assistant",
                content=message,
                sql_query=sql,
                model_name=metadata.get("model_name"),
                tokens_input=metadata.get("tokens_input"),
                tokens_output=metadata.get("tokens_output"),
                response_time_ms=metadata.get("response_time_ms"),
            )
            return {
                "message_id": message_id,
                "message": message,
                "sql": sql,
                "sql_error": sql_error_str,
                "chart": {"type": "none", "x": None, "y": None, "title": ""},
                "data": [],
                "chart_disabled": False,
                "chart_disabled_reason": None,
                "model_name": metadata.get("model_name", "unknown"),
                "tokens_input": metadata.get("tokens_input"),
                "tokens_output": metadata.get("tokens_output"),
                "response_time_ms": metadata.get("response_time_ms"),
                "timings": {
                    "llm_call_ms": metadata.get("response_time_ms"),
                    "llm_parse_ms": metadata.get("llm_parse_ms"),
                    "sql_exec_ms": sql_exec_ms,
                    "total_ms": total_ms,
                },
            }

        # Vérifier si le chart doit être désactivé
        chart_disabled, chart_disabled_reason = should_disable_chart(len(data), chart.get("type"))

        # Limiter les données pour le stockage (max 100 lignes)
        data_to_store = data[:100] if len(data) > 100 else data

        # Calculer le temps total
        total_ms = int((time.perf_counter() - total_start) * 1000)

        # Log des performances pour monitoring
        logger.info(
            "Performance [conv=%d]: LLM=%dms, Parse=%dms, SQL=%dms, Total=%dms",
            conversation_id,
            metadata.get("response_time_ms") or 0,
            metadata.get("llm_parse_ms") or 0,
            sql_exec_ms,
            total_ms,
        )

        # Sauvegarder la réponse assistant
        message_id = add_message(
            conversation_id=conversation_id,
            role="assistant",
            content=message,
            sql_query=sql,
            chart_config=json.dumps(chart),
            data_json=json.dumps(data_to_store),
            model_name=metadata.get("model_name"),
            tokens_input=metadata.get("tokens_input"),
            tokens_output=metadata.get("tokens_output"),
            response_time_ms=metadata.get("response_time_ms"),
        )

        return {
            "message_id": message_id,
            "message": message,
            "sql": sql,
            "chart": chart,
            "data": data,
            "chart_disabled": chart_disabled,
            "chart_disabled_reason": chart_disabled_reason,
            "model_name": metadata.get("model_name", "unknown"),
            "tokens_input": metadata.get("tokens_input"),
            "tokens_output": metadata.get("tokens_output"),
            "response_time_ms": metadata.get("response_time_ms"),
            "timings": {
                "llm_call_ms": metadata.get("response_time_ms"),
                "llm_parse_ms": metadata.get("llm_parse_ms"),
                "sql_exec_ms": sql_exec_ms,
                "total_ms": total_ms,
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
