"""
Catalog - Gestion des métadonnées SQLite.

API publique stable pour backward compatibility.
Tous les imports `from catalog import X` continuent de fonctionner.
"""

# Datasources
from .datasources import add_datasource

# Datasets
from .datasets import (
    create_dataset,
    delete_dataset,
    get_active_dataset,
    get_dataset,
    get_datasets,
    set_active_dataset,
    update_dataset,
    update_dataset_stats,
)

# Tables
from .tables import (
    add_column,
    add_synonym,
    add_table,
    get_schema_for_llm,
    get_table_by_id,
    get_table_info,
    set_table_enabled,
    toggle_table_enabled,
)

# Conversations
from .conversations import (
    create_conversation,
    delete_all_conversations,
    delete_conversation,
    get_conversations,
)

# Messages
from .messages import add_message, get_messages

# Reports
from .reports import (
    delete_report,
    get_report_by_token,
    get_saved_reports,
    save_report,
    toggle_pin_report,
)

# Settings
from .settings import get_all_settings, get_setting, set_setting

# Widgets
from .widgets import (
    add_widget,
    clear_widget_cache,
    delete_all_widgets,
    get_widget_cache,
    get_widgets,
    set_widget_cache,
)

# Questions
from .questions import (
    add_suggested_question,
    delete_all_suggested_questions,
    get_suggested_questions,
)

# Jobs
from .jobs import (
    create_catalog_job,
    get_catalog_job,
    get_catalog_jobs,
    get_latest_run_id,
    get_run_jobs,
    reset_job_for_retry,
    update_job_result,
    update_job_status,
)

# Workflow
from .workflow import WorkflowManager, WorkflowStep

__all__ = [
    # Workflow
    "WorkflowManager",
    "WorkflowStep",
    "add_column",
    # Datasources
    "add_datasource",
    # Datasets
    "create_dataset",
    "delete_dataset",
    "get_active_dataset",
    "get_dataset",
    "get_datasets",
    "set_active_dataset",
    "update_dataset",
    "update_dataset_stats",
    # Messages
    "add_message",
    # Questions
    "add_suggested_question",
    "add_synonym",
    # Tables
    "add_table",
    # Widgets
    "add_widget",
    "clear_widget_cache",
    # Jobs
    "create_catalog_job",
    "reset_job_for_retry",
    # Conversations
    "create_conversation",
    "delete_all_conversations",
    "delete_all_suggested_questions",
    "delete_all_widgets",
    "delete_conversation",
    "delete_report",
    "get_all_settings",
    "get_catalog_job",
    "get_catalog_jobs",
    "get_conversations",
    "get_latest_run_id",
    "get_messages",
    "get_report_by_token",
    "get_run_jobs",
    "get_saved_reports",
    "get_schema_for_llm",
    # Settings
    "get_setting",
    "get_suggested_questions",
    "get_table_by_id",
    "get_table_info",
    "get_widget_cache",
    "get_widgets",
    # Reports
    "save_report",
    "set_setting",
    "set_table_enabled",
    "set_widget_cache",
    "toggle_pin_report",
    "toggle_table_enabled",
    "update_job_result",
    "update_job_status",
]
