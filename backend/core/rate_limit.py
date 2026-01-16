"""
Rate limiting pour les endpoints publics.

Utilise slowapi basé sur limits.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

# Limiter basé sur l'adresse IP
limiter = Limiter(key_func=get_remote_address)
