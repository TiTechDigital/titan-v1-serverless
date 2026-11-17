import runpod, time, os, torch, subprocess, base64
from diffusers import LTXPipeline
from diffusers.utils import export_to_video
from huggingface_hub import hf_hub_download

print("⚡ [TITAN V1] Duke inicializuar motorin në GPU...")

# 1. Ngarkojmë modelin bazë LTX në GPU VRAM
pipe = LTXPipeline.from_pretrained(
    "Lightricks/LTX-Video",
    torch_dtype=torch.bfloat16
).to("cuda")

# 2. Shkarkojmë dhe ngarkojmë LoRA-n në mënyrë të sigurt (pa rrezik rrëzimi)
lora_file = "/titan_motion_lora.safetensors"
if not os.path.exists(lora_file):
    try:
        hf_hub_download(
            repo_id="enea25/titan-cinema-lora-14b",
            filename="titan_motion_ltx13b_lora_v2_400steps.safetensors",
            local_dir="/",
            token=os.environ.get("HF_TOKEN")  # vendose në RunPod endpoint env vars
        )
        lora_file = "/titan_motion_ltx13b_lora_v2_400steps.safetensors"
        print("✅ LoRA u shkarkua nga Hugging Face!")
    except Exception as e:
        print(f"⚠️ Nuk u shkarkua dot LoRA: {e}")

if os.path.exists(lora_file):
    try:
        pipe.load_lora_weights(lora_file)
        print("⚡ TITAN LoRA u aktivizua me sukses në VRAM!")
    except Exception as e:
        print(f"⚠️ Paralajmërim LoRA (po përdoret modeli bazë pa u rrëzuar): {e}")

print("✅ TITAN V1 Serverless Core është GATI!")

# Harta e plotë e zërave
VOICE_MAP = {
    "adam": ("a", "am_adam"),       # Hollywood Deep Baritone
    "george": ("b", "bm_george"),   # BBC Documentary British
    "bella": ("a", "af_bella"),     # Female Cinematic
    "sarah": ("a", "af_sarah"),     # Female Warm
    "michael": ("a", "am_michael")  # Male Storyteller
}


def generate_voice_audio(text, voice_key, output_path):
    """Gjeneron zërin sipas parametrit dinamik të zgjedhur nga klienti"""
    if voice_key in ["albanian", "ilir", "shqip"] or any(w in text.lower() for w in [" dhe ", " është ", " për ", " një "]):
        # Përdorim motorin e përshtatur Shqip
        import asyncio, edge_tts

        async def run_sq():
            comm = edge_tts.Communicate(text, "sq-AL-IlirNeural")
            await comm.save(output_path)
        asyncio.run(run_sq())
        return os.path.exists(output_path)

    # Kokoro Neural Voices
    try:
        from kokoro import KPipeline
        import soundfile as sf, numpy as np

        lang_code, voice_id = VOICE_MAP.get(voice_key.lower(), ("a", "am_adam"))
        kpipe = KPipeline(lang_code=lang_code)
        generator = kpipe(text, voice=voice_id, speed=0.92)

        all_chunks = [audio for _, _, audio in generator]
        if all_chunks:
            sf.write(output_path, np.concatenate(all_chunks), 24000)
            return True
    except Exception as e:
        print(f"Gabim në gjenerimin e zërit ({e}), po përdorim fallback...")
        import asyncio, edge_tts

        async def run_fb():
            comm = edge_tts.Communicate(text, "en-US-ChristopherNeural")
            await comm.save(output_path)
        asyncio.run(run_fb())
        return os.path.exists(output_path)
    return False


def handler(job):
    job_input = job.get("input", {})
    prompt = job_input.get("prompt", "Cinematic drone shot of sunset, photorealistic, 8k")
    narration = job_input.get("narration", "")
    voice = job_input.get("voice", "adam")
    aspect = job_input.get("aspect", "9:16")
    enable_4k = job_input.get("enable_4k", True)

    start_t = time.time()
    run_id = int(time.time())
    h, w = (704, 480) if aspect == "9:16" else (480, 704)
    raw_video = f"/tmp/raw_{run_id}.mp4"
    audio_file = f"/tmp/audio_{run_id}.wav"
    output_final = f"/tmp/titan_{run_id}.mp4"

    # 1. Gjenerimi i videos në GPU (~18s)
    with torch.inference_mode():
        frames = pipe(
            prompt=prompt,
            negative_prompt="worst quality, blurry, deformed, lowres",
            width=w, height=h,
            num_frames=49,
            num_inference_steps=16,
            guidance_scale=3.5
        ).frames[0]

    export_to_video(frames, raw_video, fps=24)
    target_video = raw_video

    # 2. Zmadhimi 4K me FFmpeg Lanczos (~2-3s)
    if enable_4k:
        target_w, target_h = (2160, 3840) if aspect == "9:16" else (3840, 2160)
        upscaled_4k = f"/tmp/4k_{run_id}.mp4"
        cmd_4k = f'ffmpeg -y -i "{raw_video}" -vf "scale={target_w}:{target_h}:flags=lanczos,unsharp=5:5:1.2:5:5:0.0" -c:v libx264 -preset ultrafast -crf 17 -pix_fmt yuv420p "{upscaled_4k}"'
        if subprocess.run(cmd_4k, shell=True).returncode == 0:
            target_video = upscaled_4k

    # 3. Zëri me përzgjedhje dinamike
    has_audio = False
    if narration.strip():
        has_audio = generate_voice_audio(narration.strip(), voice, audio_file)

    # 4. Bashkimi Video + Audio me FFmpeg
    if has_audio:
        cmd = f'ffmpeg -y -i "{target_video}" -i "{audio_file}" -c:v copy -c:a aac -b:a 256k -shortest "{output_final}"'
    else:
        cmd = f'ffmpeg -y -i "{target_video}" -c:v copy "{output_final}"'

    subprocess.run(cmd, shell=True, check=True)

    with open(output_final, "rb") as f:
        video_b64 = base64.b64encode(f.read()).decode("utf-8")

    # Pastrimi i të gjithë skedarëve të përkohshëm
    to_clean = [raw_video, audio_file, output_final]
    if enable_4k:
        to_clean.append(f"/tmp/4k_{run_id}.mp4")
    for p in to_clean:
        if os.path.exists(p):
            try:
                os.remove(p)
            except Exception:
                pass

    return {
        "status": "COMPLETED",
        "seconds_taken": round(time.time() - start_t, 2),
        "video_base64": f"data:video/mp4;base64,{video_b64}",
        "resolution": "4K Ultra-HD" if enable_4k else "HD",
        "voice_used": voice
    }


runpod.serverless.start({"handler": handler})
