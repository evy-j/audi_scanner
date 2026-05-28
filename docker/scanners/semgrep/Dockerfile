# syntax=docker/dockerfile:1.7

ARG SCANNER_IMAGE_TAG=latest
FROM audit-scanner/scanner-base:${SCANNER_IMAGE_TAG} AS runtime

USER root

ARG SEMGREP_VERSION=""

RUN apt-get update \
  && apt-get install --no-install-recommends -y build-essential \
  && rm -rf /var/lib/apt/lists/*

RUN if [ -n "$SEMGREP_VERSION" ]; then pip install "semgrep==$SEMGREP_VERSION"; else pip install semgrep; fi \
  && semgrep --version \
  && apt-get purge -y --auto-remove build-essential \
  && rm -rf /root/.cache /home/scanner/.cache/pip

USER scanner:scanner

CMD ["semgrep", "--version"]
