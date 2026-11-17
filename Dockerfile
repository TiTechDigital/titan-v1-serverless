FROM runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg espeak-ng && rm -rf /var/lib/apt/lists/*
WORKDIR /
COPY requirements.txt .
RUN pip freeze | grep -E '^(torch|torchvision|torchaudio)==' > /constraints.txt && pip install --no-cache-dir -c /constraints.txt -r requirements.txt
COPY handler.py .
CMD [ "python3", "-u", "/handler.py" ]
