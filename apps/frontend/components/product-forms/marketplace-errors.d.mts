export type MarketplaceIssue = { field: string; message: string; code: string; target: string };
export type MarketplaceFailure = { message: string; issues: MarketplaceIssue[]; requestId: string; status: number };
export function marketplaceFieldKey(path: unknown): string;
export function marketplaceFieldLabel(field: string, language?: string): string;
export function describeMarketplaceError(error: unknown, language?: string, fallback?: string): MarketplaceFailure;
