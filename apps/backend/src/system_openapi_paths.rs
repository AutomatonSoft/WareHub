use serde_json::{json, Value};

pub(crate) fn openapi_paths() -> Value {
    json!({
        "/api/v1/meta": {
            "get": {
                "tags": ["System"],
                "summary": "Read API metadata",
                "description": "Returns stable backend identity fields used by clients and diagnostics.",
                "operationId": "getApiMeta",
                "responses": {
                    "200": {
                        "description": "Backend metadata.",
                        "content": {
                            "application/json": {
                                "schema": { "$ref": "#/components/schemas/ApiInfoResponse" }
                            }
                        }
                    }
                }
            }
        },
        "/api/v1/openapi.json": {
            "get": {
                "tags": ["System"],
                "summary": "Download OpenAPI schema",
                "description": "Returns the generated OpenAPI document used by Scalar and typed clients.",
                "operationId": "getOpenApiDocument",
                "responses": {
                    "200": { "description": "OpenAPI JSON document." }
                }
            }
        },
        "/api/v1/scalar": {
            "get": {
                "tags": ["System"],
                "summary": "Open Scalar documentation UI",
                "description": "Serves the interactive API reference page backed by `/api/v1/openapi.json`.",
                "operationId": "getScalarUi",
                "responses": {
                    "200": { "description": "Scalar API docs page." }
                }
            }
        },
        "/api/v1/healthz": {
            "get": {
                "tags": ["System"],
                "summary": "Liveness check",
                "description": "Fast process-level healthcheck. Does not verify database connectivity.",
                "operationId": "getHealthz",
                "responses": {
                    "200": {
                        "description": "Backend process is alive.",
                        "content": {
                            "application/json": {
                                "schema": { "$ref": "#/components/schemas/HealthResponse" }
                            }
                        }
                    }
                }
            }
        },
        "/api/v1/readyz": {
            "get": {
                "tags": ["System"],
                "summary": "Readiness check",
                "description": "Checks whether the backend can reach its database and serve traffic safely.",
                "operationId": "getReadyz",
                "responses": {
                    "200": {
                        "description": "Backend is ready.",
                        "content": {
                            "application/json": {
                                "schema": { "$ref": "#/components/schemas/HealthResponse" }
                            }
                        }
                    },
                    "503": {
                        "description": "Database or required dependency is not ready.",
                        "content": {
                            "application/json": {
                                "schema": { "$ref": "#/components/schemas/ErrorResponse" },
                                "example": {
                                    "code": "database_unavailable",
                                    "message": "database is not ready",
                                    "request_id": "d03eb0f7-7480-4f49-b7b3-c254b4ca3e1b"
                                }
                            }
                        }
                    }
                }
            }
        },
        "/api/v1/mobile/app-update": {
            "get": {
                "tags": ["Mobile"],
                "summary": "Get mobile app update metadata",
                "description": "Returns the current APK channel, latest version and download URL for the active environment.",
                "operationId": "getMobileAppUpdate",
                "responses": {
                    "200": {
                        "description": "Current mobile release metadata.",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "required": ["channel", "latest_version", "apk_url"],
                                    "properties": {
                                        "channel": { "type": "string", "example": "stage" },
                                        "latest_version": { "type": "string", "example": "v1.2.3" },
                                        "apk_url": { "type": "string" }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        "/api/v1/logs": {
            "get": {
                "tags": ["Logs"],
                "summary": "Open service log viewer",
                "description": "Serves a small internal HTML log viewer that polls the log channel endpoints.",
                "operationId": "getServiceLogsPage",
                "security": [{ "bearerAuth": [] }],
                "responses": {
                    "200": { "description": "HTML page with log viewer UI." },
                    "401": {
                        "description": "Missing or invalid auth token.",
                        "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } }
                    },
                    "403": {
                        "description": "User is authenticated but not approved.",
                        "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } }
                    }
                }
            }
        },
        "/api/v1/logs/{channel}": {
            "get": {
                "tags": ["Logs"],
                "summary": "List service logs by channel",
                "description": "Returns recent in-memory log entries for one channel: `backend`, `frontend` or `mobile`.",
                "operationId": "listServiceLogs",
                "security": [{ "bearerAuth": [] }],
                "parameters": [
                    {
                        "name": "channel",
                        "in": "path",
                        "required": true,
                        "description": "Log channel to read.",
                        "schema": { "type": "string", "enum": ["backend", "frontend", "mobile"] }
                    },
                    {
                        "name": "limit",
                        "in": "query",
                        "description": "Maximum number of log rows to return.",
                        "schema": { "type": "integer", "minimum": 1, "maximum": 1000, "default": 200 }
                    }
                ],
                "responses": {
                    "200": {
                        "description": "Recent log entries for the selected channel.",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "array",
                                    "items": { "$ref": "#/components/schemas/ServiceLogEntry" }
                                }
                            }
                        }
                    },
                    "400": {
                        "description": "Unsupported channel or invalid query.",
                        "content": {
                            "application/json": {
                                "schema": { "$ref": "#/components/schemas/ErrorResponse" },
                                "example": {
                                    "code": "invalid_log_channel",
                                    "message": "channel must be one of: frontend, backend, mobile",
                                    "request_id": "7ca3cf0f-92e2-4639-a5d8-09d6570df4e8"
                                }
                            }
                        }
                    },
                    "401": {
                        "description": "Missing or invalid auth token.",
                        "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } }
                    },
                    "403": {
                        "description": "User is authenticated but not approved.",
                        "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } }
                    }
                }
            },
            "post": {
                "tags": ["Logs"],
                "summary": "Append service log entry",
                "description": "Writes one in-memory log entry into the selected channel for internal debugging.",
                "operationId": "createServiceLog",
                "security": [{ "bearerAuth": [] }],
                "parameters": [
                    {
                        "name": "channel",
                        "in": "path",
                        "required": true,
                        "description": "Target log channel.",
                        "schema": { "type": "string", "enum": ["backend", "frontend", "mobile"] }
                    }
                ],
                "requestBody": {
                    "required": true,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "required": ["message"],
                                "properties": {
                                    "level": {
                                        "type": "string",
                                        "description": "Optional log level. Unsupported values fallback to `info`.",
                                        "enum": ["debug", "info", "warn", "warning", "error"]
                                    },
                                    "message": {
                                        "type": "string",
                                        "minLength": 1,
                                        "maxLength": 1024,
                                        "description": "Human-readable log message."
                                    },
                                    "context": {
                                        "type": "string",
                                        "maxLength": 8192,
                                        "nullable": true,
                                        "description": "Optional structured or free-form debug context."
                                    }
                                }
                            }
                        }
                    }
                },
                "responses": {
                    "202": { "description": "Log entry accepted and stored in memory." },
                    "400": {
                        "description": "Invalid channel or message payload.",
                        "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } }
                    },
                    "401": {
                        "description": "Missing or invalid auth token.",
                        "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } }
                    },
                    "403": {
                        "description": "User is authenticated but not approved.",
                        "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } }
                    }
                }
            }
        },
        "/api/v1/auth/register": {
            "post": {
                "tags": ["Auth"],
                "summary": "Register new user account",
                "description": "Creates a user in `pending` status. An admin must approve the account before login is allowed.",
                "operationId": "registerUser",
                "requestBody": {
                    "required": true,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "required": ["email", "login", "first_name", "last_name", "phone_number", "password"],
                                "properties": {
                                    "email": { "type": "string", "format": "email", "maxLength": 254 },
                                    "username": {
                                        "type": "string",
                                        "nullable": true,
                                        "minLength": 3,
                                        "maxLength": 32,
                                        "description": "Optional public username. Only letters, digits and underscore are allowed."
                                    },
                                    "login": {
                                        "type": "string",
                                        "minLength": 3,
                                        "maxLength": 64,
                                        "description": "Unique login. Allowed characters: letters, digits, dot, underscore and hyphen."
                                    },
                                    "first_name": { "type": "string", "minLength": 1, "maxLength": 64 },
                                    "last_name": { "type": "string", "minLength": 1, "maxLength": 64 },
                                    "phone_number": { "type": "string", "minLength": 7, "maxLength": 24 },
                                    "password": {
                                        "type": "string",
                                        "minLength": 8,
                                        "maxLength": 128,
                                        "description": "Must contain uppercase, lowercase and digit."
                                    }
                                }
                            }
                        }
                    }
                },
                "responses": {
                    "201": {
                        "description": "Registration accepted and stored as pending.",
                        "content": {
                            "application/json": {
                                "schema": { "$ref": "#/components/schemas/RegisterResponse" }
                            }
                        }
                    },
                    "400": {
                        "description": "Validation failed or registration cannot be accepted.",
                        "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } }
                    }
                }
            }
        },
        "/api/v1/auth/login": {
            "post": {
                "tags": ["Auth"],
                "summary": "Login with credentials",
                "description": "Authenticates the user, returns bearer access and refresh tokens, and sets an HTTP-only refresh cookie for browser clients.",
                "operationId": "loginUser",
                "parameters": [
                    {
                        "name": "x-warehub-client",
                        "in": "header",
                        "required": false,
                        "schema": { "type": "string", "enum": ["mobile"] },
                        "description": "Set to `mobile` to receive `refresh_token` in the JSON response."
                    }
                ],
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
                "responses": {
                    "200": {
                        "description": "Authenticated user and new access token.",
                        "headers": {
                            "Set-Cookie": {
                                "description": "Refresh session cookie (`sofortbot_refresh_token`).",
                                "schema": { "type": "string" }
                            }
                        },
                        "content": {
                            "application/json": {
                                "schema": { "$ref": "#/components/schemas/LoginResponse" }
                            }
                        }
                    },
                    "400": {
                        "description": "Invalid credentials or malformed login payload.",
                        "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } }
                    },
                    "403": {
                        "description": "Account exists but is pending approval or has been rejected.",
                        "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } }
                    }
                }
            }
        },
        "/api/v1/auth/logout": {
            "post": {
                "tags": ["Auth"],
                "summary": "Logout current session",
                "description": "Revokes the presented access token if available, revokes the refresh token from JSON body or refresh session cookie if present, and clears the cookie client-side.",
                "operationId": "logoutUser",
                "parameters": [
                    {
                        "name": "x-warehub-client",
                        "in": "header",
                        "required": false,
                        "schema": { "type": "string", "enum": ["mobile"] },
                        "description": "Identifies mobile clients using JSON refresh tokens."
                    }
                ],
                "requestBody": {
                    "required": false,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "refresh_token": { "type": "string", "format": "uuid" }
                                }
                            }
                        }
                    }
                },
                "responses": {
                    "204": {
                        "description": "Logout completed and refresh cookie cleared.",
                        "headers": {
                            "Set-Cookie": {
                                "description": "Expired `sofortbot_refresh_token` cookie.",
                                "schema": { "type": "string" }
                            }
                        }
                    },
                    "500": {
                        "description": "Logout cleanup failed server-side.",
                        "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } }
                    }
                }
            }
        },
        "/api/v1/auth/refresh": {
            "post": {
                "tags": ["Auth"],
                "summary": "Refresh access token",
                "description": "Rotates the refresh session from JSON `refresh_token` or the HTTP-only cookie and returns fresh access and refresh tokens plus a new browser cookie.",
                "operationId": "refreshUser",
                "parameters": [
                    {
                        "name": "x-warehub-client",
                        "in": "header",
                        "required": false,
                        "schema": { "type": "string", "enum": ["mobile"] },
                        "description": "Set to `mobile` to receive the rotated `refresh_token` in the JSON response."
                    }
                ],
                "requestBody": {
                    "required": false,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "refresh_token": { "type": "string", "format": "uuid" }
                                }
                            }
                        }
                    }
                },
                "responses": {
                    "200": {
                        "description": "New access token and rotated refresh cookie.",
                        "headers": {
                            "Set-Cookie": {
                                "description": "New refresh session cookie (`sofortbot_refresh_token`).",
                                "schema": { "type": "string" }
                            }
                        },
                        "content": {
                            "application/json": {
                                "schema": { "$ref": "#/components/schemas/LoginResponse" }
                            }
                        }
                    },
                    "401": {
                        "description": "Missing, malformed, expired or revoked refresh cookie.",
                        "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } }
                    },
                    "403": {
                        "description": "Account is pending approval or rejected.",
                        "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } }
                    }
                }
            }
        },
        "/api/v1/auth/me": {
            "get": {
                "tags": ["Auth"],
                "summary": "Get current user profile",
                "description": "Returns the authenticated user's profile as stored in the backend.",
                "operationId": "getCurrentUser",
                "security": [{ "bearerAuth": [] }],
                "responses": {
                    "200": {
                        "description": "Current authenticated user profile.",
                        "content": {
                            "application/json": {
                                "schema": { "$ref": "#/components/schemas/AuthUserResponse" }
                            }
                        }
                    },
                    "401": {
                        "description": "Missing or invalid bearer token.",
                        "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } }
                    }
                }
            },
            "patch": {
                "tags": ["Auth"],
                "summary": "Update current user profile",
                "description": "Updates one or more editable profile fields. Empty payload is rejected.",
                "operationId": "updateCurrentUser",
                "security": [{ "bearerAuth": [] }],
                "requestBody": {
                    "required": true,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "email": { "type": "string", "format": "email", "nullable": true },
                                    "first_name": { "type": "string", "maxLength": 64, "nullable": true },
                                    "last_name": { "type": "string", "maxLength": 64, "nullable": true },
                                    "phone_number": { "type": "string", "minLength": 7, "maxLength": 24, "nullable": true },
                                    "avatar_url": {
                                        "type": "string",
                                        "nullable": true,
                                        "description": "Use `/uploads/...`, `http://...`, `https://...`, or empty string to clear."
                                    }
                                }
                            }
                        }
                    }
                },
                "responses": {
                    "200": {
                        "description": "Updated current user profile.",
                        "content": {
                            "application/json": {
                                "schema": { "$ref": "#/components/schemas/AuthUserResponse" }
                            }
                        }
                    },
                    "400": {
                        "description": "Payload validation failed, nothing to update, or email already taken.",
                        "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } }
                    },
                    "401": {
                        "description": "Missing or invalid bearer token.",
                        "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } }
                    }
                }
            }
        },
        "/api/v1/auth/me/password": {
            "post": {
                "tags": ["Auth"],
                "summary": "Change current password",
                "description": "Validates the current password, sets a new password, then revokes all existing access and refresh sessions for that user.",
                "operationId": "changeCurrentUserPassword",
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
                                    "new_password": {
                                        "type": "string",
                                        "minLength": 8,
                                        "maxLength": 128,
                                        "description": "Must satisfy backend password policy."
                                    }
                                }
                            }
                        }
                    }
                },
                "responses": {
                    "204": { "description": "Password changed and all active sessions revoked." },
                    "400": {
                        "description": "Current password invalid or new password failed validation.",
                        "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } }
                    },
                    "401": {
                        "description": "Missing or invalid bearer token.",
                        "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } }
                    }
                }
            }
        },
        "/api/v1/auth/me/password/request-code": {
            "post": {
                "tags": ["Auth"],
                "summary": "Request email confirmation code for password change",
                "description": "Verifies the current password and sends a one-time confirmation code to the authenticated user's email address.",
                "operationId": "requestAuthenticatedPasswordChangeCode",
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
                                    "new_password": { "type": "string", "minLength": 8, "maxLength": 128 }
                                }
                            }
                        }
                    }
                },
                "responses": {
                    "204": { "description": "Verification code sent to the current user email if request is valid." },
                    "400": {
                        "description": "Current password invalid, new password invalid, or email delivery preconditions not met.",
                        "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } }
                    },
                    "401": {
                        "description": "Missing or invalid bearer token.",
                        "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } }
                    }
                }
            }
        },
        "/api/v1/auth/me/password/confirm": {
            "post": {
                "tags": ["Auth"],
                "summary": "Confirm password change with email code",
                "description": "Completes authenticated password change after the user submits the code received by email.",
                "operationId": "confirmAuthenticatedPasswordChange",
                "security": [{ "bearerAuth": [] }],
                "requestBody": {
                    "required": true,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "required": ["current_password", "new_password", "code"],
                                "properties": {
                                    "current_password": { "type": "string" },
                                    "new_password": { "type": "string", "minLength": 8, "maxLength": 128 },
                                    "code": { "type": "string", "description": "One-time email confirmation code." }
                                }
                            }
                        }
                    }
                },
                "responses": {
                    "204": { "description": "Password changed after code confirmation." },
                    "400": {
                        "description": "Verification code invalid or expired, or new password failed validation.",
                        "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } }
                    },
                    "401": {
                        "description": "Missing or invalid bearer token.",
                        "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } }
                    }
                }
            }
        },
        "/api/v1/auth/password/reset/request": {
            "post": {
                "tags": ["Auth"],
                "summary": "Request password reset code",
                "description": "Starts unauthenticated password reset flow. For privacy, successful response does not reveal whether the email exists.",
                "operationId": "requestPasswordReset",
                "requestBody": {
                    "required": true,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "required": ["email"],
                                "properties": {
                                    "email": { "type": "string", "format": "email" }
                                }
                            }
                        }
                    }
                },
                "responses": {
                    "204": { "description": "Reset code flow accepted. Response is intentionally opaque." },
                    "400": {
                        "description": "Malformed request payload.",
                        "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } }
                    }
                }
            }
        },
        "/api/v1/auth/password/reset/confirm": {
            "post": {
                "tags": ["Auth"],
                "summary": "Confirm password reset",
                "description": "Completes password reset using email, reset code and new password.",
                "operationId": "confirmPasswordReset",
                "requestBody": {
                    "required": true,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "required": ["email", "code", "password"],
                                "properties": {
                                    "email": { "type": "string", "format": "email" },
                                    "code": { "type": "string" },
                                    "password": { "type": "string", "minLength": 8, "maxLength": 128 }
                                }
                            }
                        }
                    }
                },
                "responses": {
                    "204": { "description": "Password reset completed." },
                    "400": {
                        "description": "Reset code invalid or expired, or password validation failed.",
                        "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } }
                    }
                }
            }
        },
        "/api/v1/intakes": {
            "get": {
                "tags": ["Intakes"],
                "summary": "List intakes",
                "description": "Returns intake rows with pagination and simple search/filtering by section and activity state.",
                "operationId": "listIntakes",
                "security": [{ "bearerAuth": [] }],
                "parameters": [
                    {
                        "name": "limit",
                        "in": "query",
                        "description": "Page size.",
                        "schema": { "type": "integer", "minimum": 1, "maximum": 200, "default": 50 }
                    },
                    {
                        "name": "offset",
                        "in": "query",
                        "description": "Zero-based row offset.",
                        "schema": { "type": "integer", "minimum": 0, "default": 0 }
                    },
                    {
                        "name": "search",
                        "in": "query",
                        "description": "Free-text search over intake-identifying fields.",
                        "schema": { "type": "string" }
                    },
                    {
                        "name": "section",
                        "in": "query",
                        "description": "Warehouse section filter.",
                        "schema": { "type": "string", "enum": ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "M"] }
                    },
                    {
                        "name": "activity",
                        "in": "query",
                        "description": "Activity filter: active, inactive or all.",
                        "schema": { "type": "string", "enum": ["active", "inactive", "all"] }
                    }
                ],
                "responses": {
                    "200": {
                        "description": "Matching intake rows.",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "array",
                                    "items": { "$ref": "#/components/schemas/IntakeDto" }
                                }
                            }
                        }
                    },
                    "400": {
                        "description": "Invalid filter values, for example unsupported section or activity.",
                        "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } }
                    },
                    "401": {
                        "description": "Missing or invalid bearer token.",
                        "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } }
                    },
                    "403": {
                        "description": "User is authenticated but not approved.",
                        "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } }
                    }
                }
            },
            "post": {
                "tags": ["Intakes"],
                "summary": "Create intake",
                "description": "Creates one or more intake rows for a scanned product and returns the first created row.",
                "operationId": "createIntake",
                "security": [{ "bearerAuth": [] }],
                "requestBody": {
                    "required": true,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "required": ["qr_code", "kid_number"],
                                "properties": {
                                    "qr_code": { "type": "string", "description": "Scanned QR code payload." },
                                    "warehouse_location": { "type": "string", "nullable": true, "description": "Manual location. Usually omitted for automatic placement." },
                                    "placement_section": { "type": "string", "nullable": true, "enum": ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "M"], "description": "Required only for `pool_auto` placement." },
                                    "kid_number": { "type": "string", "description": "Product KID identifier." },
                                    "photo_url": { "type": "string", "nullable": true },
                                    "product_key": { "type": "string", "nullable": true },
                                    "product_color": { "type": "string", "nullable": true },
                                    "store": { "type": "boolean", "nullable": true, "default": false },
                                    "in_transit": { "type": "boolean", "nullable": true, "default": false },
                                    "category_main": { "type": "string", "nullable": true },
                                    "category_sub": { "type": "string", "nullable": true },
                                    "is_b_ware": { "type": "boolean", "nullable": true, "default": false },
                                    "b_ware_comment": { "type": "string", "nullable": true },
                                    "box_total": { "type": "integer", "minimum": 1, "maximum": 100, "nullable": true, "default": 1 },
                                    "placement_strategy": {
                                        "type": "string",
                                        "nullable": true,
                                        "enum": ["same_if_exists", "always_new", "manual", "pool_auto"],
                                        "description": "Placement decision mode. Defaults to backend strategy when omitted."
                                    }
                                }
                            }
                        }
                    }
                },
                "responses": {
                    "201": {
                        "description": "First created intake row.",
                        "content": {
                            "application/json": {
                                "schema": { "$ref": "#/components/schemas/IntakeDto" }
                            }
                        }
                    },
                    "400": {
                        "description": "Validation failed, for example invalid KID, section or placement inputs.",
                        "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } }
                    },
                    "401": {
                        "description": "Missing or invalid bearer token.",
                        "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } }
                    },
                    "403": {
                        "description": "User is authenticated but not approved.",
                        "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } }
                    },
                    "409": {
                        "description": "Duplicate intake detected for the same unique intake tuple.",
                        "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } }
                    }
                }
            }
        },
        "/api/v1/kids": {
            "post": {
                "tags": ["Intakes"],
                "summary": "Legacy alias for intake creation",
                "description": "Creates intake rows using the same payload and behavior as `POST /api/v1/intakes`. Kept for compatibility with older clients.",
                "operationId": "createIntakeViaKidsAlias",
                "deprecated": true,
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
                                    "warehouse_location": { "type": "string", "nullable": true },
                                    "placement_section": { "type": "string", "nullable": true, "enum": ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "M"] },
                                    "kid_number": { "type": "string" },
                                    "photo_url": { "type": "string", "nullable": true },
                                    "product_key": { "type": "string", "nullable": true },
                                    "product_color": { "type": "string", "nullable": true },
                                    "store": { "type": "boolean", "nullable": true },
                                    "in_transit": { "type": "boolean", "nullable": true },
                                    "category_main": { "type": "string", "nullable": true },
                                    "category_sub": { "type": "string", "nullable": true },
                                    "is_b_ware": { "type": "boolean", "nullable": true },
                                    "b_ware_comment": { "type": "string", "nullable": true },
                                    "box_total": { "type": "integer", "minimum": 1, "maximum": 100, "nullable": true },
                                    "placement_strategy": { "type": "string", "nullable": true, "enum": ["same_if_exists", "always_new", "manual", "pool_auto"] }
                                }
                            }
                        }
                    }
                },
                "responses": {
                    "201": {
                        "description": "First created intake row.",
                        "content": { "application/json": { "schema": { "$ref": "#/components/schemas/IntakeDto" } } }
                    },
                    "400": { "description": "Payload validation failed.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "401": { "description": "Missing or invalid bearer token.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "403": { "description": "User is authenticated but not approved.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "409": { "description": "Duplicate intake detected.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } }
                }
            }
        },
        "/api/v1/kids/": {
            "post": {
                "tags": ["Intakes"],
                "summary": "Legacy alias for intake creation",
                "description": "Creates intake rows using the same payload and behavior as `POST /api/v1/intakes`. Kept for compatibility with older clients that still send the trailing slash variant.",
                "operationId": "createIntakeViaKidsAliasTrailingSlash",
                "deprecated": true,
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
                                    "warehouse_location": { "type": "string", "nullable": true },
                                    "placement_section": { "type": "string", "nullable": true, "enum": ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "M"] },
                                    "kid_number": { "type": "string" },
                                    "photo_url": { "type": "string", "nullable": true },
                                    "product_key": { "type": "string", "nullable": true },
                                    "product_color": { "type": "string", "nullable": true },
                                    "store": { "type": "boolean", "nullable": true },
                                    "in_transit": { "type": "boolean", "nullable": true },
                                    "category_main": { "type": "string", "nullable": true },
                                    "category_sub": { "type": "string", "nullable": true },
                                    "is_b_ware": { "type": "boolean", "nullable": true },
                                    "b_ware_comment": { "type": "string", "nullable": true },
                                    "box_total": { "type": "integer", "minimum": 1, "maximum": 100, "nullable": true },
                                    "placement_strategy": { "type": "string", "nullable": true, "enum": ["same_if_exists", "always_new", "manual", "pool_auto"] }
                                }
                            }
                        }
                    }
                },
                "responses": {
                    "201": {
                        "description": "First created intake row.",
                        "content": { "application/json": { "schema": { "$ref": "#/components/schemas/IntakeDto" } } }
                    },
                    "400": { "description": "Payload validation failed.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "401": { "description": "Missing or invalid bearer token.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "403": { "description": "User is authenticated but not approved.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "409": { "description": "Duplicate intake detected.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } }
                }
            }
        },
        "/api/v1/intakes/products/stats": {
            "get": {
                "tags": ["Intakes"],
                "summary": "List product stock statistics",
                "description": "Aggregates active stock by product reference for inventory overview screens.",
                "operationId": "listProductStats",
                "security": [{ "bearerAuth": [] }],
                "responses": {
                    "200": {
                        "description": "Aggregated product stock rows.",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "array",
                                    "items": { "$ref": "#/components/schemas/ProductStockStatDto" }
                                }
                            }
                        }
                    },
                    "401": { "description": "Missing or invalid bearer token.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "403": { "description": "User is authenticated but not approved.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } }
                }
            }
        },
        "/api/v1/intakes/suggest-placement": {
            "post": {
                "tags": ["Placement"],
                "summary": "Suggest placement",
                "description": "Returns backend-calculated placement recommendation for a product key.",
                "operationId": "suggestPlacement",
                "security": [{ "bearerAuth": [] }],
                "requestBody": {
                    "required": true,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "required": ["product_key"],
                                "properties": {
                                    "product_key": { "type": "string", "description": "Product reference used for placement lookup." }
                                }
                            }
                        }
                    }
                },
                "responses": {
                    "200": {
                        "description": "Placement suggestion payload.",
                        "content": { "application/json": { "schema": { "type": "object", "additionalProperties": true } } }
                    },
                    "400": { "description": "Invalid product key or placement request.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "401": { "description": "Missing or invalid bearer token.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "403": { "description": "User is authenticated but not approved.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "409": { "description": "Placement conflict detected.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } }
                }
            }
        },
        "/api/v1/intakes/{intake_id}": {
            "delete": {
                "tags": ["Intakes"],
                "summary": "Delete intake by id",
                "description": "Deletes one intake row. Default mode is soft delete; hard delete physically removes the row and photo linkage.",
                "operationId": "deleteIntake",
                "security": [{ "bearerAuth": [] }],
                "parameters": [
                    {
                        "name": "intake_id",
                        "in": "path",
                        "required": true,
                        "description": "Intake UUID.",
                        "schema": { "type": "string", "format": "uuid" }
                    },
                    {
                        "name": "mode",
                        "in": "query",
                        "description": "Delete mode. `soft` is default; `hard` fully removes the row.",
                        "schema": { "type": "string", "enum": ["soft", "hard"], "default": "soft" }
                    }
                ],
                "responses": {
                    "204": { "description": "Intake deleted." },
                    "400": { "description": "Invalid delete mode.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "401": { "description": "Missing or invalid bearer token.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "403": { "description": "User is authenticated but not approved or delete mode is forbidden.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "404": { "description": "Intake not found.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } }
                }
            }
        },
        "/api/v1/intakes/{intake_id}/photo": {
            "patch": {
                "tags": ["Intakes"],
                "summary": "Update intake photo URL",
                "description": "Sets or clears `photo_url` for one intake row. Empty string clears the current photo reference.",
                "operationId": "updateIntakePhoto",
                "security": [{ "bearerAuth": [] }],
                "parameters": [
                    {
                        "name": "intake_id",
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
                                "properties": {
                                    "photo_url": {
                                        "type": "string",
                                        "nullable": true,
                                        "maxLength": 4000,
                                        "description": "New photo URL. Empty string or null clears the value."
                                    }
                                }
                            }
                        }
                    }
                },
                "responses": {
                    "200": {
                        "description": "Updated intake row.",
                        "content": {
                            "application/json": {
                                "schema": { "$ref": "#/components/schemas/IntakeDto" }
                            }
                        }
                    },
                    "400": { "description": "Invalid `photo_url` value.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "401": { "description": "Missing or invalid bearer token.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "403": { "description": "User is authenticated but not approved.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "404": { "description": "Intake not found.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } }
                }
            }
        },
        "/api/v1/intakes/by-location": {
            "delete": {
                "tags": ["Placement"],
                "summary": "Delete oldest intake in a slot",
                "description": "FIFO delete for one physical warehouse location identified by section and slot number.",
                "operationId": "deleteOldestIntakeByLocation",
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
                "responses": {
                    "200": {
                        "description": "Deletion result for the selected slot.",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "required": ["removed_count", "section", "slot_number", "warehouse_location"],
                                    "properties": {
                                        "removed_count": { "type": "integer" },
                                        "section": { "type": "string" },
                                        "slot_number": { "type": "integer" },
                                        "warehouse_location": { "type": "string" }
                                    }
                                }
                            }
                        }
                    },
                    "400": { "description": "Invalid location query.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "401": { "description": "Missing or invalid bearer token.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "403": { "description": "User is authenticated but not approved.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "404": { "description": "No active intake found for the given location.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } }
                }
            }
        },
        "/api/v1/intakes/ws": {
            "get": {
                "tags": ["Realtime"],
                "summary": "Open intake events websocket",
                "description": "Streams intake create, update and delete events. Preferred auth is `Sec-WebSocket-Protocol: auth.<token>`.",
                "operationId": "openIntakesWebsocket",
                "security": [{ "bearerAuth": [] }],
                "parameters": [
                    {
                        "name": "token",
                        "in": "query",
                        "schema": { "type": "string", "format": "uuid" },
                        "deprecated": true,
                        "description": "Legacy auth fallback. Prefer websocket subprotocol authentication."
                    }
                ],
                "responses": {
                    "101": { "description": "Websocket handshake accepted." },
                    "401": { "description": "Missing or invalid websocket auth token.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } }
                }
            }
        },
        "/api/v1/label-layout": {
            "get": {
                "tags": ["Settings"],
                "summary": "Get label layout settings",
                "description": "Returns global label content offsets and scaling used by printing flows.",
                "operationId": "getLabelLayoutSettings",
                "security": [{ "bearerAuth": [] }],
                "responses": {
                    "200": {
                        "description": "Current label layout settings.",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "required": ["qr_scale", "qr_offset_x", "qr_offset_y", "main_scale", "main_offset_x", "main_offset_y", "parts_scale", "parts_offset_x", "parts_offset_y"],
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
                    "401": { "description": "Missing or invalid bearer token.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } }
                }
            },
            "put": {
                "tags": ["Settings"],
                "summary": "Update label layout settings",
                "description": "Replaces the global layout configuration used for label rendering.",
                "operationId": "updateLabelLayoutSettings",
                "security": [{ "bearerAuth": [] }],
                "requestBody": {
                    "required": true,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "required": ["qr_scale", "qr_offset_x", "qr_offset_y", "main_scale", "main_offset_x", "main_offset_y", "parts_scale", "parts_offset_x", "parts_offset_y"],
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
                "responses": {
                    "200": { "description": "Settings saved.", "content": { "application/json": { "schema": { "type": "object", "additionalProperties": true } } } },
                    "400": { "description": "Invalid numeric settings payload.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "401": { "description": "Missing or invalid bearer token.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } }
                }
            }
        },
        "/api/v1/printer-setup": {
            "get": {
                "tags": ["Settings"],
                "summary": "Get printer setup settings",
                "description": "Returns global printer dimensions, density and preview mode flags.",
                "operationId": "getPrinterSetupSettings",
                "security": [{ "bearerAuth": [] }],
                "responses": {
                    "200": {
                        "description": "Current printer setup settings.",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "required": ["print_width_px", "print_height_px", "print_density", "print_label_type", "print_inter_label_delay_ms", "print_preview_only"],
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
                    "401": { "description": "Missing or invalid bearer token.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } }
                }
            },
            "put": {
                "tags": ["Settings"],
                "summary": "Update printer setup settings",
                "description": "Replaces the global printer configuration used by label printing flows.",
                "operationId": "updatePrinterSetupSettings",
                "security": [{ "bearerAuth": [] }],
                "requestBody": {
                    "required": true,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "required": ["print_width_px", "print_height_px", "print_density", "print_label_type", "print_inter_label_delay_ms", "print_preview_only"],
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
                "responses": {
                    "200": { "description": "Settings saved.", "content": { "application/json": { "schema": { "type": "object", "additionalProperties": true } } } },
                    "400": { "description": "Invalid printer settings payload.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "401": { "description": "Missing or invalid bearer token.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } }
                }
            }
        },
        "/api/v1/admin/intakes/photos/cleanup": {
            "post": {
                "tags": ["Admin"],
                "summary": "Cleanup orphaned intake photos",
                "description": "Scans removed intakes and deletes orphaned uploaded files. Supports dry-run mode for safe diagnostics.",
                "operationId": "cleanupRemovedIntakePhotos",
                "security": [{ "bearerAuth": [] }],
                "parameters": [
                    {
                        "name": "dry_run",
                        "in": "query",
                        "description": "When true, only simulates cleanup without deleting files or clearing rows.",
                        "schema": { "type": "boolean", "default": false }
                    },
                    {
                        "name": "limit",
                        "in": "query",
                        "description": "Maximum number of candidate rows to scan.",
                        "schema": { "type": "integer", "minimum": 1, "maximum": 2000, "default": 200 }
                    }
                ],
                "responses": {
                    "200": {
                        "description": "Cleanup execution summary.",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "required": ["request_id", "scanned", "deleted_files", "failed_files", "cleared_rows", "dry_run"],
                                    "properties": {
                                        "request_id": { "type": "string" },
                                        "scanned": { "type": "integer" },
                                        "deleted_files": { "type": "integer" },
                                        "failed_files": { "type": "integer" },
                                        "cleared_rows": { "type": "integer" },
                                        "dry_run": { "type": "boolean" }
                                    }
                                }
                            }
                        }
                    },
                    "400": { "description": "Invalid cleanup query.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "401": { "description": "Missing or invalid bearer token.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "403": { "description": "Admin role required.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } }
                }
            }
        },
        "/api/v1/admin/intakes/photos/cleanup/status": {
            "get": {
                "tags": ["Admin"],
                "summary": "Get photo cleanup retry queue status",
                "description": "Returns current retry queue metrics for failed orphan-photo cleanup jobs.",
                "operationId": "getPhotoCleanupRetryQueueStatus",
                "security": [{ "bearerAuth": [] }],
                "responses": {
                    "200": {
                        "description": "Retry queue summary.",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "required": ["request_id", "pending_count", "due_count", "max_attempts"],
                                    "properties": {
                                        "request_id": { "type": "string" },
                                        "pending_count": { "type": "integer" },
                                        "due_count": { "type": "integer" },
                                        "max_attempts": { "type": "integer" },
                                        "oldest_created_at": { "type": "string", "format": "date-time", "nullable": true },
                                        "next_attempt_at": { "type": "string", "format": "date-time", "nullable": true }
                                    }
                                }
                            }
                        }
                    },
                    "401": { "description": "Missing or invalid bearer token.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "403": { "description": "Admin role required.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } }
                }
            }
        },
        "/api/v1/admin/audit/intakes/deletions": {
            "get": {
                "tags": ["Admin"],
                "summary": "List intake deletion audit logs",
                "description": "Returns admin-facing audit entries for soft and hard intake deletions with optional filters.",
                "operationId": "listIntakeDeletionAuditLogs",
                "security": [{ "bearerAuth": [] }],
                "parameters": [
                    {
                        "name": "limit",
                        "in": "query",
                        "description": "Maximum number of audit rows to return.",
                        "schema": { "type": "integer", "minimum": 1, "maximum": 500, "default": 100 }
                    },
                    {
                        "name": "actor_login",
                        "in": "query",
                        "description": "Filter by actor login.",
                        "schema": { "type": "string" }
                    },
                    {
                        "name": "request_id",
                        "in": "query",
                        "description": "Filter by request correlation id.",
                        "schema": { "type": "string" }
                    },
                    {
                        "name": "section",
                        "in": "query",
                        "description": "Filter by warehouse section.",
                        "schema": { "type": "string", "enum": ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "M"] }
                    },
                    {
                        "name": "from",
                        "in": "query",
                        "description": "Inclusive lower bound by timestamp.",
                        "schema": { "type": "string", "format": "date-time" }
                    },
                    {
                        "name": "to",
                        "in": "query",
                        "description": "Inclusive upper bound by timestamp.",
                        "schema": { "type": "string", "format": "date-time" }
                    }
                ],
                "responses": {
                    "200": {
                        "description": "Audit log rows.",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "array",
                                    "items": { "type": "object", "additionalProperties": true }
                                }
                            }
                        }
                    },
                    "400": { "description": "Invalid audit filter values.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "401": { "description": "Missing or invalid bearer token.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "403": { "description": "Admin role required.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } }
                }
            }
        },
        "/api/v1/admin/registrations/pending": {
            "get": {
                "tags": ["Admin"],
                "summary": "List pending registrations",
                "description": "Returns users waiting for admin approval.",
                "operationId": "listPendingRegistrations",
                "security": [{ "bearerAuth": [] }],
                "responses": {
                    "200": { "description": "Pending users list.", "content": { "application/json": { "schema": { "type": "array", "items": { "type": "object", "additionalProperties": true } } } } },
                    "401": { "description": "Missing or invalid bearer token.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "403": { "description": "Admin role required.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } }
                }
            }
        },
        "/api/v1/admin/registrations/pending/count": {
            "get": {
                "tags": ["Admin"],
                "summary": "Count pending registrations",
                "description": "Returns only the number of users waiting for admin approval.",
                "operationId": "countPendingRegistrations",
                "security": [{ "bearerAuth": [] }],
                "responses": {
                    "200": {
                        "description": "Pending registration count.",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "required": ["pending_count"],
                                    "properties": {
                                        "pending_count": { "type": "integer" }
                                    }
                                }
                            }
                        }
                    },
                    "401": { "description": "Missing or invalid bearer token.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "403": { "description": "Admin role required.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } }
                }
            }
        },
        "/api/v1/admin/registrations/{user_id}/approve": {
            "post": {
                "tags": ["Admin"],
                "summary": "Approve registration",
                "description": "Approves a pending user so the account can authenticate normally.",
                "operationId": "approveRegistration",
                "security": [{ "bearerAuth": [] }],
                "parameters": [
                    { "name": "user_id", "in": "path", "required": true, "schema": { "type": "string", "format": "uuid" } }
                ],
                "responses": {
                    "200": { "description": "User approved.", "content": { "application/json": { "schema": { "type": "object", "additionalProperties": true } } } },
                    "401": { "description": "Missing or invalid bearer token.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "403": { "description": "Admin role required.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "404": { "description": "User not found.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } }
                }
            }
        },
        "/api/v1/admin/registrations/{user_id}/reject": {
            "post": {
                "tags": ["Admin"],
                "summary": "Reject registration",
                "description": "Marks a pending registration as rejected.",
                "operationId": "rejectRegistration",
                "security": [{ "bearerAuth": [] }],
                "parameters": [
                    { "name": "user_id", "in": "path", "required": true, "schema": { "type": "string", "format": "uuid" } }
                ],
                "responses": {
                    "200": { "description": "User rejected.", "content": { "application/json": { "schema": { "type": "object", "additionalProperties": true } } } },
                    "401": { "description": "Missing or invalid bearer token.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "403": { "description": "Admin role required.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "404": { "description": "User not found.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } }
                }
            }
        },
        "/api/v1/admin/users": {
            "get": {
                "tags": ["Admin"],
                "summary": "List users",
                "description": "Admin user list with search, role filter, approval status filter and basic pagination.",
                "operationId": "listUsers",
                "security": [{ "bearerAuth": [] }],
                "parameters": [
                    { "name": "limit", "in": "query", "schema": { "type": "integer", "minimum": 1, "maximum": 500, "default": 100 } },
                    { "name": "offset", "in": "query", "schema": { "type": "integer", "minimum": 0, "default": 0 } },
                    { "name": "search", "in": "query", "schema": { "type": "string" } },
                    { "name": "role", "in": "query", "schema": { "type": "string", "enum": ["all", "admin", "user"] } },
                    { "name": "status", "in": "query", "schema": { "type": "string", "enum": ["all", "pending", "approved", "rejected"] } },
                    { "name": "sort", "in": "query", "schema": { "type": "string", "enum": ["newest", "oldest"] } }
                ],
                "responses": {
                    "200": { "description": "Users list.", "content": { "application/json": { "schema": { "type": "array", "items": { "type": "object", "additionalProperties": true } } } } },
                    "400": { "description": "Invalid list query.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "401": { "description": "Missing or invalid bearer token.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "403": { "description": "Admin role required.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } }
                }
            }
        },
        "/api/v1/admin/users/{user_id}/role": {
            "patch": {
                "tags": ["Admin"],
                "summary": "Update user role",
                "description": "Changes a user's role between `admin` and `user`.",
                "operationId": "updateUserRole",
                "security": [{ "bearerAuth": [] }],
                "parameters": [
                    { "name": "user_id", "in": "path", "required": true, "schema": { "type": "string", "format": "uuid" } }
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
                "responses": {
                    "200": { "description": "Role updated.", "content": { "application/json": { "schema": { "type": "object", "additionalProperties": true } } } },
                    "400": { "description": "Unsupported role value.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "401": { "description": "Missing or invalid bearer token.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "403": { "description": "Admin role required.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "404": { "description": "User not found.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } }
                }
            }
        },
        "/api/v1/admin/users/{user_id}": {
            "delete": {
                "tags": ["Admin"],
                "summary": "Delete user",
                "description": "Deletes a user account. Intended for admin moderation or cleanup.",
                "operationId": "deleteUser",
                "security": [{ "bearerAuth": [] }],
                "parameters": [
                    { "name": "user_id", "in": "path", "required": true, "schema": { "type": "string", "format": "uuid" } }
                ],
                "responses": {
                    "204": { "description": "User deleted." },
                    "401": { "description": "Missing or invalid bearer token.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "403": { "description": "Admin role required.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "404": { "description": "User not found.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } }
                }
            }
        },
        "/api/v1/uploads": {
            "post": {
                "tags": ["Uploads"],
                "summary": "Upload image",
                "description": "Uploads one file and returns its stored URL. Used for product images and avatars.",
                "operationId": "uploadPhoto",
                "security": [{ "bearerAuth": [] }],
                "parameters": [
                    {
                        "name": "kind",
                        "in": "query",
                        "description": "Upload target category.",
                        "schema": { "type": "string", "enum": ["product", "avatar"] }
                    },
                    {
                        "name": "name",
                        "in": "query",
                        "description": "Optional filename prefix used for the stored file name.",
                        "schema": { "type": "string" }
                    }
                ],
                "requestBody": {
                    "required": true,
                    "content": {
                        "multipart/form-data": {
                            "schema": {
                                "type": "object",
                                "required": ["file"],
                                "properties": {
                                    "file": { "type": "string", "format": "binary" }
                                }
                            }
                        }
                    }
                },
                "responses": {
                    "201": {
                        "description": "File stored successfully.",
                        "content": {
                            "application/json": {
                                "schema": { "$ref": "#/components/schemas/UploadResponse" }
                            }
                        }
                    },
                    "400": { "description": "Unsupported file payload or invalid query arguments.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "401": { "description": "Missing or invalid bearer token.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "403": { "description": "User is authenticated but not approved.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } }
                }
            }
        },
        "/api/v1/afterbuy/orders/{order_id}": {
            "get": {
                "tags": ["Afterbuy"],
                "summary": "Fetch Afterbuy order page",
                "description": "Resolves and returns backend-transformed Afterbuy order data for one order id.",
                "operationId": "fetchAfterbuyOrder",
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
                        "description": "Optional Afterbuy account key when multiple accounts are configured.",
                        "schema": { "type": "string" }
                    }
                ],
                "responses": {
                    "200": { "description": "Afterbuy order response.", "content": { "application/json": { "schema": { "type": "object", "additionalProperties": true } } } },
                    "400": { "description": "Invalid order lookup request.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "502": { "description": "Afterbuy upstream request failed.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } }
                }
            }
        },
        "/api/v1/afterbuy/kids/{kid_number}/orders": {
            "get": {
                "tags": ["Afterbuy"],
                "summary": "Find Afterbuy orders by KID",
                "description": "Looks up Afterbuy order ids associated with one KID number.",
                "operationId": "fetchAfterbuyOrdersByKid",
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
                        "description": "Optional Afterbuy account key when multiple accounts are configured.",
                        "schema": { "type": "string" }
                    }
                ],
                "responses": {
                    "200": { "description": "Afterbuy KID search response.", "content": { "application/json": { "schema": { "type": "object", "additionalProperties": true } } } },
                    "400": { "description": "Invalid KID lookup request.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "502": { "description": "Afterbuy upstream request failed.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } }
                }
            }
        },
        "/api/v1/afterbuy/health": {
            "get": {
                "tags": ["Afterbuy"],
                "summary": "Get Afterbuy integration health",
                "description": "Returns runtime configuration and health information for configured Afterbuy accounts.",
                "operationId": "getAfterbuyHealth",
                "security": [{ "bearerAuth": [] }],
                "responses": {
                    "200": { "description": "Afterbuy integration health.", "content": { "application/json": { "schema": { "type": "object", "additionalProperties": true } } } },
                    "401": { "description": "Missing or invalid bearer token.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                    "403": { "description": "User is authenticated but not approved.", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } }
                }
            }
        }
    })
}
