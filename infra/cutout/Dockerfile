# The photo studio's background remover (backend/apps/media/photo_edits.py): rembg's model behind a tiny HTTP
# API (server.py). Built from rembg's pip package rather than its image, which has no arm64 build, so the
# same image runs on a Mac's dev stack and on the servers. The model is downloaded here, at build: a photo
# never waits for it, and nothing is fetched at run time.
#
# IS-Net (Apache-2.0): 3.4 s and 1.5 GB at its peak for a photo on the dev Mac's CPU. BiRefNet's cleaner
# hair was out of reach on CPU: even its lite model was killed at 6 GB. Not bria-rmbg, whose licence needs a
# paid agreement for commercial use.
FROM python:3.12-slim
ARG MODEL=isnet-general-use
ENV CUTOUT_MODEL=${MODEL} U2NET_HOME=/models PYTHONUNBUFFERED=1
RUN pip install --no-cache-dir "rembg[cpu]==2.0.86" \
    && python -c "from rembg import new_session; new_session('${MODEL}')" \
    && chmod -R a+rX /models \
    && useradd --system --no-create-home cutout
COPY server.py /app/server.py
# pymatting (a rembg dependency) compiles with numba, which caches beside the package unless told otherwise:
# a place the unprivileged user can write.
ENV NUMBA_CACHE_DIR=/tmp/numba
USER cutout
EXPOSE 7000
CMD ["python", "/app/server.py"]
