import re


LANG_STOPWORDS = {
    "de": {"und", "der", "die", "das", "mit", "für", "nicht", "ist", "sie", "ein"},
    "en": {"and", "the", "for", "with", "not", "this", "that", "you", "from", "new"},
    "fr": {"et", "le", "la", "les", "des", "pour", "avec", "sans", "est", "une"},
    "it": {"e", "il", "la", "le", "per", "con", "senza", "non", "una", "del"},
    "es": {"y", "el", "la", "los", "las", "para", "con", "sin", "una", "del"},
    "pt": {"e", "o", "a", "os", "as", "para", "com", "sem", "uma", "de"},
    "pl": {"i", "oraz", "z", "na", "do", "dla", "bez", "jest", "nie", "w"},
    "nl": {"en", "de", "het", "met", "voor", "zonder", "is", "een", "van", "niet"},
}


def detect_language_from_texts(*, source_fields: dict, translatable_fields: tuple[str, ...]) -> str:
    combined = " ".join(str(source_fields.get(key) or "") for key in translatable_fields).strip().lower()
    if not combined:
        return "de"

    if re.search(r"[\u0370-\u03FF]", combined):
        return "el"
    if re.search(r"[\u0400-\u04FF]", combined):
        return "ru"
    if re.search(r"[ąćęłńóśźż]", combined):
        return "pl"
    if re.search(r"[čřšžě]", combined):
        return "cs"
    if re.search(r"[áéíóúñ]", combined):
        return "es"
    if re.search(r"[àèéìòù]", combined):
        return "it"
    if re.search(r"[ãõç]", combined):
        return "pt"
    if re.search(r"[äöüß]", combined):
        return "de"

    tokens = re.findall(r"[a-zA-Z]{2,}", combined)
    if not tokens:
        return "de"

    best_lang = "de"
    best_score = 0
    for lang, words in LANG_STOPWORDS.items():
        score = sum(1 for token in tokens if token in words)
        if score > best_score:
            best_score = score
            best_lang = lang
    return best_lang
