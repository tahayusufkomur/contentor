#!/usr/bin/env bash
# Encode the landing's media from the raw footage and photos.
#
#   scripts/footage/encode.sh <group>...   groups: photos screens landing looks all
#
# Reads e2e/eval-shots/footage/ (record.ts's <flow>.webm + <flow>.marks.json +
# PNG stills; photos/<niche>.* from Pix4Less) and writes
# frontend-main/public/media/{clips,posters,stills}. Then run
# `node scripts/footage/manifest.mjs`.
# Spec 5.3: h264 CRF 23 with maxrate ≤ 2.5 Mbit/s and +faststart, a VP9 twin,
# a 720 px phone encode, AVIF posters from the first
# frame, 2x AVIF stills. Each maxrate below is that ceiling lowered to Phase 2's
# per-file target: target bytes × 8 / clip seconds (hero 2.5 MB / 12 s ≈ 1.6M).
# macOS /bin/bash is 3.2: no associative arrays.
# After any re-encode, purge /media/* at Cloudflare's edge: the filenames are
# not hashed and prod caches /media/* (7-day edge TTL, 1-day browser TTL), so
# visitors otherwise get the old footage for up to a week.
# Before shipping a clip, look at its frames for a dev hostname: record.ts
# rewrites "<slug>.localhost" in the page. The setup-looks and setup-compose
# recordings predate that and carry the coach domain painted over the preview's
# address pill (2026-10-15); a re-recording needs no paint.
set -euo pipefail
export LC_ALL=C # awk prints "2.50", never "2,50"
cd "$(dirname "$0")/../.."
RAW=e2e/eval-shots/footage
OUT=frontend-main/public/media
LOOKS="journal kinetic encore studiofloor tavola primer dojo workshop atelier sprout trail nocturne"
NICHES="yoga fitness music dance cooking language martial-arts crafts beauty family outdoors wellness"

for tool in ffmpeg ffprobe jq; do
  command -v "$tool" >/dev/null || { echo "missing $tool: brew install ffmpeg jq" >&2; exit 1; }
done
mkdir -p "$OUT/clips" "$OUT/posters" "$OUT/stills"

q() { ffmpeg -y -hide_banner -loglevel error "$@"; }
kb() { echo $(($(wc -c <"$1") / 1000)); }

# mark <flow> <name>: seconds from the flow's first frame (record.ts).
mark() { jq -er --arg k "$2" '.[$k]' "$RAW/$1.marks.json" || { echo "no mark $2 in $1.marks.json: re-record $1" >&2; return 1; }; }

# segments <key> <kind> <flow:fromMark:toMark>...: the segments joined into clips/<key>.mp4.
#   clip: sped up by SPEED (default 2), plays in view;  phone: 750×1624.
segments() {
  local key=$1 kind=$2
  shift 2
  local inputs=() total=0 n=0 i seg flow from to s e len speed vf x264 filt=""
  for seg in "$@"; do
    IFS=: read -r flow from to <<<"$seg"
    [ -f "$RAW/$flow.webm" ] || { echo "skip $key: no $flow.webm (record it first)"; return 0; }
    s=$(mark "$flow" "$from")
    e=$(mark "$flow" "$to")
    len=$(awk -v a="$s" -v b="$e" 'BEGIN{printf "%.2f", b-a}')
    inputs+=(-ss "$s" -t "$len" -i "$RAW/$flow.webm")
    total=$(awk -v a="$total" -v b="$len" 'BEGIN{printf "%.2f", a+b}')
    n=$((n + 1))
  done
  case $kind in
    clip)
      speed=${SPEED:-2}
      vf="fps=25,scale=1280:800:flags=lanczos"
      x264="-preset slow -crf 24 -maxrate 1.2M -bufsize 2.4M" ;;
    phone)
      speed=1
      vf="fps=25,scale=750:1624:flags=lanczos"
      x264="-preset slow -crf 23 -maxrate 0.6M -bufsize 1.2M" ;;
  esac
  i=0
  while [ $i -lt $n ]; do filt="$filt[$i:v]setpts=(PTS-STARTPTS)/$speed,$vf,setsar=1[s$i];"; i=$((i + 1)); done
  i=0
  while [ $i -lt $n ]; do filt="$filt[s$i]"; i=$((i + 1)); done
  filt="${filt}concat=n=$n:v=1:a=0[v]"
  # shellcheck disable=SC2086 # $x264 is a word list on purpose
  q "${inputs[@]}" -filter_complex "$filt" -map "[v]" -an -c:v libx264 $x264 \
    -pix_fmt yuv420p -movflags +faststart "$OUT/clips/$key.mp4"
  echo "clip  $key  $(kb "$OUT/clips/$key.mp4") KB  (${total}s raw, speed $speed)"
}

# webm <key> <crf> <cap>: the VP9 twin; manifest.mjs fails it if it is bigger than the mp4.
webm() { q -i "$OUT/clips/$1.mp4" -an -c:v libvpx-vp9 -crf "$2" -b:v 0 -row-mt 1 -deadline good -cpu-used 2 "$OUT/clips/$1.webm"; }
# phone <key> <maxrate>: the 720 px wide encode MediaVideo serves below 768 px.
phone() {
  q -i "$OUT/clips/$1.mp4" -an -vf "scale=720:-2:flags=lanczos" -c:v libx264 -preset slow -crf 23 \
    -maxrate "$2" -bufsize "$2" -pix_fmt yuv420p -movflags +faststart "$OUT/clips/$1-phone.mp4"
}
# poster <key>: the clip's first frame as AVIF, at the clip's own size (no layout shift).
poster() { q -i "$OUT/clips/$1.mp4" -frames:v 1 -c:v libaom-av1 -still-picture 1 -crf 32 -cpu-used 4 -pix_fmt yuv420p "$OUT/posters/$1.avif"; }
# avif <in> <out> <w:h> <crf>: a still, scaled to cover the box and center-cropped.
avif() {
  q -i "$1" -vf "scale=$3:force_original_aspect_ratio=increase:flags=lanczos,crop=$3:exact=1" -frames:v 1 \
    -c:v libaom-av1 -still-picture 1 -crf "$4" -cpu-used 4 -pix_fmt yuv420p "$2"
}
# still <key> <in> <w:h> <small w:h> <crf> <small crf>
still() {
  [ -f "$2" ] || { echo "skip $1: no ${2:-photo} (record or download it first)"; return 0; }
  avif "$2" "$OUT/stills/$1.avif" "$3" "$5"
  avif "$2" "$OUT/stills/$1-small.avif" "$4" "$6"
  echo "still $1  $(kb "$OUT/stills/$1.avif") KB / $(kb "$OUT/stills/$1-small.avif") KB"
}
# story <key>: a chapter clip's twin, phone encode and poster.
story() {
  if [ -f "$OUT/clips/$1.mp4" ]; then webm "$1" 40 1.2M; phone "$1" 0.4M; poster "$1"; fi
}
photos() {
  local n
  for n in $NICHES; do still "still-$n" "$(ls "$RAW"/photos/"$n".* 2>/dev/null | head -1)" 1280:1600 640:800 40 42; done
}
# screens: "One platform on every screen", Mara streaming (a still) and three
# students watching her live (photos/screens-*: Pix4Less; screens.py lays the
# recorded class onto each screen, frame by frame). Each loop plays its frames
# forward then back, so it never jumps.
screens() {
  still screens-creator "$RAW/photos/screens-creator.jpg" 1280:1600 640:800 30 32
  local d f
  for d in laptop tablet phone; do
    f="$RAW/photos/screens-$d-frames"
    [ -d "$f" ] || { echo "skip screens-$d: run scripts/footage/screens.py"; continue; }
    q -framerate 25 -i "$f/%04d.png" -filter_complex \
      "[0]scale=960:1200:force_original_aspect_ratio=increase,crop=960:1200,split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1:a=0[v]" \
      -map "[v]" -an -c:v libx264 -preset slow -crf 24 -maxrate 1M -bufsize 2M -pix_fmt yuv420p \
      -movflags +faststart "$OUT/clips/screens-$d.mp4"
    webm "screens-$d" 38
    phone "screens-$d" 0.4M
    poster "screens-$d"
    echo "loop  screens-$d  $(kb "$OUT/clips/screens-$d.mp4") KB"
  done
}
# landing: Mara's school (record.ts setup-* + mara-site): the launch clip.
landing() {
  segments path-launch clip setup-answer:ask-1:sent setup-looks:gallery:gallery-picked \
    setup-compose:built:scrolled mara-site:scroll:end
  story path-launch
}
looks() {
  local l
  for l in $LOOKS; do still "look-$l" "$RAW/look-$l.png" 750:1624 375:812 30 32; done
}

[ $# -gt 0 ] || { echo "usage: $0 photos|screens|landing|looks|all ..." >&2; exit 1; }
for g in "$@"; do
  case $g in
    all) photos; screens; landing; looks ;;
    photos | screens | landing | looks) "$g" ;;
    *) echo "unknown group: $g" >&2; exit 1 ;;
  esac
done
