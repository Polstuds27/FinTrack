"""Manual trigger for the background jobs the django-q2 scheduler normally runs.

    python manage.py run_jobs recurring
    python manage.py run_jobs alerts
    python manage.py run_jobs maintenance
    python manage.py run_jobs all
"""

from django.core.management.base import BaseCommand

from apps.tasks import (
    evaluate_alerts,
    generate_recurring_transactions,
    nightly_maintenance,
)

JOBS = {
    "recurring": generate_recurring_transactions,
    "alerts": evaluate_alerts,
    "maintenance": nightly_maintenance,
}


class Command(BaseCommand):
    help = "Run background jobs on demand (recurring generation, alerts, maintenance)."

    def add_arguments(self, parser):
        parser.add_argument(
            "job",
            choices=[*JOBS, "all"],
            help="Which job to run.",
        )

    def handle(self, *args, **options):
        name = options["job"]
        names = list(JOBS) if name == "all" else [name]
        for job_name in names:
            result = JOBS[job_name]()
            label = job_name.replace("_", " ")
            self.stdout.write(f"{label}: {result}")