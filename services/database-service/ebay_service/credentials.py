import os

from cryptography.fernet import Fernet, InvalidToken

from .models import EbayOAuthCredential


class EbayCredentialError(RuntimeError):
    pass


def store_refresh_token(*, account: str, refresh_token: str) -> None:
    ciphertext = _fernet().encrypt(_required_token(refresh_token).encode("utf-8")).decode("ascii")
    EbayOAuthCredential.objects.update_or_create(account=account, defaults={"refresh_token_encrypted": ciphertext})


def load_refresh_token(*, account: str) -> str:
    credential = EbayOAuthCredential.objects.filter(account=account).only("refresh_token_encrypted").first()
    if credential is None:
        return (os.getenv(f"EBAY_{account.upper()}_REFRESH_TOKEN") or "").strip()
    try:
        return _fernet().decrypt(credential.refresh_token_encrypted.encode("ascii")).decode("utf-8")
    except (InvalidToken, UnicodeDecodeError) as error:
        raise EbayCredentialError("Stored eBay refresh token cannot be decrypted.") from error


def _fernet() -> Fernet:
    key = (os.getenv("EBAY_TOKEN_ENCRYPTION_KEY") or "").strip()
    if not key:
        raise EbayCredentialError("EBAY_TOKEN_ENCRYPTION_KEY is not configured.")
    try:
        return Fernet(key.encode("ascii"))
    except (TypeError, ValueError) as error:
        raise EbayCredentialError("EBAY_TOKEN_ENCRYPTION_KEY is invalid.") from error


def _required_token(value: str) -> str:
    token = str(value or "").strip()
    if not token:
        raise EbayCredentialError("eBay refresh token is empty.")
    return token
