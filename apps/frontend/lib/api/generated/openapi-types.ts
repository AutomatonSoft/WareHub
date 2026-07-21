// AUTO-GENERATED FILE. DO NOT EDIT.
// Source: openapi/unified-openapi.json

export interface paths {
    "/api/v1/hood/items/by-ean/{ean}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["services_get_api_v1_hood_items_by_ean_ean"];
        put?: never;
        post?: never;
        delete: operations["services_delete_api_v1_hood_items_by_ean_ean"];
        options?: never;
        head?: never;
        patch: operations["services_patch_api_v1_hood_items_by_ean_ean"];
        trace?: never;
    };
    "/api/v1/jv/batch/jobs/{job_id}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["services_get_api_v1_jv_batch_jobs_job_id"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/jv/batch/update-by-ean/{ean}/apply/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["services_post_api_v1_jv_batch_update_by_ean_ean_apply"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/jv/batch/update-by-ean/{ean}/plan/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["services_post_api_v1_jv_batch_update_by_ean_ean_plan"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/jv/delivery-options/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["services_get_api_v1_jv_delivery_options"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/jv/products/by-ean/{ean}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["services_get_api_v1_jv_products_by_ean_ean"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/jv/products/create-and-push/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["services_post_api_v1_jv_products_create_and_push"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/jv/products/local-by-ean/{ean}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["services_get_api_v1_jv_products_local_by_ean_ean"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/jv/products/sync-by-ean/{ean}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["services_post_api_v1_jv_products_sync_by_ean_ean"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/jv/products/update-by-ean/{ean}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["services_patch_api_v1_jv_products_update_by_ean_ean"];
        trace?: never;
    };
    "/api/v1/jv/rubrics/tree/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["services_get_api_v1_jv_rubrics_tree"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/jv/sites/by-ean/{ean}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["services_get_api_v1_jv_sites_by_ean_ean"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orchestrator/healthz": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Healthz */
        get: operations["orchestrator_get_api_v1_orchestrator_healthz"];
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
        /** Get Orchestrator Job */
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
        /** Get Orchestrator Job Attempts */
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
        /** Get Orchestrator Job Events */
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
        /** Create Orchestrator Jobs Batch */
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
        /** Get Orchestrator Jobs Status Batch */
        post: operations["orchestrator_post_api_v1_orchestrator_jobs_status_batch"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orchestrator/metrics": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Metrics */
        get: operations["orchestrator_get_api_v1_orchestrator_metrics"];
        put?: never;
        post?: never;
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
        post: operations["orchestrator_post_api_v1_orchestrator_product_editor_apply"];
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
        post: operations["post_api_v1_orchestrator_product_editor_apply"];
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
        post: operations["orchestrator_post_api_v1_orchestrator_product_editor_discover"];
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
        post: operations["post_api_v1_orchestrator_product_editor_discover"];
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
        get: operations["orchestrator_get_api_v1_orchestrator_product_editor_jobs_job_id"];
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
        get: operations["get_api_v1_orchestrator_product_editor_jobs_job_id"];
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
        post: operations["orchestrator_post_api_v1_orchestrator_product_editor_load"];
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
        post: operations["post_api_v1_orchestrator_product_editor_load"];
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
        post: operations["orchestrator_post_api_v1_orchestrator_product_editor_plan"];
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
        post: operations["post_api_v1_orchestrator_product_editor_plan"];
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
        post: operations["orchestrator_post_api_v1_orchestrator_products_ean_update"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orchestrator/readyz": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Readyz */
        get: operations["orchestrator_get_api_v1_orchestrator_readyz"];
        put?: never;
        post?: never;
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
        /** List Reconciliation Reports */
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
        /** Get Reconciliation Report */
        get: operations["orchestrator_get_api_v1_orchestrator_reconciliation_reports_report_id"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/services/afterbuy/items/search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["services_get_api_v1_services_afterbuy_items_search"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/services/afterbuy/items/search-web": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["services_get_api_v1_services_afterbuy_items_search_web"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/services/afterbuy/orders/create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["services_post_api_v1_services_afterbuy_orders_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/services/dev/session/sync": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["services_get_api_v1_services_dev_session_sync"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/services/ean-pool/{ean}/usage": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["services_get_api_v1_services_ean_pool_ean_usage"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/services/ean-pool/import": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["services_post_api_v1_services_ean_pool_import"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/services/ean-pool/mark-used": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["services_post_api_v1_services_ean_pool_mark_used"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/services/ean-pool/reserve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["services_post_api_v1_services_ean_pool_reserve"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/services/ean-pool/stats": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["services_get_api_v1_services_ean_pool_stats"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/services/ean-pool/take-next-free": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["services_post_api_v1_services_ean_pool_take_next_free"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/services/healthz": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["services_get_api_v1_services_healthz"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/services/inventory/rows": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["services_get_api_v1_services_inventory_rows"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/services/kaufland/{ean}/{site}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["services_get_api_v1_services_kaufland_ean_site"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/services/kaufland/products/create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["services_post_api_v1_services_kaufland_products_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/services/kaufland/products/delete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["services_post_api_v1_services_kaufland_products_delete"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/services/kaufland/products/ean/change": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["services_post_api_v1_services_kaufland_products_ean_change"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/services/kids": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["services_get_api_v1_services_kids"];
        put?: never;
        post: operations["services_post_api_v1_services_kids"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/services/kids/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["services_get_api_v1_services_kids_id"];
        put: operations["services_put_api_v1_services_kids_id"];
        post?: never;
        delete: operations["services_delete_api_v1_services_kids_id"];
        options?: never;
        head?: never;
        patch: operations["services_patch_api_v1_services_kids_id"];
        trace?: never;
    };
    "/api/v1/services/kids/{kid_id}/ean-summary": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["services_get_api_v1_services_kids_kid_id_ean_summary"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/services/kids/{kid_id}/marketplace-eans": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["services_get_api_v1_services_kids_kid_id_marketplace_eans"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["services_patch_api_v1_services_kids_kid_id_marketplace_eans"];
        trace?: never;
    };
    "/api/v1/services/kids/{kid_id}/order-ids": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["services_get_api_v1_services_kids_kid_id_order_ids"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/services/kids/bulk-update": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["services_patch_api_v1_services_kids_bulk_update"];
        trace?: never;
    };
    "/api/v1/services/marketplace/hood/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["services_get_api_v1_services_marketplace_hood_health"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/services/marketplace/kaufland/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["services_get_api_v1_services_marketplace_kaufland_health"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/services/orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["services_get_api_v1_services_orders"];
        put?: never;
        post: operations["services_post_api_v1_services_orders"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/services/orders/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["services_get_api_v1_services_orders_id"];
        put: operations["services_put_api_v1_services_orders_id"];
        post?: never;
        delete: operations["services_delete_api_v1_services_orders_id"];
        options?: never;
        head?: never;
        patch: operations["services_patch_api_v1_services_orders_id"];
        trace?: never;
    };
    "/api/v1/services/otto/{profile}/products": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["services_get_api_v1_services_otto_profile_products"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/services/otto/{profile}/products/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["services_get_api_v1_services_otto_profile_products_id"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/services/otto/{profile}/products/upsert": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["services_post_api_v1_services_otto_profile_products_upsert"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/services/otto/products": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["services_get_api_v1_services_otto_products"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/services/otto/products/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["services_get_api_v1_services_otto_products_id"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/services/otto/products/upsert": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["services_post_api_v1_services_otto_products_upsert"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/services/readyz": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["services_get_api_v1_services_readyz"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/uploads/images/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["services_post_api_v1_uploads_images"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/xl/batch/update-by-ean/{ean}/apply/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["services_post_api_v1_xl_batch_update_by_ean_ean_apply"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/xl/batch/update-by-ean/{ean}/plan/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["services_post_api_v1_xl_batch_update_by_ean_ean_plan"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/xl/delivery-options/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["services_get_api_v1_xl_delivery_options"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/xl/products/by-ean/{ean}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["services_get_api_v1_xl_products_by_ean_ean"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/xl/products/create-and-push/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["services_post_api_v1_xl_products_create_and_push"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/xl/products/local-by-ean/{ean}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["services_get_api_v1_xl_products_local_by_ean_ean"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/xl/products/sync-by-ean/{ean}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["services_post_api_v1_xl_products_sync_by_ean_ean"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/xl/products/update-by-ean/{ean}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["services_patch_api_v1_xl_products_update_by_ean_ean"];
        trace?: never;
    };
    "/api/v1/xl/rubrics/tree/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["services_get_api_v1_xl_rubrics_tree"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/xl/sites/by-ean/{ean}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["services_get_api_v1_xl_sites_by_ean_ean"];
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
        KidModel: {
            /** @enum {string|null} */
            account?: KidModelAccount;
            b_ware?: boolean;
            commentary?: string | null;
            readonly id?: number;
            in_transit?: boolean;
            kid_number: string;
            photo?: Record<string, never>;
            place?: string | null;
            room?: string | null;
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
        OrderModel: {
            additional_items?: Record<string, never>;
            buyer?: string | null;
            /** Format: date-time */
            order_date?: string | null;
            readonly id?: number;
            kid: number;
            memo?: string | null;
            order_id: string;
            full_amount?: string | null;
            invoice_number?: string | null;
            already_paid?: string | null;
            shipping_tax_rate?: string | null;
            /** Format: date-time */
            delivery_date?: string | null;
            invoice_amount?: string | null;
            paid_amount?: string | null;
            /** Format: date-time */
            payment_date?: string | null;
            payment_method?: string | null;
            payment_id?: string | null;
            payment_function?: string | null;
            shipping_method?: string | null;
            platform?: string | null;
            quantity?: number;
            sku?: string | null;
            /** @enum {string} */
            status?: OrderModelStatus;
            title: string;
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
    services_get_api_v1_hood_items_by_ean_ean: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                ean: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
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
    services_delete_api_v1_hood_items_by_ean_ean: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                ean: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    services_patch_api_v1_hood_items_by_ean_ean: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                ean: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": unknown;
                "application/x-www-form-urlencoded": unknown;
                "multipart/form-data": unknown;
            };
        };
        responses: {
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
    services_get_api_v1_jv_batch_jobs_job_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                job_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
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
    services_post_api_v1_jv_batch_update_by_ean_ean_apply: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                ean: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": unknown;
                "application/x-www-form-urlencoded": unknown;
                "multipart/form-data": unknown;
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    services_post_api_v1_jv_batch_update_by_ean_ean_plan: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                ean: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": unknown;
                "application/x-www-form-urlencoded": unknown;
                "multipart/form-data": unknown;
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    services_get_api_v1_jv_delivery_options: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown[];
                };
            };
        };
    };
    services_get_api_v1_jv_products_by_ean_ean: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                ean: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
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
    services_post_api_v1_jv_products_create_and_push: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": unknown;
                "application/x-www-form-urlencoded": unknown;
                "multipart/form-data": unknown;
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    services_get_api_v1_jv_products_local_by_ean_ean: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                ean: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
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
    services_post_api_v1_jv_products_sync_by_ean_ean: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                ean: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": unknown;
                "application/x-www-form-urlencoded": unknown;
                "multipart/form-data": unknown;
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    services_patch_api_v1_jv_products_update_by_ean_ean: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                ean: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": unknown;
                "application/x-www-form-urlencoded": unknown;
                "multipart/form-data": unknown;
            };
        };
        responses: {
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
    services_get_api_v1_jv_rubrics_tree: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown[];
                };
            };
        };
    };
    services_get_api_v1_jv_sites_by_ean_ean: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                ean: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
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
    orchestrator_get_api_v1_orchestrator_healthz: {
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
    orchestrator_get_api_v1_orchestrator_metrics: {
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
    post_api_v1_orchestrator_product_editor_apply: {
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
    post_api_v1_orchestrator_product_editor_discover: {
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
    get_api_v1_orchestrator_product_editor_jobs_job_id: {
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
    post_api_v1_orchestrator_product_editor_load: {
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
    post_api_v1_orchestrator_product_editor_plan: {
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
    orchestrator_get_api_v1_orchestrator_readyz: {
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
    services_get_api_v1_services_afterbuy_items_search: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown[];
                };
            };
        };
    };
    services_get_api_v1_services_afterbuy_items_search_web: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown[];
                };
            };
        };
    };
    services_post_api_v1_services_afterbuy_orders_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": unknown;
                "application/x-www-form-urlencoded": unknown;
                "multipart/form-data": unknown;
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    services_get_api_v1_services_dev_session_sync: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown[];
                };
            };
        };
    };
    services_get_api_v1_services_ean_pool_ean_usage: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                ean: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown[];
                };
            };
        };
    };
    services_post_api_v1_services_ean_pool_import: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": unknown;
                "application/x-www-form-urlencoded": unknown;
                "multipart/form-data": unknown;
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    services_post_api_v1_services_ean_pool_mark_used: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": unknown;
                "application/x-www-form-urlencoded": unknown;
                "multipart/form-data": unknown;
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    services_post_api_v1_services_ean_pool_reserve: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": unknown;
                "application/x-www-form-urlencoded": unknown;
                "multipart/form-data": unknown;
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    services_get_api_v1_services_ean_pool_stats: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown[];
                };
            };
        };
    };
    services_post_api_v1_services_ean_pool_take_next_free: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": unknown;
                "application/x-www-form-urlencoded": unknown;
                "multipart/form-data": unknown;
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    services_get_api_v1_services_healthz: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown[];
                };
            };
        };
    };
    services_get_api_v1_services_inventory_rows: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown[];
                };
            };
        };
    };
    services_get_api_v1_services_kaufland_ean_site: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                ean: string;
                site: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
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
    services_post_api_v1_services_kaufland_products_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": unknown;
                "application/x-www-form-urlencoded": unknown;
                "multipart/form-data": unknown;
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    services_post_api_v1_services_kaufland_products_delete: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": unknown;
                "application/x-www-form-urlencoded": unknown;
                "multipart/form-data": unknown;
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    services_post_api_v1_services_kaufland_products_ean_change: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": unknown;
                "application/x-www-form-urlencoded": unknown;
                "multipart/form-data": unknown;
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    services_get_api_v1_services_kids: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["KidModel"][];
                };
            };
        };
    };
    services_post_api_v1_services_kids: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["KidModel"];
                "application/x-www-form-urlencoded": components["schemas"]["KidModel"];
                "multipart/form-data": components["schemas"]["KidModel"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["KidModel"];
                };
            };
        };
    };
    services_get_api_v1_services_kids_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description A unique integer value identifying this kid. */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["KidModel"];
                };
            };
        };
    };
    services_put_api_v1_services_kids_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description A unique integer value identifying this kid. */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["KidModel"];
                "application/x-www-form-urlencoded": components["schemas"]["KidModel"];
                "multipart/form-data": components["schemas"]["KidModel"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["KidModel"];
                };
            };
        };
    };
    services_delete_api_v1_services_kids_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description A unique integer value identifying this kid. */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    services_patch_api_v1_services_kids_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description A unique integer value identifying this kid. */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["KidModel"];
                "application/x-www-form-urlencoded": components["schemas"]["KidModel"];
                "multipart/form-data": components["schemas"]["KidModel"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["KidModel"];
                };
            };
        };
    };
    services_get_api_v1_services_kids_kid_id_ean_summary: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                kid_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown[];
                };
            };
        };
    };
    services_get_api_v1_services_kids_kid_id_marketplace_eans: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                kid_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown[];
                };
            };
        };
    };
    services_patch_api_v1_services_kids_kid_id_marketplace_eans: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                kid_id: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": unknown;
                "application/x-www-form-urlencoded": unknown;
                "multipart/form-data": unknown;
            };
        };
        responses: {
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
    services_get_api_v1_services_kids_kid_id_order_ids: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                kid_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown[];
                };
            };
        };
    };
    services_patch_api_v1_services_kids_bulk_update: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": unknown;
                "application/x-www-form-urlencoded": unknown;
                "multipart/form-data": unknown;
            };
        };
        responses: {
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
    services_get_api_v1_services_marketplace_hood_health: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown[];
                };
            };
        };
    };
    services_get_api_v1_services_marketplace_kaufland_health: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown[];
                };
            };
        };
    };
    services_get_api_v1_services_orders: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrderModel"][];
                };
            };
        };
    };
    services_post_api_v1_services_orders: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["OrderModel"];
                "application/x-www-form-urlencoded": components["schemas"]["OrderModel"];
                "multipart/form-data": components["schemas"]["OrderModel"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrderModel"];
                };
            };
        };
    };
    services_get_api_v1_services_orders_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description A unique integer value identifying this orders. */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrderModel"];
                };
            };
        };
    };
    services_put_api_v1_services_orders_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description A unique integer value identifying this orders. */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["OrderModel"];
                "application/x-www-form-urlencoded": components["schemas"]["OrderModel"];
                "multipart/form-data": components["schemas"]["OrderModel"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrderModel"];
                };
            };
        };
    };
    services_delete_api_v1_services_orders_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description A unique integer value identifying this orders. */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    services_patch_api_v1_services_orders_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description A unique integer value identifying this orders. */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["OrderModel"];
                "application/x-www-form-urlencoded": components["schemas"]["OrderModel"];
                "multipart/form-data": components["schemas"]["OrderModel"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrderModel"];
                };
            };
        };
    };
    services_get_api_v1_services_otto_profile_products: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                profile: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown[];
                };
            };
        };
    };
    services_get_api_v1_services_otto_profile_products_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                profile: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
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
    services_post_api_v1_services_otto_profile_products_upsert: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                profile: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": unknown;
                "application/x-www-form-urlencoded": unknown;
                "multipart/form-data": unknown;
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    services_get_api_v1_services_otto_products: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown[];
                };
            };
        };
    };
    services_get_api_v1_services_otto_products_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
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
    services_post_api_v1_services_otto_products_upsert: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": unknown;
                "application/x-www-form-urlencoded": unknown;
                "multipart/form-data": unknown;
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    services_get_api_v1_services_readyz: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown[];
                };
            };
        };
    };
    services_post_api_v1_uploads_images: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": unknown;
                "application/x-www-form-urlencoded": unknown;
                "multipart/form-data": unknown;
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    services_post_api_v1_xl_batch_update_by_ean_ean_apply: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                ean: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": unknown;
                "application/x-www-form-urlencoded": unknown;
                "multipart/form-data": unknown;
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    services_post_api_v1_xl_batch_update_by_ean_ean_plan: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                ean: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": unknown;
                "application/x-www-form-urlencoded": unknown;
                "multipart/form-data": unknown;
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    services_get_api_v1_xl_delivery_options: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown[];
                };
            };
        };
    };
    services_get_api_v1_xl_products_by_ean_ean: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                ean: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
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
    services_post_api_v1_xl_products_create_and_push: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": unknown;
                "application/x-www-form-urlencoded": unknown;
                "multipart/form-data": unknown;
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    services_get_api_v1_xl_products_local_by_ean_ean: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                ean: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
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
    services_post_api_v1_xl_products_sync_by_ean_ean: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                ean: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": unknown;
                "application/x-www-form-urlencoded": unknown;
                "multipart/form-data": unknown;
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    services_patch_api_v1_xl_products_update_by_ean_ean: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                ean: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": unknown;
                "application/x-www-form-urlencoded": unknown;
                "multipart/form-data": unknown;
            };
        };
        responses: {
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
    services_get_api_v1_xl_rubrics_tree: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown[];
                };
            };
        };
    };
    services_get_api_v1_xl_sites_by_ean_ean: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                ean: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
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
export enum KidModelAccount {
    JV = "JV",
    XL = "XL",
    CH = "CH"
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
export enum OrderModelStatus {
    paid = "paid",
    no_paid = "no_paid"
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
