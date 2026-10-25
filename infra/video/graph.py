"""The ffmpeg command for one reel (server.py runs it). Pure: no I/O, so tests.py checks it anywhere.

A reel is a stretch of the coach's video turned into a 1080x1920 clip:

    source  -> 30 fps -> framed (a crop window that follows the coach's face, or the whole frame on a blurred
               copy of itself) -> only the stretches with speech kept (pauses cut) -> photo cutaways
               -> captions and title (an ASS file, libass) -> progress bar -> end card
    audio   -> the same stretches -> denoised and evened out to -14 LUFS (or as it is)

Every time in the job is in seconds. `start`/`end` are the source's; `keep` and `crop` keys are from
`start`; cutaways are in the reel's own time (after the cuts).
"""

import re

W, H, FPS = 1080, 1920, 30
HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
CUTAWAY_FADE = 0.25


class JobError(ValueError):
    """The job asks for something this service can't make."""


def even(value: float) -> int:
    return max(2, int(round(value / 2)) * 2)


def _num(value, name: str) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise JobError(f"{name} is not a number") from None
    if number != number or abs(number) > 1e6:  # NaN, or absurd
        raise JobError(f"{name} is out of range")
    return round(number, 3)


def window(width: int, height: int) -> tuple[int, int, int]:
    """The 9:16 crop of a width x height frame: (crop width, crop height, its top), as tall as the frame
    allows (a frame narrower than 9:16 is cropped top and bottom instead)."""
    cw, ch = even(height * 9 / 16), even(height)
    if cw > width:
        cw, ch = even(width), even(width * 16 / 9)
    return min(cw, width), min(ch, height), max(0, (height - min(ch, height)) // 2)


def crop_x(keys, width: int, cw: int) -> str:
    """The crop window's left edge (px) as an ffmpeg expression of t: straight lines between the keys
    `[[t, centre], ...]` (centre as a share of the width), held before the first and after the last."""
    room = max(0, width - cw)
    points = [(_num(t, "a crop key"), max(0, min(room, round(_num(cx, "a crop key") * width - cw / 2)))) for t, cx in keys]
    points.sort()
    if not points:
        return str(room // 2)
    expr = str(points[-1][1])
    for (t0, x0), (t1, x1) in reversed(list(zip(points, points[1:], strict=False))):
        if t1 <= t0:
            continue
        expr = f"if(lt(t,{t1}),{x0}+({x1 - x0})*(t-{t0})/{round(t1 - t0, 3)},{expr})"
    return f"if(lt(t,{points[0][0]}),{points[0][1]},{expr})"


def fill_fonts(ass: str, families: dict) -> str:
    """The ASS with each `@role` font name replaced by the family of the file fetched for it."""
    return re.sub(r"@([a-z]+)", lambda m: families.get(m.group(1), "DejaVu Sans"), ass)


def command(job: dict, probe: dict, paths: dict, threads: int = 6) -> tuple[list[str], float]:
    """(ffmpeg argv, the reel's length in s) for `job` on a source `probe` says is width x height with or
    without sound. `paths`: the written files (ass, fonts dir, end_card, cutaways [..]) and the out file."""
    start, end = _num(job.get("start"), "start"), _num(job.get("end"), "end")
    length = round(end - start, 3)
    if start < 0 or not 1 <= length <= 300:
        raise JobError("a reel is 1 s to 5 min of the video")
    width, height = int(probe["width"]), int(probe["height"])
    source = str(job.get("source") or "")
    if not source.startswith(("http://", "https://")):
        raise JobError("the source is not a link")

    keep = [(_num(a, "keep"), _num(b, "keep")) for a, b in job.get("keep") or [[0, length]]]
    keep = [(max(0.0, a), min(length, b)) for a, b in keep if b - a >= 0.1]
    if not keep:
        raise JobError("nothing of the video is kept")
    main = round(sum(b - a for a, b in keep), 3)

    args = ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y"]
    args += ["-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "4"]
    args += ["-ss", str(start), "-t", str(length), "-i", source]
    inputs = 1
    if probe.get("audio"):
        audio_in = "0:a:0"
    else:
        args += ["-f", "lavfi", "-t", str(length), "-i", "anullsrc=r=48000:cl=stereo"]
        audio_in, inputs = f"{inputs}:a", inputs + 1

    parts = []
    # framing
    if job.get("layout") == "fit":
        parts.append(
            "[0:v:0]fps=30,split[bga][fga];"
            "[bga]scale=108:192:force_original_aspect_ratio=increase,crop=108:192,boxblur=6:2,"
            f"scale={W}:{H},eq=brightness=-0.08[bg];"
            f"[fga]scale={W}:{H}:force_original_aspect_ratio=decrease:flags=lanczos[fg];"
            "[bg][fg]overlay=x=(W-w)/2:y=(H-h)/2,setsar=1[base]"
        )
    else:
        cw, ch, top = window(width, height)
        x = crop_x(job.get("crop") or [], width, cw)
        parts.append(f"[0:v:0]fps=30,crop=w={cw}:h={ch}:x='{x}':y={top},scale={W}:{H}:flags=lanczos,setsar=1[base]")
    parts.append(f"[{audio_in}]aformat=sample_rates=48000:channel_layouts=stereo[araw]")

    # the stretches with speech
    if len(keep) == 1 and keep[0] == (0.0, length):
        parts.append("[base]null[cv];[araw]anull[ca]")
    else:
        n = len(keep)
        parts.append(f"[base]split={n}" + "".join(f"[s{i}]" for i in range(n)))
        parts.append(f"[araw]asplit={n}" + "".join(f"[r{i}]" for i in range(n)))
        for i, (a, b) in enumerate(keep):
            parts.append(f"[s{i}]trim=start={a}:end={b},setpts=PTS-STARTPTS[v{i}]")
            parts.append(f"[r{i}]atrim=start={a}:end={b},asetpts=PTS-STARTPTS[a{i}]")
        parts.append("".join(f"[v{i}][a{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=1[cv][ca]")

    # photo cutaways, under the captions
    video = "cv"
    for i, (cut, path) in enumerate(zip(job.get("cutaways") or [], paths.get("cutaways") or [], strict=False)):
        t0, t1 = _num(cut.get("start"), "a cutaway"), _num(cut.get("end"), "a cutaway")
        t0, t1 = max(0.0, t0), min(main, t1)
        if t1 - t0 < 1:
            continue
        d = round(t1 - t0, 3)
        args += ["-loop", "1", "-framerate", str(FPS), "-t", str(d), "-i", path]
        sw, sh = even(W * 1.1), even(H * 1.1)
        parts.append(
            f"[{inputs}:v]scale={sw}:{sh}:force_original_aspect_ratio=increase,crop={sw}:{sh},"
            f"crop={W}:{H}:x='(in_w-out_w)*t/{d}':y='(in_h-out_h)/2',setsar=1,format=yuva420p,"
            f"fade=t=in:st=0:d={CUTAWAY_FADE}:alpha=1,fade=t=out:st={round(d - CUTAWAY_FADE, 3)}:d={CUTAWAY_FADE}:alpha=1,"
            f"setpts=PTS-STARTPTS+{t0}/TB[c{i}]"
        )
        parts.append(f"[{video}][c{i}]overlay=eof_action=pass:enable='between(t,{t0},{t1})'[cw{i}]")
        video, inputs = f"cw{i}", inputs + 1

    if paths.get("ass"):
        parts.append(f"[{video}]subtitles=filename={paths['ass']}:fontsdir={paths['fonts']}[sv]")
        video = "sv"
    progress = job.get("progress")
    if progress:
        if not HEX.match(str(progress)):
            raise JobError("the progress colour is not #rrggbb")
        parts.append(f"color=c=0x{progress[1:]}:s={W}x12:r={FPS}:d={main}[bar]")
        parts.append(f"[{video}][bar]overlay=x='-w+w*t/{main}':y=H-h:eof_action=pass[pv]")
        video = "pv"

    if job.get("clean_audio", True):
        audio = "afftdn=nr=10:nf=-45,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000,"
    else:
        audio = ""
    fade_at = round(max(0.0, main - 0.15), 3)
    parts.append(
        f"[ca]{audio}afade=t=out:st={fade_at}:d=0.15,aformat=sample_rates=48000:channel_layouts=stereo[ma]"
    )
    parts.append(f"[{video}]format=yuv420p[mv]")

    total = main
    if paths.get("end_card"):
        seconds = max(1.0, min(6.0, _num(job.get("end_seconds", 2.5), "end_seconds")))
        args += ["-loop", "1", "-framerate", str(FPS), "-t", str(seconds), "-i", paths["end_card"]]
        args += ["-f", "lavfi", "-t", str(seconds), "-i", "anullsrc=r=48000:cl=stereo"]
        parts.append(
            f"[{inputs}:v]scale={W}:{H},setsar=1,format=yuv420p,fade=t=in:st=0:d=0.3[ev];"
            f"[{inputs + 1}:a]aformat=sample_rates=48000:channel_layouts=stereo[ea];"
            "[mv][ma][ev][ea]concat=n=2:v=1:a=1[vout][aout]"
        )
        total = round(main + seconds, 3)
    else:
        parts.append("[mv]null[vout];[ma]anull[aout]")

    args += ["-filter_complex", ";".join(parts), "-map", "[vout]", "-map", "[aout]"]
    args += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-profile:v", "high", "-pix_fmt", "yuv420p"]
    args += ["-r", str(FPS), "-threads", str(threads), "-c:a", "aac", "-b:a", "160k", "-ar", "48000"]
    args += ["-movflags", "+faststart", "-max_muxing_queue_size", "4096", paths["out"]]
    return args, total
