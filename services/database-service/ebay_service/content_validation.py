from html.parser import HTMLParser

from .client import EbayApiError


INVENTORY_DESCRIPTION_MAX_LENGTH = 4000
NON_CONTENT_TAGS = frozenset({"head", "style", "script", "template", "noscript"})
VOID_TAGS = frozenset({"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"})


class DescriptionTextParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.text = []

    def handle_starttag(self, tag, attrs):
        if tag not in VOID_TAGS:
            self.stack.append(tag)

    def handle_startendtag(self, tag, attrs):
        pass

    def handle_endtag(self, tag):
        if tag in self.stack:
            self.stack = self.stack[:len(self.stack) - 1 - self.stack[::-1].index(tag)]

    def handle_data(self, data):
        if not any(tag in NON_CONTENT_TAGS for tag in self.stack):
            self.text.append(data)


def validate_description(value, *, field="description", maximum=None):
    message = "Add an eBay product description containing text, not only HTML, CSS or images."
    if isinstance(value, str) and value.strip():
        if maximum is not None and len(value.strip()) > maximum:
            message = f"eBay product description must contain at most {maximum} characters, including HTML tags."
        else:
            parser = DescriptionTextParser()
            parser.feed(value)
            parser.close()
            if any(character.isalnum() for character in " ".join(parser.text)):
                return
    raise EbayApiError(
        message, status_code=400, operation="validate_inventory_description",
        details={"field_errors": {field: [message]}},
    )


def validate_inventory_descriptions(item=None, offer=None):
    if isinstance(item, dict):
        product = item.get("product")
        validate_description(
            product.get("description") if isinstance(product, dict) else None,
            maximum=INVENTORY_DESCRIPTION_MAX_LENGTH,
        )
    if isinstance(offer, dict) and offer.get("listingDescription"):
        validate_description(offer["listingDescription"], field="description")
