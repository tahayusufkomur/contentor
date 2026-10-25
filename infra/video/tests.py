"""graph.py's checks: `python -m unittest tests` (stdlib only, so anywhere: the image runs them as well)."""

import unittest

import graph

PROBE = {"width": 1920, "height": 1080, "audio": True}
PATHS = {"fonts": "/w/fonts", "out": "/w/reel.mp4", "cutaways": []}


def at(expr: str, t: float) -> float:
    """An ffmpeg expression of the shape crop_x writes, evaluated at t."""
    py = expr.replace("if(", "_if(").replace("lt(", "_lt(")
    return eval(py, {"_if": lambda c, a, b: a if c else b, "_lt": lambda a, b: a < b, "t": t})  # noqa: S307


def job(**fields) -> dict:
    return {"source": "https://s3.example/v.mp4?sig=1", "start": 10, "end": 20, **fields}


def graph_of(args: list[str]) -> str:
    return args[args.index("-filter_complex") + 1]


class Window(unittest.TestCase):
    def test_a_wide_video_is_cropped_to_its_full_height(self):
        self.assertEqual(graph.window(1920, 1080), (608, 1080, 0))

    def test_a_vertical_video_is_kept_whole(self):
        self.assertEqual(graph.window(1080, 1920), (1080, 1920, 0))

    def test_a_taller_video_loses_its_top_and_bottom(self):
        self.assertEqual(graph.window(1080, 2400), (1080, 1920, 240))


class CropX(unittest.TestCase):
    def test_straight_lines_between_the_keys_held_at_both_ends(self):
        expr = graph.crop_x([[0, 0.5], [2, 0.5], [2.5, 0.7]], 1920, 608)
        centre, right = 1920 * 0.5 - 304, 1920 * 0.7 - 304
        self.assertEqual(at(expr, -1), centre)
        self.assertEqual(at(expr, 1), centre)
        self.assertAlmostEqual(at(expr, 2.25), (centre + right) / 2, delta=1)
        self.assertEqual(at(expr, 9), right)

    def test_the_window_never_leaves_the_frame(self):
        expr = graph.crop_x([[0, 0.0], [1, 1.0]], 1920, 608)
        self.assertEqual((at(expr, 0), at(expr, 1)), (0, 1920 - 608))

    def test_no_keys_is_the_middle(self):
        self.assertEqual(graph.crop_x([], 1920, 608), str((1920 - 608) // 2))


class Command(unittest.TestCase):
    def test_a_plain_crop_with_sound(self):
        args, total = graph.command(job(crop=[[0, 0.5]]), PROBE, PATHS)
        self.assertEqual(total, 10)
        self.assertEqual(args[args.index("-ss") + 1 : args.index("-ss") + 4], ["10.0", "-t", "10.0"])
        fc = graph_of(args)
        self.assertIn("crop=w=608:h=1080:x='if(lt(t,0.0),656", fc)
        self.assertIn("[base]null[cv];[araw]anull[ca]", fc)
        self.assertIn("[0:a:0]aformat", fc)
        self.assertIn("loudnorm=I=-14", fc)
        self.assertEqual(args[-1], "/w/reel.mp4")
        self.assertEqual(args[args.index("-map") + 1], "[vout]")

    def test_fit_puts_the_whole_frame_on_a_blurred_copy(self):
        fc = graph_of(graph.command(job(layout="fit"), PROBE, PATHS)[0])
        self.assertIn("boxblur", fc)
        self.assertNotIn("crop=w=", fc)

    def test_pauses_are_cut(self):
        args, total = graph.command(job(keep=[[0, 2], [3, 5.5]]), PROBE, PATHS)
        fc = graph_of(args)
        self.assertEqual(total, 4.5)
        self.assertIn("[base]split=2[s0][s1]", fc)
        self.assertIn("[s1]trim=start=3.0:end=5.5,setpts=PTS-STARTPTS[v1]", fc)
        self.assertIn("[r1]atrim=start=3.0:end=5.5,asetpts=PTS-STARTPTS[a1]", fc)
        self.assertIn("[v0][a0][v1][a1]concat=n=2:v=1:a=1[cv][ca]", fc)
        self.assertIn("afade=t=out:st=4.35", fc)

    def test_a_silent_video_gets_silence(self):
        args, _ = graph.command(job(), {**PROBE, "audio": False}, PATHS)
        self.assertIn("anullsrc=r=48000:cl=stereo", args)
        self.assertIn("[1:a]aformat", graph_of(args))

    def test_cutaways_captions_progress_and_end_card(self):
        paths = {**PATHS, "ass": "/w/captions.ass", "end_card": "/w/end.png", "cutaways": ["/w/cut0.jpg"]}
        cut = {"start": 2, "end": 4.5, "image": "x"}
        args, total = graph.command(job(cutaways=[cut], progress="#ff8800", end_seconds=3), PROBE, paths)
        fc = graph_of(args)
        self.assertEqual(total, 13)
        photo = args.index("/w/cut0.jpg")
        self.assertEqual(args[photo - 7 : photo], ["-loop", "1", "-framerate", "30", "-t", "2.5", "-i"])
        self.assertIn("[1:v]scale=1188:2112", fc)  # the photo is input 1
        self.assertIn("setpts=PTS-STARTPTS+2.0/TB[c0]", fc)
        self.assertIn("[cv][c0]overlay=eof_action=pass:enable='between(t,2.0,4.5)'[cw0]", fc)
        self.assertIn("[cw0]subtitles=filename=/w/captions.ass:fontsdir=/w/fonts[sv]", fc)
        self.assertIn("color=c=0xff8800:s=1080x12:r=30:d=10.0[bar]", fc)
        self.assertIn("[2:v]scale=1080:1920", fc)  # the end card is input 2, its silence 3
        self.assertIn("[3:a]aformat", fc)
        self.assertIn("[mv][ma][ev][ea]concat=n=2:v=1:a=1[vout][aout]", fc)

    def test_a_cutaway_shorter_than_a_second_is_left_out(self):
        paths = {**PATHS, "cutaways": ["/w/cut0.jpg"]}
        args, _ = graph.command(job(cutaways=[{"start": 9.5, "end": 12}]), PROBE, paths)
        self.assertNotIn("/w/cut0.jpg", args)

    def test_what_it_refuses(self):
        for bad in (
            job(source="file:///etc/passwd"),
            job(end=400),
            job(end=10),
            job(progress="red;drawtext"),
            job(keep=[[0, 0.05]]),
            job(crop=[["x", 0.5]]),
        ):
            with self.assertRaises(graph.JobError):
                graph.command(bad, PROBE, PATHS)


class Fonts(unittest.TestCase):
    def test_each_role_gets_its_family_and_a_missing_one_the_bundled_font(self):
        ass = "Style: Caption,@caption,84\nStyle: Title,@title,70"
        self.assertEqual(
            graph.fill_fonts(ass, {"caption": "Archivo"}), "Style: Caption,Archivo,84\nStyle: Title,DejaVu Sans,70"
        )


if __name__ == "__main__":
    unittest.main()
