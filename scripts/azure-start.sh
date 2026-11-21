#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="/home/site/wwwroot"
export WAYPOINT_DATA_DIR="${WAYPOINT_DATA_DIR:-/home/waypoint-data}"
export WAYPOINT_CHAT_THREADS="${WAYPOINT_CHAT_THREADS:-1}"
export WAYPOINT_CHAT_CONTEXT="${WAYPOINT_CHAT_CONTEXT:-1024}"
export HOST="0.0.0.0"
export PORT="${PORT:-8080}"
mkdir -p "$WAYPOINT_DATA_DIR/ai"
MODEL="$WAYPOINT_DATA_DIR/ai/Qwen3-0.6B-Q4_K_M.gguf"
if [ ! -s "$MODEL" ]; then
  echo "Downloading the included Qwen3 chat model once into persistent storage."
  curl --fail --location --retry 3 --connect-timeout 20 --max-time 600 --output "$MODEL.download" "https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_K_M.gguf"
  mv "$MODEL.download" "$MODEL"
fi
mkdir -p /tmp/waypoint-native
cp -a "$ROOT/native/." /tmp/waypoint-native/
export LLAMA_SERVER_PATH="$(find /tmp/waypoint-native -type f -name llama-server -print -quit)"
if [ -z "$LLAMA_SERVER_PATH" ]; then echo "The Linux chat runtime is missing."; exit 1; fi
NATIVE_DIR="$(dirname "$LLAMA_SERVER_PATH")"
export LD_LIBRARY_PATH="$NATIVE_DIR:$NATIVE_DIR/../lib:${LD_LIBRARY_PATH:-}"
chmod +x "$LLAMA_SERVER_PATH"
cd "$ROOT"
exec node server.mjs
