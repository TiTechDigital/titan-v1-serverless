"""TITAN V1 serverless: LTX (motion) -> Wan 14B V2V (+cinema LoRA) -> Real-ESRGAN -> voice/music -> mp4.

Needs a 48 GB+ GPU and ~64 GB system RAM (both big models use CPU offload).
Put HF cache on a network volume (HF_HOME=/runpod-volume/hf) to avoid re-downloading ~60 GB per cold start.
"""
import os
if os.path.isdir("/runpod-volume") and "HF_HOME" not in os.environ:
    os.environ["HF_HOME"] = "/runpod-volume/hf"

import runpod, time, torch, subprocess, base64, gc, urllib.request
import numpy as np
from PIL import Image
from diffusers import LTXPipeline, WanVideoToVideoPipeline, AutoencoderKLWan, UniPCMultistepScheduler
from huggingface_hub import hf_hub_download

HF_TOKEN = os.environ.get("HF_TOKEN")
LORA_REPO = "enea25/titan-cinema-lora-14b"
LTX_LORA_FILE = "titan_motion_ltx13b_lora_v2_400steps.safetensors"   # LTX-Video 2B LoRA (dim 2048)
WAN_LORA_FILE = "titan_cinema_14b_lora_v2_400steps.safetensors"      # Wan 2.1 14B LoRA (dim 5120)
WAN_MODEL = os.environ.get("WAN_MODEL", "Wan-AI/Wan2.1-T2V-14B-Diffusers")

LTX_FPS, WAN_FPS, OUT_FPS = 24, 16, 24

print("⚡ [TITAN V1] Duke inicializuar motorët...")


def load_lora_remapped(pipeline, repo_file, adapter_name):
    """LoRA keys are saved as 'base_model.model.*'; diffusers wants 'transformer.*'."""
    from safetensors.torch import load_file
    path = hf_hub_download(repo_id=LORA_REPO, filename=repo_file, token=HF_TOKEN)
    sd = load_file(path)
    print(f"LORA_KEYS_SAMPLE[{adapter_name}]:", list(sd.keys())[:3])
    sd = {("transformer." + k[len("base_model.model."):] if k.startswith("base_model.model.") else k): v
          for k, v in sd.items()}
    pipeline.load_lora_weights(sd, adapter_name=adapter_name)
    print(f"⚡ LoRA '{adapter_name}' u aktivizua ({len(sd)} çelësa)")


# 1. LTX-Video: lëvizja / kompozimi
ltx = LTXPipeline.from_pretrained("Lightricks/LTX-Video", torch_dtype=torch.bfloat16)
try:
    load_lora_remapped(ltx, LTX_LORA_FILE, "titan_ltx")
except Exception as e:
    print(f"⚠️ LTX LoRA nuk u ngarkua (po përdoret modeli bazë): {e}")
ltx.enable_model_cpu_offload()

# 2. Wan 2.1 14B video-to-video + LoRA cinema
wan = None
try:
    wan_vae = AutoencoderKLWan.from_pretrained(WAN_MODEL, subfolder="vae", torch_dtype=torch.float32)
    wan = WanVideoToVideoPipeline.from_pretrained(WAN_MODEL, vae=wan_vae, torch_dtype=torch.bfloat16)
    wan.scheduler = UniPCMultistepScheduler.from_config(wan.scheduler.config, flow_shift=3.0)  # 3.0 = 480p
    try:
        load_lora_remapped(wan, WAN_LORA_FILE, "titan_wan")
    except Exception as e:
        print(f"⚠️ Wan LoRA nuk u ngarkua (Wan pa LoRA): {e}")
    wan.enable_model_cpu_offload()
    wan.vae.enable_tiling()
    print("✅ Wan 14B u ngarkua")
except Exception as e:
    wan = None
    print(f"⚠️ Wan nuk u ngarkua, vazhdon vetëm LTX: {e}")

# 3. Real-ESRGAN x4
upscaler = None
try:
    from esrgan import Upscaler
    upscaler = Upscaler()
    print("✅ Real-ESRGAN x4plus u ngarkua (FP16)")
except Exception as e:
    print(f"⚠️ Real-ESRGAN nuk u ngarkua, po përdoret Lanczos: {e}")

print("✅ TITAN V1 Serverless Core është GATI!")

# Harta e plotë e zërave
VOICE_MAP = {
    "adam": ("a", "am_adam"),         # Hollywood Deep Baritone
    "george": ("b", "bm_george"),     # BBC Documentary British
    "bella": ("a", "af_bella"),       # Female Cinematic
    "sarah": ("a", "af_sarah"),       # Female Warm
    "michael": ("a", "am_michael"),   # Male Storyteller
    "albanian": ("sq", "sq-AL-IlirNeural"),  # Shqip Ilir
    "anila": ("sq", "sq-AL-AnilaNeural")     # Shqip Femëror
}


def generate_voice_audio(text, voice_key, output_path):
    """
    Ruan zgjedhjen e klientit dhe kthen (sukses, emri_real_i_zerit)
    """
    voice_key_clean = (voice_key or "auto").lower().strip()

    # 1. Shqip: kërkim eksplicit, ose "auto" dhe teksti është shqip
    is_explicit_sq = voice_key_clean in ["albanian", "ilir", "shqip", "anila"]
    is_auto_sq = voice_key_clean == "auto" and any(w in f" {text.lower()} " for w in [" dhe ", " është ", " për ", " një "])

    if is_explicit_sq or is_auto_sq:
        target_voice = "sq-AL-AnilaNeural" if voice_key_clean == "anila" else "sq-AL-IlirNeural"
        import asyncio, edge_tts

        async def run_sq():
            comm = edge_tts.Communicate(text, target_voice)
            await comm.save(output_path)
        asyncio.run(run_sq())
        return os.path.exists(output_path), target_voice

    # 2. Kokoro Neural Voices (adam, george, bella, etj.)
    try:
        from kokoro import KPipeline
        import soundfile as sf

        # Nëse çelësi nuk ekziston, zgjedhim am_adam si standard
        lang_code, voice_id = VOICE_MAP.get(voice_key_clean, ("a", "am_adam"))
        kpipe = KPipeline(lang_code=lang_code, repo_id="hexgrad/Kokoro-82M")
        generator = kpipe(text, voice=voice_id, speed=0.92)

        all_chunks = [audio for _, _, audio in generator]
        if all_chunks:
            sf.write(output_path, np.concatenate(all_chunks), 24000)
            return True, voice_id
    except Exception as e:
        print(f"Gabim në Kokoro ({e}), po përdorim fallback...")
        import asyncio, edge_tts

        async def run_fb():
            comm = edge_tts.Communicate(text, "en-US-ChristopherNeural")
            await comm.save(output_path)
        asyncio.run(run_fb())
        return os.path.exists(output_path), "en-US-ChristopherNeural (fallback)"

    return False, "none"


def get_music(job_input, seconds, out_path):
    """Muzika: `music_url` (file i gatshëm) ose `music_prompt` (MusicGen small). Kthen True nëse u krijua."""
    try:
        url = job_input.get("music_url")
        if url:
            urllib.request.urlretrieve(url, out_path)
            return os.path.exists(out_path)
        prompt = (job_input.get("music_prompt") or "").strip()
        if prompt:
            from transformers import AutoProcessor, MusicgenForConditionalGeneration
            import soundfile as sf
            proc = AutoProcessor.from_pretrained("facebook/musicgen-small")
            mg = MusicgenForConditionalGeneration.from_pretrained("facebook/musicgen-small").to("cuda")
            inputs = proc(text=[prompt], padding=True, return_tensors="pt").to("cuda")
            with torch.inference_mode():
                audio = mg.generate(**inputs, do_sample=True, max_new_tokens=int(min(seconds, 30) * 50))
            sf.write(out_path, audio[0, 0].float().cpu().numpy(), mg.config.audio_encoder.sampling_rate)
            del mg
            torch.cuda.empty_cache()
            return True
    except Exception as e:
        print(f"⚠️ Muzika dështoi, vazhdon pa të: {e}")
    return False


def media_duration(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "default=nw=1:nk=1", path], capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except ValueError:
        return 0.0


def to_pil(frame):
    if isinstance(frame, Image.Image):
        return frame
    arr = np.asarray(frame)
    if arr.dtype != np.uint8:
        arr = (np.clip(arr, 0, 1) * 255).round().astype(np.uint8)
    return Image.fromarray(arr)


def encode_frames(frames, in_fps, target_w, target_h, out_path, crf, level):
    """Stream frames to ffmpeg (no giant intermediate file): fps->24, scale+crop to fill, H.264."""
    first = to_pil(frames[0]).convert("RGB")
    fw, fh = first.size
    vf = (f"fps={OUT_FPS},scale={target_w}:{target_h}:force_original_aspect_ratio=increase:flags=lanczos,"
          f"crop={target_w}:{target_h}")
    cmd = ["ffmpeg", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{fw}x{fh}", "-r", str(in_fps),
           "-i", "-", "-vf", vf, "-c:v", "libx264", "-preset", "fast", "-crf", str(crf),
           "-level:v", level, "-pix_fmt", "yuv420p", out_path]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    try:
        for fr in frames:
            p.stdin.write(to_pil(fr).convert("RGB").tobytes())
    finally:
        p.stdin.close()
        p.wait()
    if p.returncode != 0:
        raise RuntimeError("ffmpeg encode failed")


def handler(job):
    job_input = job.get("input", {})
    prompt = job_input.get("prompt", "Cinematic drone shot of sunset, photorealistic, 8k")
    wan_prompt = job_input.get("wan_prompt", prompt)
    narration = (job_input.get("narration", "") or "").strip()
    voice = job_input.get("voice", "adam")
    aspect = job_input.get("aspect", "9:16")
    enable_4k = job_input.get("enable_4k", True)      # ESRGAN + upscale to final size
    true_4k = bool(job_input.get("true_4k", False))   # False -> 1080x1920, True -> 2160x3840
    wan_strength = float(job_input.get("wan_strength", 0.6))
    wan_steps = int(job_input.get("wan_steps", 25))

    # Kohëzgjatja 2-10 sek. Pa "duration": nga teksti i narracionit, ose 5s.
    if "duration" in job_input:
        seconds = float(job_input["duration"])
    elif narration:
        seconds = len(narration.split()) / 2.5 + 0.5
    else:
        seconds = 5.0
    seconds = max(2.0, min(10.0, seconds))

    start_t = time.time()
    run_id = int(time.time())
    h, w = (704, 480) if aspect == "9:16" else (480, 704)
    audio_file = f"/tmp/audio_{run_id}.wav"
    music_file = f"/tmp/music_{run_id}.wav"
    video_file = f"/tmp/video_{run_id}.mp4"
    output_final = f"/tmp/titan_{run_id}.mp4"

    # 1. LTX: lëvizja (8k+1 frames @24fps)
    ltx_frames_n = int(round(seconds * LTX_FPS / 8)) * 8 + 1
    with torch.inference_mode():
        frames = ltx(
            prompt=prompt,
            negative_prompt="worst quality, blurry, deformed, lowres",
            width=w, height=h,
            num_frames=ltx_frames_n,
            num_inference_steps=16,
            guidance_scale=3.5
        ).frames[0]
    frames = [to_pil(f) for f in frames]
    in_fps = LTX_FPS
    wan_used = False

    # 2. Wan 14B + LoRA: video-to-video mbi lëvizjen e LTX (4k+1 frames @16fps)
    if wan is not None:
        try:
            wan_n = int(round(seconds * WAN_FPS / 4)) * 4 + 1
            idx = np.linspace(0, len(frames) - 1, wan_n).round().astype(int)
            src = [frames[i] for i in idx]
            torch.cuda.empty_cache()
            with torch.inference_mode():
                wan_out = wan(
                    video=src,
                    prompt=wan_prompt,
                    negative_prompt="worst quality, blurry, deformed, lowres, jitter, static",
                    height=h, width=w,
                    num_frames=wan_n,
                    num_inference_steps=wan_steps,
                    guidance_scale=5.0,
                    strength=wan_strength,
                    output_type="pil",
                ).frames[0]
            frames, in_fps, wan_used = [to_pil(f) for f in wan_out], WAN_FPS, True
            del src, wan_out
        except Exception as e:
            print(f"⚠️ Wan dështoi, po përdoret dalja e LTX: {e}")
        gc.collect()
        torch.cuda.empty_cache()

    # 3. Real-ESRGAN x4 + crop/scale në rezolucionin final
    esrgan_used = False
    if enable_4k:
        if upscaler is not None:
            try:
                frames = [upscaler.enhance(fr) for fr in frames]
                esrgan_used = True
            except Exception as e:
                print(f"⚠️ Real-ESRGAN dështoi, po përdoret Lanczos: {e}")
        long_side, short_side = (3840, 2160) if true_4k else (1920, 1080)
    else:
        long_side, short_side = max(w, h), min(w, h)
    target_w, target_h = (short_side, long_side) if aspect == "9:16" else (long_side, short_side)
    encode_frames(frames, in_fps, target_w, target_h, video_file,
                  crf=23, level="5.2" if (enable_4k and true_4k) else "4.2")
    del frames
    gc.collect()
    torch.cuda.empty_cache()

    # 4. Zëri + muzika
    has_voice, actual_voice_used = False, "none"
    if narration:
        has_voice, actual_voice_used = generate_voice_audio(narration, voice, audio_file)
    has_music = get_music(job_input, seconds, music_file) if (
        job_input.get("music_url") or job_input.get("music_prompt")) else False

    # 5. Bashkimi. Nëse zëri është më i gjatë se videoja, kornizën e fundit e mbajmë (pa prerë narracionin).
    vid_dur = media_duration(video_file)
    total = vid_dur
    if has_voice:
        total = max(vid_dur, media_duration(audio_file) + 0.3)

    cmd = ["ffmpeg", "-y", "-i", video_file]
    labels = []
    if has_voice:
        cmd += ["-i", audio_file]
        labels.append(f"[{len(labels) + 1}:a]volume=1.0,apad[a{len(labels)}]")
    if has_music:
        cmd += ["-i", music_file]
        fade_out = max(total - 1.5, 0)
        labels.append(f"[{len(labels) + 1}:a]volume={0.18 if has_voice else 0.6},"
                      f"afade=t=in:d=1,afade=t=out:st={fade_out:.2f}:d=1.5[a{len(labels)}]")
    n_audio = len(labels)
    filters = list(labels)
    if n_audio:
        ins = "".join(f"[a{i}]" for i in range(n_audio))
        filters.append(f"{ins}amix=inputs={n_audio}:duration=longest:normalize=0,atrim=0:{total:.2f}[aout]")
    pad = total - vid_dur
    if pad > 0.05:
        filters.append(f"[0:v]tpad=stop_mode=clone:stop_duration={pad:.2f}[vout]")
        vmap, vcodec = "[vout]", ["-c:v", "libx264", "-preset", "fast", "-crf", "23", "-pix_fmt", "yuv420p"]
    else:
        vmap, vcodec = "0:v", ["-c:v", "copy"]
    if filters:
        cmd += ["-filter_complex", ";".join(filters)]
    cmd += ["-map", vmap]
    if n_audio:
        cmd += ["-map", "[aout]", "-c:a", "aac", "-b:a", "128k", "-ar", "44100"]
    cmd += vcodec + ["-t", f"{total:.2f}", output_final]
    subprocess.run(cmd, check=True)

    with open(output_final, "rb") as f:
        video_b64 = base64.b64encode(f.read()).decode("utf-8")

    for p in [audio_file, music_file, video_file, output_final]:
        if os.path.exists(p):
            try:
                os.remove(p)
            except Exception:
                pass

    return {
        "status": "COMPLETED",
        "seconds_taken": round(time.time() - start_t, 2),
        "video_base64": f"data:video/mp4;base64,{video_b64}",
        "duration": round(total, 2),
        "resolution": f"{target_w}x{target_h}",
        "wan_used": wan_used,
        "esrgan_used": esrgan_used,
        "voice_requested": voice,
        "voice_used": actual_voice_used,
        "music": has_music,
    }


runpod.serverless.start({"handler": handler})
