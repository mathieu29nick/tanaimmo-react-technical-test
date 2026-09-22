import test from "node:test";
import assert from "node:assert/strict";

import { createLead } from "../src/crm/crmClient.js";

const lead = {
  listingId: 42,
  name: "Jean Dupont",
  phone: "0340000000",
  email: "jean@example.com",
  message: "Je souhaite avoir plus d'informations.",
};

function createMockResponse(
  status,
  body = {},
  headers = {}
) {
  return {
    status,

    headers: {
      get(name) {
        const headerName = Object.keys(headers).find(
          (key) =>
            key.toLowerCase() ===
            name.toLowerCase()
        );

        return headerName
          ? headers[headerName]
          : null;
      },
    },

    async json() {
      return body;
    },
  };
}

test("429 puis succès", async () => {
  const calls = [];
  const delays = [];

  const fetchImpl = async (url, options) => {
    calls.push({
      url,
      options,
    });

    if (calls.length === 1) {
      return createMockResponse(
        429,
        {},
        {
          "Retry-After": "2",
        }
      );
    }

    return createMockResponse(201, {
      id: "lead_123",
      createdAt: "2026-09-22T10:00:00Z",
    });
  };

  const result = await createLead(
    lead,
    {
      fetchImpl,

      sleep: async (ms) => {
        delays.push(ms);
      },

      token: "test-token",

      idempotencyKey:
        "test-idempotency-key",
    }
  );

  assert.equal(calls.length, 2);

  assert.equal(delays.length, 1);

  assert.equal(delays[0], 2000);

  assert.equal(
    calls[0].options.headers[
      "Idempotency-Key"
    ],
    "test-idempotency-key"
  );

  assert.equal(
    calls[1].options.headers[
      "Idempotency-Key"
    ],
    "test-idempotency-key"
  );

  assert.deepEqual(result, {
    id: "lead_123",
    createdAt: "2026-09-22T10:00:00Z",
  });
});

test(
  "500 trois fois puis abandon",
  async () => {
    let numberOfCalls = 0;

    const delays = [];

    const fetchImpl = async () => {
      numberOfCalls++;

      return createMockResponse(500);
    };

    await assert.rejects(
      () =>
        createLead(lead, {
          fetchImpl,

          sleep: async (ms) => {
            delays.push(ms);
          },

          token: "test-token",

          idempotencyKey:
            "test-idempotency-key",
        }),

      /CRM temporary failure after 3 attempts/
    );

    assert.equal(numberOfCalls, 3);

    assert.deepEqual(
      delays,
      [500, 1000]
    );
  }
);