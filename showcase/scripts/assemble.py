"""Cuts the recorded scenes, burns the caption cards in with a fade, and joins everything with crossfades.
Usage: python3 assemble.py <captureDir> <outDir>"""
import subprocess, sys, os
CAP, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
X = 0.4  # crossfade seconds
# name, start offset into the recording, length, caption card (or None)
SCENES = [
    ("01-logo", 0.3, 5.4, None),
    ("02-signin", 0.5, 4.6, "02"),
    ("03-beranda", 2.6, 6.2, "03"),
    ("04-rka", 4.6, 10.0, "04"),
    ("05-route", 0.3, 7.0, None),
    ("06-summary", 3.6, 7.8, "06"),
    ("07-cash-pipeline", 2.4, 6.4, "07"),
    ("08-end", 0.2, 4.0, None),
]
inputs, filters, labels = [], [], []
idx = 0
for name, ss, dur, cap in SCENES:
    inputs += ["-ss", str(ss), "-t", str(dur), "-i", f"{CAP}/{name}.webm"]
    v = idx; idx += 1
    chain = f"[{v}:v]fps=30,scale=1920:1080,format=yuv420p,setsar=1[b{v}]"
    filters.append(chain)
    last = f"[b{v}]"
    if cap:
        inputs += ["-loop", "1", "-t", str(dur), "-i", f"{CAP}/cap-{cap}.png"]
        c = idx; idx += 1
        filters.append(f"[{c}:v]format=rgba,fade=t=in:st=0.6:d=0.4:alpha=1,fade=t=out:st={dur-1.0}:d=0.4:alpha=1[c{c}]")
        filters.append(f"{last}[c{c}]overlay=format=auto,format=yuv420p[s{v}]")
        last = f"[s{v}]"
    labels.append((last, dur))
# crossfade chain
cur, total = labels[0]
for i, (lab, dur) in enumerate(labels[1:], 1):
    off = total - X
    filters.append(f"{cur}{lab}xfade=transition=fade:duration={X}:offset={off:.3f}[x{i}]")
    cur = f"[x{i}]"
    total = off + dur
fc = ";".join(filters)
common = ["ffmpeg", "-v", "error", "-y"] + inputs + ["-filter_complex", fc, "-map", cur, "-an"]
subprocess.check_call(common + ["-c:v", "libx264", "-crf", "21", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", f"{OUT}/estrada-showcase.mp4"])
subprocess.check_call(common + ["-c:v", "libvpx-vp9", "-crf", "34", "-b:v", "0", "-row-mt", "1", f"{OUT}/estrada-showcase.webm"])
subprocess.check_call(["ffmpeg", "-v", "error", "-y", "-ss", "1.8", "-i", f"{OUT}/estrada-showcase.mp4", "-frames:v", "1", f"{OUT}/estrada-showcase-poster.jpg"])
print("total seconds", round(total, 1))
