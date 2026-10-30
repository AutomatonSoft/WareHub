from django.db import models
import uuid


class KauflandPublication(models.Model):
    controller = models.CharField(max_length=2, choices=[("jv", "JV"), ("xl", "XL")])
    ean = models.CharField(max_length=64)
    submission_id = models.UUIDField(default=uuid.uuid4)
    online = models.BooleanField(default=False)
    errors = models.JSONField(default=list)
    submitted_at = models.DateTimeField()
    checked_at = models.DateTimeField(null=True)
    next_check_at = models.DateTimeField(null=True, db_index=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["controller", "ean"], name="kaufland_publication_controller_ean")]

class Product(models.Model):
    ean = models.CharField(max_length=13)
    controller = models.CharField(max_length=50)
    storefront = models.CharField(max_length=10)
    title = models.CharField(max_length=1000)
    id_product = models.CharField(max_length=50)
    id_unit = models.CharField(max_length=50)
    price = models.CharField(max_length=16)
    reference_price = models.CharField(max_length=16)
