from django.db import models

class Product(models.Model):
    ean = models.CharField(max_length=13)
    controller = models.CharField(max_length=50)
    storefront = models.CharField(max_length=10)
    title = models.CharField(max_length=1000)
    id_product = models.CharField(max_length=50)
    id_unit = models.CharField(max_length=50)
    price = models.CharField(max_length=16)
    reference_price = models.CharField(max_length=16)
