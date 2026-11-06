export function getSofortListReturnHref(value: string | null): string {
  return value && /^\/sofort-list(?:\?|$)/.test(value) ? value : "/sofort-list";
}

export function buildSofortCreateProductHref(kidId: number, returnTo: string): string {
  const params = new URLSearchParams({ kid: String(kidId), returnTo: getSofortListReturnHref(returnTo) });
  return `/create-product?${params.toString()}`;
}
