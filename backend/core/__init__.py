"""
Module core - État applicatif et utilitaires partagés.
"""

from core.state import app_state, get_duckdb_path, get_system_instruction, PromptNotConfiguredError
from core.query import execute_query, build_filter_context, should_disable_chart

__all__ = [
    "PromptNotConfiguredError",
    "app_state",
    "build_filter_context",
    "execute_query",
    "get_duckdb_path",
    "get_system_instruction",
    "should_disable_chart",
]
