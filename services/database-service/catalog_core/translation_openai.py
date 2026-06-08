import json
import os
import re

import requests


def _translation_timeout() -> tuple[float, float]:
    connect_timeout = float(os.getenv("OPENAI_TRANSLATION_CONNECT_TIMEOUT_SEC", "10"))
    read_timeout = float(os.getenv("OPENAI_TRANSLATION_READ_TIMEOUT_SEC", "90"))
    return connect_timeout, read_timeout


def extract_response_output_text(payload: dict) -> str:
    output_text = payload.get("output_text")
    if output_text:
        return str(output_text).strip()

    outputs = payload.get("output") or []
    for item in outputs:
        for content in item.get("content") or []:
            text_value = content.get("text")
            if text_value:
                return str(text_value).strip()
    return ""


def translate_text(*, text: str, source_lang: str, target_lang: str) -> str:
    if not text:
        return ""
    if str(source_lang or "").strip().lower() == str(target_lang or "").strip().lower():
        return text
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set.")
    model = os.getenv("OPENAI_TRANSLATION_MODEL", "gpt-5.4-mini").strip()
    prompt = (
        f"Translate ecommerce content from {source_lang} to {target_lang}. "
        "Preserve all HTML tags and attributes exactly, preserve line breaks, placeholders, SKU, brand names, and numbers. "
        "Do not copy source-language text. If the target language is not Russian, the output must not contain Cyrillic characters. "
        "Return only translated text, no markdown, no explanations."
    )
    resp = requests.post(
        "https://api.openai.com/v1/responses",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": model,
            "input": [
                {"role": "system", "content": [{"type": "input_text", "text": prompt}]},
                {"role": "user", "content": [{"type": "input_text", "text": text}]},
            ],
        },
        timeout=_translation_timeout(),
    )
    resp.raise_for_status()
    payload = resp.json()
    output_text = extract_response_output_text(payload)
    if output_text:
        return output_text
    raise RuntimeError("OpenAI translation response did not contain text.")


def translate_fields_batch(
    *,
    source_fields: dict,
    source_lang: str,
    target_lang: str,
    translatable_fields: tuple[str, ...],
) -> dict:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set.")
    model = os.getenv("OPENAI_TRANSLATION_MODEL", "gpt-5.4-mini").strip()
    payload_fields = {
        key: str(source_fields.get(key) or "")
        for key in translatable_fields
        if str(source_fields.get(key) or "")
    }
    if not payload_fields:
        return {}

    prompt = (
        f"Translate ecommerce content from {source_lang} to {target_lang}. "
        "Preserve all HTML tags and attributes exactly, preserve line breaks, placeholders, SKU, brand names, and numbers. "
        "Do not copy source-language text. If the target language is not Russian, translated values must not contain Cyrillic characters. "
        "Return ONLY compact JSON object with the same keys and translated string values. No markdown."
    )
    resp = requests.post(
        "https://api.openai.com/v1/responses",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": model,
            "input": [
                {"role": "system", "content": [{"type": "input_text", "text": prompt}]},
                {
                    "role": "user",
                    "content": [{"type": "input_text", "text": json.dumps(payload_fields, ensure_ascii=False)}],
                },
            ],
        },
        timeout=_translation_timeout(),
    )
    resp.raise_for_status()
    body = resp.json()
    text = extract_response_output_text(body)
    if not text:
        raise RuntimeError("OpenAI translation response did not contain text.")

    candidate = text.strip()
    if candidate.startswith("```"):
        candidate = re.sub(r"^```[a-zA-Z]*\s*", "", candidate)
        candidate = re.sub(r"\s*```$", "", candidate)
    try:
        translated = json.loads(candidate)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", candidate, flags=re.DOTALL)
        if not m:
            raise RuntimeError("OpenAI batch translation returned non-JSON output.")
        translated = json.loads(m.group(0))

    if not isinstance(translated, dict):
        raise RuntimeError("OpenAI batch translation returned non-object JSON.")

    normalized: dict = {}
    for key in translatable_fields:
        if key in translated and translated.get(key) is not None:
            normalized[key] = str(translated.get(key))
    return normalized
