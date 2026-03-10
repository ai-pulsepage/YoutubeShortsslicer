"""
RunPod GPU Worker — Documentary Factory

Python worker that runs on RunPod RTX 4090 pod.
Listens to Redis for generation jobs and processes them with:
- Flux.1: Reference image generation
- Wan2.2: Image-conditioned video generation

Deploy: Upload this folder to RunPod pod, then run:
  pip install -r requirements.txt
  python worker.py

Environment Variables Required:
  REDIS_URL       - Railway Redis connection string
  R2_ENDPOINT     - Cloudflare R2 endpoint
  R2_ACCESS_KEY   - R2 access key
  R2_SECRET_KEY   - R2 secret key
  R2_BUCKET       - R2 bucket name
  WEBHOOK_URL     - Backend webhook URL (e.g. https://your-app.railway.app/api/documentary/webhook)
  WORKER_WEBHOOK_SECRET - Shared secret for webhook auth
"""

import json
import os
import sys
import time
import uuid
import tempfile
import traceback
import requests
from pathlib import Path

import redis
import boto3
import torch
from botocore.config import Config

# ─── Configuration ─────────────────────────────────────
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
R2_ENDPOINT = os.environ["R2_ENDPOINT"]
R2_ACCESS_KEY = os.environ["R2_ACCESS_KEY"]
R2_SECRET_KEY = os.environ["R2_SECRET_KEY"]
R2_BUCKET = os.environ.get("R2_BUCKET", "youtubeshorts")
WEBHOOK_URL = os.environ.get("WEBHOOK_URL", "")  # e.g. https://your-app.railway.app/api/documentary/webhook
WEBHOOK_SECRET = os.environ.get("WORKER_WEBHOOK_SECRET", "documentary-worker-secret")

JOBS_CHANNEL = "documentary_jobs"
RESULTS_CHANNEL = "documentary_results"

# ─── R2 Client ─────────────────────────────────────────
s3 = boto3.client(
    "s3",
    endpoint_url=R2_ENDPOINT,
    aws_access_key_id=R2_ACCESS_KEY,
    aws_secret_access_key=R2_SECRET_KEY,
    config=Config(signature_version="s3v4"),
    region_name="auto",
)


def upload_to_r2(local_path: str, r2_key: str, content_type: str = "application/octet-stream"):
    """Upload a file to R2."""
    s3.upload_file(local_path, R2_BUCKET, r2_key, ExtraArgs={"ContentType": content_type})
    print(f"  📤 Uploaded: {r2_key}")
    return r2_key


def download_from_r2(r2_key: str, local_path: str):
    """Download a file from R2."""
    s3.download_file(R2_BUCKET, r2_key, local_path)
    print(f"  📥 Downloaded: {r2_key}")


# ─── Multi-Model Image Generation ─────────────────────
_image_pipelines = {}  # Cache: model_name -> pipeline

def get_image_pipeline(model_name: str = "flux"):
    """Lazy-load the requested image generation pipeline.
    
    Supported models:
      - chroma: Chroma FP16 (uncensored, Apache 2.0, 8.9B params) — best for horror/mature
      - flux: Flux.1-dev (gated) or Flux.1-schnell (open fallback) — standard
      - juggernaut: Juggernaut XL (photorealistic SDXL) — best for true crime/biography
    """
    global _image_pipelines
    
    if model_name in _image_pipelines:
        return _image_pipelines[model_name]
    
    import gc
    
    # Free other loaded image pipelines to save VRAM
    for key in list(_image_pipelines.keys()):
        print(f"  🧹 Unloading {key} pipeline to make room for {model_name}...")
        del _image_pipelines[key]
    gc.collect()
    torch.cuda.empty_cache()
    
    if model_name == "chroma":
        from diffusers import FluxPipeline, FluxTransformer2DModel
        print("🔄 Loading Chroma transformer...")
        # Chroma is a fine-tuned transformer on top of FLUX.1-schnell
        # Load the transformer separately, then plug into the full schnell pipeline
        transformer = FluxTransformer2DModel.from_pretrained(
            "lodestones/Chroma",
            subfolder="transformer",
            torch_dtype=torch.bfloat16,
        )
        print("🔄 Loading base FLUX.1-schnell pipeline...")
        pipe = FluxPipeline.from_pretrained(
            "black-forest-labs/FLUX.1-schnell",
            transformer=transformer,
            torch_dtype=torch.bfloat16,
            token=False,
        )
        pipe.enable_model_cpu_offload()
        print("✅ Chroma loaded (schnell base + Chroma transformer, uncensored)")
        
    elif model_name == "juggernaut":
        from diffusers import StableDiffusionXLPipeline
        print("🔄 Loading Juggernaut XL pipeline (photorealistic)...")
        pipe = StableDiffusionXLPipeline.from_pretrained(
            "RunDiffusion/Juggernaut-XL-v9",
            torch_dtype=torch.float16,
            variant="fp16",
        )
        pipe.enable_model_cpu_offload()
        print("✅ Juggernaut XL loaded (photorealistic)")
        
    else:  # Default: flux
        from diffusers import FluxPipeline
        hf_token = None
        for token_path in [
            os.path.join(os.environ.get("HF_HOME", ""), "token"),
            os.path.expanduser("~/.cache/huggingface/token"),
        ]:
            if os.path.exists(token_path):
                with open(token_path) as f:
                    hf_token = f.read().strip()
                break

        try:
            print("🔄 Loading Flux.1-dev pipeline...")
            pipe = FluxPipeline.from_pretrained(
                "black-forest-labs/FLUX.1-dev",
                torch_dtype=torch.bfloat16,
                token=hf_token,
            )
            pipe.enable_model_cpu_offload()
            print("✅ Flux.1-dev loaded")
        except Exception as e:
            print(f"⚠️  Flux.1-dev failed ({e}), falling back to Flux.1-schnell...")
            pipe = FluxPipeline.from_pretrained(
                "black-forest-labs/FLUX.1-schnell",
                torch_dtype=torch.bfloat16,
                token=False,
            )
            pipe.enable_model_cpu_offload()
            print("✅ Flux.1-schnell loaded (open model)")
    
    _image_pipelines[model_name] = pipe
    return pipe


def generate_image(prompt: str, output_path: str, width: int = 1024, height: int = 1024, model: str = "flux"):
    """Generate an image with the specified model."""
    pipe = get_image_pipeline(model)
    
    # Juggernaut XL uses different params than Flux/Chroma
    if model == "juggernaut":
        image = pipe(
            prompt=prompt,
            width=width,
            height=height,
            num_inference_steps=35,
            guidance_scale=6.0,
        ).images[0]
    else:
        # Flux and Chroma share the same API
        image = pipe(
            prompt=prompt,
            width=width,
            height=height,
            num_inference_steps=30,
            guidance_scale=7.5,
        ).images[0]
    
    image.save(output_path)
    print(f"  🖼️  Image generated ({model}): {output_path}")


# ─── Wan2.1 Video Generation ──────────────────────────
_wan_pipe = None

def get_wan_pipeline():
    """Lazy-load Wan2.2 image-to-video pipeline."""
    global _wan_pipe
    if _wan_pipe is None:
        from diffusers import WanImageToVideoPipeline

        model_id = "Wan-AI/Wan2.2-TI2V-5B-Diffusers"
        print(f"🔄 Loading {model_id}...")
        _wan_pipe = WanImageToVideoPipeline.from_pretrained(
            model_id,
            torch_dtype=torch.bfloat16,
        )
        _wan_pipe.enable_model_cpu_offload()
        _wan_pipe.vae.enable_slicing()
        _wan_pipe.vae.enable_tiling()
        print(f"✅ {model_id} loaded")
    return _wan_pipe


def generate_video(
    prompt: str,
    reference_image_path: str,
    output_path: str,
    num_frames: int = 81,  # ~3.4 seconds at 24fps
    width: int = 1280,
    height: int = 720,
):
    """Generate a video clip with Wan2.2 image-to-video."""
    import gc
    from PIL import Image

    # Wan2.2 requires dimensions divisible by 16
    width = (width // 16) * 16
    height = (height // 16) * 16

    pipe = get_wan_pipeline()
    torch.cuda.empty_cache()
    gc.collect()

    ref_image = Image.open(reference_image_path).convert("RGB").resize((width, height))

    result = pipe(
        prompt=prompt,
        image=ref_image,
        num_frames=num_frames,
        width=width,
        height=height,
        num_inference_steps=30,
        guidance_scale=5.0,
    )

    # Export frames to video
    from diffusers.utils import export_to_video
    export_to_video(result.frames[0], output_path, fps=24)
    print(f"  🎬 Video generated: {output_path}")

    # Aggressive cleanup to prevent system RAM buildup
    del result
    gc.collect()
    torch.cuda.empty_cache()


def process_job(job: dict, r: redis.Redis):
    """Process a single generation job."""
    job_id = job.get("jobId", "unknown")
    job_type = job.get("type", "unknown")
    prompt = job.get("prompt", "")
    refs = job.get("referenceImages", [])
    metadata = job.get("metadata", {})
    image_model = metadata.get("model", "flux")  # chroma, flux, or juggernaut

    print(f"\n{'='*60}")
    print(f"📋 Job: {job_id} | Type: {job_type} | Model: {image_model}")
    print(f"   Prompt: {prompt[:100]}...")

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            # Map job types: ref_image and image both generate images
            if job_type in ("image", "ref_image"):
                # Generate reference image with selected model
                output_file = os.path.join(tmpdir, f"{job_id}.png")
                generate_image(prompt, output_file, model=image_model)

                # Upload to R2
                r2_key = f"documentaries/assets/{job_id}.png"
                upload_to_r2(output_file, r2_key, "image/png")

                # Publish result
                result = {
                    "jobId": job_id,
                    "status": "completed",
                    "outputPath": r2_key,
                    "type": "image",
                }

            elif job_type in ("video", "shot_video"):
                # Download reference image first
                ref_path = os.path.join(tmpdir, "reference.png")
                if refs and len(refs) > 0:
                    download_from_r2(refs[0], ref_path)
                else:
                    # Generate a reference image from prompt if none provided
                    generate_image(prompt, ref_path, width=1280, height=704)

                # Generate video clip
                output_file = os.path.join(tmpdir, f"{job_id}.mp4")
                duration_secs = job.get("duration", 5)
                num_frames = max(33, int(duration_secs * 24))  # 24fps for Wan2.2
                generate_video(prompt, ref_path, output_file, num_frames=num_frames)

                # Upload to R2
                r2_key = f"documentaries/clips/{job_id}.mp4"
                upload_to_r2(output_file, r2_key, "video/mp4")

                # Extract last frame for visual continuity
                last_frame_key = None
                try:
                    import subprocess
                    last_frame_file = os.path.join(tmpdir, "last_frame.png")
                    subprocess.run([
                        "ffmpeg", "-sseof", "-0.1", "-i", output_file,
                        "-frames:v", "1", "-q:v", "2", last_frame_file, "-y"
                    ], capture_output=True, timeout=30)
                    if os.path.exists(last_frame_file):
                        last_frame_key = f"documentaries/clips/{job_id}_last_frame.png"
                        upload_to_r2(last_frame_file, last_frame_key, "image/png")
                except Exception:
                    pass  # Last frame extraction is best-effort

                result = {
                    "jobId": job_id,
                    "status": "completed",
                    "outputPath": r2_key,
                    "lastFramePath": last_frame_key,
                    "type": "video",
                }

            else:
                result = {
                    "jobId": job_id,
                    "status": "failed",
                    "error": f"Unknown job type: {job_type}",
                }

        # Report result via webhook (primary) and Redis (fallback)
        report_result(r, result)
        print(f"✅ Job {job_id} completed → {result.get('outputPath', 'N/A')}")

    except Exception as e:
        error_msg = f"{type(e).__name__}: {str(e)}"
        print(f"❌ Job {job_id} failed: {error_msg}")
        traceback.print_exc()

        result = {
            "jobId": job_id,
            "status": "failed",
            "error": error_msg,
        }
        report_result(r, result)


# ─── Result Reporting ──────────────────────────────────

def report_result(r, result: dict):
    """Report job result via webhook (primary) and Redis list (fallback)."""
    # Always push to Redis list as fallback
    r.lpush(RESULTS_CHANNEL, json.dumps(result))

    # Call webhook if configured
    if WEBHOOK_URL:
        try:
            resp = requests.post(
                WEBHOOK_URL,
                json=result,
                headers={
                    "Content-Type": "application/json",
                    "x-webhook-secret": WEBHOOK_SECRET,
                },
                timeout=10,
            )
            if resp.status_code == 200:
                print(f"  📡 Webhook reported: {result.get('status', 'unknown')}")
            else:
                print(f"  ⚠️ Webhook returned {resp.status_code}: {resp.text[:100]}")
        except Exception as e:
            print(f"  ⚠️ Webhook failed (Redis fallback used): {e}")


# ─── Main Loop ─────────────────────────────────────────

def main():
    print(f"🚀 Documentary GPU Worker starting...")
    print(f"   Redis: {REDIS_URL[:30]}...")
    print(f"   R2: {R2_ENDPOINT}")
    print(f"   GPU: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU (no GPU!)'}")
    print()

    print(f"📡 Listening on queue: {JOBS_CHANNEL} (BRPOP)")
    print(f"   Waiting for jobs...")
    sys.stdout.flush()

    while True:
        try:
            r = redis.from_url(REDIS_URL, decode_responses=True, socket_timeout=30, socket_keepalive=True)
            r.ping()
            print(f"✅ Redis connected")
            sys.stdout.flush()

            while True:
                # Use short timeout (5s) to avoid Railway proxy killing the connection
                result = r.brpop(JOBS_CHANNEL, timeout=5)
                if result is None:
                    continue  # Timeout, loop and try again

                _, raw_data = result
                try:
                    job = json.loads(raw_data)
                    process_job(job, r)
                except json.JSONDecodeError:
                    print(f"⚠️ Invalid JSON: {raw_data[:100]}")
                except Exception as e:
                    print(f"⚠️ Error processing job: {e}")
                    traceback.print_exc()
                sys.stdout.flush()

        except (redis.exceptions.ConnectionError, redis.exceptions.TimeoutError, ConnectionResetError) as e:
            print(f"🔄 Redis connection lost: {e}. Reconnecting in 3s...")
            sys.stdout.flush()
            time.sleep(3)
        except KeyboardInterrupt:
            print("\n👋 Worker stopped.")
            break
        except Exception as e:
            print(f"❌ Unexpected error: {e}")
            traceback.print_exc()
            sys.stdout.flush()
            time.sleep(5)


if __name__ == "__main__":
    main()

