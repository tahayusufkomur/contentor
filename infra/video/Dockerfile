# The reels' video service (server.py): ffmpeg (libx264, libass for the captions) and OpenCV's YuNet face
# detector behind a tiny HTTP API, for backend/apps/reels. The model is downloaded here, at build: nothing is
# fetched at run time but the job's own video, fonts and upload.
#
# YuNet (OpenCV Zoo, MIT): ~230 KB, a few ms a frame at 640 px on the CPU. ponytail: x264 on the CPU, ~5x
# realtime on the mini PCs; Quick Sync (h264_vaapi, /dev/dri passed in) if renders ever make coaches wait.
FROM python:3.12-slim
ARG YUNET=https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx
ENV PYTHONUNBUFFERED=1 FACE_MODEL=/models/yunet.onnx
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg fontconfig fonts-dejavu-core curl \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir "opencv-python-headless==4.10.0.84" "numpy>=2,<3" \
    && mkdir /models \
    && curl -fsSL -o /models/yunet.onnx "$YUNET" \
    && chmod -R a+rX /models \
    && useradd --system --no-create-home reels
COPY graph.py server.py tests.py /app/
WORKDIR /app
USER reels
EXPOSE 7100
CMD ["python", "/app/server.py"]
