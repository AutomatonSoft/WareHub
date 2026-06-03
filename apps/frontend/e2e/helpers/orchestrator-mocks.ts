export type OrchestratorErrorFixture = {
  name: string;
  httpStatus: number;
  response: Record<string, unknown>;
};

function channelFailure(code: string, requestId: string, statusCode = 502, details: Record<string, unknown> = {}) {
  return {
    request_id: requestId,
    status: "partial_success",
    results: [
      {
        marketplace: "hood",
        target: "hood,account=jv",
        status: "success",
        status_code: 200,
        data: { ok: true }
      },
      {
        marketplace: "kaufland",
        target: "kaufland,account=jv",
        status: "failed",
        status_code: statusCode,
        error: {
          code,
          message: `Mocked error: ${code}`,
          request_id: requestId,
          details
        }
      }
    ]
  };
}

export const orchestratorErrorFixtures: OrchestratorErrorFixture[] = [
  {
    name: "orchestrator_request_validation_failed",
    httpStatus: 422,
    response: {
      code: "orchestrator_request_validation_failed",
      message: "Mocked request validation failure",
      request_id: "req-mock-001",
      details: { errors: [{ field: "channels", message: "must not be empty" }] }
    }
  },
  {
    name: "orchestrator_ean_empty",
    httpStatus: 422,
    response: {
      code: "orchestrator_ean_empty",
      message: "Mocked empty ean",
      request_id: "req-mock-002",
      details: {}
    }
  },
  { name: "orchestrator_channel_validation_failed", httpStatus: 200, response: channelFailure("orchestrator_channel_validation_failed", "req-mock-003", 422) },
  { name: "orchestrator_channel_timeout", httpStatus: 200, response: channelFailure("orchestrator_channel_timeout", "req-mock-004", 504) },
  { name: "orchestrator_channel_network", httpStatus: 200, response: channelFailure("orchestrator_channel_network", "req-mock-005", 503) },
  { name: "orchestrator_channel_retry_exhausted", httpStatus: 200, response: channelFailure("orchestrator_channel_retry_exhausted", "req-mock-006", 503) },
  { name: "orchestrator_channel_transport_error", httpStatus: 200, response: channelFailure("orchestrator_channel_transport_error", "req-mock-007", 500) },
  { name: "orchestrator_channel_upstream_4xx", httpStatus: 200, response: channelFailure("orchestrator_channel_upstream_4xx", "req-mock-008", 409, { upstream_response: { code: "conflict" } }) },
  { name: "orchestrator_channel_upstream_5xx", httpStatus: 200, response: channelFailure("orchestrator_channel_upstream_5xx", "req-mock-009", 502, { upstream_response: { code: "upstream_error" } }) },
  { name: "orchestrator_channel_request_failed", httpStatus: 200, response: channelFailure("orchestrator_channel_request_failed", "req-mock-010", 502) },
  {
    name: "orchestrator_proxy_failed",
    httpStatus: 502,
    response: {
      code: "orchestrator_proxy_failed",
      message: "Mocked proxy failure",
      request_id: "req-mock-011",
      details: {}
    }
  },
  { name: "orchestrator_unknown_code_fallback", httpStatus: 200, response: channelFailure("orchestrator_future_new_code", "req-mock-012", 520) }
];
