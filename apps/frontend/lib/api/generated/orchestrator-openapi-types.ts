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
        /**
         * Healthz
         * @description Lightweight liveness probe for the orchestrator process.
         */
        get: operations["orchestrator_get_api_v1_healthz"];
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
        /**
         * Metrics
         * @description Returns in-memory request, job store, database pool and circuit-breaker metrics.
         */
        get: operations["orchestrator_get_api_v1_metrics"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/openapi.json": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get orchestrator OpenAPI schema
         * @description Returns the normalized OpenAPI document for the orchestrator service.
         */
        get: operations["orchestrator_get_api_v1_openapi.json"];
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
        /**
         * List Orchestrator Jobs
         * @description Queues one asynchronous orchestrator job and returns its job identifier.
         */
        get: operations["orchestrator_get_api_v1_orchestrator_jobs"];
        put?: never;
        /**
         * Create Orchestrator Job
         * @description Queues one asynchronous orchestrator job and returns its job identifier.
         */
        post: operations["orchestrator_post_api_v1_orchestrator_jobs"];
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
        /**
         * Get Orchestrator Job
         * @description Returns the current persisted status for one orchestrator job.
         */
        get: operations["orchestrator_get_api_v1_orchestrator_jobs_job_id"];
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
        /**
         * Get Orchestrator Job Attempts
         * @description Returns execution attempt history for one orchestrator job.
         */
        get: operations["orchestrator_get_api_v1_orchestrator_jobs_job_id_attempts"];
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
        /**
         * Get Orchestrator Job Events
         * @description Returns recorded event history for one orchestrator job.
         */
        get: operations["orchestrator_get_api_v1_orchestrator_jobs_job_id_events"];
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
        /**
         * Create Orchestrator Jobs Batch
         * @description Queues multiple orchestrator jobs in a single request.
         */
        post: operations["orchestrator_post_api_v1_orchestrator_jobs_batch"];
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
        /**
         * Get Orchestrator Jobs Status Batch
         * @description Loads status snapshots for multiple orchestrator job identifiers.
         */
        post: operations["orchestrator_post_api_v1_orchestrator_jobs_status_batch"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orchestrator/marketplace/jobs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Marketplace Toggle Jobs
         * @description GET /api/v1/orchestrator/marketplace/jobs.
         */
        get: operations["orchestrator_get_api_v1_orchestrator_marketplace_jobs"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orchestrator/marketplace/jobs/{job_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Marketplace Toggle Job
         * @description GET /api/v1/orchestrator/marketplace/jobs/{job_id}.
         */
        get: operations["orchestrator_get_api_v1_orchestrator_marketplace_jobs_job_id"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orchestrator/marketplace/toggle-by-kid": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Create Marketplace Toggle Job
         * @description POST /api/v1/orchestrator/marketplace/toggle-by-kid.
         */
        post: operations["orchestrator_post_api_v1_orchestrator_marketplace_toggle_by_kid"];
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
        /**
         * Product Editor Apply
         * @description Applies a previously generated Product Editor plan after explicit confirmation.
         */
        post: operations["orchestrator_post_api_v1_orchestrator_product_editor_apply"];
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
        /**
         * Product Editor Discover
         * @description Discovers Product Editor groups, capabilities and initial warnings for a given EAN.
         */
        post: operations["orchestrator_post_api_v1_orchestrator_product_editor_discover"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orchestrator/product-editor/jobs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Product Editor Jobs List
         * @description Returns Product Editor job status, target execution state and warnings.
         */
        get: operations["orchestrator_get_api_v1_orchestrator_product_editor_jobs"];
        put?: never;
        post?: never;
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
        /**
         * Product Editor Job Status
         * @description Returns Product Editor job status, target execution state and warnings.
         */
        get: operations["orchestrator_get_api_v1_orchestrator_product_editor_jobs_job_id"];
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
        /**
         * Product Editor Load
         * @description Loads Product Editor baseline data and current target state for a selected group.
         */
        post: operations["orchestrator_post_api_v1_orchestrator_product_editor_load"];
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
        /**
         * Product Editor Plan
         * @description Builds a Product Editor execution plan from draft changes and selected targets.
         */
        post: operations["orchestrator_post_api_v1_orchestrator_product_editor_plan"];
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
        /**
         * Orchestrate Update
         * @description Executes a direct orchestrator product update request for the provided EAN across selected channels.
         */
        post: operations["orchestrator_post_api_v1_orchestrator_products_ean_update"];
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
        /**
         * Reconcile Orchestrator State
         * @description Computes desired-versus-actual channel state differences for one EAN.
         */
        post: operations["orchestrator_post_api_v1_orchestrator_reconciliation_diff"];
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
        /**
         * List Reconciliation Reports
         * @description Lists stored reconciliation reports, optionally filtered by request parameters.
         */
        get: operations["orchestrator_get_api_v1_orchestrator_reconciliation_reports"];
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
        /**
         * Get Reconciliation Report
         * @description Returns one persisted reconciliation report by identifier.
         */
        get: operations["orchestrator_get_api_v1_orchestrator_reconciliation_reports_report_id"];
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
        /**
         * Readyz
         * @description Readiness probe that validates the orchestrator idempotency store connection.
         */
        get: operations["orchestrator_get_api_v1_readyz"];
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
            /** Categoryid */
            categoryID?: string | null;
            /** Compliance */
            compliance?: {
                [key: string]: unknown;
            } | null;
            /** Condition */
            condition?: string | null;
            /** Date Available */
            date_available?: string | null;
            /** Delivery */
            delivery?: {
                [key: string]: unknown;
            } | null;
            /** Description */
            description?: string | null;
            /** Descriptions */
            descriptions?: {
                [key: string]: unknown;
            }[] | null;
            /** Ean */
            ean?: string | null;
            /** Ebay Currency */
            ebay_currency?: string | null;
            /** Ebay Inventory Item */
            ebay_inventory_item?: {
                [key: string]: unknown;
            } | null;
            /** Ebay Item Id */
            ebay_item_id?: string | null;
            /** Ebay Listing Mode */
            ebay_listing_mode?: CanonicalPayloadEbay_listing_modeAnyOf0 | null;
            /** Ebay Offer */
            ebay_offer?: {
                [key: string]: unknown;
            } | null;
            /** Ebay Variation Sku */
            ebay_variation_sku?: string | null;
            /** Image */
            image?: string | null;
            /** Images */
            images?: string[] | null;
            /** Isbn */
            isbn?: string | null;
            /** Itemmode */
            itemMode?: string | null;
            /** Itemnumber */
            itemNumber?: string | null;
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
            /** Maxorderquantity */
            maxOrderQuantity?: number | null;
            /** Mediaassets */
            mediaAssets?: {
                [key: string]: unknown;
            }[] | null;
            /** Moin */
            moin?: string | null;
            /** Mpn */
            mpn?: string | null;
            /** Offeringstartdate */
            offeringStartDate?: string | null;
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
            /** Productproperties */
            productProperties?: {
                [key: string]: unknown;
            }[] | null;
            /** Productreference */
            productReference?: string | null;
            /** Pzn */
            pzn?: string | null;
            /** Quantity */
            quantity?: number | null;
            /** Releasedate */
            releaseDate?: string | null;
            /** Shippingprofileid */
            shippingProfileId?: string | null;
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
            /** Upc */
            upc?: string | null;
        };
        /** ChannelTarget */
        ChannelTarget: {
            /** Account */
            account?: string | null;
            /** Changed Fields */
            changed_fields?: string[];
            /**
             * Ean Source
             * @default main
             * @enum {string}
             */
            ean_source: ChannelTargetEan_source;
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
        /** MarketplaceToggleCreateResponse */
        MarketplaceToggleCreateResponse: {
            /** Job Id */
            job_id: string;
            /** Request Id */
            request_id: string;
            status: components["schemas"]["JobStatus"];
        };
        /** MarketplaceToggleJobListResponse */
        MarketplaceToggleJobListResponse: {
            /** Jobs */
            jobs?: components["schemas"]["MarketplaceToggleJobResponse"][];
            /** Limit */
            limit: number;
            /** Offset */
            offset: number;
            /** Request Id */
            request_id: string;
            /** Total */
            total: number;
        };
        /** MarketplaceToggleJobResponse */
        MarketplaceToggleJobResponse: {
            /** Created At Unix Ms */
            created_at_unix_ms?: number | null;
            error?: components["schemas"]["ErrorContract"] | null;
            /** Inactive */
            inactive: boolean;
            /** Job Id */
            job_id: string;
            job_status: components["schemas"]["JobStatus"];
            /** Kid Number */
            kid_number: string;
            /** Request Id */
            request_id: string;
            /** Results */
            results?: components["schemas"]["MarketplaceToggleResultItem"][];
            /**
             * Status
             * @enum {string}
             */
            status: MarketplaceToggleJobResponseStatus;
            summary?: components["schemas"]["MarketplaceToggleSummary"] | null;
            /** Updated At Unix Ms */
            updated_at_unix_ms?: number | null;
        };
        /** MarketplaceToggleRequest */
        MarketplaceToggleRequest: {
            /**
             * Inactive
             * @default true
             */
            inactive: boolean;
            /** Kid Number */
            kid_number: string;
            /** Place */
            place?: string | null;
        };
        /** MarketplaceToggleResultItem */
        MarketplaceToggleResultItem: {
            /** Channel */
            channel: string;
            /** Details */
            details?: {
                [key: string]: unknown;
            };
            /** Ok */
            ok: boolean;
            /** Site Key */
            site_key: string;
            /** Status Code */
            status_code: number;
        };
        /** MarketplaceToggleSummary */
        MarketplaceToggleSummary: {
            /** Failed */
            failed: number;
            /** Success */
            success: number;
            /** Total */
            total: number;
        };
        /**
         * Operation
         * @enum {string}
         */
        Operation: Operation;
        /** OrchestrateRequest */
        OrchestrateRequest: {
            /** Channels */
            channels: components["schemas"]["ChannelTarget"][];
            /** Kid Number */
            kid_number?: string | null;
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
        /** ProductEditorJobListResponse */
        ProductEditorJobListResponse: {
            /** Jobs */
            jobs?: components["schemas"]["ProductEditorJobResponse"][];
            /** Limit */
            limit: number;
            /** Offset */
            offset: number;
            /** Request Id */
            request_id: string;
            /** Total */
            total: number;
        };
        /** ProductEditorJobResponse */
        ProductEditorJobResponse: {
            active_group?: components["schemas"]["ProductEditorGroupId"] | null;
            /** Created At Unix Ms */
            created_at_unix_ms?: number | null;
            /** Ean */
            ean?: string | null;
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
            /** Updated At Unix Ms */
            updated_at_unix_ms?: number | null;
        };
        /** ProductEditorLoadRequest */
        ProductEditorLoadRequest: {
            active_group: components["schemas"]["ProductEditorGroupId"];
            /** Baseline Target Id */
            baseline_target_id?: string | null;
            /** Ean */
            ean: string;
            /** Legacy Item Id */
            legacy_item_id?: string | null;
            /** Publishing Target Id */
            publishing_target_id?: string | null;
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
    orchestrator_get_api_v1_healthz: {
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
    orchestrator_get_api_v1_metrics: {
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
    "orchestrator_get_api_v1_openapi.json": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OpenAPI JSON document. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    orchestrator_get_api_v1_orchestrator_jobs: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                query?: string;
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
    orchestrator_post_api_v1_orchestrator_jobs: {
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
    orchestrator_get_api_v1_orchestrator_jobs_job_id: {
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
    orchestrator_get_api_v1_orchestrator_jobs_job_id_attempts: {
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
    orchestrator_get_api_v1_orchestrator_jobs_job_id_events: {
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
    orchestrator_post_api_v1_orchestrator_jobs_batch: {
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
    orchestrator_post_api_v1_orchestrator_jobs_status_batch: {
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
    orchestrator_get_api_v1_orchestrator_marketplace_jobs: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                query?: string;
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
                    "application/json": components["schemas"]["MarketplaceToggleJobListResponse"];
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
    orchestrator_get_api_v1_orchestrator_marketplace_jobs_job_id: {
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
                    "application/json": components["schemas"]["MarketplaceToggleJobResponse"];
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
    orchestrator_post_api_v1_orchestrator_marketplace_toggle_by_kid: {
        parameters: {
            query?: never;
            header?: {
                "X-Request-Id"?: string | null;
                "X-WareHub-Actor-Login"?: string | null;
                "X-WareHub-Actor-Name"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MarketplaceToggleRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MarketplaceToggleCreateResponse"];
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
    orchestrator_post_api_v1_orchestrator_product_editor_apply: {
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
    orchestrator_post_api_v1_orchestrator_product_editor_discover: {
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
    orchestrator_get_api_v1_orchestrator_product_editor_jobs: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                query?: string;
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
                    "application/json": components["schemas"]["ProductEditorJobListResponse"];
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
    orchestrator_get_api_v1_orchestrator_product_editor_jobs_job_id: {
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
    orchestrator_post_api_v1_orchestrator_product_editor_load: {
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
    orchestrator_post_api_v1_orchestrator_product_editor_plan: {
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
    orchestrator_post_api_v1_orchestrator_products_ean_update: {
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
    orchestrator_post_api_v1_orchestrator_reconciliation_diff: {
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
    orchestrator_get_api_v1_orchestrator_reconciliation_reports: {
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
    orchestrator_get_api_v1_orchestrator_reconciliation_reports_report_id: {
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
    orchestrator_get_api_v1_readyz: {
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
export enum CanonicalPayloadEbay_listing_modeAnyOf0 {
    inventory = "inventory",
    legacy = "legacy"
}
export enum ChannelTargetEan_source {
    main = "main",
    pool = "pool"
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
    ebay = "ebay",
    hood = "hood",
    kaufland = "kaufland",
    otto = "otto",
    xljv = "xljv"
}
export enum MarketplaceToggleJobResponseStatus {
    queued = "queued",
    running = "running",
    ok = "ok",
    partial = "partial",
    failed = "failed"
}
export enum Operation {
    fetch = "fetch",
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
