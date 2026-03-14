import time

from django.core.management.base import BaseCommand
from django.db import connection
from django.db.utils import OperationalError


class Command(BaseCommand):
    help = "Wait for database to be available"

    def handle(self, *args, **options):
        self.stdout.write("Waiting for database...")
        for i in range(30):
            try:
                connection.ensure_connection()
                self.stdout.write(self.style.SUCCESS("Database available!"))
                return
            except OperationalError:
                self.stdout.write(f"Database unavailable, waiting... ({i + 1}/30)")
                time.sleep(1)
        self.stdout.write(self.style.ERROR("Database unavailable after 30s"))
        raise OperationalError("Could not connect to database")
