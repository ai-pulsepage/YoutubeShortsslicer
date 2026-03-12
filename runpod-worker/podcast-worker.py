"""
RunPod Podcast Worker — Mistral-Large + Brave Search

Runs on RunPod dedicated pod (2×A100 80GB).
Generates multi-character podcast dialogue using:
  - vLLM serving Mistral-Large-Instruct (local, port 8000)
  - Brave Search API for current events research
  - Character personality injection from archetype system

Listens on Redis queue `podcast_jobs`, reports results via webhook.

Setup on RunPod (2× A100 PCIe 80GB, 265GB volume):
  1. pip install -r podcast-requirements.txt
  2. Start vLLM:
     python -m vllm.entrypoints.openai.api_server \
       --model mistralai/Mistral-Large-Instruct-2411 \
       --tensor-parallel-size 2 \
       --max-model-len 32768 \
       --gpu-memory-utilization 0.90 \
       --port 8000 &
  3. Set env vars (REDIS_URL, BRAVE_API_KEY, WEBHOOK_URL, WORKER_WEBHOOK_SECRET)
  4. python podcast-worker.py

Environment Variables:
  REDIS_URL                - Railway Redis connection string
  BRAVE_API_KEY            - Brave Search API key
  WEBHOOK_URL              - e.g. https://your-app.railway.app/api/podcast/webhook
  WORKER_WEBHOOK_SECRET    - Shared secret for webhook auth
  VLLM_BASE_URL            - vLLM endpoint (default: http://localhost:8000)
"""

import json
import os
import sys
import time
import traceback
import requests
import redis

# ─── Configuration ─────────────────────────────────────

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
BRAVE_API_KEY = os.environ.get("BRAVE_API_KEY", "")
WEBHOOK_URL = os.environ.get("WEBHOOK_URL", "")
WEBHOOK_SECRET = os.environ.get("WORKER_WEBHOOK_SECRET", "podcast-worker-secret")
VLLM_BASE_URL = os.environ.get("VLLM_BASE_URL", "http://localhost:8000")

JOBS_CHANNEL = "podcast_jobs"

# ─── Brave Search ──────────────────────────────────────

def brave_search(query: str, count: int = 5) -> list[dict]:
    """Search Brave for current articles on a topic.
    Returns list of {title, url, snippet} dicts.
    """
    if not BRAVE_API_KEY:
        print("  ⚠️ No BRAVE_API_KEY set, skipping web research")
        return []

    try:
        resp = requests.get(
            "https://api.search.brave.com/res/v1/web/search",
            headers={
                "Accept": "application/json",
                "Accept-Encoding": "gzip",
                "X-Subscription-Token": BRAVE_API_KEY,
            },
            params={
                "q": query,
                "count": count,
                "freshness": "pw",  # past week
                "text_decorations": False,
            },
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()

        results = []
        for item in data.get("web", {}).get("results", [])[:count]:
            results.append({
                "title": item.get("title", ""),
                "url": item.get("url", ""),
                "snippet": item.get("description", ""),
            })

        print(f"  🔍 Brave Search: {len(results)} results for '{query[:60]}'")
        return results

    except Exception as e:
        print(f"  ⚠️ Brave Search failed: {e}")
        return []


def fetch_url_text(url: str, max_chars: int = 3000) -> str:
    """Fetch and extract readable text from a URL."""
    try:
        resp = requests.get(
            url,
            headers={"User-Agent": "Mozilla/5.0 PodcastResearchBot/1.0"},
            timeout=10,
        )
        resp.raise_for_status()

        from bs4 import BeautifulSoup
        soup = BeautifulSoup(resp.text, "html.parser")

        # Remove scripts, styles, nav
        for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
            tag.decompose()

        text = soup.get_text(separator="\n", strip=True)
        # Clean up whitespace
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        text = "\n".join(lines)

        return text[:max_chars]
    except Exception as e:
        print(f"  ⚠️ Failed to fetch {url[:60]}: {e}")
        return ""


def research_topic(topic_title: str, source_urls: list, source_mode: str) -> str:
    """Build research context for a topic segment."""
    context_parts = []

    if source_mode == "URLS" and source_urls:
        # User provided specific URLs — fetch them
        for url in source_urls[:5]:
            text = fetch_url_text(url)
            if text:
                context_parts.append(f"SOURCE ({url}):\n{text}\n")

    elif source_mode == "AUTO_RESEARCH":
        # Auto-research via Brave Search
        results = brave_search(topic_title)
        for r in results:
            context_parts.append(
                f"ARTICLE: {r['title']}\nURL: {r['url']}\nSUMMARY: {r['snippet']}\n"
            )
        # Fetch full text of top 2 results
        for r in results[:2]:
            text = fetch_url_text(r["url"])
            if text:
                context_parts.append(f"FULL TEXT ({r['url']}):\n{text}\n")

    if context_parts:
        return "RESEARCH CONTEXT:\n" + "\n---\n".join(context_parts)
    return ""


# ─── Mistral via vLLM ─────────────────────────────────

def call_mistral(system_prompt: str, user_prompt: str, temperature: float = 0.85) -> str:
    """Call local vLLM Mistral endpoint."""
    resp = requests.post(
        f"{VLLM_BASE_URL}/v1/chat/completions",
        json={
            "model": "mistralai/Mistral-Large-Instruct-2411",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": temperature,
            "max_tokens": 8192,
            "response_format": {"type": "json_object"},
        },
        timeout=120,
    )
    resp.raise_for_status()
    data = resp.json()
    content = data["choices"][0]["message"]["content"]
    return content


def parse_dialogue(raw: str) -> list[dict]:
    """Parse LLM response into dialogue lines."""
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        # Try extracting JSON array
        import re
        match = re.search(r'\[[\s\S]*\]', raw)
        if match:
            parsed = json.loads(match.group())
        else:
            print(f"  ❌ Could not parse dialogue JSON: {raw[:300]}")
            return []

    # Handle wrapped response
    if isinstance(parsed, dict):
        for key in ("lines", "dialogue", "script", "segments"):
            if key in parsed and isinstance(parsed[key], list):
                parsed = parsed[key]
                break
        else:
            parsed = list(parsed.values())[0] if parsed.values() else []

    if not isinstance(parsed, list):
        return []

    lines = []
    for item in parsed:
        if isinstance(item, dict) and "text" in item:
            words = len(item["text"].split())
            lines.append({
                "speaker": item.get("speaker", "Unknown"),
                "characterId": item.get("characterId", item.get("character_id", "")),
                "text": item["text"],
                "emotion": item.get("emotion", "neutral"),
                "duration": max(2, round(words / 2.5)),
            })

    return lines


# ─── Segment Generation ───────────────────────────────

def generate_intro(characters: list, episode_title: str, show_name: str,
                   topic_titles: list, content_filter: str) -> list[dict]:
    """Generate intro segment."""
    host = next((c for c in characters if c["role"] == "HOST"), characters[0])
    guests = [c for c in characters if c["role"] == "GUEST"]
    filter_note = _filter_note(content_filter)

    system_prompt = f"""You are writing a podcast script. Write ONLY the intro segment.
The host {host['name']} opens the show, welcomes listeners, introduces today's guests, and previews the topics.

{host['prompt']}

GUESTS ON THIS EPISODE:
{chr(10).join(f"- {g['name']}" for g in guests)}

TOPICS FOR THIS EPISODE:
{chr(10).join(f"- {t}" for t in topic_titles if t)}

CONTENT FILTER: {filter_note}

OUTPUT FORMAT — respond with ONLY a JSON array of dialogue lines:
[{{"speaker": "{host['name']}", "characterId": "{host['id']}", "text": "...", "emotion": "excited"}}]

Keep it 3-6 lines. Natural, conversational. The host should be IN CHARACTER per their archetype.
Emotions: "neutral", "excited", "amused", "serious", "angry", "sarcastic", "concerned"
"""
    raw = call_mistral(system_prompt, f'Write the intro for "{show_name}" episode "{episode_title}".')
    return parse_dialogue(raw)


def generate_topic(characters: list, topic_title: str, topic_content: str,
                   source_urls: list, source_mode: str, duration_min: int,
                   content_filter: str) -> list[dict]:
    """Generate heated debate for a topic segment."""
    filter_note = _filter_note(content_filter)
    target_words = duration_min * 150
    target_lines = max(8, round(duration_min * 5))

    char_block = "\n\n".join(
        f"=== {c['name']} ({c['role']}) ===\n{c['prompt']}" for c in characters
    )

    # Web research
    research = research_topic(topic_title, source_urls, source_mode)

    system_prompt = f"""You are a podcast script writer. Write a HEATED, NATURAL debate segment between these characters.

CHARACTERS:
{char_block}

RULES:
1. Characters MUST stay in their archetype. Bulldozers steamroll. Skeptics question. Mediators find common ground.
2. Characters MUST argue from their worldview — political leaning, religious views, generational perspective.
3. Characters MUST hit each other's hot buttons when the topic allows it.
4. Include interruptions, talking over each other, emotional escalation, and moments of surprising agreement.
5. This is NOT a polite panel discussion. This is a REAL argument between people with strong opinions.
6. Include at least one moment where a character says something that genuinely surprises the others.
7. Hosts should moderate but also have their own opinions — they're not neutral.
8. Guests should push back against the host when they disagree.
9. Reference CURRENT EVENTS and REAL DATA from the research context when available.

CONTENT FILTER: {filter_note}

TARGET: ~{target_lines} lines, ~{target_words} words total. Duration target: {duration_min} minutes.

OUTPUT FORMAT — respond with ONLY a JSON array:
[{{"speaker": "CharacterName", "characterId": "charId", "text": "...", "emotion": "angry"}}]

Emotions: "neutral", "excited", "amused", "serious", "angry", "sarcastic", "concerned", "passionate", "dismissive", "shocked"
Do NOT include stage directions or action descriptions. Only spoken dialogue."""

    user_prompt = f"TOPIC: {topic_title}\n"
    if topic_content:
        user_prompt += f"\nPREMISE/CONTEXT:\n{topic_content}\n"
    if research:
        user_prompt += f"\n{research}\n"
    user_prompt += "\nGenerate the debate segment now. Make it HEATED and REAL."

    raw = call_mistral(system_prompt, user_prompt)
    return parse_dialogue(raw)


def generate_ad_break(hosts: list, sponsor: dict | None) -> list[dict]:
    """Generate ad break segment."""
    host = hosts[0] if hosts else None
    if not host:
        return []

    if not sponsor:
        return [{
            "speaker": host["name"],
            "characterId": host["id"],
            "text": "We'll be right back after a quick break.",
            "emotion": "neutral",
            "duration": 3,
        }]

    system_prompt = f"""You are writing a podcast ad read. The host {host['name']} reads an ad for {sponsor['brandName']}.

{host['prompt']}

AD STYLE: {sponsor.get('adStyle', 'CASUAL')}
SPONSOR: {sponsor['brandName']}
TAGLINE: {sponsor.get('tagline', 'N/A')}
PROMO CODE: {sponsor.get('promoCode', 'N/A')}
URL: {sponsor.get('promoUrl', 'N/A')}
TALKING POINTS: {', '.join(sponsor.get('talkingPoints', []))}

OUTPUT: JSON array of 2-4 dialogue lines for the ad read. Keep it natural to the host's character."""

    raw = call_mistral(system_prompt, f"Write the {sponsor.get('adStyle', 'CASUAL')} ad read for {sponsor['brandName']}.")
    return parse_dialogue(raw)


def generate_outro(characters: list, show_name: str, content_filter: str) -> list[dict]:
    """Generate outro segment."""
    host = next((c for c in characters if c["role"] == "HOST"), characters[0])

    system_prompt = f"""You are writing a podcast outro. The host {host['name']} wraps up the show.

{host['prompt']}

Write 2-4 lines where the host thanks the guests, teases next episode, and signs off.
Stay in character. OUTPUT: JSON array of dialogue lines."""

    raw = call_mistral(system_prompt, f'Write the outro for "{show_name}".')
    return parse_dialogue(raw)


def _filter_note(content_filter: str) -> str:
    if content_filter == "FAMILY_FRIENDLY":
        return "Keep language completely clean."
    elif content_filter == "MODERATE":
        return "Light profanity allowed but not excessive."
    return "No content restrictions. Raw, unfiltered language is fine. Characters can swear, be crass, use slang."


# ─── Job Processing ────────────────────────────────────

def process_job(job: dict, r):
    """Process a single podcast script generation job."""
    job_id = job.get("jobId", "unknown")
    episode_id = job.get("episodeId", "")
    characters = job.get("characters", [])
    segments = job.get("segments", [])
    show_name = job.get("showName", "")
    episode_title = job.get("episodeTitle", "")
    content_filter = job.get("contentFilter", "UNHINGED")

    print(f"\n{'='*60}")
    print(f"🎙️  Podcast Job: {job_id}")
    print(f"   Episode: {episode_title} ({show_name})")
    print(f"   Characters: {len(characters)} | Segments: {len(segments)}")

    try:
        hosts = [c for c in characters if c["role"] == "HOST"]
        topic_titles = [s.get("topicTitle", "") for s in segments if s.get("type") == "TOPIC"]

        script_segments = []

        for i, seg in enumerate(segments):
            seg_type = seg.get("type", "TOPIC")
            print(f"\n  📝 Segment {i+1}/{len(segments)}: {seg_type} — {seg.get('topicTitle', 'untitled')}")

            if seg_type == "INTRO":
                lines = generate_intro(characters, episode_title, show_name, topic_titles, content_filter)
            elif seg_type == "TOPIC":
                lines = generate_topic(
                    characters,
                    seg.get("topicTitle", "Open Discussion"),
                    seg.get("topicContent", ""),
                    seg.get("sourceUrls", []),
                    seg.get("sourceMode", "MANUAL_PREMISE"),
                    seg.get("durationMin", 10),
                    content_filter,
                )
            elif seg_type == "AD_BREAK":
                lines = generate_ad_break(hosts, seg.get("sponsor"))
            elif seg_type == "OUTRO":
                lines = generate_outro(characters, show_name, content_filter)
            else:
                lines = []

            print(f"    → {len(lines)} lines generated")

            script_segments.append({
                "segmentId": seg.get("segmentId", ""),
                "type": seg_type,
                "topicTitle": seg.get("topicTitle"),
                "lines": lines,
            })

        # Build result
        total_lines = sum(len(s["lines"]) for s in script_segments)
        total_duration = sum(
            l.get("duration", 5) for s in script_segments for l in s["lines"]
        )

        result = {
            "jobId": job_id,
            "episodeId": episode_id,
            "status": "completed",
            "script": {
                "episodeId": episode_id,
                "showName": show_name,
                "episodeTitle": episode_title,
                "totalEstimatedDuration": total_duration,
                "segments": script_segments,
            },
            "lineCount": total_lines,
            "estimatedDuration": total_duration,
        }

        report_result(r, result)
        print(f"\n✅ Job {job_id} completed — {total_lines} lines, ~{total_duration}s estimated")

    except Exception as e:
        error_msg = f"{type(e).__name__}: {str(e)}"
        print(f"\n❌ Job {job_id} failed: {error_msg}")
        traceback.print_exc()

        result = {
            "jobId": job_id,
            "episodeId": episode_id,
            "status": "failed",
            "error": error_msg,
        }
        report_result(r, result)


# ─── Result Reporting ──────────────────────────────────

def report_result(r, result: dict):
    """Report job result via webhook (primary) and Redis (fallback)."""
    r.lpush("podcast_results", json.dumps(result))

    if WEBHOOK_URL:
        try:
            resp = requests.post(
                WEBHOOK_URL,
                json=result,
                headers={
                    "Content-Type": "application/json",
                    "x-webhook-secret": WEBHOOK_SECRET,
                },
                timeout=15,
            )
            if resp.status_code == 200:
                print(f"  📡 Webhook reported: {result.get('status', 'unknown')}")
            else:
                print(f"  ⚠️ Webhook returned {resp.status_code}: {resp.text[:100]}")
        except Exception as e:
            print(f"  ⚠️ Webhook failed (Redis fallback used): {e}")


# ─── Health Check ──────────────────────────────────────

def wait_for_vllm():
    """Wait for vLLM server to be ready."""
    print("⏳ Waiting for vLLM server...")
    for i in range(120):  # Wait up to 10 minutes
        try:
            resp = requests.get(f"{VLLM_BASE_URL}/health", timeout=5)
            if resp.status_code == 200:
                print("✅ vLLM server is ready!")
                return True
        except requests.ConnectionError:
            pass
        if i % 10 == 0 and i > 0:
            print(f"  Still waiting... ({i * 5}s)")
        time.sleep(5)

    print("❌ vLLM server did not start in time")
    return False


# ─── Main Loop ─────────────────────────────────────────

def main():
    print("🎙️  Podcast GPU Worker starting...")
    print(f"   Redis: {REDIS_URL[:40]}...")
    print(f"   vLLM: {VLLM_BASE_URL}")
    print(f"   Brave Search: {'✅ configured' if BRAVE_API_KEY else '❌ not set'}")
    print(f"   Webhook: {WEBHOOK_URL or '❌ not set'}")
    print()

    # Wait for vLLM to be ready
    if not wait_for_vllm():
        print("⚠️ Starting anyway — vLLM may come online later")

    print(f"\n📡 Listening on queue: {JOBS_CHANNEL} (BRPOP)")
    print("   Waiting for jobs...")
    sys.stdout.flush()

    while True:
        try:
            r = redis.from_url(REDIS_URL, decode_responses=True, socket_timeout=30, socket_keepalive=True)
            r.ping()
            print("✅ Redis connected")
            sys.stdout.flush()

            while True:
                result = r.brpop(JOBS_CHANNEL, timeout=5)
                if result is None:
                    continue

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
