#!/usr/bin/env bash
# Encode the landing's media from the raw footage and photos.
#
#   scripts/footage/encode.sh <group>...   groups: photos student studio assistant setup looks all
#
# Reads e2e/eval-shots/footage/ (record.ts's <flow>.webm + <flow>.marks.json +
# PNG stills; photos/<niche>.* from Pix4Less) and writes
# frontend-main/public/media/{clips,posters,stills}. Then run
# `node scripts/footage/manifest.mjs`.
# Spec 5.3: h264 CRF 23 with maxrate ≤ 2.5 Mbit/s and +faststart, a VP9 twin,
# -g 1 only for scrubs, a 720 px phone encode, AVIF posters from the first
# frame, 2x AVIF stills. Each maxrate below is that ceiling lowered to Phase 2's
# per-file target: target bytes × 8 / clip seconds (hero 2.5 MB / 12 s ≈ 1.6M).
# macOS /bin/bash is 3.2: no associative arrays.
# After any re-encode, purge /media/* at Cloudflare's edge: the filenames are
# not hashed and prod caches /media/* (7-day edge TTL, 1-day browser TTL), so
# visitors otherwise get the old footage for up to a week.
# Before shipping a clip, look at its frames for a dev hostname: record.ts
# rewrites "<slug>.localhost" in the page, and scrub-setup.mp4 shipped once with
# it (fixed 2026-10-15 by painting maralindqvist.contentor.app over the preview
# chrome's address on the encoded frames).
set -euo pipefail
export LC_ALL=C # awk prints "2.50", never "2,50"
cd "$(dirname "$0")/../.."
RAW=e2e/eval-shots/footage
OUT=frontend-main/public/media
# Scrubs are all-keyframe, so every frame costs a whole picture. Over 1.5 MB:
# raise SCRUB_SPEED (fewer frames, same story) before SCRUB_CRF (28 at most).
SCRUB_FPS=${SCRUB_FPS:-10}
SCRUB_SPEED=${SCRUB_SPEED:-4.2}
SCRUB_CRF=${SCRUB_CRF:-28}
HERO_LOOKS="journal tavola encore kinetic"
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
#   scrub: all-keyframe, sped up by SCRUB_SPEED;  loop: sped up to fit 3.8 s;  phone: 750×1624.
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
    scrub)
      speed=$SCRUB_SPEED
      vf="fps=$SCRUB_FPS,scale=1280:800:flags=lanczos"
      x264="-preset slow -crf $SCRUB_CRF -g 1 -keyint_min 1 -sc_threshold 0 -bf 0" ;;
    loop)
      speed=$(awk -v t="$total" 'BEGIN{printf "%.3f", (t > 3.8 ? t / 3.8 : 1)}')
      vf="fps=25,scale=1280:800:flags=lanczos"
      x264="-preset slow -crf 23 -maxrate 1.5M -bufsize 3M" ;;
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
# loop <key> <flow:from:to>: a studio tile's hover loop with its twin and poster.
loop() {
  segments "$1" loop "$2"
  if [ -f "$OUT/clips/$1.mp4" ]; then webm "$1" 40 1.2M; poster "$1"; fi
}

photos() {
  local n
  for n in $NICHES; do still "still-$n" "$(ls "$RAW"/photos/"$n".* 2>/dev/null | head -1)" 1280:1600 640:800 40 42; done
}
student() {
  segments clip-student-phone phone student-phone:dash:dash-tap student-phone:lesson:lesson-end student-phone:live:live-tap
  if [ -f "$OUT/clips/clip-student-phone.mp4" ]; then
    webm clip-student-phone 40 0.6M
    phone clip-student-phone 0.4M
    poster clip-student-phone
  fi
  still tile-student-dashboard "$RAW/tile-student-dashboard.png" 1600:1000 800:500 28 32
  still tile-live-class "$RAW/tile-live-class.png" 1600:1000 800:500 28 32
}
studio() {
  local t
  for t in courses messages community media blog logo; do loop "loop-$t" "studio-tiles:$t-start:$t-end"; done
  loop loop-live studio-live:form:created
  for t in courses live messages community media blog logo; do still "tile-$t" "$RAW/tile-$t.png" 1600:1000 800:500 28 32; done
}
assistant() {
  segments scrub-assistant scrub assistant:start:drafting assistant:card:end
  if [ -f "$OUT/clips/scrub-assistant.mp4" ]; then poster scrub-assistant; fi
}
setup() {
  segments scrub-setup scrub setup-answer:ask-1:sent setup-answer:ask-2:picked setup-looks:gallery:gallery-picked setup-looks:opened:kept \
    setup-compose:composing:composing-held setup-compose:built:scrolled
  if [ -f "$OUT/clips/scrub-setup.mp4" ]; then poster scrub-setup; fi
}
# hero: four looks × 3 s from the "scroll" mark, the phone cut laid over the desktop cut.
hero() {
  local inputs=() filt="" i=0 l f s
  for l in $HERO_LOOKS; do
    for f in "site-$l" "site-$l-phone"; do
      [ -f "$RAW/$f.webm" ] || { echo "skip hero-looks: no $f.webm (record looks:$l first)"; return 0; }
    done
    s=$(mark "site-$l" scroll)
    inputs+=(-ss "$s" -t 3 -i "$RAW/site-$l.webm")
    s=$(mark "site-$l-phone" scroll)
    inputs+=(-ss "$s" -t 3 -i "$RAW/site-$l-phone.webm")
    filt="$filt[$((2 * i)):v]setpts=PTS-STARTPTS,fps=25,scale=1600:1000:flags=lanczos,setsar=1[d$i];"
    # ponytail: square ink frame round the phone; rounded corners need an alpha mask, add if the owner asks
    filt="$filt[$((2 * i + 1)):v]setpts=PTS-STARTPTS,fps=25,scale=-2:820:flags=lanczos,pad=iw+16:ih+16:8:8:color=0x1d1d1f,setsar=1[p$i];"
    filt="$filt[d$i][p$i]overlay=x=W-w-72:y=H-h-48:shortest=1[h$i];"
    i=$((i + 1))
  done
  filt="$filt[h0][h1][h2][h3]concat=n=4:v=1:a=0[v]"
  q "${inputs[@]}" -filter_complex "$filt" -map "[v]" -an -c:v libx264 -preset slow -crf 23 \
    -maxrate 1.6M -bufsize 3.2M -pix_fmt yuv420p -movflags +faststart "$OUT/clips/hero-looks.mp4"
  webm hero-looks 40 1.6M
  phone hero-looks 0.6M
  poster hero-looks
  echo "clip  hero-looks  $(kb "$OUT/clips/hero-looks.mp4") KB"
}
looks() {
  local l
  hero
  for l in $LOOKS; do still "look-$l" "$RAW/look-$l.png" 750:1624 375:812 30 32; done
}

[ $# -gt 0 ] || { echo "usage: $0 photos|student|studio|assistant|setup|looks|all ..." >&2; exit 1; }
for g in "$@"; do
  case $g in
    all) photos; student; studio; assistant; setup; looks ;;
    photos | student | studio | assistant | setup | looks) "$g" ;;
    *) echo "unknown group: $g" >&2; exit 1 ;;
  esac
done
