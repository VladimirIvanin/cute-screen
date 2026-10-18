FROM ubuntu:22.04

ARG NODE_VERSION=22.23.1
ARG PNPM_VERSION=10.33.2
ARG RUST_VERSION=1.97.0
ENV DEBIAN_FRONTEND=noninteractive \
    RUSTUP_HOME=/opt/rustup \
    CARGO_HOME=/opt/cargo \
    PATH=/opt/cargo/bin:/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin

RUN apt-get update && apt-get install --yes --no-install-recommends \
    binutils build-essential ca-certificates curl file libayatana-appindicator3-dev \
    librsvg2-dev libssl-dev libwebkit2gtk-4.1-dev libxdo-dev patchelf pkg-config \
    rsync wget xz-utils xvfb xauth dbus-x11 webkit2gtk-driver \
    && rm -rf /var/lib/apt/lists/*

RUN set -eu; \
    case "$(dpkg --print-architecture)" in amd64) node_arch=x64 ;; arm64) node_arch=arm64 ;; *) exit 1 ;; esac; \
    cd /tmp; \
    archive="node-v${NODE_VERSION}-linux-${node_arch}.tar.xz"; \
    curl --fail --location --retry 3 --output "$archive" "https://nodejs.org/dist/v${NODE_VERSION}/${archive}"; \
    curl --fail --location --retry 3 --output SHASUMS256.txt "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt"; \
    awk -v archive="$archive" '$2 == archive { print }' SHASUMS256.txt > node-checksum; \
    test -s node-checksum; \
    sha256sum --check node-checksum; \
    tar --extract --file "$archive" --directory /usr/local --strip-components=1; \
    rm "$archive" SHASUMS256.txt node-checksum; \
    npm install --global "pnpm@${PNPM_VERSION}"; \
    curl --fail --location --retry 3 --output rustup-init.sh https://sh.rustup.rs; \
    sh rustup-init.sh -y --no-modify-path --profile minimal --default-toolchain "$RUST_VERSION" --component clippy,rustfmt; \
    rm rustup-init.sh; \
    chmod -R a+rX /opt/cargo /opt/rustup

RUN apt-get update && apt-get install --yes --no-install-recommends xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
