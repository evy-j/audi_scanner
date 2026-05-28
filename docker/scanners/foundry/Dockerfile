# syntax=docker/dockerfile:1.7

ARG FOUNDRY_IMAGE_TAG=latest
FROM ghcr.io/foundry-rs/foundry:${FOUNDRY_IMAGE_TAG} AS foundry

ARG SCANNER_IMAGE_TAG=latest
FROM audit-scanner/scanner-base:${SCANNER_IMAGE_TAG} AS runtime

USER root

COPY --from=foundry /usr/local/bin/forge /usr/local/bin/forge
COPY --from=foundry /usr/local/bin/cast /usr/local/bin/cast
COPY --from=foundry /usr/local/bin/anvil /usr/local/bin/anvil
COPY --from=foundry /usr/local/bin/chisel /usr/local/bin/chisel

RUN forge --version

USER scanner:scanner

CMD ["forge", "--version"]
