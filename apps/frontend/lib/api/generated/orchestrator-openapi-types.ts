// AUTO-GENERATED FILE. DO NOT EDIT.
// Source: openapi/orchestrator-openapi.json

export interface paths {
    "/api/v1/orchestrator/jobs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create Orchestrator Job */
        post: operations["create_orchestrator_job_api_v1_orchestrator_jobs_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orchestrator/jobs/{job_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Orchestrator Job */
        get: operations["get_orchestrator_job_api_v1_orchestrator_jobs__job_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orchestrator/jobs/{job_id}/attempts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Orchestrator Job Attempts */
        get: operations["get_orchestrator_job_attempts_api_v1_orchestrator_jobs__job_id__attempts_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orchestrator/jobs/{job_id}/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Orchestrator Job Events */
        get: operations["get_orchestrator_job_events_api_v1_orchestrator_jobs__job_id__events_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orchestrator/products/{ean}/update": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Orchestrate Update */
        post: operations["orchestrate_update_api_v1_orchestrator_products__ean__update_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/healthz": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Healthz */
        get: operations["healthz_healthz_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/metrics": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Metrics */
        get: operations["metrics_metrics_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/readyz": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Readyz */
        get: operations["readyz_readyz_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** CanonicalPayload */
        CanonicalPayload: {
            /** Categories */
            categories?: {
                [key: string]: unknown;
            }[] | null;
            /** Compliance */
            compliance?: {
                [key: string]: unknown;
            } | null;
            /** Date Available */
            date_available?: string | null;
            /** Description */
            description?: string | null;
            /** Descriptions */
            descriptions?: {
                [key: string]: unknown;
            }[] | null;
            /** Ean */
            ean?: string | null;
            /** Image */
            image?: string | null;
            /** Images */
            images?: string[] | null;
            /** Jv Fields */
            jv_fields?: {
                [key: string]: unknown;
            } | null;
            /** Logistics */
            logistics?: {
                [key: string]: unknown;
            } | null;
            /** Manufacturer Id */
            manufacturer_id?: number | null;
            /** Mediaassets */
            mediaAssets?: {
                [key: string]: unknown;
            }[] | null;
            /** Moin */
            moin?: string | null;
            /** Mpn */
            mpn?: string | null;
            /** Order */
            order?: {
                [key: string]: unknown;
            } | null;
            /** Picture Urls */
            picture_urls?: string[] | null;
            /** Price */
            price?: string | null;
            /** Pricing */
            pricing?: {
                [key: string]: unknown;
            } | null;
            /** Productdescription */
            productDescription?: {
                [key: string]: unknown;
            } | null;
            /** Productreference */
            productReference?: string | null;
            /** Pzn */
            pzn?: string | null;
            /** Quantity */
            quantity?: number | null;
            /** Releasedate */
            releaseDate?: string | null;
            /** Sku */
            sku?: string | null;
            /** Source Ean Field */
            source_ean_field?: string | null;
            /** Source Model */
            source_model?: string | null;
            /** Source Sku */
            source_sku?: string | null;
            /** Specials */
            specials?: {
                [key: string]: unknown;
            }[] | null;
            /** Status */
            status?: boolean | null;
            /** Stock Status Id */
            stock_status_id?: number | null;
            /** Storefront */
            storefront?: string | null;
            /** Stores */
            stores?: {
                [key: string]: unknown;
            }[] | null;
            /** Tax Class Id */
            tax_class_id?: number | null;
            /** Title */
            title?: string | null;
            /** Unit Id */
            unit_id?: number | null;
        };
        /** ChannelTarget */
        ChannelTarget: {
            /** Account */
            account?: string | null;
            /** Changed Fields */
            changed_fields?: string[];
            marketplace: components["schemas"]["Marketplace"];
            /** Overrides */
            overrides?: {
                [key: string]: unknown;
            };
            /** Profile */
            profile?: string | null;
            /** Site */
            site?: string | null;
            /** Site Key */
            site_key?: string | null;
        };
        /** CreateJobRequest */
        CreateJobRequest: {
            command: components["schemas"]["OrchestrateRequest"];
            /** Ean */
            ean: string;
        };
        /** HTTPValidationError */
        HTTPValidationError: {
            /** Detail */
            detail?: components["schemas"]["ValidationError"][];
        };
        /**
         * Marketplace
         * @enum {string}
         */
        Marketplace: Marketplace;
        /**
         * Operation
         * @enum {string}
         */
        Operation: Operation;
        /** OrchestrateRequest */
        OrchestrateRequest: {
            /** Channels */
            channels: components["schemas"]["ChannelTarget"][];
            /** @default update */
            operation: components["schemas"]["Operation"];
            payload: components["schemas"]["CanonicalPayload"];
        };
        /** ValidationError */
        ValidationError: {
            /** Context */
            ctx?: Record<string, never>;
            /** Input */
            input?: unknown;
            /** Location */
            loc: (string | number)[];
            /** Message */
            msg: string;
            /** Error Type */
            type: string;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    create_orchestrator_job_api_v1_orchestrator_jobs_post: {
        parameters: {
            query?: never;
            header?: {
                "X-Request-Id"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateJobRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_orchestrator_job_api_v1_orchestrator_jobs__job_id__get: {
        parameters: {
            query?: never;
            header?: {
                "X-Request-Id"?: string | null;
            };
            path: {
                job_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_orchestrator_job_attempts_api_v1_orchestrator_jobs__job_id__attempts_get: {
        parameters: {
            query?: never;
            header?: {
                "X-Request-Id"?: string | null;
            };
            path: {
                job_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_orchestrator_job_events_api_v1_orchestrator_jobs__job_id__events_get: {
        parameters: {
            query?: never;
            header?: {
                "X-Request-Id"?: string | null;
            };
            path: {
                job_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    orchestrate_update_api_v1_orchestrator_products__ean__update_post: {
        parameters: {
            query?: never;
            header?: {
                "Idempotency-Key"?: string | null;
                "X-Request-Id"?: string | null;
            };
            path: {
                ean: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OrchestrateRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    healthz_healthz_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
        };
    };
    metrics_metrics_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
        };
    };
    readyz_readyz_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
}
export enum Marketplace {
    hood = "hood",
    kaufland = "kaufland",
    otto = "otto",
    xljv = "xljv"
}
export enum Operation {
    publish = "publish",
    update = "update",
    unpublish = "unpublish",
    relist = "relist"
}
