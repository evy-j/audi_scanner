# syntax=docker/dockerfile:1.7

ARG SCANNER_IMAGE_TAG=latest
FROM audit-scanner/scanner-base:${SCANNER_IMAGE_TAG} AS runtime

USER root

ARG SLITHER_ANALYZER_VERSION=""
ARG SOLC_SELECT_VERSION=""
ARG SOLC_VERSIONS="0.8.26 0.8.25 0.8.24 0.8.23 0.8.20 0.7.6 0.6.12 0.5.17 0.4.26"
ARG DEFAULT_SOLC_VERSION="0.8.24"

RUN apt-get update \
  && apt-get install --no-install-recommends -y build-essential \
  && rm -rf /var/lib/apt/lists/*

RUN if [ -n "$SOLC_SELECT_VERSION" ]; then pip install "solc-select==$SOLC_SELECT_VERSION"; else pip install solc-select; fi \
  && if [ -n "$SLITHER_ANALYZER_VERSION" ]; then pip install "slither-analyzer==$SLITHER_ANALYZER_VERSION"; else pip install slither-analyzer; fi \
  && su scanner -s /bin/sh -c "for version in $SOLC_VERSIONS; do solc-select install \"\$version\"; done && solc-select use \"$DEFAULT_SOLC_VERSION\"" \
  && su scanner -s /bin/sh -c "slither --version && solc --version" \
  && apt-get purge -y --auto-remove build-essential \
  && rm -rf /root/.cache /home/scanner/.cache/pip

USER scanner:scanner

CMD ["slither", "--version"]
