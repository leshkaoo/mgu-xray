#!/bin/sh
# Local cross-build only. Never deploys or connects to a vehicle.
set -eu
cd "$(dirname "$0")/.."
src=research/upstream/XTLS--Xray-core
commit=676eaf66f8f05d4d558ee7a74b4736623d3feeb9
[ "$(git -C "$src" rev-parse HEAD)" = "$commit" ] || { echo 'Wrong Xray commit' >&2; exit 1; }
[ -z "$(git -C "$src" status --porcelain)" ] || { echo 'Dirty Xray sources' >&2; exit 1; }
mkdir -p build
root=$(pwd)
cd "$src"
for platform in darwin/arm64 linux/amd64; do
 os=${platform%/*}
 arch=${platform#*/}
 GOTOOLCHAIN=go1.27.3 CGO_ENABLED=0 GOOS=$os GOARCH=$arch GOAMD64=v1 \
 go build -mod=readonly -trimpath -buildvcs=false -ldflags='-s -w -buildid=' -o "$root/build/xray-$os-$arch" ./main
done
cd "$root"
shasum -a 256 build/xray-* > build/engine-SHA256SUMS
