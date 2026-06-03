use serde_json::{json, Value};

pub(crate) fn openapi_paths() -> Value {
    json!({
        "/healthz": {
            "get": {
                "summary": "Service health check",
                "responses": { "200": { "description": "OK" } }
            }
        },
        "/readyz": {
            "get": {
                "summary": "Readiness check (DB)",
                "responses": { "200": { "description": "Ready" } }
            }
        },
        "/api/v1/meta": {
            "get": {
                "summary": "API metadata",
                "responses": { "200": { "description": "Metadata" } }
            }
        },
        "/api/v1/mobile/app-update": {
            "get": {
                "summary": "Mobile app update metadata",
                "responses": { "200": { "description": "Latest mobile APK version and URL" } }
            }
        },
        "/api/v1/healthz": {
            "get": {
                "summary": "v1 health check",
                "responses": { "200": { "description": "OK" } }
            }
        },
        "/api/v1/readyz": {
            "get": {
                "summary": "v1 readiness check (DB)",
                "responses": { "200": { "description": "Ready" } }
            }
        },
        "/api/v1/intakes": {
            "get": {
                "summary": "List intakes",
                "security": [{ "bearerAuth": [] }],
                "parameters": [
                    {
                        "name": "limit",
                        "in": "query",
                        "schema": { "type": "integer", "minimum": 1, "maximum": 200, "default": 50 }
                    },
                    {
                        "name": "offset",
                        "in": "query",
                        "schema": { "type": "integer", "minimum": 0, "default": 0 }
                    },
                    {
                        "name": "search",
                        "in": "query",
                        "schema": { "type": "string" }
                    },
                    {
                        "name": "section",
                        "in": "query",
                        "schema": { "type": "string", "enum": ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "M"] }
                    },
                    {
                        "name": "activity",
                        "in": "query",
                        "schema": { "type": "string", "enum": ["active", "inactive", "all"] }
                    }
                ],
                "responses": { "200": { "description": "List of intakes" } }
            },
            "post": {
                "summary": "Create intake(s)",
                "security": [{ "bearerAuth": [] }],
                "requestBody": {
                    "required": true,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "required": ["qr_code", "kid_number"],
                                "properties": {
                                    "qr_code": { "type": "string" },
                                    "warehouse_location": { "type": "string" },
                                    "placement_section": {
                                        "type": "string",
                                        "description": "required when placement_strategy=pool_auto"
                                    },
                                    "kid_number": { "type": "string" },
                                    "photo_url": { "type": "string" },
                                    "product_key": { "type": "string" },
                                    "product_color": { "type": "string" },
                                    "is_b_ware": { "type": "boolean" },
                                    "b_ware_comment": { "type": "string", "nullable": true },
                                    "category_main": { "type": "string", "nullable": true },
                                    "category_sub": { "type": "string", "nullable": true },
                                    "box_total": { "type": "integer", "minimum": 1, "maximum": 100 },
                                    "placement_strategy": {
                                        "type": "string",
                                        "enum": ["same_if_exists", "always_new", "manual", "pool_auto"]
                                    }
                                }
                            }
                        }
                    }
                },
                "responses": { "201": { "description": "Created" } }
            }
        },
        "/api/v1/intakes/products/stats": {
            "get": {
                "summary": "List product stock stats",
                "security": [{ "bearerAuth": [] }],
                "responses": { "200": { "description": "Product stock stats list" } }
            }
        },
        "/api/v1/kids/": {
            "post": {
                "summary": "Create intake(s)",
                "security": [{ "bearerAuth": [] }],
                "requestBody": {
                    "required": true,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "required": ["qr_code", "kid_number"],
                                "properties": {
                                    "qr_code": { "type": "string" },
                                    "warehouse_location": { "type": "string" },
                                    "placement_section": {
                                        "type": "string",
                                        "description": "required when placement_strategy=pool_auto"
                                    },
                                    "kid_number": { "type": "string" },
                                    "photo_url": { "type": "string" },
                                    "product_key": { "type": "string" },
                                    "product_color": { "type": "string" },
                                    "is_b_ware": { "type": "boolean" },
                                    "b_ware_comment": { "type": "string", "nullable": true },
                                    "category_main": { "type": "string", "nullable": true },
                                    "category_sub": { "type": "string", "nullable": true },
                                    "box_total": { "type": "integer", "minimum": 1, "maximum": 100 },
                                    "placement_strategy": {
                                        "type": "string",
                                        "enum": ["same_if_exists", "always_new", "manual", "pool_auto"]
                                    }
                                }
                            }
                        }
                    }
                },
                "responses": { "201": { "description": "Created" } }
            }
        },
        "/api/v1/intakes/suggest-placement": {
            "post": {
                "summary": "Suggest placement for product key",
                "security": [{ "bearerAuth": [] }],
                "requestBody": {
                    "required": true,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "required": ["product_key"],
                                "properties": {
                                    "product_key": { "type": "string" }
                                }
                            }
                        }
                    }
                },
                "responses": { "200": { "description": "Placement suggestion" } }
            }
        },
        "/api/v1/intakes/{intake_id}": {
            "delete": {
                "summary": "Delete intake",
                "security": [{ "bearerAuth": [] }],
                "parameters": [
                    {
                        "name": "intake_id",
                        "in": "path",
                        "required": true,
                        "schema": { "type": "string", "format": "uuid" }
                    },
                    {
                        "name": "mode",
                        "in": "query",
                        "schema": { "type": "string", "enum": ["soft"] }
                    }
                ],
                "responses": { "204": { "description": "Deleted" } }
            }
        },
        "/api/v1/intakes/by-location": {
            "delete": {
                "summary": "Delete oldest active intake unit by section/slot (FIFO)",
                "security": [{ "bearerAuth": [] }],
                "parameters": [
                    {
                        "name": "section",
                        "in": "query",
                        "required": true,
                        "schema": { "type": "string", "enum": ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "M"] }
                    },
                    {
                        "name": "slot_number",
                        "in": "query",
                        "required": true,
                        "schema": { "type": "integer", "minimum": 1, "maximum": 10000 }
                    }
                ],
                "responses": { "200": { "description": "Oldest unit deleted" } }
            }
        },
        "/api/v1/intakes/ws": {
            "get": {
                "summary": "Intake events websocket",
                "security": [{ "bearerAuth": [] }],
                "parameters": [
                    {
                        "name": "token",
                        "in": "query",
                        "schema": { "type": "string", "format": "uuid" },
                        "deprecated": true,
                        "description": "Legacy fallback. Preferred websocket auth is Sec-WebSocket-Protocol: auth.<token>"
                    }
                ],
                "responses": { "101": { "description": "Switching Protocols" } }
            }
        },
        "/api/v1/label-layout": {
            "get": {
                "summary": "Get global label layout settings",
                "security": [{ "bearerAuth": [] }],
                "responses": { "200": { "description": "Label layout settings" } }
            },
            "put": {
                "summary": "Update global label layout settings",
                "security": [{ "bearerAuth": [] }],
                "requestBody": {
                    "required": true,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "required": [
                                    "qr_scale",
                                    "qr_offset_x",
                                    "qr_offset_y",
                                    "main_scale",
                                    "main_offset_x",
                                    "main_offset_y",
                                    "parts_scale",
                                    "parts_offset_x",
                                    "parts_offset_y"
                                ],
                                "properties": {
                                    "qr_scale": { "type": "number" },
                                    "qr_offset_x": { "type": "number" },
                                    "qr_offset_y": { "type": "number" },
                                    "main_scale": { "type": "number" },
                                    "main_offset_x": { "type": "number" },
                                    "main_offset_y": { "type": "number" },
                                    "parts_scale": { "type": "number" },
                                    "parts_offset_x": { "type": "number" },
                                    "parts_offset_y": { "type": "number" }
                                }
                            }
                        }
                    }
                },
                "responses": { "200": { "description": "Label layout settings updated" } }
            }
        },
        "/api/v1/printer-setup": {
            "get": {
                "summary": "Get global printer setup settings",
                "security": [{ "bearerAuth": [] }],
                "responses": { "200": { "description": "Printer setup settings" } }
            },
            "put": {
                "summary": "Update global printer setup settings",
                "security": [{ "bearerAuth": [] }],
                "requestBody": {
                    "required": true,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "required": [
                                    "print_width_px",
                                    "print_height_px",
                                    "print_density",
                                    "print_label_type",
                                    "print_inter_label_delay_ms",
                                    "print_preview_only"
                                ],
                                "properties": {
                                    "print_width_px": { "type": "integer" },
                                    "print_height_px": { "type": "integer" },
                                    "print_density": { "type": "integer" },
                                    "print_label_type": { "type": "integer" },
                                    "print_inter_label_delay_ms": { "type": "integer" },
                                    "print_preview_only": { "type": "boolean" }
                                }
                            }
                        }
                    }
                },
                "responses": { "200": { "description": "Printer setup settings updated" } }
            }
        },
        "/api/v1/admin/intakes/photos/cleanup": {
            "post": {
                "summary": "Cleanup photos for removed intakes",
                "security": [{ "bearerAuth": [] }],
                "parameters": [
                    {
                        "name": "dry_run",
                        "in": "query",
                        "schema": { "type": "boolean", "default": false }
                    },
                    {
                        "name": "limit",
                        "in": "query",
                        "schema": { "type": "integer", "minimum": 1, "maximum": 2000, "default": 200 }
                    }
                ],
                "responses": { "200": { "description": "Cleanup result" } }
            }
        },
        "/api/v1/admin/intakes/photos/cleanup/status": {
            "get": {
                "summary": "Get intake photo cleanup retry queue status",
                "security": [{ "bearerAuth": [] }],
                "responses": { "200": { "description": "Retry queue status" } }
            }
        },
        "/api/v1/admin/audit/intakes/deletions": {
            "get": {
                "summary": "List intake deletion audit logs (admin)",
                "security": [{ "bearerAuth": [] }],
                "parameters": [
                    {
                        "name": "limit",
                        "in": "query",
                        "schema": { "type": "integer", "minimum": 1, "maximum": 500, "default": 100 }
                    },
                    {
                        "name": "actor_login",
                        "in": "query",
                        "schema": { "type": "string" }
                    },
                    {
                        "name": "request_id",
                        "in": "query",
                        "schema": { "type": "string" }
                    },
                    {
                        "name": "section",
                        "in": "query",
                        "schema": { "type": "string", "enum": ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "M"] }
                    },
                    {
                        "name": "from",
                        "in": "query",
                        "schema": { "type": "string", "format": "date-time" }
                    },
                    {
                        "name": "to",
                        "in": "query",
                        "schema": { "type": "string", "format": "date-time" }
                    }
                ],
                "responses": { "200": { "description": "Intake delete audit entries" } }
            }
        },
        "/api/v1/uploads": {
            "post": {
                "summary": "Upload product image",
                "parameters": [
                    {
                        "name": "kind",
                        "in": "query",
                        "schema": { "type": "string", "enum": ["product", "avatar"] }
                    },
                    {
                        "name": "name",
                        "in": "query",
                        "schema": { "type": "string" },
                        "description": "optional filename prefix used for stored file name"
                    }
                ],
                "requestBody": {
                    "required": true,
                    "content": {
                        "multipart/form-data": {
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "file": { "type": "string", "format": "binary" }
                                }
                            }
                        }
                    }
                },
                "security": [{ "bearerAuth": [] }],
                "responses": { "201": { "description": "Created" } }
            }
        },
        "/api/v1/afterbuy/orders/{order_id}": {
            "get": {
                "summary": "Fetch Afterbuy order page",
                "parameters": [
                    {
                        "name": "order_id",
                        "in": "path",
                        "required": true,
                        "schema": { "type": "string" }
                    },
                    {
                        "name": "account",
                        "in": "query",
                        "schema": { "type": "string" }
                    }
                ],
                "responses": { "200": { "description": "Afterbuy order response" } }
            }
        },
        "/api/v1/afterbuy/kids/{kid_number}/orders": {
            "get": {
                "summary": "Find Afterbuy order ids by KID",
                "parameters": [
                    {
                        "name": "kid_number",
                        "in": "path",
                        "required": true,
                        "schema": { "type": "string" }
                    },
                    {
                        "name": "account",
                        "in": "query",
                        "schema": { "type": "string" }
                    }
                ],
                "responses": { "200": { "description": "Afterbuy KID search response" } }
            }
        },
        "/api/v1/afterbuy/health": {
            "get": {
                "summary": "Afterbuy runtime configuration health",
                "security": [{ "bearerAuth": [] }],
                "responses": { "200": { "description": "Afterbuy config health per account" } }
            }
        },
        "/api/v1/auth/register": {
            "post": {
                "summary": "Register new user account",
                "requestBody": {
                    "required": true,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "required": ["email", "login", "password"],
                                "properties": {
                                    "username": { "type": "string" },
                                    "email": { "type": "string" },
                                    "login": { "type": "string" },
                                    "password": { "type": "string" }
                                }
                            }
                        }
                    }
                },
                "responses": { "201": { "description": "Submitted for approval" } }
            }
        },
        "/api/v1/auth/password/reset/request": {
            "post": {
                "summary": "Request password reset code",
                "requestBody": {
                    "required": true,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "required": ["email"],
                                "properties": {
                                    "email": { "type": "string" }
                                }
                            }
                        }
                    }
                },
                "responses": { "204": { "description": "Reset code sent if email exists" } }
            }
        },
        "/api/v1/auth/password/reset/confirm": {
            "post": {
                "summary": "Confirm password reset with code",
                "requestBody": {
                    "required": true,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "required": ["email", "code", "password"],
                                "properties": {
                                    "email": { "type": "string" },
                                    "code": { "type": "string" },
                                    "password": { "type": "string" }
                                }
                            }
                        }
                    }
                },
                "responses": { "204": { "description": "Password updated" } }
            }
        },
        "/api/v1/auth/login": {
            "post": {
                "summary": "Login",
                "requestBody": {
                    "required": true,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "required": ["login", "password"],
                                "properties": {
                                    "login": { "type": "string" },
                                    "password": { "type": "string" }
                                }
                            }
                        }
                    }
                },
                "responses": { "200": { "description": "Token and user info" } }
            }
        },
        "/api/v1/auth/me": {
            "get": {
                "summary": "Current user profile",
                "security": [{ "bearerAuth": [] }],
                "responses": { "200": { "description": "Current user profile" } }
            },
            "patch": {
                "summary": "Update current user profile",
                "security": [{ "bearerAuth": [] }],
                "requestBody": {
                    "required": true,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "email": { "type": "string" },
                                    "avatar_url": { "type": "string" }
                                }
                            }
                        }
                    }
                },
                "responses": { "200": { "description": "Updated user profile" } }
            }
        },
        "/api/v1/auth/me/password": {
            "post": {
                "summary": "Change current user password",
                "security": [{ "bearerAuth": [] }],
                "requestBody": {
                    "required": true,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "required": ["current_password", "new_password"],
                                "properties": {
                                    "current_password": { "type": "string" },
                                    "new_password": { "type": "string" }
                                }
                            }
                        }
                    }
                },
                "responses": { "204": { "description": "Password changed" } }
            }
        },
        "/api/v1/admin/registrations/pending": {
            "get": {
                "summary": "List pending registrations (admin)",
                "security": [{ "bearerAuth": [] }],
                "responses": { "200": { "description": "Pending users list" } }
            }
        },
        "/api/v1/admin/registrations/pending/count": {
            "get": {
                "summary": "Pending registrations count (admin)",
                "security": [{ "bearerAuth": [] }],
                "responses": { "200": { "description": "Pending count" } }
            }
        },
        "/api/v1/admin/registrations/{user_id}/approve": {
            "post": {
                "summary": "Approve registration (admin)",
                "security": [{ "bearerAuth": [] }],
                "parameters": [
                    {
                        "name": "user_id",
                        "in": "path",
                        "required": true,
                        "schema": { "type": "string", "format": "uuid" }
                    }
                ],
                "responses": { "200": { "description": "Approved" } }
            }
        },
        "/api/v1/admin/registrations/{user_id}/reject": {
            "post": {
                "summary": "Reject registration (admin)",
                "security": [{ "bearerAuth": [] }],
                "parameters": [
                    {
                        "name": "user_id",
                        "in": "path",
                        "required": true,
                        "schema": { "type": "string", "format": "uuid" }
                    }
                ],
                "responses": { "200": { "description": "Rejected" } }
            }
        },
        "/api/v1/admin/users": {
            "get": {
                "summary": "List all users (admin)",
                "security": [{ "bearerAuth": [] }],
                "parameters": [
                    {
                        "name": "limit",
                        "in": "query",
                        "schema": { "type": "integer", "minimum": 1, "maximum": 500, "default": 100 }
                    },
                    {
                        "name": "offset",
                        "in": "query",
                        "schema": { "type": "integer", "minimum": 0, "default": 0 }
                    },
                    {
                        "name": "search",
                        "in": "query",
                        "schema": { "type": "string" }
                    },
                    {
                        "name": "role",
                        "in": "query",
                        "schema": { "type": "string", "enum": ["all", "admin", "user"] }
                    },
                    {
                        "name": "status",
                        "in": "query",
                        "schema": { "type": "string", "enum": ["all", "pending", "approved", "rejected"] }
                    },
                    {
                        "name": "sort",
                        "in": "query",
                        "schema": { "type": "string", "enum": ["newest", "oldest"] }
                    }
                ],
                "responses": { "200": { "description": "Users list" } }
            }
        },
        "/api/v1/admin/users/{user_id}/role": {
            "patch": {
                "summary": "Update user role (admin)",
                "security": [{ "bearerAuth": [] }],
                "parameters": [
                    {
                        "name": "user_id",
                        "in": "path",
                        "required": true,
                        "schema": { "type": "string", "format": "uuid" }
                    }
                ],
                "requestBody": {
                    "required": true,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "required": ["role"],
                                "properties": {
                                    "role": { "type": "string", "enum": ["admin", "user"] }
                                }
                            }
                        }
                    }
                },
                "responses": { "200": { "description": "Role updated" } }
            }
        },
        "/api/v1/admin/users/{user_id}": {
            "delete": {
                "summary": "Delete user (admin)",
                "security": [{ "bearerAuth": [] }],
                "parameters": [
                    {
                        "name": "user_id",
                        "in": "path",
                        "required": true,
                        "schema": { "type": "string", "format": "uuid" }
                    }
                ],
                "responses": { "204": { "description": "User deleted" } }
            }
        }
    })
}
