"""
Workflow manager for catalog operations.
"""

import logging

from .jobs import update_job_status

logger = logging.getLogger(__name__)


class WorkflowManager:
    """
    Gestionnaire de workflow qui garantit la mise à jour du statut avant/après chaque étape.

    Usage:
        workflow = WorkflowManager(job_id=123, total_steps=5)

        with workflow.step("extract_metadata"):
            # Faire le travail
            result = extract_metadata()

        with workflow.step("save_catalog"):
            # Faire le travail
            save_catalog(result)
    """

    def __init__(self, job_id: int, total_steps: int):
        self.job_id = job_id
        self.total_steps = total_steps
        self.current_step_index = 0

    def step(self, name: str) -> "WorkflowStep":
        """Retourne un context manager pour une étape du workflow."""
        return WorkflowStep(self, name)


class WorkflowStep:
    """Context manager pour une étape de workflow."""

    def __init__(self, manager: WorkflowManager, name: str):
        self.manager = manager
        self.name = name

    def __enter__(self) -> "WorkflowStep":
        """Marque l'étape comme 'running' AVANT son exécution."""
        update_job_status(
            job_id=self.manager.job_id,
            status="running",
            current_step=self.name,
            step_index=self.manager.current_step_index,
        )
        logger.info(
            "Step %d/%d: %s",
            self.manager.current_step_index + 1,
            self.manager.total_steps,
            self.name,
        )
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        _exc_tb: object,
    ) -> None:
        """
        Gère la fin de l'étape.
        - Si succès: incrémente le step_index
        - Si erreur: marque le job comme 'failed'
        """
        if exc_type is None:
            # Succès: passer à l'étape suivante
            self.manager.current_step_index += 1
        else:
            # Erreur: marquer le job comme failed
            error_msg = f"{exc_type.__name__}: {str(exc_val)[:200]}"
            update_job_status(job_id=self.manager.job_id, status="failed", error_message=error_msg)
            logger.error("Step failed: %s", error_msg)

        # Ne pas supprimer l'exception (return None = propagate)
