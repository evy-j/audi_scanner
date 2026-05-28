# Explorer Verification

P14B fetches verified contract source and ABI from configured explorers.

Statuses:

- `VERIFIED`: explorer returned verified source and the source policy accepted at least one file
- `NOT_VERIFIED`: explorer did not return verified source
- `PROVIDER_NOT_CONFIGURED`: API key/env config is missing
- `RATE_LIMITED`: explorer rate limit was detected
- `FAILED`: operational failure
- `NOT_ASSESSED`: chain/explorer does not support verification

Verified source is sanitized through the existing source ingestion policy before a private source artifact is created. ABI is stored only when the explorer returns parseable ABI JSON.
