from .product_editor_gateway import ProductEditorGateway


class ProductReviewGateway(ProductEditorGateway):
    def publication_states(self, *, entries: list[dict], request_id: str) -> list[dict]:
        if not entries:
            return []
        response = self.http.request(
            'POST', f'{self.base_url}/api/v1/marketplace/publication-states/',
            headers=self._headers(request_id, content_type='application/json'),
            json={'entries': entries}, timeout_seconds=10, retries=0,
        )
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict) or not isinstance(payload.get('items'), list):
            raise ValueError('Invalid publication states response')
        return payload['items']
