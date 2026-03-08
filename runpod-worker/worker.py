"""
RunPod GPU Worker — Documentary Factory

Python worker that runs on RunPod RTX 4090 pod.
Listens to Redis for generation jobs and processes them with:
- Flux.1: Reference image generation
- Wan2.1: Image-conditioned video generation

Deploy: Upload this folder to RunPod pod, then run:
  pip install -r requirements.txt
  python worker.py

Environment Variables Required:
  REDIS_URL       - Railway Redis connection string
  R2_ENDPOINT     - Cloudflare R2 endpoint
  R2_ACCESS_KEY   - R2 access key
  R2_SECRET_KEY   - R2 secret key
  R2_BUCKET       - R2 bucket name
"""

import json
import os
import sys
import time
import uuid
import tempfile
import traceback
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


# ─── Flux.1 Image Generation ──────────────────────────
_flux_pipe = None

def get_flux_pipeline():
    """Lazy-load Flux.1 pipeline."""
    global _flux_pipe
    if _flux_pipe is None:
        print("🔄 Loading Flux.1 pipeline...")
        from diffusers import FluxPipeline
        _flux_pipe = FluxPipeline.from_pretrained(
            "black-forest-labs/FLUX.1-dev",
            torch_dtype=torch.bfloat16,
        ).to("cuda")
        # Enable memory optimizations
        _flux_pipe.enable_model_cpu_offload()
        print("✅ Flux.1 loaded")
    return _flux_pipe


def generate_image(prompt: str, output_path: str, width: int = 1024, height: int = 1024):
    """Generate an image with Flux.1."""
    pipe = get_flux_pipeline()
    image = pipe(
        prompt=prompt,
        width=width,
        height=height,
        num_inference_steps=30,
        guidance_scale=7.5,
    ).images[0]
    image.save(output_path)
    print(f"  🖼️  Image generated: {output_path}")


# ─── Wan2.1 Video Generation ──────────────────────────
_wan_pipe = None

def get_wan_pipeline():
    """Lazy-load Wan2.1 image-to-video pipeline."""
    global _wan_pipe
    if _wan_pipe is None:
        print("🔄 Loading Wan2.1 pipeline...")
        from diffusers import WanImageToVideoPipeline
        _wan_pipe = WanImageToVideoPipeline.from_pretrained(
            "Wan-AI/Wan2.1-I2V-14B-480P",
            torch_dtype=torch.bfloat16,
        ).to("cuda")
        _wan_pipe.enable_model_cpu_offload()
        print("✅ Wan2.1 loaded")
    return _wan_pipe


def generate_video(
    prompt: str,
    reference_image_path: str,
    output_path: str,
    num_frames: int = 81,  # ~5 seconds at 16fps
    width: int = 854,
    height: int = 480,
):
    """Generate a video clip with Wan2.1 image-to-video."""
    from PIL import Image

    pipe = get_wan_pipeline()
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
    export_to_video(result.frames[0], output_path, fps=16)
    print(f"  🎬 Video generated: {output_path}")


# ─── Job Processor ─────────────────────────────────────

def process_job(job: dict, r: redis.Redis):
    """Process a single generation job."""
    job_id = job.get("jobId", "unknown")
    job_type = job.get("type", "unknown")
    prompt = job.get("prompt", "")
    refs = job.get("referenceImages", [])

    print(f"\n{'='*60}")
    print(f"📋 Job: {job_id} | Type: {job_type}")
    print(f"   Prompt: {prompt[:100]}...")

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            if job_type == "image":
                # Generate reference image with Flux.1
                output_file = os.path.join(tmpdir, f"{job_id}.png")
                generate_image(prompt, output_file)

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

            elif job_type == "video":
                # Download reference image first
                ref_path = os.path.join(tmpdir, "reference.png")
                if refs and len(refs) > 0:
                    download_from_r2(refs[0], ref_path)
                else:
                    # Generate a reference image from prompt if none provided
                    generate_image(prompt, ref_path, width=854, height=480)

                # Generate video clip
                output_file = os.path.join(tmpdir, f"{job_id}.mp4")
                duration_secs = job.get("duration", 5)
                num_frames = max(33, int(duration_secs * 16))  # 16fps
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

        # Publish result back
        r.publish(RESULTS_CHANNEL, json.dumps(result))
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
        r.publish(RESULTS_CHANNEL, json.dumps(result))


# ─── Main Loop ─────────────────────────────────────────

def main():
    print(f"🚀 Documentary GPU Worker starting...")
    print(f"   Redis: {REDIS_URL[:30]}...")
    print(f"   R2: {R2_ENDPOINT}")
    print(f"   GPU: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU (no GPU!)'}")
    print()

    r = redis.from_url(REDIS_URL, decode_responses=True)
    pubsub = r.pubsub()
    pubsub.subscribe(JOBS_CHANNEL)

    print(f"📡 Listening on channel: {JOBS_CHANNEL}")
    print(f"   Waiting for jobs...")

    for message in pubsub.listen():
        if message["type"] != "message":
            continue

        try:
            job = json.loads(message["data"])
            process_job(job, r)
        except json.JSONDecodeError:
            print(f"⚠️ Invalid JSON: {message['data'][:100]}")
        except Exception as e:
            print(f"⚠️ Error processing message: {e}")
            traceback.print_exc()


if __name__ == "__main__":
    main()
