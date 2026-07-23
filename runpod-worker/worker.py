"""
RunPod GPU Worker — Documentary Factory

Python worker that runs on RunPod RTX 4090 pod.
Listens to Redis for generation jobs and processes them with:
- Flux.1: Reference image generation
- Wan2.2: Image-conditioned video generation
- MusicGen: Background music / jingle generation

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

import os
# Force Hugging Face & Torch caches to live on the persistent storage drive (/workspace)
os.environ["HF_HOME"] = "/workspace/hf_cache"
os.environ["TORCH_HOME"] = "/workspace/torch_cache"
os.environ["TMPDIR"] = "/workspace/tmp"
os.makedirs("/workspace/tmp", exist_ok=True)
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

# Monkey patch torch.distributed.tensor for PyTorch 2.4.0 compatibility
import sys
import torch
try:
    if not hasattr(torch.distributed, "tensor"):
        import torch.distributed._tensor as _tensor
        sys.modules["torch.distributed.tensor"] = _tensor
except ImportError:
    pass

# Mock torch.nn.attention.flex_attention for PyTorch < 2.5 compatibility
try:
    import types
    from importlib.machinery import ModuleSpec

    # First, check if flex_attention is natively available (e.g. PyTorch >= 2.5)
    try:
        import torch.nn.attention.flex_attention as native_flex
        print("  ✅ torch.nn.attention.flex_attention natively available. Skipping mock.")
    except ImportError:
        # Not available natively (PyTorch < 2.5), register our mock finder
        class FlexAttentionFinder:
            def find_spec(self, fullname, path, target=None):
                if fullname == "torch.nn.attention.flex_attention":
                    return ModuleSpec(fullname, self)
                return None

            def create_module(self, spec):
                flex_mock = types.ModuleType(spec.name)
                
                def dummy_flex_attention(*args, **kwargs):
                    raise NotImplementedError("flex_attention is not supported on PyTorch < 2.5")
                    
                def dummy_create_block_mask(*args, **kwargs):
                    raise NotImplementedError("create_block_mask is not supported on PyTorch < 2.5")

                class DummyBlockMask:
                    pass

                flex_mock.flex_attention = dummy_flex_attention
                flex_mock.create_block_mask = dummy_create_block_mask
                flex_mock.BlockMask = DummyBlockMask
                flex_mock._DEFAULT_SPARSE_BLOCK_SIZE = 128
                return flex_mock

            def exec_module(self, module):
                pass

        sys.meta_path.insert(0, FlexAttentionFinder())
        
        # Pre-inject into sys.modules and force parent package paths
        flex_mock = types.ModuleType("torch.nn.attention.flex_attention")
        def dummy_flex_attention(*args, **kwargs):
            raise NotImplementedError("flex_attention is not supported on PyTorch < 2.5")
        def dummy_create_block_mask(*args, **kwargs):
            raise NotImplementedError("create_block_mask is not supported on PyTorch < 2.5")
        class DummyBlockMask:
            pass
        flex_mock.flex_attention = dummy_flex_attention
        flex_mock.create_block_mask = dummy_create_block_mask
        flex_mock.BlockMask = DummyBlockMask
        flex_mock._DEFAULT_SPARSE_BLOCK_SIZE = 128
        sys.modules["torch.nn.attention.flex_attention"] = flex_mock
        
        try:
            import torch.nn.attention
            if not hasattr(torch.nn.attention, "__path__"):
                torch.nn.attention.__path__ = []
            torch.nn.attention.flex_attention = flex_mock
        except ImportError:
            pass
        print("  ✅ Successfully registered FlexAttentionFinder in sys.meta_path for PyTorch < 2.5")
except Exception as e:
    print(f"  ⚠️ Failed to mock torch.nn.attention.flex_attention: {e}")

# Monkey patch torch.library.infer_schema for PyTorch 2.4.0 string type annotation compatibility
try:
    import torch
    import torch.library
    try:
        import torch._library
        import torch._library.infer_schema
    except ImportError:
        pass

    # Find the original function
    _orig_infer_schema = None
    if hasattr(torch, "_library") and hasattr(torch._library, "infer_schema") and hasattr(torch._library.infer_schema, "infer_schema"):
        _orig_infer_schema = torch._library.infer_schema.infer_schema
    elif hasattr(torch, "library") and hasattr(torch.library, "infer_schema"):
        _orig_infer_schema = torch.library.infer_schema

    if _orig_infer_schema is not None:
        def patched_infer_schema(func, *args, **kwargs):
            if hasattr(func, "__annotations__"):
                import typing
                new_annotations = {}
                for name, val in func.__annotations__.items():
                    if isinstance(val, str):
                        val_str = val.strip()
                        # Resolve union and typing structures
                        if val_str == "torch.Tensor":
                            new_annotations[name] = torch.Tensor
                        elif val_str in ("torch.Tensor | None", "Optional[torch.Tensor]", "typing.Optional[torch.Tensor]"):
                            new_annotations[name] = typing.Optional[torch.Tensor]
                        elif val_str == "bool":
                            new_annotations[name] = bool
                        elif val_str in ("bool | None", "Optional[bool]", "typing.Optional[bool]"):
                            new_annotations[name] = typing.Optional[bool]
                        elif val_str == "int":
                            new_annotations[name] = int
                        elif val_str in ("int | None", "Optional[int]", "typing.Optional[int]"):
                            new_annotations[name] = typing.Optional[int]
                        elif val_str == "float":
                            new_annotations[name] = float
                        elif val_str in ("float | None", "Optional[float]", "typing.Optional[float]"):
                            new_annotations[name] = typing.Optional[float]
                        elif val_str == "str":
                            new_annotations[name] = str
                        elif val_str in ("str | None", "Optional[str]", "typing.Optional[str]"):
                            new_annotations[name] = typing.Optional[str]
                        elif val_str.startswith("tuple[") or val_str.startswith("Tuple[") or "tuple" in val_str.lower():
                            if "[" in val_str:
                                inner = val_str[val_str.find("[")+1 : val_str.rfind("]")]
                                types = [t.strip() for t in inner.split(",")]
                                resolved_types = []
                                for t in types:
                                    if t == "torch.Tensor":
                                        resolved_types.append(torch.Tensor)
                                    elif t == "int":
                                        resolved_types.append(int)
                                    elif t == "float":
                                        resolved_types.append(float)
                                    elif t == "bool":
                                        resolved_types.append(bool)
                                    else:
                                        resolved_types.append(t)
                                new_annotations[name] = typing.Tuple[tuple(resolved_types)]
                            else:
                                new_annotations[name] = tuple
                        else:
                            new_annotations[name] = val
                    else:
                        new_annotations[name] = val
                func.__annotations__ = new_annotations
            return _orig_infer_schema(func, *args, **kwargs)

        # Apply patch to all namespaces
        if hasattr(torch, "_library") and hasattr(torch._library, "infer_schema"):
            torch._library.infer_schema.infer_schema = patched_infer_schema
        if hasattr(torch, "library") and hasattr(torch.library, "infer_schema"):
            torch.library.infer_schema = patched_infer_schema
        
        # Also patch in sys.modules directly
        if "torch._library.infer_schema" in sys.modules:
            sys.modules["torch._library.infer_schema"].infer_schema = patched_infer_schema
        if "torch.library" in sys.modules:
            sys.modules["torch.library"].infer_schema = patched_infer_schema
            
        print("  ✅ Successfully patched torch.library.infer_schema in all namespaces")
except Exception as e:
    print(f"  ⚠️ Failed to patch torch.library.infer_schema: {e}")

import json
import gc
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
R2_ENDPOINT = os.environ.get("R2_ENDPOINT")
R2_ACCESS_KEY = os.environ.get("R2_ACCESS_KEY") or os.environ.get("R2_ACCESS_KEY_ID")
R2_SECRET_KEY = os.environ.get("R2_SECRET_KEY") or os.environ.get("R2_SECRET_ACCESS_KEY")
R2_BUCKET = os.environ.get("R2_BUCKET") or os.environ.get("R2_BUCKET_NAME") or "youtubeshorts"
WEBHOOK_URL = os.environ.get("WEBHOOK_URL", "")  # e.g. https://your-app.railway.app/api/documentary/webhook
WEBHOOK_SECRET = os.environ.get("WORKER_WEBHOOK_SECRET", "documentary-worker-secret")

# Validate that all required R2 parameters are loaded
missing_keys = []
if not R2_ENDPOINT: missing_keys.append("R2_ENDPOINT")
if not R2_ACCESS_KEY: missing_keys.append("R2_ACCESS_KEY/R2_ACCESS_KEY_ID")
if not R2_SECRET_KEY: missing_keys.append("R2_SECRET_KEY/R2_SECRET_ACCESS_KEY")

if missing_keys:
    raise ValueError(f"CRITICAL: Missing required Cloudflare R2 environment variables: {', '.join(missing_keys)}")


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

def unload_image_pipelines():
    global _image_pipelines
    if _image_pipelines:
        for key in list(_image_pipelines.keys()):
            print(f"  🧹 Unloading image pipeline: {key}...")
            del _image_pipelines[key]
        _image_pipelines = {}
        import gc
        gc.collect()
        torch.cuda.empty_cache()

def unload_wan_pipeline():
    global _wan_pipe
    if _wan_pipe is not None:
        print("  🧹 Unloading Wan pipeline...")
        del _wan_pipe
        _wan_pipe = None
        import gc
        gc.collect()
        torch.cuda.empty_cache()

def unload_musicgen():
    global _musicgen_model, _musicgen_processor
    if _musicgen_model is not None:
        print("  🧹 Unloading MusicGen model...")
        del _musicgen_model
        del _musicgen_processor
        _musicgen_model = None
        _musicgen_processor = None
        import gc
        gc.collect()
        torch.cuda.empty_cache()

def get_image_pipeline(model_name: str = "flux"):
    """Lazy-load the requested image generation pipeline.
    
    Supported models:
      - chroma: Chroma FP16 (uncensored, Apache 2.0, 8.9B params) — best for horror/mature
      - flux: Flux.1-dev (gated) or Flux.1-schnell (open fallback) — standard
      - juggernaut: Juggernaut XL (photorealistic SDXL) — best for true crime/biography
    """
    global _image_pipelines
    
    # Free other loaded models to prevent VRAM overflow
    unload_wan_pipeline()
    unload_musicgen()
    
    if model_name in _image_pipelines:
        return _image_pipelines[model_name]
    
    import gc
    
    # Free other loaded image pipelines to save VRAM
    for key in list(_image_pipelines.keys()):
        print(f"  🧹 Unloading {key} pipeline to make room for {model_name}...")
        del _image_pipelines[key]
    gc.collect()
    torch.cuda.empty_cache()
    
    if model_name == "chroma" or model_name == "flux":
        # Both chroma and flux use FLUX.1-dev
        # Chroma was intended to be uncensored but the LoRA causes OOM on 24GB GPUs
        # FLUX.1-dev handles horror/dark content fine without restrictions
        from diffusers import FluxPipeline
        print(f"🔄 Loading FLUX.1-dev pipeline (model={model_name})...")
        pipe = FluxPipeline.from_pretrained(
            "black-forest-labs/FLUX.1-dev",
            torch_dtype=torch.bfloat16,
        )
        pipe.enable_sequential_cpu_offload()  # More aggressive offloading for 24GB GPUs
        pipe.vae.enable_slicing()
        pipe.vae.enable_tiling()
        print(f"✅ FLUX.1-dev loaded (model={model_name})")
        
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
        
    else:
        from diffusers import FluxPipeline
        print(f"🔄 Loading FLUX.1-dev pipeline (model={model_name})...")
        pipe = FluxPipeline.from_pretrained(
            "black-forest-labs/FLUX.1-dev",
            torch_dtype=torch.bfloat16,
        )
        pipe.enable_sequential_cpu_offload()
        pipe.vae.enable_slicing()
        pipe.vae.enable_tiling()
        print(f"✅ FLUX.1-dev loaded (model={model_name})")
    
    _image_pipelines[model_name] = pipe
    return pipe


def generate_image(prompt: str, output_path: str, width: int = 768, height: int = 768, model: str = "flux"):
    """Generate an image with the specified model."""
    # Clear VRAM before each generation
    gc.collect()
    torch.cuda.empty_cache()
    
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
        # Flux and Chroma use FLUX.1-dev with dual text encoders (CLIP-L + T5-XXL)
        # Pass max_sequence_length=512 so T5 uses full 512-token context window
        image = pipe(
            prompt=prompt,
            width=width,
            height=height,
            num_inference_steps=25,  # Reduced from 30 to save VRAM
            guidance_scale=3.5,  # FLUX.1-dev works best with lower guidance
            max_sequence_length=512,
        ).images[0]
    
    image.save(output_path, format="WEBP", quality=90)
    print(f"  🖼️  Image generated ({model}, WebP): {output_path}")


# ─── LTX & Wan Video Generation ──────────────────────────
_wan_pipe = None
_ltx_pipe = None

def unload_video_pipelines():
    global _wan_pipe, _ltx_pipe
    if _wan_pipe is not None:
        del _wan_pipe
        _wan_pipe = None
    if _ltx_pipe is not None:
        del _ltx_pipe
        _ltx_pipe = None
    torch.cuda.empty_cache()

def get_ltx_pipeline(model_variant: str = "ltx2.3"):
    """Lazy-load LTX-Video image-to-video pipeline (supports LTX-Video 2.3 & 2.2)."""
    global _ltx_pipe, _wan_pipe
    unload_image_pipelines()
    unload_musicgen()
    if _wan_pipe is not None:
        print("🔄 Unloading Wan pipeline to free VRAM for LTX...")
        del _wan_pipe
        _wan_pipe = None
        torch.cuda.empty_cache()

    if _ltx_pipe is None:
        try:
            from diffusers import LTXImageToVideoPipeline
            # Determine target model repository based on model_variant
            if "2.3" in model_variant:
                model_id = "Lightricks/LTX-Video-2.3"
            else:
                model_id = "Lightricks/LTX-Video"

            print(f"🔄 Loading {model_id} (Variant: {model_variant})...")
            try:
                _ltx_pipe = LTXImageToVideoPipeline.from_pretrained(
                    model_id,
                    torch_dtype=torch.bfloat16,
                    low_cpu_mem_usage=True,
                )
            except Exception as download_err:
                print(f"⚠️ Primary repository {model_id} unavailable ({download_err}). Falling back to Lightricks/LTX-Video...")
                model_id = "Lightricks/LTX-Video"
                _ltx_pipe = LTXImageToVideoPipeline.from_pretrained(
                    model_id,
                    torch_dtype=torch.bfloat16,
                    low_cpu_mem_usage=True,
                )

            if torch.cuda.is_available():
                _ltx_pipe.enable_model_cpu_offload()
                if hasattr(_ltx_pipe, "vae"):
                    try:
                        _ltx_pipe.vae.enable_slicing()
                        _ltx_pipe.vae.enable_tiling()
                    except Exception:
                        pass
            print(f"✅ {model_id} loaded successfully")
        except Exception as err:
            print(f"⚠️ LTX-Video pipeline loading error: {err}")
            return get_wan_pipeline(model_variant="wan2.2")
    return _ltx_pipe

def get_wan_pipeline(model_variant: str = "wan2.3"):
    """Lazy-load Wan2.3 / Wan2.2 / Wan2.1 image-to-video pipeline."""
    global _wan_pipe, _ltx_pipe
    
    # Free other loaded models to prevent VRAM overflow
    unload_image_pipelines()
    unload_musicgen()
    if _ltx_pipe is not None:
        print("🔄 Unloading LTX pipeline to free VRAM for Wan...")
        del _ltx_pipe
        _ltx_pipe = None
        torch.cuda.empty_cache()
    
    if _wan_pipe is None:
        from diffusers import WanImageToVideoPipeline

        if "dance" in model_variant.lower():
            model_id = "Wan-AI/Wan2.1-I2V-14B-480P"
            print(f"💃 Loading Wan-Dance Rhythmic Choreography Pipeline ({model_id})...")
        elif "2.1" in model_variant:
            model_id = "Wan-AI/Wan2.1-I2V-14B-480P"
        else:
            model_id = "Wan-AI/Wan2.2-TI2V-5B-Diffusers"

        print(f"🔄 Loading {model_id} (Variant: {model_variant})...")
        try:
            _wan_pipe = WanImageToVideoPipeline.from_pretrained(
                model_id,
                torch_dtype=torch.bfloat16,
                low_cpu_mem_usage=True,
            )
        except Exception as download_err:
            print(f"⚠️ Repo {model_id} load error ({download_err}). Falling back to Wan-AI/Wan2.2-TI2V-5B-Diffusers...")
            model_id = "Wan-AI/Wan2.2-TI2V-5B-Diffusers"
            _wan_pipe = WanImageToVideoPipeline.from_pretrained(
                model_id,
                torch_dtype=torch.bfloat16,
                low_cpu_mem_usage=True,
            )

        if torch.cuda.is_available():
            print("  🚀 Enabling CPU offload for Wan pipeline to prevent VRAM overflow...")
            _wan_pipe.enable_model_cpu_offload()
        else:
            _wan_pipe.enable_model_cpu_offload()
        _wan_pipe.vae.enable_slicing()
        _wan_pipe.vae.enable_tiling()
        print(f"✅ {model_id} loaded successfully")
    return _wan_pipe


def generate_video(
    prompt: str,
    reference_image_path: str,
    output_path: str,
    num_frames: int = 49,  # Safe default ~2s at 24fps
    width: int = 768,
    height: int = 1280,
    model_name: str = "ltx",
):
    """Generate a video clip with LTX-Video or Wan2.2 image-to-video."""
    import gc
    from PIL import Image

    # Dimensions divisible by 16 and bounded safely for 24GB GPUs
    width = min((width // 16) * 16, 768)
    height = min((height // 16) * 16, 1280)
    num_frames = min(num_frames, 49)

    if "ltx" in model_name.lower():
        pipe = get_ltx_pipeline(model_variant=model_name)
    else:
        pipe = get_wan_pipeline(model_variant=model_name)

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


# ─── MusicGen Audio Generation ─────────────────────────
_musicgen_model = None
_musicgen_processor = None

def get_musicgen():
    """Lazy-load MusicGen medium model (~3.3GB VRAM)."""
    global _musicgen_model, _musicgen_processor
    
    # Free other loaded models to prevent VRAM overflow
    unload_image_pipelines()
    unload_wan_pipeline()
    
    if _musicgen_model is None:
        from transformers import AutoProcessor, MusicgenForConditionalGeneration
        model_id = "facebook/musicgen-medium"
        print(f"🔄 Loading MusicGen medium...")
        _musicgen_processor = AutoProcessor.from_pretrained(model_id, cache_dir="/workspace/hf_cache")
        _musicgen_model = MusicgenForConditionalGeneration.from_pretrained(
            model_id,
            cache_dir="/workspace/hf_cache",
            torch_dtype=torch.float16,
        ).to("cuda")
        print(f"✅ MusicGen loaded")
    return _musicgen_model, _musicgen_processor


def generate_music(prompt: str, output_path: str, duration_sec: int = 15):
    """Generate music audio from a text prompt."""
    model, processor = get_musicgen()
    import scipy.io.wavfile as wavfile

    inputs = processor(
        text=[prompt],
        padding=True,
        return_tensors="pt",
    ).to("cuda")

    # MusicGen generates at 32kHz, tokens = duration * 50
    max_new_tokens = int(duration_sec * 50)
    print(f"  🎵 Generating {duration_sec}s of music ({max_new_tokens} tokens)...")

    with torch.no_grad():
        audio_values = model.generate(**inputs, max_new_tokens=max_new_tokens)

    # Save as WAV
    sampling_rate = model.config.audio_encoder.sampling_rate
    audio_data = audio_values[0, 0].cpu().numpy()
    wavfile.write(output_path, rate=sampling_rate, data=audio_data)
    print(f"  🎵 Music generated: {output_path}")

    # Cleanup
    del audio_values, inputs
    gc.collect()
    torch.cuda.empty_cache()


def check_and_free_memory():
    """Monitor host system RAM usage and proactively reclaim memory if high (>75%)."""
    try:
        import psutil
        ram = psutil.virtual_memory()
        print(f"📊 System Memory Status: {ram.used / (1024**3):.2f} GB / {ram.total / (1024**3):.2f} GB ({ram.percent}%)")
        if ram.percent > 75:
            print("⚠️ High system RAM utilization detected. Clearing model caches...")
            unload_image_pipelines()
            unload_wan_pipeline()
            unload_musicgen()
    except Exception as me:
        print(f"⚠️ Memory check helper failed: {me}")


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
        os.makedirs("/workspace/tmp", exist_ok=True)
        with tempfile.TemporaryDirectory(dir="/workspace/tmp") as tmpdir:
            # Map job types: ref_image and image both generate images
            if job_type in ("image", "ref_image"):
                # Generate reference image with selected model
                output_file = os.path.join(tmpdir, f"{job_id}.webp")
                generate_image(prompt, output_file, model=image_model)

                # Upload to R2
                r2_key = metadata.get("r2Key") or f"documentaries/assets/{job_id}.webp"
                upload_to_r2(output_file, r2_key, "image/webp")

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
                    if job_type == "shot_video":
                        raise ValueError("Character-consistent visual generation failed: Reference character avatar image is missing!")
                    else:
                        # Generate a reference image from prompt if none provided for general videos
                        generate_image(prompt, ref_path, width=1280, height=704)

                # Generate video clip
                output_file = os.path.join(tmpdir, f"{job_id}.mp4")
                # duration lives inside metadata (set by dispatchJob on the Next.js side)
                duration_secs = metadata.get("duration", job.get("duration", 5))
                num_frames = max(33, int(duration_secs * 24))  # 24fps for Wan2.2
                generate_video(prompt, ref_path, output_file, num_frames=num_frames)

                # Upload to R2
                r2_key = metadata.get("r2Key") or f"documentaries/clips/{job_id}.mp4"
                upload_to_r2(output_file, r2_key, "video/mp4")

                # Extract last frame for visual continuity
                last_frame_key = None
                try:
                    import subprocess
                    last_frame_file = os.path.join(tmpdir, "last_frame.png")
                    subprocess.run([
                        "ffmpeg", "-sseof", "-0.5", "-i", output_file,
                        "-frames:v", "1", "-q:v", "2", last_frame_file, "-y"
                    ], capture_output=True, timeout=30)
                    if not os.path.exists(last_frame_file) or os.path.getsize(last_frame_file) == 0:
                        subprocess.run([
                            "ffmpeg", "-i", output_file,
                            "-vf", "select='eq(n,0)'", "-vframes", "1", "-q:v", "2", last_frame_file, "-y"
                        ], capture_output=True, timeout=30)

                    if os.path.exists(last_frame_file) and os.path.getsize(last_frame_file) > 0:
                        last_frame_key = metadata.get("r2KeyLastFrame") or f"documentaries/clips/{job_id}_last_frame.png"
                        upload_to_r2(last_frame_file, last_frame_key, "image/png")
                except Exception as lfe:
                    print(f"  ⚠️ Last frame extraction failed (non-critical, chaining will use character avatar): {type(lfe).__name__}: {lfe}")

                result = {
                    "jobId": job_id,
                    "status": "completed",
                    "outputPath": r2_key,
                    "lastFramePath": last_frame_key,
                    "type": "video",
                }

            elif job_type == "musicgen_generate":
                # Generate background music / jingle
                duration = job.get("duration", 15)
                output_file = os.path.join(tmpdir, f"{job_id}.wav")
                generate_music(prompt, output_file, duration_sec=duration)

                # Upload to R2
                r2_key = f"podcast-audio/music/{job_id}.wav"
                upload_to_r2(output_file, r2_key, "audio/wav")

                # Build public URL
                output_url = f"https://{R2_BUCKET}.{R2_ENDPOINT.replace('https://', '')}/{r2_key}"

                result = {
                    "jobId": job_id,
                    "status": "completed",
                    "outputPath": r2_key,
                    "output_url": output_url,
                    "type": "music",
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
        check_and_free_memory()

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
        check_and_free_memory()


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

