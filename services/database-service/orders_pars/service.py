import os
import re
import logging
from datetime import datetime, timezone as dt_timezone
from http.cookiejar import MozillaCookieJar
from pathlib import Path
from urllib.parse import urljoin
from xml.sax.saxutils import escape
import xml.etree.ElementTree as ET
from html import unescape
from html.parser import HTMLParser

import requests
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

try:
    from django.utils import timezone as django_timezone
except Exception:  # noqa: BLE001
    logger.warning(
        "AFTERBUY_DJANGO_TIMEZONE_IMPORT_FAILED code=afterbuy_django_timezone_import_failed",
        exc_info=True,
    )
    django_timezone = None

BASE_DIR = Path(__file__).resolve().parent
SHARED_ENV_PATH = BASE_DIR.parent.parent.parent.parent / "sofortbot-infra" / ".env"
load_dotenv(dotenv_path=SHARED_ENV_PATH)
load_dotenv(dotenv_path=BASE_DIR / ".env")

API_URL = os.getenv("AFTERBUY_API_URL", "https://api.afterbuy.de/afterbuy/ABInterface.aspx")
XL_LOGIN_URL = os.getenv("AFTERBUY_XL_LOGIN_URL", "https://login.afterbuy.de/")
AUKTIONSLISTE_URL = os.getenv(
    "AFTERBUY_AUKTIONSLISTE_URL",
    "https://farm01.afterbuy.de/afterbuy/auktionsliste.aspx",
)
JV_LOGIN = os.getenv("AFTERBUY_JV_LOGIN")
JV_PASS = os.getenv("AFTERBUY_JV_PASS")
XL_LOGIN = os.getenv("AFTERBUY_XL_LOGIN")
XL_PASS = os.getenv("AFTERBUY_XL_PASS")
JV_COOKIE_CACHE_FILE = os.getenv("AFTERBUY_JV_COOKIE_CACHE_FILE", ".afterbuy_jv.cookie")
XL_COOKIE_CACHE_FILE = os.getenv("AFTERBUY_XL_COOKIE_CACHE_FILE", ".afterbuy_xl.cookie")
CH_COOKIE_CACHE_FILE = os.getenv("AFTERBUY_CH_COOKIE_CACHE_FILE", ".afterbuy_ch.cookie")
CONNECT_TIMEOUT = int(os.getenv("AFTERBUY_CONNECT_TIMEOUT", "8"))
READ_TIMEOUT = int(os.getenv("AFTERBUY_READ_TIMEOUT", "20"))
MAX_REDIRECTS = int(os.getenv("AFTERBUY_MAX_REDIRECTS", "15"))
REQUEST_TIMEOUT = (CONNECT_TIMEOUT, READ_TIMEOUT)
API_PROFILE = (os.getenv("AFTERBUY_API_PROFILE", "XL") or "XL").strip().upper()
DEFAULT_MAX_SOLD_ITEMS = int(os.getenv("AFTERBUY_MAX_SOLD_ITEMS", "100"))
MAX_FEDERATION_HOPS = int(os.getenv("AFTERBUY_MAX_FEDERATION_HOPS", "40"))
AFTERBUY_VERBOSE = (os.getenv("AFTERBUY_VERBOSE", "0") or "").strip().lower() in {"1", "true", "yes", "on"}


def env_first(*keys: str) -> str | None:
    for key in keys:
        value = os.getenv(key)
        if value is not None:
            value = value.strip()
            if value:
                return value
    return None


def parse_afterbuy_datetime(raw_date: str) -> datetime | None:
    raw_date = (raw_date or "").strip()
    if not raw_date:
        return None

    for fmt in ("%d.%m.%Y %H:%M:%S", "%d.%m.%Y %H:%M"):
        try:
            parsed = datetime.strptime(raw_date, fmt)
        except ValueError:
            continue

        if parsed.tzinfo is not None:
            return parsed

        if django_timezone is not None:
            try:
                return django_timezone.make_aware(parsed, django_timezone.get_default_timezone())
            except Exception:  # noqa: BLE001
                logger.warning(
                    "AFTERBUY_MAKE_AWARE_FAILED code=afterbuy_make_aware_failed",
                    exc_info=True,
                )

        return parsed.replace(tzinfo=dt_timezone.utc)

    return None


def has_token_auth() -> bool:
    partner_token = env_first("AFTERBUY_PARTNER_TOKEN", f"{API_PROFILE}_PARTNERTOKEN")
    account_token = env_first("AFTERBUY_ACCOUNT_TOKEN", f"{API_PROFILE}_ACCOUNTTOKEN")
    return bool(partner_token and account_token)


def get_login_credentials(profile: str) -> tuple[str | None, str | None]:
    profile = (profile or "").strip().upper()
    if profile == "JV":
        return env_first("AFTERBUY_JV_LOGIN", "JV_LOGIN"), env_first("AFTERBUY_JV_PASS", "JV_PASS")
    if profile == "XL":
        return env_first("AFTERBUY_XL_LOGIN", "XL_LOGIN"), env_first("AFTERBUY_XL_PASS", "XL_PASS")
    if profile == "CH":
        return env_first("AFTERBUY_CH_LOGIN", "AFTERBUY_СH_LOGIN", "CH_LOGIN"), env_first(
            "AFTERBUY_CH_PASS",
            "AFTERBUY_СH_PASS",
            "CH_PASS",
        )
    return None, None


def profile_has_login_credentials(profile: str) -> bool:
    login_user, login_pass = get_login_credentials(profile)
    return bool(login_user and login_pass)


def build_auth_xml() -> str:
    partner_token = env_first("AFTERBUY_PARTNER_TOKEN", f"{API_PROFILE}_PARTNERTOKEN")
    account_token = env_first("AFTERBUY_ACCOUNT_TOKEN", f"{API_PROFILE}_ACCOUNTTOKEN")

    partner_id = env_first(
        "AFTERBUY_PARTNER_ID",
        f"{API_PROFILE}_PARTNERID",
        "JV_PARTNERID",
        "XL_PARTNERID",
    )
    partner_password = env_first(
        "AFTERBUY_PARTNER_PASSWORD",
        "AFTERBUY_JV_PASS" if API_PROFILE == "JV" else "AFTERBUY_XL_PASS",
        "AFTERBUY_JV_PASS",
        "AFTERBUY_XL_PASS",
    )
    user_id = env_first(
        "AFTERBUY_USER_ID",
        "AFTERBUY_JV_LOGIN" if API_PROFILE == "JV" else "AFTERBUY_XL_LOGIN",
        "AFTERBUY_JV_LOGIN",
        "AFTERBUY_XL_LOGIN",
    )
    user_password = env_first(
        "AFTERBUY_USER_PASSWORD",
        "AFTERBUY_JV_PASS" if API_PROFILE == "JV" else "AFTERBUY_XL_PASS",
        "AFTERBUY_JV_PASS",
        "AFTERBUY_XL_PASS",
    )

    if partner_token and account_token:
        print(f"Using token auth profile: {API_PROFILE}")
        return (
            f"<PartnerToken>{escape(partner_token)}</PartnerToken>"
            f"<AccountToken>{escape(account_token)}</AccountToken>"
        )

    if not partner_id or not partner_password or not user_id or not user_password:
        raise RuntimeError(
            "Missing required env vars. Set token auth "
            "(AFTERBUY_PARTNER_TOKEN + AFTERBUY_ACCOUNT_TOKEN or "
            "JV_PARTNERTOKEN/JV_ACCOUNTTOKEN or XL_PARTNERTOKEN/XL_ACCOUNTTOKEN) "
            "or legacy auth (AFTERBUY_PARTNER_ID, AFTERBUY_PARTNER_PASSWORD, "
            "AFTERBUY_USER_ID, AFTERBUY_USER_PASSWORD)."
        )
    print(f"Using legacy auth profile: {API_PROFILE}")
    return (
        f"<PartnerID>{escape(partner_id)}</PartnerID>"
        f"<PartnerPassword>{escape(partner_password)}</PartnerPassword>"
        f"<UserID>{escape(user_id)}</UserID>"
        f"<UserPassword>{escape(user_password)}</UserPassword>"
    )


def extract_hidden_inputs(html: str) -> dict:
    hidden = {}
    pattern = re.compile(
        r'<input[^>]*type=["\']hidden["\'][^>]*name=["\']([^"\']+)["\'][^>]*>',
        re.IGNORECASE,
    )
    value_pattern = re.compile(r'value=["\']([^"\']*)["\']', re.IGNORECASE)

    for tag_match in pattern.finditer(html):
        full_tag = tag_match.group(0)
        name = tag_match.group(1)
        value_match = value_pattern.search(full_tag)
        hidden[name] = value_match.group(1) if value_match else ""
    return hidden


class _FormInputParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.form_action: str | None = None
        self.fields: dict[str, str] = {}

    def handle_starttag(self, tag: str, attrs):
        attr_map = dict(attrs)
        tag = tag.lower()
        if tag == "form" and self.form_action is None:
            self.form_action = attr_map.get("action")
        if tag == "input":
            name = attr_map.get("name")
            if name:
                self.fields[name] = attr_map.get("value", "")


def parse_form(html: str) -> tuple[str | None, dict]:
    parser = _FormInputParser()
    parser.feed(html)
    return parser.form_action, parser.fields


def extract_form_action(html: str) -> str | None:
    action, _ = parse_form(html)
    return action


def extract_form_fields(html: str) -> dict:
    _, fields = parse_form(html)
    return fields


def has_working_form(html: str) -> bool:
    return "<title>Working...</title>" in html and "<form" in html and "hiddenform" in html


def is_login_form_page(response: requests.Response) -> bool:
    text = response.text or ""
    return (
        "login.afterbuy.de" in response.url
        and "<form" in text
        and (
            'name="Username"' in text
            or 'id="Username"' in text
            or "/Account/Login" in response.url
        )
    )


def is_generic_login_form_page(response: requests.Response) -> bool:
    text = (response.text or "").lower()
    if "<form" not in text:
        return False
    url = response.url.lower()
    markers = (
        "account/login",
        "benutzer-login",
        'name="username"',
        'name="password"',
        'name="user"',
        'name="pass"',
        "art=login",
    )
    return any(marker in text or marker in url for marker in markers)


def inject_login_credentials(fields: dict, login_user: str, login_pass: str) -> dict:
    result = dict(fields)
    user_keys = ("Username", "username", "user", "UserID", "userid", "login", "Login")
    pass_keys = ("Password", "password", "pass", "pwd", "UserPassword", "userpassword")

    user_set = False
    for key in user_keys:
        if key in result:
            result[key] = login_user
            user_set = True
    if not user_set:
        result["Username"] = login_user

    pass_set = False
    for key in pass_keys:
        if key in result:
            result[key] = login_pass
            pass_set = True
    if not pass_set:
        result["Password"] = login_pass

    if "StaySignedIn" in result:
        result["StaySignedIn"] = "true"
    return result


def request_with_federation(
    session: requests.Session,
    method: str,
    url: str,
    *,
    params: dict | None = None,
    data: dict | None = None,
    auto_login: bool = True,
    login_user: str | None = None,
    login_pass: str | None = None,
) -> requests.Response:
    response = session.request(
        method=method.upper(),
        url=url,
        params=params,
        data=data,
        timeout=REQUEST_TIMEOUT,
        allow_redirects=False,
    )
    target_url = response.request.url
    login_attempts = 0

    for _ in range(MAX_FEDERATION_HOPS):
        if response.is_redirect or response.is_permanent_redirect:
            location = response.headers.get("Location")
            if not location:
                return response
            next_url = urljoin(response.url, location)
            if response.status_code in (307, 308):
                req_method = response.request.method.upper()
                req_body = response.request.body
                req_headers = {}
                content_type = response.request.headers.get("Content-Type")
                if content_type:
                    req_headers["Content-Type"] = content_type
                response = session.request(
                    method=req_method,
                    url=next_url,
                    data=req_body,
                    headers=req_headers or None,
                    timeout=REQUEST_TIMEOUT,
                    allow_redirects=False,
                )
            else:
                response = session.get(
                    next_url,
                    timeout=REQUEST_TIMEOUT,
                    allow_redirects=False,
                )
            continue

        if has_working_form(response.text):
            action = extract_form_action(response.text)
            if not action:
                return response
            fields = extract_form_fields(response.text)
            response = session.post(
                urljoin(response.url, action),
                data=fields,
                timeout=REQUEST_TIMEOUT,
                allow_redirects=False,
            )
            continue

        if auto_login and (is_login_form_page(response) or is_generic_login_form_page(response)):
            if not login_user or not login_pass:
                raise RuntimeError("Missing login credentials for federation handshake.")
            if login_attempts >= 5:
                raise RuntimeError("Login failed during federation handshake.")
            login_attempts += 1
            action = extract_form_action(response.text)
            if not action:
                raise RuntimeError("Login form action not found.")
            fields = extract_form_fields(response.text)
            fields = inject_login_credentials(fields, login_user, login_pass)
            response = session.post(
                urljoin(response.url, action),
                data=fields,
                timeout=REQUEST_TIMEOUT,
                allow_redirects=False,
            )
            continue

        if (not (response.text or "").strip()) and (
            "loginresult.aspx" in response.url.lower()
            or "logout.afterbuy.de/federation/index" in response.url.lower()
        ):
            response = session.get(
                target_url,
                timeout=REQUEST_TIMEOUT,
                allow_redirects=False,
            )
            continue

        return response

    raise RuntimeError(f"Too many federation hops (>{MAX_FEDERATION_HOPS}).")


def cookie_cache_path(profile: str = "XL") -> Path:
    profile = (profile or "").strip().upper()
    if profile == "JV":
        return BASE_DIR / JV_COOKIE_CACHE_FILE
    if profile == "CH":
        return BASE_DIR / CH_COOKIE_CACHE_FILE
    return BASE_DIR / XL_COOKIE_CACHE_FILE


def load_cookies(session: requests.Session, profile: str = "XL") -> None:
    path = cookie_cache_path(profile)
    if not path.exists():
        return
    jar = MozillaCookieJar(str(path))
    jar.load(ignore_discard=True, ignore_expires=True)
    for cookie in jar:
        session.cookies.set_cookie(cookie)


def save_cookies(session: requests.Session, profile: str = "XL") -> None:
    jar = MozillaCookieJar(str(cookie_cache_path(profile)))
    for cookie in session.cookies:
        jar.set_cookie(cookie)
    jar.save(ignore_discard=True, ignore_expires=True)


def is_login_successful(response: requests.Response) -> bool:
    page = response.text.lower()
    url = response.url.lower()

    if "/account/login" in url and "name=\"username\"" in page and "name=\"password\"" in page:
        return False

    error_markers = (
        "ungültig",
        "falsches passwort",
        "anmeldung fehlgeschlagen",
        "invalid",
        "error",
    )
    if any(marker in page for marker in error_markers):
        return False

    success_markers = ("abmelden", "logout", "mein konto", "dashboard")
    if any(marker in page for marker in success_markers):
        return True

    return len(response.cookies) > 0 or len(response.history) > 0


def follow_redirects(
    session: requests.Session,
    response: requests.Response,
) -> requests.Response:
    redirects = 0
    seen_urls: set[str] = set()
    while response.is_redirect or response.is_permanent_redirect:
        if redirects >= MAX_REDIRECTS:
            raise RuntimeError(f"Too many redirects during XL login (>{MAX_REDIRECTS}).")
        location = response.headers.get("Location")
        if not location:
            break
        next_url = urljoin(response.url, location)
        if next_url in seen_urls:
            raise RuntimeError("Redirect loop detected during XL login.")
        seen_urls.add(next_url)
        response = session.get(
            next_url,
            timeout=REQUEST_TIMEOUT,
            allow_redirects=False,
        )
        redirects += 1
    return response


def _prepare_login_page(session: requests.Session) -> requests.Response:
    response = session.get(
        XL_LOGIN_URL,
        timeout=REQUEST_TIMEOUT,
        allow_redirects=False,
    )
    response = follow_redirects(session, response)
    response.raise_for_status()
    return response


def login_xl(session: requests.Session, allow_retry: bool = True) -> None:
    if not XL_LOGIN_URL:
        return
    if not XL_LOGIN or not XL_PASS:
        raise RuntimeError("Missing AFTERBUY_XL_LOGIN or AFTERBUY_XL_PASS in .env")

    session.max_redirects = MAX_REDIRECTS

    if allow_retry:
        try:
            load_cookies(session)
        except Exception:
            logger.warning(
                "AFTERBUY_LOAD_COOKIES_FAILED code=afterbuy_load_cookies_failed",
                exc_info=True,
            )
            session.cookies.clear()

    try:
        page_response = _prepare_login_page(session)
    except RuntimeError as exc:
        if allow_retry:
            session.cookies.clear()
            return login_xl(session, allow_retry=False)
        raise exc

    if is_login_successful(page_response):
        print("XL login OK (cookie cache)")
        return

    # Stale cookies can cause SSO redirect loops.
    session.cookies.clear()
    page_response = _prepare_login_page(session)

    action = extract_form_action(page_response.text)
    login_post_url = urljoin(page_response.url, action or "")
    if not login_post_url:
        login_post_url = page_response.url

    hidden_inputs = extract_hidden_inputs(page_response.text)

    payload = {
        **hidden_inputs,
        "Username": XL_LOGIN,
        "Password": XL_PASS,
        "StaySignedIn": "true",
    }
    login_response = session.post(
        login_post_url,
        data=payload,
        timeout=REQUEST_TIMEOUT,
        allow_redirects=False,
    )
    login_response = follow_redirects(session, login_response)
    login_response.raise_for_status()
    if is_login_successful(login_response):
        save_cookies(session)
        print("XL login OK")
        return

    if allow_retry:
        session.cookies.clear()
        return login_xl(session, allow_retry=False)

    raise RuntimeError(
        "XL login failed. Check AFTERBUY_XL_LOGIN / AFTERBUY_XL_PASS "
        "or verify account access at login.afterbuy.de."
    )


def request_get_sold_items(session: requests.Session, max_sold_items: int = DEFAULT_MAX_SOLD_ITEMS) -> None:
    auth_xml = build_auth_xml()
    max_sold_items = max(1, min(int(max_sold_items), 500))
    xml_data = f"""<?xml version="1.0" encoding="utf-8"?>
<Request>
    <AfterbuyGlobal>
        {auth_xml}
        <CallName>GetSoldItems</CallName>
        <DetailLevel>0</DetailLevel>
        <ErrorLanguage>DE</ErrorLanguage>
    </AfterbuyGlobal>
    <DataFilter />
    <MaxSoldItems>{max_sold_items}</MaxSoldItems>
    <ReturnHiddenItems>1</ReturnHiddenItems>
</Request>
"""
    headers = {"Content-Type": "application/xml; charset=utf-8"}
    response = session.post(
        API_URL,
        data=xml_data.encode("utf-8"),
        headers=headers,
        timeout=REQUEST_TIMEOUT,
    )
    return response


def _text(parent: ET.Element | None, path: str) -> str:
    if parent is None:
        return ""
    node = parent.find(path)
    if node is None or node.text is None:
        return ""
    return node.text.strip()


def extract_afterbuy_error(xml_payload: str) -> str | None:
    try:
        root = ET.fromstring(xml_payload)
    except ET.ParseError:
        return "Afterbuy returned invalid XML payload."

    call_status = (_text(root, "CallStatus") or "").lower()
    if call_status != "error":
        return None

    errors = []
    for err in root.findall(".//ErrorList/Error"):
        desc = _text(err, "ErrorDescription")
        if desc:
            errors.append(desc)
    if errors:
        return "; ".join(errors)
    return "Unknown Afterbuy API error."


def parse_sold_items(xml_payload: str) -> list[dict]:
    root = ET.fromstring(xml_payload)
    items: list[dict] = []

    for order in root.findall(".//Orders/Order"):
        billing = order.find("BuyerInfo/BillingAddress")
        first_name = _text(billing, "FirstName")
        last_name = _text(billing, "LastName")
        company = _text(billing, "Company")
        kundenname = " ".join(part for part in [first_name, last_name] if part).strip()
        if not kundenname:
            kundenname = company

        common = {
            "order_id": _text(order, "OrderID"),
            "ebay_account": _text(order, "EbayAccount"),
            "order_date": _text(order, "OrderDate"),
            "afterbuy_user_id": _text(billing, "AfterbuyUserID"),
            "afterbuy_user_id_alt": _text(billing, "AfterbuyUserIDAlt"),
            "user_id_platform": _text(billing, "UserIDPlattform"),
            "buyer_first_name": first_name,
            "buyer_last_name": last_name,
            "buyer_company": company,
            "buyer_email": _text(billing, "Mail"),
            "kundenname": kundenname,
            "kundennummer": _text(billing, "AfterbuyUserID") or _text(billing, "UserIDPlattform"),
        }

        sold_items = order.findall("SoldItems/SoldItem")
        if not sold_items:
            continue

        for sold_item in sold_items:
            items.append(
                {
                    **common,
                    "item_id": _text(sold_item, "ItemID"),
                    "platform_item_id": _text(sold_item, "PlatformSpecificItemId"),
                    "platform_order_id": _text(sold_item, "PlatformSpecificOrderId"),
                    "anr": _text(sold_item, "Anr"),
                    "item_title": _text(sold_item, "ItemTitle"),
                    "item_quantity": _text(sold_item, "ItemQuantity"),
                    "item_price": _text(sold_item, "ItemPrice"),
                }
            )

    return items


def _contains(haystack: str, needle: str) -> bool:
    return needle.lower() in haystack.lower()


def filter_items(
    items: list[dict],
    *,
    ebay: str = "",
    kundenname: str = "",
    kundennummer: str = "",
) -> list[dict]:
    result: list[dict] = []
    ebay = ebay.strip()
    kundenname = kundenname.strip()
    kundennummer = kundennummer.strip()

    for item in items:
        if ebay and not _contains(item.get("ebay_account", ""), ebay):
            continue

        if kundenname:
            name_candidates = [
                item.get("kundenname", ""),
                " ".join(
                    part
                    for part in [item.get("buyer_first_name", ""), item.get("buyer_last_name", "")]
                    if part
                ),
                item.get("buyer_company", ""),
                item.get("buyer_email", ""),
            ]
            if not any(_contains(candidate, kundenname) for candidate in name_candidates if candidate):
                continue

        if kundennummer:
            number_candidates = [
                item.get("kundennummer", ""),
                item.get("afterbuy_user_id", ""),
                item.get("afterbuy_user_id_alt", ""),
                item.get("user_id_platform", ""),
            ]
            if not any(_contains(candidate, kundennummer) for candidate in number_candidates if candidate):
                continue

        result.append(item)

    return result


def search_items(
    *,
    ebay: str = "",
    kundenname: str = "",
    kundennummer: str = "",
    max_sold_items: int = DEFAULT_MAX_SOLD_ITEMS,
) -> list[dict]:
    if not (ebay.strip() or kundenname.strip() or kundennummer.strip()):
        raise RuntimeError("Pass at least one filter: ebay, kundenname or kundennummer.")

    session = requests.Session()
    if has_token_auth():
        print("Skip XL login: token auth is enabled.")
    else:
        login_xl(session)

    response = request_get_sold_items(session, max_sold_items=max_sold_items)
    response.raise_for_status()

    error_message = extract_afterbuy_error(response.text)
    if error_message:
        raise RuntimeError(error_message)

    items = parse_sold_items(response.text)
    return filter_items(
        items,
        ebay=ebay,
        kundenname=kundenname,
        kundennummer=kundennummer,
    )


def _build_auktionsliste_params(
    *,
    ebay: str = "",
    kundenname: str = "",
    kundennummer: str = "",
    max_total: int = 500,
    max_items_per_page: int = 10,
    show_hidden: bool = True,
) -> dict[str, str]:
    query = (kundennummer or ebay or kundenname).strip()
    return {
        "AWebayname": query,
        "AWFilter": "0",
        "AWSuchwort": kundenname.strip(),
        "AWRENummer": "",
        "AWshowall": "ON" if show_hidden else "",
        "AWFilter2": "0",
        "awmaxart": str(max(1, min(max_items_per_page, 100))),
        "maxgesamt": str(max(1, min(max_total, 5000))),
        "AWEmail": "",
        "AWDatumVon": "",
        "AWDatumBis": "",
        "AWBezug": "EndeDerAuktion",
        "AWPLZ": "",
        "AWBetrag": "",
        "AWBetragBezug": "1",
        "AWStammID": "",
        "awCountryGroup": "",
        "AWLaenderkennung": "",
        "AWLaenderkennungBezug": "rechnung",
        "AWLabelDynSearchField1": "ShippingAddress",
        "AWDynSearchField1": "",
        "AWeBaySubAccount": "-1",
        "AWLabelDynSearchField2": "PaymentStatus",
        "AWDynSearchField2": "",
        "AWDynamicSorting": "0",
        "AWLabelDynSearchField3": "PaymentShipMethod",
        "AWDynSearchField3": "",
        "searchUserTag1": "0",
        "searchUserTag2": "0",
        "searchUserTag3": "0",
        "searchUserTag4": "0",
        "killordersession": "0",
        "art": "SetAuswahl",
    }


def fetch_auktionsliste_html(
    *,
    ebay: str = "",
    kundenname: str = "",
    kundennummer: str = "",
    max_total: int = 500,
    max_items_per_page: int = 10,
    show_hidden: bool = True,
    login_profile: str = "JV",
    force_relogin: bool = False,
) -> str:
    if not (ebay.strip() or kundenname.strip() or kundennummer.strip()):
        raise RuntimeError("Pass at least one filter: ebay, kundenname or kundennummer.")

    login_profile = (login_profile or "").strip().upper()
    login_user, login_pass = get_login_credentials(login_profile)
    if not login_user or not login_pass:
        raise RuntimeError(f"Missing {login_profile} login credentials in .env")

    session = requests.Session()
    if force_relogin:
        session.cookies.clear()
        try:
            cookie_cache_path(login_profile).unlink(missing_ok=True)
        except OSError:
            logger.warning(
                "AFTERBUY_COOKIE_DELETE_FAILED code=afterbuy_cookie_delete_failed profile=%s",
                login_profile,
                exc_info=True,
            )

    params = _build_auktionsliste_params(
        ebay=ebay,
        kundenname=kundenname,
        kundennummer=kundennummer,
        max_total=max_total,
        max_items_per_page=max_items_per_page,
        show_hidden=show_hidden,
    )
    response = request_with_federation(
        session,
        "GET",
        AUKTIONSLISTE_URL,
        params=params,
        login_user=login_user,
        login_pass=login_pass,
    )
    response.raise_for_status()
    return response.text


def _extract_labeled_value(html: str, label: str) -> str:
    escaped_label = re.escape(label)
    patterns = [
        rf"<(?:td|th)[^>]*>\s*{escaped_label}\s*:?\s*</(?:td|th)>\s*<(?:td|th)[^>]*>(?P<value>.*?)</(?:td|th)>",
        rf"{escaped_label}\s*:?\s*&nbsp;\s*(?P<value>[^<\r\n]+)",
        rf"{escaped_label}.{{0,400}}?<input[^>]*value=[\"'](?P<value>[^\"']+)[\"']",
        rf"{escaped_label}\s*:?\s*(?P<value>[^<\r\n]+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, html, flags=re.IGNORECASE | re.DOTALL)
        if not match:
            continue
        value = _strip_tags(match.group("value"))
        if value:
            return value
    return ""


def _extract_item_section(html: str, item_id: str | None) -> str:
    if not item_id:
        return html
    marker_match = re.search(
        rf'name="id_fsp"[^>]*value="{re.escape(item_id)}"|value="{re.escape(item_id)}"[^>]*name="id_fsp"',
        html,
        flags=re.IGNORECASE,
    )
    if not marker_match:
        return html

    marker_pos = marker_match.start()
    section_start = html.rfind('<div class="panel panel-default">', 0, marker_pos)
    if section_start < 0:
        section_start = max(0, marker_pos - 4000)

    section_end = html.find('<div class="panel panel-default">', marker_pos + 1)
    if section_end < 0:
        section_end = html.find('<input type="hidden" name="temp_counter"', marker_pos)
    if section_end < 0:
        section_end = min(len(html), marker_pos + 4000)

    return html[section_start:section_end]


def _extract_sum_with_currency(html: str, field_name: str) -> str:
    value_match = re.search(
        rf'name="{re.escape(field_name)}"[^>]*value="([^"]+)"',
        html,
        flags=re.IGNORECASE,
    )
    if not value_match:
        return ""
    amount = _strip_tags(value_match.group(1))
    after = html[value_match.end() : value_match.end() + 500]
    currency_match = re.search(r"<span[^>]*>\s*([A-Z]{3})\s*</span>", after, flags=re.IGNORECASE)
    if currency_match:
        currency = _strip_tags(currency_match.group(1)).upper()
        return f"{amount} {currency}".strip()
    return amount


def _extract_textarea_value(html: str, field_name: str) -> str:
    match = re.search(
        rf'<textarea[^>]*name="{re.escape(field_name)}"[^>]*>(.*?)</textarea>',
        html,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if not match:
        return ""
    value = unescape(match.group(1))
    value = value.replace("\r\n", "\n").replace("\r", "\n").strip()
    return value


def _normalize_sku(raw_value: str) -> str:
    value = _strip_tags(raw_value or "")
    if not value:
        return ""

    chunks = [chunk.strip() for chunk in re.split(r"[,\n;]+", value) if chunk and chunk.strip()]
    cleaned: list[str] = []
    seen: set[str] = set()

    for chunk in chunks:
        normalized = chunk.strip()
        lowered = normalized.lower()
        if "alternative artikelnummer" in lowered:
            continue
        if lowered in {"-", "n/a", "none", "keine"}:
            continue
        key = normalized.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(normalized)

    return ", ".join(cleaned)


def parse_order_detail_fields(html: str, *, item_id: str | None = None) -> dict[str, str]:
    item_section = _extract_item_section(html, item_id)
    sku_match = re.search(r"SKU:\s*([^<\r\n]+)", item_section, flags=re.IGNORECASE)
    verkaufsdatum_match = re.search(
        r"Verkaufsdatum\s*<strong>([^<]+)</strong>",
        item_section,
        flags=re.IGNORECASE,
    )

    zahlungssumme = _extract_sum_with_currency(html, "zahlung")
    if not zahlungssumme:
        zahlungssumme = _extract_labeled_value(html, "Zahlungssumme")

    rechnungssumme_match = re.search(
        r">Rechnungssumme</td>\s*<td[^>]*>(.*?)</td>",
        html,
        flags=re.IGNORECASE | re.DOTALL,
    )
    rechnungssumme = _strip_tags(rechnungssumme_match.group(1)) if rechnungssumme_match else ""
    if not rechnungssumme:
        rechnungssumme = _extract_labeled_value(html, "Rechnungssumme")
    memo = _extract_textarea_value(html, "Memo")

    sku_value = _normalize_sku(
        _strip_tags(sku_match.group(1)) if sku_match else _extract_labeled_value(item_section, "SKU")
    )
    if not sku_value:
        sku_value = _normalize_sku(_extract_labeled_value(item_section, "Art.-Nr."))

    fields = {
        "sku": sku_value,
        "verkaufsdatum": (
            _strip_tags(verkaufsdatum_match.group(1))
            if verkaufsdatum_match
            else _extract_labeled_value(item_section, "Verkaufsdatum")
        ),
        "zahlungssumme": zahlungssumme,
        "rechnungssumme": rechnungssumme,
        "memo": memo,
    }
    return fields


def _fetch_order_details_with_session(
    session: requests.Session,
    order_id: str,
    *,
    login_user: str,
    login_pass: str,
) -> dict[str, str]:
    response = request_with_federation(
        session,
        "GET",
        AUKTIONSLISTE_URL,
        params={
            "art": "edit",
            "id": order_id,
            "rsposition": "0",
            "ref": "/afterbuy/auktionsliste.aspx",
        },
        login_user=login_user,
        login_pass=login_pass,
    )
    response.raise_for_status()
    return parse_order_detail_fields(response.text, item_id=order_id)


def fetch_order_details_by_id(
    order_id: str,
    *,
    login_profile: str = "JV",
    force_relogin: bool = False,
) -> dict[str, str]:
    order_id = str(order_id).strip()
    if not order_id:
        return {
            "sku": "",
            "verkaufsdatum": "",
            "zahlungssumme": "",
            "rechnungssumme": "",
            "memo": "",
        }

    login_profile = (login_profile or "").strip().upper()
    login_user, login_pass = get_login_credentials(login_profile)
    if not login_user or not login_pass:
        raise RuntimeError(f"Missing {login_profile} login credentials in .env")

    session = requests.Session()
    if force_relogin:
        session.cookies.clear()
        try:
            cookie_cache_path(login_profile).unlink(missing_ok=True)
        except OSError:
            logger.warning(
                "AFTERBUY_COOKIE_DELETE_FAILED code=afterbuy_cookie_delete_failed profile=%s",
                login_profile,
                exc_info=True,
            )

    return _fetch_order_details_with_session(
        session,
        order_id,
        login_user=login_user,
        login_pass=login_pass,
    )


def enrich_items_with_order_details(items: list[dict], *, login_profile: str) -> list[dict]:
    login_profile = (login_profile or "").strip().upper()
    login_user, login_pass = get_login_credentials(login_profile)
    if not login_user or not login_pass:
        for item in items:
            item["detail_error"] = f"Missing {login_profile} login credentials in .env"
        return items

    session = requests.Session()
    for item in items:
        for key in ("sku", "verkaufsdatum", "zahlungssumme", "rechnungssumme", "memo"):
            item.setdefault(key, "")

        order_id = str(item.get("order_id") or "").strip()
        if not order_id:
            continue

        try:
            details = _fetch_order_details_with_session(
                session,
                order_id,
                login_user=login_user,
                login_pass=login_pass,
            )
        except (requests.RequestException, RuntimeError) as exc:
            item["detail_error"] = str(exc)
            continue

        for key, value in details.items():
            if value:
                item[key] = value
    return items


def _strip_tags(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", text)
    text = unescape(text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _order_group_date(raw_value: str) -> str:
    raw_value = (raw_value or "").strip()
    if not raw_value:
        return ""
    date_match = re.match(r"^(\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2})", raw_value)
    if date_match:
        return date_match.group(1)
    return raw_value


def _item_group_key(item: dict) -> tuple[str, str, str, str, str]:
    return (
        str(item.get("kundennummer") or "").strip(),
        _order_group_date(str(item.get("verkaufsdatum") or item.get("order_date") or "")),
        str(item.get("zahlungssumme") or "").strip(),
        str(item.get("rechnungssumme") or "").strip(),
        str(item.get("memo") or "").strip(),
    )


def _parse_order_datetime(value: str) -> datetime | None:
    value = _order_group_date(value)
    if not value:
        return None
    try:
        return datetime.strptime(value, "%d.%m.%Y %H:%M")
    except ValueError:
        return None


def _extract_reference_number(text: str) -> str:
    match = re.search(r"\b(?:re[-.\s]*)?nr\.?\s*(\d+)\b", text, flags=re.IGNORECASE)
    return match.group(1) if match else ""


def _is_additional_service_item(item: dict) -> bool:
    title = str(item.get("title") or "").strip().lower()
    memo = str(item.get("memo") or "").strip().lower()
    combined = f"{title} {memo}".strip()
    if not combined:
        return False

    # ReNr / correction lines should be attached to parent product order.
    if "renr" in combined or "re nr" in combined:
        return True

    service_tokens = (
        "hin- und abfahrt",
        "hin und abfahrt",
        "abfahrt",
        "fahrt",
        "lieferung",
        "versand",
        "transport",
        "aufbau",
        "montage",
        "service",
        "color",
        "colour",
        "material",
        "draufsicht",
        "front view",
    )
    return any(token in combined for token in service_tokens)


def _build_order_snapshot(item: dict) -> dict:
    return {
        "order_id": str(item.get("order_id") or "").strip(),
        "platform": str(item.get("platform") or "").strip(),
        "buyer": str(item.get("buyer") or "").strip(),
        "title": str(item.get("title") or "").strip(),
        "sku": str(item.get("sku") or "").strip(),
        "memo": str(item.get("memo") or "").strip(),
        "verkaufsdatum": str(item.get("verkaufsdatum") or item.get("order_date") or "").strip(),
        "zahlungssumme": str(item.get("zahlungssumme") or "").strip(),
        "rechnungssumme": str(item.get("rechnungssumme") or "").strip(),
        "article_number_2": str(item.get("article_number_2") or "").strip(),
        "auction_group": str(item.get("auction_group") or "").strip(),
        "is_additional_service": _is_additional_service_item(item),
    }


def _title_starts_with_service_marker(title_lower: str) -> bool:
    return title_lower.startswith(
        (
            "1x renr",
            "renr",
            "1x material",
            "material",
            "1x farbe",
            "farbe",
            "1x draufsicht",
            "draufsicht",
            "1x front view",
            "front view",
            "1x hin- und abfahrt",
            "1x hin und abfahrt",
            "1x 2 x mann lieferung",
            "1x 2 mann lieferung",
            "1x lagergeld",
            "lagergeld",
            "1x rücktransport",
            "rücktransport",
        )
    )


def _contains_product_tokens(title_lower: str) -> bool:
    return any(
        token in title_lower
        for token in (
            "sofa",
            "couch",
            "bett",
            "esstisch",
            "tisch",
            "stuhl",
            "schrank",
            "kommode",
            "sessel",
            "wohnlandschaft",
            "lowboard",
            "vitrine",
            "whirlpool",
        )
    )


def _parent_snapshot_rank(snapshot: dict) -> tuple[int, int, int, int]:
    title = str(snapshot.get("title") or "").strip()
    title_lower = title.lower()
    score = 0

    starts_service = _title_starts_with_service_marker(title_lower)
    has_product = _contains_product_tokens(title_lower)

    if starts_service:
        score -= 120
    else:
        score += 40

    # Hard service-only prefixes should almost never become parent.
    hard_service_prefixes = (
        "1x lagergeld",
        "lagergeld",
        "1x hin- und abfahrt",
        "1x hin und abfahrt",
        "1x 2 x mann lieferung",
        "1x 2 mann lieferung",
        "1x rücktransport",
        "rücktransport",
        "1x material",
        "material",
        "1x farbe",
        "farbe",
        "1x front view",
        "front view",
        "1x draufsicht",
        "draufsicht",
    )
    if title_lower.startswith(hard_service_prefixes):
        score -= 350

    if has_product:
        score += 220

    if ":" not in title:
        score += 20

    if "renr" in title_lower:
        if has_product:
            score += 80
        else:
            score -= 120

    if str(snapshot.get("sku") or "").strip():
        score += 10

    order_id = str(snapshot.get("order_id") or "").strip()
    try:
        numeric_order_id = int(order_id)
    except ValueError:
        numeric_order_id = 0

    # Prefer lower numeric order id as a stable tiebreaker.
    return score, len(title), -numeric_order_id, 1 if order_id else 0


def _merge_child_item_into_parent(parent: dict, child: dict) -> None:
    parent_titles = parent.setdefault("__titles_list", [])
    child_titles = child.get("__titles_list", [])
    parent_seen_titles = set(parent_titles)
    for title in child_titles:
        if title not in parent_seen_titles:
            parent_titles.append(title)
            parent_seen_titles.add(title)

    parent_skus = parent.setdefault("__skus_list", [])
    child_skus = child.get("__skus_list", [])
    parent_seen_skus = set(parent_skus)
    for sku in child_skus:
        if sku not in parent_seen_skus:
            parent_skus.append(sku)
            parent_seen_skus.add(sku)

    parent_source_ids = parent.setdefault("__source_order_ids", [])
    child_source_ids = child.get("__source_order_ids", [])
    parent_seen_ids = set(parent_source_ids)
    for source_id in child_source_ids:
        if source_id not in parent_seen_ids:
            parent_source_ids.append(source_id)
            parent_seen_ids.add(source_id)

    parent_snapshots = parent.setdefault("__order_snapshots", {})
    child_snapshots = child.get("__order_snapshots", {})
    for order_id, snapshot in child_snapshots.items():
        if order_id and order_id not in parent_snapshots:
            parent_snapshots[order_id] = dict(snapshot)


def _item_rank(item: dict) -> tuple[int, int, int]:
    title = str(item.get("title") or "").strip()
    title_lower = title.lower()
    score = 0

    # Strongly de-prioritize obvious additional/service lines when selecting
    # a parent order candidate.
    if _is_additional_service_item(item):
        score -= 200

    if _title_starts_with_service_marker(title_lower):
        score -= 120

    # Prefer product lines over configuration/service lines.
    if ":" not in title:
        score += 50

    if _contains_product_tokens(title_lower):
        score += 35

    if any(
        token in title_lower
        for token in (
            "versandart",
            "artikelnummer",
            "nachttisch",
            "matratze",
            "lattenrost",
            "material",
            "farbe",
            "ausführung",
        )
    ):
        score -= 20
    if str(item.get("sku") or "").strip():
        score += 5

    order_id = str(item.get("order_id") or "").strip()
    try:
        numeric_order_id = int(order_id)
    except ValueError:
        numeric_order_id = 0

    return score, len(title), -numeric_order_id


def collapse_items_to_orders(items: list[dict]) -> tuple[list[dict], int]:
    grouped: dict[tuple[str, str, str, str, str], list[dict]] = {}
    for item in items:
        key = _item_group_key(item)
        grouped.setdefault(key, []).append(item)

    collapsed: list[dict] = []
    dropped = 0
    for group_items in grouped.values():
        selected = dict(sorted(group_items, key=_item_rank, reverse=True)[0])

        titles: list[str] = []
        seen_titles: set[str] = set()
        selected_title = str(selected.get("title") or "").strip()
        if selected_title:
            seen_titles.add(selected_title)
            titles.append(selected_title)
        for row in group_items:
            row_title = str(row.get("title") or "").strip()
            if not row_title or row_title in seen_titles:
                continue
            seen_titles.add(row_title)
            titles.append(row_title)

        skus: list[str] = []
        seen_skus: set[str] = set()
        selected_sku = str(selected.get("sku") or "").strip()
        if selected_sku:
            seen_skus.add(selected_sku)
            skus.append(selected_sku)
        for row in group_items:
            row_sku = str(row.get("sku") or "").strip()
            if not row_sku or row_sku in seen_skus:
                continue
            seen_skus.add(row_sku)
            skus.append(row_sku)

        source_order_ids: list[str] = []
        seen_ids: set[str] = set()
        selected_order_id = str(selected.get("order_id") or "").strip()
        if selected_order_id:
            seen_ids.add(selected_order_id)
            source_order_ids.append(selected_order_id)
        for row in group_items:
            row_order_id = str(row.get("order_id") or "").strip()
            if not row_order_id or row_order_id in seen_ids:
                continue
            seen_ids.add(row_order_id)
            source_order_ids.append(row_order_id)

        if titles:
            selected["title"] = ", ".join(titles)
        if skus:
            selected["sku"] = ", ".join(skus)
        else:
            selected["sku"] = ""

        selected["__titles_list"] = titles
        selected["__skus_list"] = skus
        selected["__source_order_ids"] = source_order_ids
        selected["__main_order_id"] = selected_order_id
        snapshots: dict[str, dict] = {}
        for row in group_items:
            snapshot = _build_order_snapshot(row)
            snapshot_order_id = snapshot.get("order_id") or ""
            if snapshot_order_id and snapshot_order_id not in snapshots:
                snapshots[snapshot_order_id] = snapshot
        selected["__order_snapshots"] = snapshots
        collapsed.append(selected)

        if len(group_items) > 1:
            dropped += len(group_items) - 1

    # Second pass: if an entry is an additional service, attach it to the most
    # likely parent product order within the same kundennummer/buyer context.
    context_groups: dict[tuple[str, str], list[int]] = {}
    for index, item in enumerate(collapsed):
        context_key = (
            str(item.get("kundennummer") or "").strip(),
            str(item.get("buyer") or "").strip().lower(),
        )
        context_groups.setdefault(context_key, []).append(index)

    remove_indexes: set[int] = set()
    for indexes in context_groups.values():
        parent_indexes = [idx for idx in indexes if not _is_additional_service_item(collapsed[idx])]
        if not parent_indexes:
            continue

        for idx in indexes:
            if idx in parent_indexes:
                continue
            child = collapsed[idx]
            if not _is_additional_service_item(child):
                continue

            child_ref = _extract_reference_number(
                f"{child.get('title', '')} {child.get('memo', '')}"
            )
            candidate_indexes = parent_indexes
            if child_ref:
                filtered = []
                for parent_idx in parent_indexes:
                    parent = collapsed[parent_idx]
                    parent_ref = _extract_reference_number(
                        f"{parent.get('title', '')} {parent.get('memo', '')}"
                    )
                    if parent_ref == child_ref:
                        filtered.append(parent_idx)
                if filtered:
                    candidate_indexes = filtered

            child_dt = _parse_order_datetime(str(child.get("verkaufsdatum") or child.get("order_date") or ""))
            def _distance(parent_idx: int) -> float:
                parent = collapsed[parent_idx]
                parent_dt = _parse_order_datetime(str(parent.get("verkaufsdatum") or parent.get("order_date") or ""))
                if child_dt and parent_dt:
                    return abs((child_dt - parent_dt).total_seconds())
                return float("inf")

            best_parent_idx = min(
                candidate_indexes,
                key=lambda parent_idx: (
                    _distance(parent_idx),
                    _item_rank(collapsed[parent_idx]),
                ),
            )
            parent = collapsed[best_parent_idx]
            _merge_child_item_into_parent(parent, child)
            remove_indexes.add(idx)
            dropped += 1

    if remove_indexes:
        collapsed = [item for index, item in enumerate(collapsed) if index not in remove_indexes]

    for item in collapsed:
        titles = [str(value).strip() for value in (item.pop("__titles_list", []) or []) if str(value).strip()]
        skus = [str(value).strip() for value in (item.pop("__skus_list", []) or []) if str(value).strip()]
        source_order_ids = [
            str(value).strip()
            for value in (item.pop("__source_order_ids", []) or [])
            if str(value).strip()
        ]
        main_order_id = str(item.pop("__main_order_id", "") or "").strip()
        if not main_order_id and source_order_ids:
            main_order_id = source_order_ids[0]
        order_snapshots = item.pop("__order_snapshots", {}) or {}

        # Re-evaluate parent order id from available source snapshots.
        candidate_order_ids = [order_id for order_id in source_order_ids if order_id]
        if not candidate_order_ids and main_order_id:
            candidate_order_ids = [main_order_id]
        ranked_candidates: list[tuple[tuple[int, int, int, int], str]] = []
        for candidate_order_id in candidate_order_ids:
            snapshot = order_snapshots.get(candidate_order_id, {"order_id": candidate_order_id})
            ranked_candidates.append((_parent_snapshot_rank(snapshot), candidate_order_id))
        if ranked_candidates:
            ranked_candidates.sort(reverse=True)
            best_candidate_order_id = ranked_candidates[0][1]
            if best_candidate_order_id:
                main_order_id = best_candidate_order_id

        if titles:
            item["title"] = ", ".join(dict.fromkeys(titles))
        if skus:
            item["sku"] = ", ".join(dict.fromkeys(skus))
        else:
            item["sku"] = ""

        item["main_order_id"] = main_order_id
        if source_order_ids:
            if main_order_id in source_order_ids:
                source_order_ids = [main_order_id, *[x for x in source_order_ids if x != main_order_id]]
            item["order_id"] = ", ".join(dict.fromkeys(source_order_ids))
        source_order_ids = list(dict.fromkeys(source_order_ids))
        item["source_order_ids"] = source_order_ids

        additional_items: list[dict] = []
        for order_id in source_order_ids:
            if not order_id or order_id == main_order_id:
                continue
            snapshot = order_snapshots.get(order_id)
            if snapshot is None:
                snapshot = {"order_id": order_id}
            additional_items.append(snapshot)
        item["additional_items"] = additional_items

    return collapsed, dropped


def parse_auktionsliste_items(html: str, *, kundennummer: str = "") -> list[dict]:
    if "Kein Datensatz vorhanden" in html:
        return []

    items: list[dict] = []
    normalized_kundennummer = (kundennummer or "").strip()

    def _extract_row_order_id(attrs: str, body: str) -> str:
        # In some Afterbuy layouts data-row-item-id may point to a grouped row,
        # while the real position id is present in the edit link.
        patterns = (
            r"[?&]art=edit(?:&amp;|&)id=(\d+)",
            r"[?&]id=(\d+)(?:&amp;|&|\"|')",
            r'name="id_fsp"[^>]*value="(\d+)"',
            r"data-row-item-id=\"(\d+)\"",
        )
        source = f"{attrs} {body}"
        for pattern in patterns:
            match = re.search(pattern, source, flags=re.IGNORECASE)
            if match:
                return match.group(1)
        return ""

    row_pattern = re.compile(
        r'<tr[^>]*class="seller-overview-table-frow"(?P<attrs>[^>]*)>(?P<body>.*?)(?=<tr[^>]*class="seller-overview-table-frow"|$)',
        flags=re.IGNORECASE | re.DOTALL,
    )
    for row_match in row_pattern.finditer(html):
        attrs = row_match.group("attrs") or ""
        body = row_match.group("body") or ""

        order_id = _extract_row_order_id(attrs, body)
        if not order_id:
            continue

        platform_match = re.search(r'data-art="([^"]*)"', attrs)
        platform = unescape(platform_match.group(1).strip()) if platform_match else ""

        title_match = re.search(r"<div[^>]*>\s*<b>(.*?)</b>", body, flags=re.IGNORECASE | re.DOTALL)
        title = _strip_tags(title_match.group(1)) if title_match else ""

        sku_match = re.search(
            r"SKU\s*\(Art\.-Nr\.\s*1\)\s*:\s*&nbsp;\s*([^<]+)",
            body,
            flags=re.IGNORECASE,
        )
        sku = _normalize_sku(_strip_tags(sku_match.group(1)) if sku_match else "")

        alt_number_match = re.search(
            r"Best\.-Nr\.\s*\(Art\.-Nr\.\s*2\)\.?\s*:\s*&nbsp;\s*([^<]+)",
            body,
            flags=re.IGNORECASE,
        )
        alt_number = _normalize_sku(_strip_tags(alt_number_match.group(1)) if alt_number_match else "")

        date_match = re.search(r'<td class="EING">([^<]+)</td>', body, flags=re.IGNORECASE)
        order_date = _strip_tags(date_match.group(1)) if date_match else ""

        auction_group_match = re.search(
            r'data-identification="auctiongroup">\s*([^<]+)',
            body,
            flags=re.IGNORECASE,
        )
        auction_group = _strip_tags(auction_group_match.group(1)) if auction_group_match else ""

        buyer_match = re.search(r"useridto=([^&\"']+)", body, flags=re.IGNORECASE)
        buyer = unescape(buyer_match.group(1)) if buyer_match else ""

        items.append(
            {
                "kundennummer": normalized_kundennummer,
                "order_id": order_id,
                "platform": platform,
                "title": title,
                "sku": sku,
                "verkaufsdatum": order_date,
                "zahlungssumme": "",
                "rechnungssumme": "",
                "memo": "",
                "article_number_2": alt_number,
                "order_date": order_date,
                "auction_group": auction_group,
                "buyer": buyer,
            }
        )
    
    return items


def _attach_source_account(items: list[dict], profile: str) -> list[dict]:
    normalized_profile = (profile or "").strip().upper()
    for item in items:
        if isinstance(item, dict):
            item["source_account"] = normalized_profile
    return items


def search_items_auktionsliste(
    *,
    ebay: str = "",
    kundenname: str = "",
    kundennummer: str = "",
    max_total: int = 500,
    max_items_per_page: int = 20,
    show_hidden: bool = True,
    include_order_details: bool = True,
) -> list[dict]:
    search_profiles = [profile for profile in ("JV", "XL", "CH") if profile_has_login_credentials(profile)]
    if not search_profiles:
        raise RuntimeError("Missing Afterbuy login credentials in .env for JV, XL or CH.")

    primary_profile = search_profiles[0]
    html = fetch_auktionsliste_html(
        ebay=ebay,
        kundenname=kundenname,
        kundennummer=kundennummer,
        max_total=max_total,
        max_items_per_page=max_items_per_page,
        show_hidden=show_hidden,
        login_profile=primary_profile,
    )
    items = parse_auktionsliste_items(html, kundennummer=kundennummer)
    if include_order_details and items:
        items = enrich_items_with_order_details(items, login_profile=primary_profile)
    if items:
        items = _attach_source_account(items, primary_profile)

    if kundennummer.strip() and not items:
        for fallback_profile in search_profiles[1:]:
            if AFTERBUY_VERBOSE:
                print(f"No kundennummer match on {primary_profile}. Retrying with fresh {fallback_profile} relogin...")
            html = fetch_auktionsliste_html(
                ebay=ebay,
                kundenname=kundenname,
                kundennummer=kundennummer,
                max_total=max_total,
                max_items_per_page=max_items_per_page,
                show_hidden=show_hidden,
                login_profile=fallback_profile,
                force_relogin=True,
            )
            items = parse_auktionsliste_items(html, kundennummer=kundennummer)
            if include_order_details and items:
                items = enrich_items_with_order_details(items, login_profile=fallback_profile)
            if items:
                items = _attach_source_account(items, fallback_profile)
            if items:
                break
    return items


PARSED_ITEM_FIELDS = (
    "kundennummer",
    "order_id",
    "platform",
    "title",
    "sku",
    "verkaufsdatum",
    "zahlungssumme",
    "rechnungssumme",
    "memo",
    "article_number_2",
    "order_date",
    "auction_group",
    "buyer",
    "source_account",
)


def build_parsed_items(items: list[dict]) -> list[dict]:
    parsed_items: list[dict] = []
    for item in items:
        parsed_items.append({field: (item.get(field, "") or "") for field in PARSED_ITEM_FIELDS})
    return parsed_items


def main() -> None:
    session = requests.Session()
    if has_token_auth():
        print("Skip XL login: token auth is enabled.")
    else:
        try:
            login_xl(session)
        except requests.RequestException as exc:
            print(f"XL login request failed: {exc}")
        except RuntimeError as exc:
            print(f"XL login failed: {exc}")

    try:
        response = request_get_sold_items(session)
        print(response.status_code)
        print(response.text)
    except requests.RequestException as exc:
        print(f"API request failed: {exc}")
    except RuntimeError as exc:
        print(f"Config error: {exc}")


if __name__ == "__main__":
    main()
