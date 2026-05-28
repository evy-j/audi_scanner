# syntax=docker/dockerfile:1.7

FROM python:3.11-slim-bookworm AS runtime

ARG SCANNER_UID=10001
ARG SCANNER_GID=10001

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    HOME=/home/scanner \
    TMPDIR=/tmp \
    XDG_CACHE_HOME=/tmp/.cache

RUN apt-get update \
  && apt-get install --no-install-recommends -y \
    bash \
    ca-certificates \
    git \
    jq \
    tini \
  && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid "${SCANNER_GID}" scanner \
  && useradd --uid "${SCANNER_UID}" --gid "${SCANNER_GID}" --create-home --home-dir /home/scanner --shell /usr/sbin/nologin scanner \
  && mkdir -p /workspace /output /tmp/.cache /tmp/scanner \
  && chown -R scanner:scanner /workspace /output /tmp/.cache /tmp/scanner /home/scanner

COPY --chmod=0555 docker/scanners/entrypoint.sh /usr/local/bin/scanner-entrypoint

WORKDIR /workspace
USER scanner:scanner

ENTRYPOINT ["/usr/local/bin/scanner-entrypoint"]
CMD ["python", "--version"]
