# NurDiff build for Linux in a container (Podman or Docker).
#   Tests:    podman build --target test .
#   Packages: podman build --target build -t nurdiff-build .
# The script ./scripts/build-linux.sh does everything and copies the results to ./out.
#
# Ubuntu 22.04 is deliberately "old": the binaries compiled here use a glibc
# that is not too recent and so also run on newer distributions.
# The full image name avoids Podman's registry choice prompt.

FROM docker.io/library/ubuntu:22.04 AS base
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential curl wget file git ca-certificates pkg-config xz-utils patchelf \
        libssl-dev libwebkit2gtk-4.1-dev libxdo-dev \
        libayatana-appindicator3-dev librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

# Node.js 22
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Rust (stable)
ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=/usr/local/cargo/bin:$PATH
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal

WORKDIR /src


# --- Test di core e CLI -----------------------------------------------------
FROM base AS test
COPY . .
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/src/target \
    cargo test


# --- Build of the app (AppImage, .deb, .rpm) and of the CLI ----------------------
FROM base AS build
COPY . .
RUN npm ci

# The commit it is built from (with "*" if there are uncommitted changes): there is no `.git`
# in this container, so ./scripts/build-linux.sh passes it and vite.config.ts reads it.
ARG NURDIFF_COMMIT=""
ENV NURDIFF_COMMIT=$NURDIFF_COMMIT

# AppImage: there is no FUSE in the container, so the tools must be extracted and run directly
ENV APPIMAGE_EXTRACT_AND_RUN=1 \
    NO_STRIP=true

# The .deb and .rpm also carry nurdiff-cli (scripts/stage-cli.sh builds it, src-tauri/bundle-cli/linux.json places it).
# The target folder is a build cache (fast on later builds),
# so the results are copied to /out in the same step.
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/src/target \
    rm -rf target/release/bundle \
    && ./scripts/stage-cli.sh \
    && npm run tauri build -- --config src-tauri/bundle-cli/linux.json \
    && mkdir -p /out \
    && cp -r target/release/bundle/. /out/ \
    && cp target/release/nurdiff-cli /out/nurdiff-cli \
    && cp target/release/nurdiff /out/nurdiff


# --- Daily development: ./scripts/dev.sh ---------------------------------
# Like `base`, plus clippy/rustfmt and Chromium with Playwright for ./tools/ui-test/run.sh.
# The code is not in the image: ./scripts/dev.sh mounts the repository at /src.
FROM base AS dev
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-pip fonts-dejavu-core libgl1-mesa-dri \
    && rm -rf /var/lib/apt/lists/*
RUN rustup component add clippy rustfmt
# The browsers live outside the home: in the container the user changes at every run
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
RUN pip3 install --no-cache-dir playwright \
    && playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/* \
    && chmod -R a+rX /opt/pw-browsers /usr/local/rustup
# Without this, system-ui/sans-serif/Roboto/Segoe UI all fall back to DejaVu Sans, much wider
# than the fonts of a real desktop (the toolbar would wrap to two rows at 1100 px).
RUN printf '%s\n' '<?xml version="1.0"?>' '<!DOCTYPE fontconfig SYSTEM "fonts.dtd">' '<fontconfig>' \
        '<match target="pattern"><edit name="family" mode="prepend" binding="strong"><string>Liberation Sans</string></edit></match>' \
        '</fontconfig>' > /etc/fonts/conf.d/10-nurdiff-sans.conf
