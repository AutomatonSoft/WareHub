from django.db import models


class EbayOAuthCredential(models.Model):
    account = models.CharField(max_length=32, unique=True)
    refresh_token_encrypted = models.TextField()
    updated_at = models.DateTimeField(auto_now=True)
