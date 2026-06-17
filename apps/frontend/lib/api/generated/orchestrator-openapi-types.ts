// AUTO-GENERATED FILE. DO NOT EDIT.
// Source: openapi/orchestrator-openapi.json

export interface paths {
    "/api/v1/healthz": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Healthz */
        get: operations["healthz_api_v1_healthz_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/metrics": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Metrics */
        get: operations["metrics_api_v1_metrics_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
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
    "/api/v1/orchestrator/jobs/batch": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create Orchestrator Jobs Batch */
        post: operations["create_orchestrator_jobs_batch_api_v1_orchestrator_jobs_batch_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orchestrator/jobs/status/batch": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Get Orchestrator Jobs Status Batch */
        post: operations["get_orchestrator_jobs_status_batch_api_v1_orchestrator_jobs_status_batch_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orchestrator/product-editor/apply": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Product Editor Apply */
        post: operations["product_editor_apply_api_v1_orchestrator_product_editor_apply_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orchestrator/product-editor/apply/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Product Editor Apply */
        post: operations["product_editor_apply_api_v1_orchestrator_product_editor_apply__post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orchestrator/product-editor/discover": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Product Editor Discover */
        post: operations["product_editor_discover_api_v1_orchestrator_product_editor_discover_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orchestrator/product-editor/discover/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Product Editor Discover */
        post: operations["product_editor_discover_api_v1_orchestrator_product_editor_discover__post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orchestrator/product-editor/jobs/{job_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Product Editor Job Status */
        get: operations["product_editor_job_status_api_v1_orchestrator_product_editor_jobs__job_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orchestrator/product-editor/jobs/{job_id}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Product Editor Job Status */
        get: operations["product_editor_job_status_api_v1_orchestrator_product_editor_jobs__job_id___get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orchestrator/product-editor/load": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Product Editor Load */
        post: operations["product_editor_load_api_v1_orchestrator_product_editor_load_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orchestrator/product-editor/load/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Product Editor Load */
        post: operations["product_editor_load_api_v1_orchestrator_product_editor_load__post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orchestrator/product-editor/plan": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Product Editor Plan */
        post: operations["product_editor_plan_api_v1_orchestrator_product_editor_plan_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orchestrator/product-editor/plan/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Product Editor Plan */
        post: operations["product_editor_plan_api_v1_orchestrator_product_editor_plan__post"];
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
    "/api/v1/orchestrator/reconciliation/diff": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Reconcile Orchestrator State */
        post: operations["reconcile_orchestrator_state_api_v1_orchestrator_reconciliation_diff_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orchestrator/reconciliation/reports": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Reconciliation Reports */
        get: operations["list_reconciliation_reports_api_v1_orchestrator_reconciliation_reports_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orchestrator/reconciliation/reports/{report_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Reconciliation Report */
        get: operations["get_reconciliation_report_api_v1_orchestrator_reconciliation_reports__report_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/readyz": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Readyz */
        get: operations["readyz_api_v1_readyz_get"];
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
        /** BatchCreateJobItem */
        BatchCreateJobItem: {
            command: components["schemas"]["OrchestrateRequest"];
            /** Ean */
            ean: string;
            /** @default normal */
            priority: components["schemas"]["JobPriority"];
            /** Scheduled At Unix Ms */
            scheduled_at_unix_ms?: number | null;
        };
        /** BatchCreateJobRequest */
        BatchCreateJobRequest: {
            /** Items */
            items: components["schemas"]["BatchCreateJobItem"][];
        };
        /** BatchJobStatusRequest */
        BatchJobStatusRequest: {
            /** Job Ids */
            job_ids: string[];
        };
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
            /** @default normal */
            priority: components["schemas"]["JobPriority"];
            /** Scheduled At Unix Ms */
            scheduled_at_unix_ms?: number | null;
        };
        /** ErrorContract */
        ErrorContract: {
            /** Code */
            code: string;
            /** Details */
            details?: {
                [key: string]: unknown;
            };
            /** Message */
            message: string;
            /** Request Id */
            request_id: string;
        };
        /** HTTPValidationError */
        HTTPValidationError: {
            /** Detail */
            detail?: components["schemas"]["ValidationError"][];
        };
        /**
         * JobPriority
         * @enum {string}
         */
        JobPriority: JobPriority;
        /**
         * JobStatus
         * @enum {string}
         */
        JobStatus: JobStatus;
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
        /** ProductEditorApplyRequest */
        ProductEditorApplyRequest: {
            /**
             * Confirmation
             * @default false
             */
            confirmation: boolean;
            /** Plan Id */
            plan_id: string;
        };
        /** ProductEditorApplyResponse */
        ProductEditorApplyResponse: {
            /**
             * Accepted
             * @default true
             */
            accepted: boolean;
            active_group: components["schemas"]["ProductEditorGroupId"];
            /** Job Id */
            job_id: string;
            /** Request Id */
            request_id: string;
            status: components["schemas"]["JobStatus"];
        };
        /** ProductEditorCapability */
        ProductEditorCapability: {
            /**
             * Apply
             * @default false
             */
            apply: boolean;
            /**
             * Discover
             * @default false
             */
            discover: boolean;
            /**
             * Job Status
             * @default false
             */
            job_status: boolean;
            /**
             * Load
             * @default false
             */
            load: boolean;
            /**
             * Plan
             * @default false
             */
            plan: boolean;
        };
        /** ProductEditorDiscoverRequest */
        ProductEditorDiscoverRequest: {
            active_group?: components["schemas"]["ProductEditorGroupId"] | null;
            /** Ean */
            ean: string;
        };
        /** ProductEditorDiscoverResponse */
        ProductEditorDiscoverResponse: {
            /** Ean */
            ean: string;
            /** Groups */
            groups: components["schemas"]["ProductEditorGroup"][];
            /** Recommended Baseline Target Id */
            recommended_baseline_target_id?: string | null;
            /** Request Id */
            request_id: string;
            selected_group_id: components["schemas"]["ProductEditorGroupId"];
            /** Selected Target Ids */
            selected_target_ids?: string[];
            /** Warnings */
            warnings?: components["schemas"]["ProductEditorWarning"][];
        };
        /** ProductEditorGroup */
        ProductEditorGroup: {
            capabilities?: components["schemas"]["ProductEditorCapability"];
            /** Description */
            description: string;
            id: components["schemas"]["ProductEditorGroupId"];
            /** Label */
            label: string;
            /**
             * Planned
             * @default false
             */
            planned: boolean;
            /**
             * Read Only
             * @default false
             */
            read_only: boolean;
            /** Targets */
            targets?: components["schemas"]["ProductEditorTarget"][];
            /**
             * Unsupported
             * @default false
             */
            unsupported: boolean;
        };
        /**
         * ProductEditorGroupId
         * @enum {string}
         */
        ProductEditorGroupId: ProductEditorGroupId;
        /** ProductEditorJobResponse */
        ProductEditorJobResponse: {
            active_group?: components["schemas"]["ProductEditorGroupId"] | null;
            error?: components["schemas"]["ErrorContract"] | null;
            /** Job Id */
            job_id: string;
            /** Request Id */
            request_id: string;
            /** Status */
            status: components["schemas"]["JobStatus"] | string;
            /** Summary */
            summary?: {
                [key: string]: unknown;
            };
            /** Targets */
            targets?: {
                [key: string]: unknown;
            }[];
        };
        /** ProductEditorLoadRequest */
        ProductEditorLoadRequest: {
            active_group: components["schemas"]["ProductEditorGroupId"];
            /** Baseline Target Id */
            baseline_target_id?: string | null;
            /** Ean */
            ean: string;
        };
        /** ProductEditorLoadResponse */
        ProductEditorLoadResponse: {
            active_group: components["schemas"]["ProductEditorGroupId"];
            /** Baseline Target Id */
            baseline_target_id?: string | null;
            /** Draft */
            draft?: {
                [key: string]: unknown;
            };
            /** Ean */
            ean: string;
            /** Request Id */
            request_id: string;
            /**
             * Supported
             * @default false
             */
            supported: boolean;
            /** Warnings */
            warnings?: components["schemas"]["ProductEditorWarning"][];
        };
        /** ProductEditorPlanRequest */
        ProductEditorPlanRequest: {
            active_group: components["schemas"]["ProductEditorGroupId"];
            /** Changed Fields */
            changed_fields?: string[];
            /** Draft */
            draft?: {
                [key: string]: unknown;
            };
            /** Ean */
            ean: string;
            /** Selected Target Ids */
            selected_target_ids?: string[];
        };
        /** ProductEditorPlanResponse */
        ProductEditorPlanResponse: {
            active_group: components["schemas"]["ProductEditorGroupId"];
            /** Changed Fields */
            changed_fields?: string[];
            /** Ean */
            ean: string;
            /** Plan Id */
            plan_id: string;
            /** Request Id */
            request_id: string;
            /** @default medium */
            risk_level: components["schemas"]["ProductEditorRiskLevel"];
            /** Summary */
            summary?: {
                [key: string]: unknown;
            };
            /** Targets */
            targets?: components["schemas"]["ProductEditorTarget"][];
            /** Warnings */
            warnings?: components["schemas"]["ProductEditorWarning"][];
        };
        /**
         * ProductEditorRiskLevel
         * @enum {string}
         */
        ProductEditorRiskLevel: ProductEditorRiskLevel;
        /** ProductEditorTarget */
        ProductEditorTarget: {
            /** Account Family */
            account_family?: string | null;
            /**
             * Auto Baseline Eligible
             * @default false
             */
            auto_baseline_eligible: boolean;
            /**
             * Baseline Eligible
             * @default false
             */
            baseline_eligible: boolean;
            capabilities?: components["schemas"]["ProductEditorCapability"];
            /** Country */
            country?: string | null;
            group: components["schemas"]["ProductEditorGroupId"];
            /** Id */
            id: string;
            /** Label */
            label: string;
            /** Metadata */
            metadata?: {
                [key: string]: unknown;
            };
            /**
             * Planned
             * @default false
             */
            planned: boolean;
            /**
             * Read Only
             * @default false
             */
            read_only: boolean;
            /**
             * Selected By Default
             * @default false
             */
            selected_by_default: boolean;
            /** @default unknown */
            status: components["schemas"]["ProductEditorTargetStatus"];
            target_type: components["schemas"]["ProductEditorTargetType"];
            /**
             * Unsupported
             * @default false
             */
            unsupported: boolean;
            /** Warnings */
            warnings?: components["schemas"]["ProductEditorWarning"][];
        };
        /**
         * ProductEditorTargetStatus
         * @enum {string}
         */
        ProductEditorTargetStatus: ProductEditorTargetStatus;
        /**
         * ProductEditorTargetType
         * @enum {string}
         */
        ProductEditorTargetType: ProductEditorTargetType;
        /** ProductEditorWarning */
        ProductEditorWarning: {
            /** Code */
            code: string;
            /** @default medium */
            level: components["schemas"]["ProductEditorRiskLevel"];
            /** Message */
            message: string;
        };
        /** ReconciliationChannelState */
        ReconciliationChannelState: {
            /** Payload */
            payload?: {
                [key: string]: unknown;
            };
            target: components["schemas"]["ChannelTarget"];
        };
        /** ReconciliationRequest */
        ReconciliationRequest: {
            /** Actual */
            actual?: components["schemas"]["ReconciliationChannelState"][];
            /**
             * Apply Repair
             * @default false
             */
            apply_repair: boolean;
            desired: components["schemas"]["OrchestrateRequest"];
            /** Ean */
            ean: string;
        };
        /** ValidationError */
        ValidationError: {
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
    healthz_api_v1_healthz_get: {
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
    metrics_api_v1_metrics_get: {
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
    create_orchestrator_job_api_v1_orchestrator_jobs_post: {
        parameters: {
            query?: never;
            header?: {
                "Idempotency-Key"?: string | null;
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
    create_orchestrator_jobs_batch_api_v1_orchestrator_jobs_batch_post: {
        parameters: {
            query?: never;
            header?: {
                "Idempotency-Key"?: string | null;
                "X-Request-Id"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BatchCreateJobRequest"];
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
    get_orchestrator_jobs_status_batch_api_v1_orchestrator_jobs_status_batch_post: {
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
                "application/json": components["schemas"]["BatchJobStatusRequest"];
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
    product_editor_apply_api_v1_orchestrator_product_editor_apply_post: {
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
                "application/json": components["schemas"]["ProductEditorApplyRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProductEditorApplyResponse"];
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
    product_editor_apply_api_v1_orchestrator_product_editor_apply__post: {
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
                "application/json": components["schemas"]["ProductEditorApplyRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProductEditorApplyResponse"];
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
    product_editor_discover_api_v1_orchestrator_product_editor_discover_post: {
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
                "application/json": components["schemas"]["ProductEditorDiscoverRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProductEditorDiscoverResponse"];
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
    product_editor_discover_api_v1_orchestrator_product_editor_discover__post: {
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
                "application/json": components["schemas"]["ProductEditorDiscoverRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProductEditorDiscoverResponse"];
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
    product_editor_job_status_api_v1_orchestrator_product_editor_jobs__job_id__get: {
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
                    "application/json": components["schemas"]["ProductEditorJobResponse"];
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
    product_editor_job_status_api_v1_orchestrator_product_editor_jobs__job_id___get: {
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
                    "application/json": components["schemas"]["ProductEditorJobResponse"];
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
    product_editor_load_api_v1_orchestrator_product_editor_load_post: {
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
                "application/json": components["schemas"]["ProductEditorLoadRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProductEditorLoadResponse"];
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
    product_editor_load_api_v1_orchestrator_product_editor_load__post: {
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
                "application/json": components["schemas"]["ProductEditorLoadRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProductEditorLoadResponse"];
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
    product_editor_plan_api_v1_orchestrator_product_editor_plan_post: {
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
                "application/json": components["schemas"]["ProductEditorPlanRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProductEditorPlanResponse"];
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
    product_editor_plan_api_v1_orchestrator_product_editor_plan__post: {
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
                "application/json": components["schemas"]["ProductEditorPlanRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProductEditorPlanResponse"];
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
    reconcile_orchestrator_state_api_v1_orchestrator_reconciliation_diff_post: {
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
                "application/json": components["schemas"]["ReconciliationRequest"];
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
    list_reconciliation_reports_api_v1_orchestrator_reconciliation_reports_get: {
        parameters: {
            query: {
                ean: string;
            };
            header?: {
                "X-Request-Id"?: string | null;
            };
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
    get_reconciliation_report_api_v1_orchestrator_reconciliation_reports__report_id__get: {
        parameters: {
            query?: never;
            header?: {
                "X-Request-Id"?: string | null;
            };
            path: {
                report_id: string;
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
    readyz_api_v1_readyz_get: {
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
export enum JobPriority {
    urgent = "urgent",
    normal = "normal",
    background = "background"
}
export enum JobStatus {
    queued = "queued",
    running = "running",
    completed = "completed",
    failed = "failed"
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
export enum ProductEditorGroupId {
    JV = "JV",
    XL = "XL",
    HOOD = "HOOD",
    OTTO = "OTTO",
    KAUFLAND = "KAUFLAND",
    EBAY = "EBAY"
}
export enum ProductEditorRiskLevel {
    low = "low",
    medium = "medium",
    high = "high"
}
export enum ProductEditorTargetStatus {
    unknown = "unknown",
    found = "found",
    missing = "missing",
    error = "error",
    planned = "planned",
    unsupported = "unsupported",
    read_only = "read_only"
}
export enum ProductEditorTargetType {
    source_site = "source_site",
    marketplace_account = "marketplace_account"
}
