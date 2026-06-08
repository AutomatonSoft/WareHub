def source_env_prefixes(*, namespace: str, site: str, site_key: str | None):
    """
    Build env prefix candidates for source DB credentials.
    Example namespace='JV', site='JV', site_key='JV_DE':
      JV_SOURCE_JV_DE_DB_
      JV_SOURCE_JV_JV_DE_DB_
      JV_SOURCE_JV_DB_
    """
    ns = str(namespace or "").strip().upper()
    site_norm = str(site or "").strip().upper()
    if site_key:
        key_norm = str(site_key).strip().upper()
        yield f"{ns}_SOURCE_{key_norm}_DB_"
        yield f"{ns}_SOURCE_{site_norm}_{key_norm}_DB_"
    yield f"{ns}_SOURCE_{site_norm}_DB_"
