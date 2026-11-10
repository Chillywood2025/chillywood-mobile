# Source preparation only. No image from this recipe is qualified or deployed yet.
# Official Linux/amd64 ClamAV 1.5.4_base manifest, observed 2026-11-10.
# The installed Mac 1.5.2 passed behavioral tests but is NOT a deployable
# security baseline; 1.5.4 includes subsequent published security fixes.
FROM --platform=linux/amd64 clamav/clamav:1.5.4_base@sha256:b2c2f5c9a557dc1c1249e09448a84c59c3e414bb3bbbac0a9d065236c779842c
USER root
# Exact direct package versions observed in official signed Alpine v3.24 indexes.
# Transitive resolution is recorded below; deployment must pin the FINAL image
# digest, not rebuild this recipe and assume identical transitive dependencies.
RUN printf '%s\n' 'https://dl-cdn.alpinelinux.org/alpine/v3.24/main' 'https://dl-cdn.alpinelinux.org/alpine/v3.24/community' > /etc/apk/repositories \
 && apk add --no-cache nodejs=24.22.1-r1 ffmpeg=8.1.3-r0 tini=0.19.0-r3 ca-certificates=20261020-r0 \
 && addgroup -S -g 65532 native-scanner \
 && adduser -S -D -H -u 65532 -G native-scanner native-scanner \
 && mkdir -p /app /opt/native-scanner/certs /work /state /definitions /run/native-scanner /run/secrets \
 && chown 65532:65532 /work /state /run/native-scanner /run/secrets \
 && chmod 700 /work /state /run/native-scanner /run/secrets \
 && for name in node ffmpeg ffprobe clamscan sigtool freshclam; do binary="$(command -v "$name")"; test -n "$binary"; if [ "$binary" != "/usr/local/bin/$name" ]; then ln -s "$binary" "/usr/local/bin/$name"; fi; done \
 && cert="$(find /etc /usr/local -type f -name clamav.crt | head -n 1)" \
 && test -n "$cert" && cp "$cert" /opt/native-scanner/certs/clamav.crt
WORKDIR /app
COPY ops/isolated-paid-video-worker/ ./ops/isolated-paid-video-worker/
COPY ops/native-paid-video-scanner-runtime/ ./ops/native-paid-video-scanner-runtime/
RUN node ops/native-paid-video-scanner-runtime/record-runtime.mjs \
 && chmod -R a-w /app /opt/native-scanner/certs
USER 65532:65532
ENV LANG=C LC_ALL=C TZ=UTC TMPDIR=/work
# Never inherit the generic image's clamd/freshclam daemon entrypoint.
HEALTHCHECK NONE
ENTRYPOINT ["/sbin/tini", "-g", "--", "/usr/local/bin/node", "/app/ops/native-paid-video-scanner-runtime/launch.mjs"]
CMD []
