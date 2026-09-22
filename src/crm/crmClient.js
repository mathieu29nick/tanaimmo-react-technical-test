import { randomUUID } from "node:crypto";

const CRM_ENDPOINT = "https://crm.example.com/v1/leads";

const TIMEOUT_MS = 5_000;
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 500;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getBackoffDelay(attempt) {
  return BASE_DELAY_MS * 2 ** (attempt - 1);
}

function getRetryAfterMs(response) {
  const retryAfter = response.headers.get("retry-after");

  if (!retryAfter) {
    return 0;
  }

  const seconds = Number(retryAfter);

  if (!Number.isFinite(seconds) || seconds < 0) {
    return 0;
  }

  return seconds * 1000;
}

function isTemporaryStatus(status) {
  return (
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503
  );
}

export async function createLead(lead, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const sleep = options.sleep ?? wait;

  const token =
    options.token ??
    process.env.CRM_TOKEN;

  if (!token) {
    throw new Error("CRM_TOKEN is not configured");
  }

  const idempotencyKey =
    options.idempotencyKey ??
    randomUUID();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, TIMEOUT_MS);

    let response;

    try {
      response = await fetchImpl(CRM_ENDPOINT, {
        method: "POST",

        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },

        body: JSON.stringify(lead),

        signal: controller.signal,
      });
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) {
        if (error?.name === "AbortError") {
          throw new Error(
            `CRM request timed out after ${MAX_ATTEMPTS} attempts`
          );
        }

        throw new Error(
          `CRM request failed after ${MAX_ATTEMPTS} attempts`
        );
      }

      const delay = getBackoffDelay(attempt);

      await sleep(delay);

      continue;
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 201) {
      return response.json();
    }

    if (isTemporaryStatus(response.status)) {
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(
          `CRM temporary failure after ${MAX_ATTEMPTS} attempts`
        );
      }

      const backoffDelay =
        getBackoffDelay(attempt);

      const retryAfterDelay =
        response.status === 429
          ? getRetryAfterMs(response)
          : 0;

      const delay = Math.max(
        backoffDelay,
        retryAfterDelay
      );

      await sleep(delay);

      continue;
    }

    if (
      response.status >= 400 &&
      response.status < 500
    ) {
      throw new Error(
        `CRM request rejected with status ${response.status}`
      );
    }

    throw new Error(
      `Unexpected CRM response with status ${response.status}`
    );
  }

  throw new Error("CRM request failed");
}