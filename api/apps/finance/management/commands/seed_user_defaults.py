"""Seed default categories/tags for an existing user.

    python manage.py seed_user_defaults you@example.com
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from apps.finance.seed import seed_defaults


class Command(BaseCommand):
    help = "Create default categories and tags for a user."

    def add_arguments(self, parser):
        parser.add_argument("email", help="Email address of the user.")

    def handle(self, *args, **options):
        User = get_user_model()
        email = options["email"].strip().lower()
        user = User.objects.filter(email__iexact=email).first()
        if user is None:
            raise CommandError(f"No user with email {email!r}")
        seed_defaults(user)
        self.stdout.write(self.style.SUCCESS(f"Seeded defaults for {user.email}"))