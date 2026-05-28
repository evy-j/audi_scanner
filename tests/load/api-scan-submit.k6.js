import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  scenarios: {
    scan_submit_smoke: {
      executor: "constant-vus",
      vus: Number(__ENV.LOAD_TEST_VUS ?? 25),
      duration: `${Number(__ENV.LOAD_TEST_DURATION_SECONDS ?? 60)}s`
    }
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"]
  }
};

const apiBaseUrl = __ENV.LOAD_TEST_API_URL ?? "http://localhost:4000/api/v1";

export default function () {
  const response = http.get(`${apiBaseUrl}/health`, {
    headers: {
      "x-test-suite": "load"
    }
  });

  check(response, {
    "health is ok": (res) => res.status === 200
  });
  sleep(1);
}
