from contextlib import contextmanager
from hashlib import blake2b

from django.db import connections, transaction
from django.db.models import CharField, Exists, OuterRef, Q
from django.db.models.functions import Trim


EMPTY_EANS = {'', '0000000000000', 'B_WARE', 'B-WARE'}


class EanOwnershipConflict(ValueError):
    def __init__(self, ean, kid_id, kid_number):
        self.ean = ean
        self.kid_id = kid_id
        self.kid_number = kid_number
        super().__init__(f'EAN {ean} уже принадлежит другому товару: KID {kid_number} (ID {kid_id}).')


@contextmanager
def serialize_ean_ownership(values, using='default'):
    with transaction.atomic(using=using):
        connection = connections[using]
        if connection.vendor == 'postgresql':
            with connection.cursor() as cursor:
                for value in sorted(set(values) - {''}):
                    lock_id = int.from_bytes(blake2b(f'warehub:ean:{value}'.encode(), digest_size=8).digest(), signed=True)
                    cursor.execute('SELECT pg_advisory_xact_lock(%s)', [lock_id])
        yield


def ean_fields(model):
    return [field.name for field in model._meta.fields if isinstance(field, CharField)]


def normalized_ean(value):
    value = str(value or '').strip()
    return '' if value.upper() in EMPTY_EANS else value


def assert_ean_available(ean, *, kid_id=None, using='default'):
    from .models import Ean

    value = normalized_ean(ean)
    if not value:
        return
    fields = ean_fields(Ean)
    rows = Ean.objects.using(using).annotate(**{f'owned_{field}': Trim(field) for field in fields})
    match = Q()
    for field in fields:
        match |= Q(**{f'owned_{field}': value})
    if kid_id is not None:
        rows = rows.exclude(kid_id=kid_id)
    with serialize_ean_ownership([value], using):
        owner = rows.filter(match).values('kid_id', 'kid__kid_number').order_by('kid_id').first()
        if owner:
            raise EanOwnershipConflict(value, owner['kid_id'], owner['kid__kid_number'])


def unassigned_pool_items(queryset):
    from .models import Ean

    match = Q()
    fields = ean_fields(Ean)
    for field in fields:
        match |= Q(**{f'owned_{field}': OuterRef('ean')})
    owners = Ean.objects.using(queryset.db).annotate(**{f'owned_{field}': Trim(field) for field in fields}).filter(match)
    return queryset.annotate(has_ean_owner=Exists(owners)).filter(has_ean_owner=False)
