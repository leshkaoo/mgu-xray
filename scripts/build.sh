#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
sh scripts/build-engine.sh
for platform in darwin/arm64 linux/amd64; do
 os=${platform%/*}
 arch=${platform#*/}
 GOTOOLCHAIN=go1.26.5 CGO_ENABLED=0 GOOS=$os GOARCH=$arch GOAMD64=v1 \
 go build -trimpath -buildvcs=false -ldflags='-s -w -buildid=' \
  -o "build/mgu-xray-$os-$arch" ./cmd/mgu-xray
done
host=$(go env GOOS)-$(go env GOARCH)
cp "build/mgu-xray-$host" build/mgu-xray
shasum -a 256 build/xray-darwin-arm64 build/xray-linux-amd64 \
 build/mgu-xray-darwin-arm64 build/mgu-xray-linux-amd64 > build/SHA256SUMS
