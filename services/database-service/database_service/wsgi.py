"""
WSGI config for database_service project.

It exposes the WSGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/6.0/howto/deployment/wsgi/
"""

import os

from django.core.wsgi import get_wsgi_application
from database_service.observability import configure_observability

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'database_service.settings')
configure_observability()

application = get_wsgi_application()
