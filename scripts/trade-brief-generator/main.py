"""
Storycot Trade Books — Weekly Brief Generator
Selects 5 evergreen brief templates each Monday and enqueues them as
trade_titles + trade_book_jobs rows in Neon.  No LLM required.
"""

import json
import os
import random
import sys
import urllib.request
import uuid
from datetime import datetime, timezone


# ---------------------------------------------------------------------------
# Automation service helpers (required)
# ---------------------------------------------------------------------------

def fire_callback(status="COMPLETED", error=None):
    url = os.environ.get("AUTOMATION_CALLBACK_URL", "")
    if not url:
        return
    body = {"status": status, "run_id": os.environ.get("AUTOMATION_RUN_ID", "")}
    if error:
        body["error"] = error
    try:
        urllib.request.urlopen(
            urllib.request.Request(
                url,
                data=json.dumps(body).encode(),
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {os.environ.get('AUTOMATION_CALLBACK_API_KEY', '')}",
                },
            )
        )
    except Exception as exc:
        print(f"Callback error: {exc}", file=sys.stderr)


# ---------------------------------------------------------------------------
# Evergreen brief library — 40 templates across age ranges and themes
# ---------------------------------------------------------------------------

BRIEFS = [
    # Baby / toddler
    {"theme": "bedtime calm", "premise": "A little one follows a cosy nighttime routine — bath, milk, a favourite toy — and finally closes their eyes as the stars appear outside the window.", "notes": "Gentle lullaby feel. Warm golden light. End on sleepy contentment.", "storyPreset": "baby-drift", "locale": "en", "protagonist": {"name": "Pip", "age": 1, "gender": "not_specified"}},
    {"theme": "first steps", "premise": "A baby pulls themselves up, wobbles, and takes their very first steps across the living room into a waiting hug.", "notes": "Celebrate the milestone without drama. Soft sensory focus.", "storyPreset": "little-listener", "locale": "en", "protagonist": {"name": "Bea", "age": 1, "gender": "girl"}},
    {"theme": "hello world", "premise": "A toddler wakes up and discovers the ordinary wonders of their home — sunlight on the floor, a purring cat, toast popping up — with wide-eyed delight.", "notes": "Simple naming-the-world structure. Joyful and sensory.", "storyPreset": "little-listener", "locale": "en", "protagonist": {"name": "Arlo", "age": 1, "gender": "boy"}},
    {"theme": "sharing", "premise": "Two young children fight over the same toy until they discover something even better: playing together.", "notes": "Warm, reassuring toddler conflict and resolution. No adults needed.", "storyPreset": "toddler-tale", "locale": "en", "protagonist": {"name": "Mia", "age": 2, "gender": "girl"}},
    {"theme": "big feelings", "premise": "A small child has a big tantrum when things don't go their way, then slowly finds their way back to calm with a hug and a slow breath.", "notes": "Normalise the feeling without drama. Show the physical relief of calm.", "storyPreset": "toddler-tale", "locale": "en", "protagonist": {"name": "Leo", "age": 2, "gender": "boy"}},
    # Preschool
    {"theme": "new baby sibling", "premise": "A child worried about a new baby arriving discovers that love doesn't get split — it grows bigger.", "notes": "Gentle anxiety to acceptance arc. The older child teaches the baby something small at the end.", "storyPreset": "first-adventure", "locale": "en", "protagonist": {"name": "Rosie", "age": 3, "gender": "girl"}},
    {"theme": "trying new foods", "premise": "A stubborn child refuses to try the strange green thing on their plate — until a small funny adventure changes their mind.", "notes": "Light humour. The child genuinely tries it — no magic disguise.", "storyPreset": "first-adventure", "locale": "en", "protagonist": {"name": "Sam", "age": 3, "gender": "not_specified"}},
    {"theme": "fear of the dark", "premise": "A child scared of bedtime darkness discovers the shadows in their room are just ordinary things wearing funny nighttime shapes.", "notes": "Cosy not spooky. Child self-soothes. End on brave comfort.", "storyPreset": "first-adventure", "locale": "en", "protagonist": {"name": "Finn", "age": 4, "gender": "boy"}},
    {"theme": "kindness", "premise": "A child notices a friend sitting alone at the playground and finds the courage to say hello, starting an unexpected friendship.", "notes": "Simple social courage. Authentic awkwardness before connection.", "storyPreset": "preschool-story", "locale": "en", "protagonist": {"name": "Zara", "age": 4, "gender": "girl"}},
    {"theme": "starting preschool", "premise": "On their first day at preschool a child feels butterflies in their tummy — but by lunchtime they have made one small friend and painted something they're proud of.", "notes": "Realistic first-day nerves, not immediately resolved. The win is small but real.", "storyPreset": "preschool-story", "locale": "en", "protagonist": {"name": "Otto", "age": 3, "gender": "boy"}},
    {"theme": "patience", "premise": "A child plants a seed and has to wait — really wait — through sunny days and rainy days — before the first tiny green shoot finally appears.", "notes": "Slow meditative pace. Each spread is a different day.", "storyPreset": "preschool-story", "locale": "en", "protagonist": {"name": "Ivy", "age": 4, "gender": "girl"}},
    {"theme": "helping at home", "premise": "A child insists on helping cook dinner — things go a little wrong — but working together they fix it and share a meal they made themselves.", "notes": "Small domestic adventure. Celebrate effort over perfection.", "storyPreset": "preschool-story", "locale": "en", "protagonist": {"name": "Jude", "age": 4, "gender": "not_specified"}},
    {"theme": "imagination", "premise": "Stuck indoors on a rainy day, a child transforms their living room into a jungle, an ocean, and a spaceship using only the things around them.", "notes": "Pure imaginative play. Each spread is a different imagined world grounded in real objects.", "storyPreset": "preschool-story", "locale": "en", "protagonist": {"name": "Cleo", "age": 5, "gender": "girl"}},
    {"theme": "losing a tooth", "premise": "A child's wobbly tooth finally comes out at the most unexpected moment, and they can't stop showing everyone their new gap-toothed smile.", "notes": "Milestone celebration. Light funny tone. No tooth fairy needed — the moment itself is the magic.", "storyPreset": "preschool-story", "locale": "en", "protagonist": {"name": "Eli", "age": 5, "gender": "boy"}},
    # Early school age
    {"theme": "starting school", "premise": "On the first day of big school everything feels too large and too loud — until one small act of kindness from a classmate makes it feel a little more like home.", "notes": "Realistic anxiety, not magically fixed. The kindness can be tiny.", "storyPreset": "big-kid-chapter", "locale": "en", "protagonist": {"name": "Nora", "age": 5, "gender": "girl"}},
    {"theme": "bravery", "premise": "A child terrified of the high diving board at the pool spends a whole summer working up the courage — and when they finally jump, they want to do it again.", "notes": "Fear is real and the courage is earned. The jump should feel visceral.", "storyPreset": "big-kid-chapter", "locale": "en", "protagonist": {"name": "Kai", "age": 6, "gender": "not_specified"}},
    {"theme": "making mistakes", "premise": "A child convinced they are bad at drawing enters an art competition anyway — and discovers that imperfect things can still be wonderful.", "notes": "Anti-perfectionism. The child doesn't win but feels genuinely proud.", "storyPreset": "big-kid-chapter", "locale": "en", "protagonist": {"name": "Mateo", "age": 6, "gender": "boy"}},
    {"theme": "honesty", "premise": "A child breaks something precious by accident and spends the whole day deciding whether to tell the truth — and finally does.", "notes": "The internal debate is the story. Resolution is relief, not reward.", "storyPreset": "big-kid-chapter", "locale": "en", "protagonist": {"name": "Ruby", "age": 6, "gender": "girl"}},
    {"theme": "being different", "premise": "A child who likes different things from their classmates worries they don't fit in — until their difference is exactly what makes their contribution special.", "notes": "No magical intervention. The payoff comes from a genuine situation.", "storyPreset": "big-kid-chapter", "locale": "en", "protagonist": {"name": "Ren", "age": 7, "gender": "not_specified"}},
    {"theme": "missing a grandparent", "premise": "A child who misses their faraway grandparent finds ways to feel close — through a recipe, a story, a video call — and realises love doesn't shrink with distance.", "notes": "Warm but not saccharine. Grandparent is alive and well, just far away.", "storyPreset": "big-kid-chapter", "locale": "en", "protagonist": {"name": "Lily", "age": 6, "gender": "girl"}},
    {"theme": "perseverance", "premise": "A child learning to ride a bike falls off six times before the seventh try when everything finally clicks — and they can't stop grinning.", "notes": "Physical, sensory, triumphant. Show each fall without drama.", "storyPreset": "big-kid-chapter", "locale": "en", "protagonist": {"name": "Ben", "age": 6, "gender": "boy"}},
    {"theme": "worry", "premise": "A child who worries about everything learns a simple trick — ask: is this happening right now? — and practises it through a whole anxious day.", "notes": "Practical and warm. The technique is shown working in small real moments.", "storyPreset": "big-kid-chapter", "locale": "en", "protagonist": {"name": "Freya", "age": 7, "gender": "girl"}},
    {"theme": "moving house", "premise": "A child who doesn't want to move to a new house keeps one small thing from the old place in their pocket — and uses it to make the new place feel like home.", "notes": "The object is small and symbolic. The new home doesn't have to be perfect — just theirs.", "storyPreset": "big-kid-chapter", "locale": "en", "protagonist": {"name": "Ash", "age": 7, "gender": "not_specified"}},
    # Older reader
    {"theme": "self-belief", "premise": "A child who always finishes last in races decides to train for one more — not to win, but to beat their own best time — and learns what winning really means.", "notes": "Multiple training sessions shown. The internal goal matters more than the external result.", "storyPreset": "young-reader-short", "locale": "en", "protagonist": {"name": "Mack", "age": 8, "gender": "not_specified"}},
    {"theme": "friendship", "premise": "Two children who have nothing in common are paired together for a school project — and discover through arguing that they actually understand each other perfectly.", "notes": "Genuine conflict that resolves through mutual discovery. Their differences stay.", "storyPreset": "young-reader-short", "locale": "en", "protagonist": {"name": "Priya", "age": 8, "gender": "girl"}},
    {"theme": "curiosity", "premise": "A child who reads everything and questions everything follows a mystery in their neighbourhood — a strange sound, an unusual light — and solves it through observation alone.", "notes": "Mini-mystery. The solution is surprising but completely logical in retrospect.", "storyPreset": "young-reader-short", "locale": "en", "protagonist": {"name": "Theo", "age": 8, "gender": "boy"}},
    {"theme": "empathy", "premise": "A child who has always found the new kid annoying finally understands why they act the way they do — and how it feels to be the one who doesn't know anyone.", "notes": "Perspective shift is the core. Show the moment of realisation physically.", "storyPreset": "young-reader-classic", "locale": "en", "protagonist": {"name": "Isla", "age": 9, "gender": "girl"}},
    {"theme": "responsibility", "premise": "A child given their first real responsibility — looking after a neighbour's dog for a week — nearly loses the dog, has to find it, and discovers what responsibility really costs.", "notes": "Real stakes, real fear, real payoff. The dog is fine but it was genuinely close.", "storyPreset": "young-reader-classic", "locale": "en", "protagonist": {"name": "Jake", "age": 9, "gender": "boy"}},
    {"theme": "being yourself", "premise": "A child who hides their real passion (writing poetry) because it's not cool finally reads one poem aloud to the whole class by accident — and finds it's more powerful than they knew.", "notes": "Authentic reaction from class. The moment is cringeworthy then unexpectedly still.", "storyPreset": "young-reader-classic", "locale": "en", "protagonist": {"name": "Wren", "age": 10, "gender": "not_specified"}},
    {"theme": "courage", "premise": "A child who witnesses someone being picked on has to decide — in the ten seconds before the moment passes — whether to say something.", "notes": "The decision itself is the drama. No magical outcome. They speak up and it's messy and real.", "storyPreset": "young-reader-classic", "locale": "en", "protagonist": {"name": "Lena", "age": 10, "gender": "girl"}},
    # Seasonal / occasion
    {"theme": "Christmas morning", "premise": "A child wakes before dawn on Christmas morning, too excited to sleep, and creeps downstairs to discover something unexpected under the tree.", "notes": "Sense of wonder and hush. The unexpected thing is original — not a franchise toy.", "storyPreset": "preschool-story", "locale": "en", "protagonist": {"name": "Holly", "age": 4, "gender": "girl"}},
    {"theme": "birthday bravery", "premise": "A child whose birthday party wish goes wrong — the wrong cake, the wrong weather, the wrong everything — discovers the best birthday present can't be ordered.", "notes": "Warm and funny. The imperfect party becomes a perfect story.", "storyPreset": "first-adventure", "locale": "en", "protagonist": {"name": "Sunny", "age": 4, "gender": "not_specified"}},
    {"theme": "easter discovery", "premise": "A child follows a trail of clues through the garden on Easter morning, finding more than they expected hidden in the ordinary places.", "notes": "Gentle mystery and discovery. Sensory world of a spring garden.", "storyPreset": "toddler-tale", "locale": "en", "protagonist": {"name": "Daisy", "age": 3, "gender": "girl"}},
    {"theme": "first day of summer", "premise": "School is finally out. A child has the whole endless summer day ahead — and not a single plan — and discovers the best adventure is the one you stumble into.", "notes": "Slow, sun-drenched, meandering. No plot problem needed — the joy is the point.", "storyPreset": "big-kid-chapter", "locale": "en", "protagonist": {"name": "Sol", "age": 7, "gender": "not_specified"}},
    {"theme": "autumn change", "premise": "A child who hates that summer is ending follows one falling leaf from the tree to the ground — and decides that change might be beautiful after all.", "notes": "Meditative, slow. Sensory focus on colour, smell, texture.", "storyPreset": "preschool-story", "locale": "en", "protagonist": {"name": "Maple", "age": 5, "gender": "girl"}},
    {"theme": "rainy day baking", "premise": "Stuck inside on a rainy day with nothing to do, a child helps their grandparent bake something from scratch for the very first time — and starts a tradition.", "notes": "Cosy, slow, warm. Focus on hands, ingredients, smell.", "storyPreset": "first-adventure", "locale": "en", "protagonist": {"name": "Noah", "age": 4, "gender": "boy"}},
    # Family / relationships
    {"theme": "two homes", "premise": "A child who splits their time between two houses gradually realises that home isn't a place — it's where your people are.", "notes": "Neither house is better. Both parents love the child. No sadness — just discovery.", "storyPreset": "big-kid-chapter", "locale": "en", "protagonist": {"name": "Cam", "age": 7, "gender": "not_specified"}},
    {"theme": "grandparent wisdom", "premise": "A child frustrated by something they can't do yet asks their grandparent for help — and the grandparent teaches them by showing something they themselves once couldn't do.", "notes": "Intergenerational warmth. The skill is tactile — tying a knot, whistling, skimming stones.", "storyPreset": "preschool-story", "locale": "en", "protagonist": {"name": "Bo", "age": 5, "gender": "not_specified"}},
    {"theme": "pet loss", "premise": "After their beloved pet dies, a child grieves in small ordinary ways — and slowly begins to remember the joy more than the sadness.", "notes": "Gentle and honest. The pet is gone; no magical return. The healing is gradual and real.", "storyPreset": "big-kid-chapter", "locale": "en", "protagonist": {"name": "Luna", "age": 7, "gender": "girl"}},
    {"theme": "adoption", "premise": "A child who is adopted has always wondered where they came from — and finally understands that belonging isn't about where you started, it's about where you're loved.", "notes": "Warm and affirming. The question is answered with love, not a dramatic reveal.", "storyPreset": "young-reader-short", "locale": "en", "protagonist": {"name": "River", "age": 8, "gender": "not_specified"}},
]


# ---------------------------------------------------------------------------
# Selection and deduplication
# ---------------------------------------------------------------------------

def week_stamp():
    return datetime.now(timezone.utc).strftime("%Y-W%V")


def pick_briefs(n=5):
    stamp = week_stamp()
    rng = random.Random(stamp)
    return rng.sample(BRIEFS, min(n, len(BRIEFS)))


def dedupe_key(brief, stamp):
    slug = brief["theme"].lower().replace(" ", "-").replace("/", "-")[:40]
    return f"weekly-brief:{stamp}:{slug}"


# ---------------------------------------------------------------------------
# Database insertion
# ---------------------------------------------------------------------------

def clean_db_url(url):
    """Strip psycopg2-incompatible query params (e.g. channel_binding) from the URL."""
    from urllib.parse import urlparse, urlencode, parse_qs, urlunparse
    parsed = urlparse(url)
    params = parse_qs(parsed.query, keep_blank_values=True)
    params.pop("channel_binding", None)
    clean_query = urlencode({k: v[0] for k, v in params.items()})
    return urlunparse(parsed._replace(query=clean_query))


def insert_briefs(db_url, briefs):
    import psycopg2
    db_url = clean_db_url(db_url)

    stamp = week_stamp()
    now = datetime.now(timezone.utc).isoformat()
    inserted = 0

    conn = psycopg2.connect(db_url)
    try:
        with conn:
            with conn.cursor() as cur:
                for brief in briefs:
                    title_id = str(uuid.uuid4())
                    job_id = str(uuid.uuid4())
                    dk = dedupe_key(brief, stamp)

                    cur.execute(
                        "INSERT INTO trade_titles (id, status, seed_brief, created_at, updated_at) "
                        "VALUES (%s, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
                        (title_id, "queued", json.dumps(brief), now, now),
                    )
                    if cur.rowcount == 0:
                        print(f"skip (already exists): {brief['theme']}")
                        continue

                    cur.execute(
                        "INSERT INTO trade_book_jobs "
                        "(id, kind, dedupe_key, payload, status, attempts, available_at, created_at, updated_at) "
                        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) "
                        "ON CONFLICT (dedupe_key) DO NOTHING",
                        (job_id, "generate_title", dk, json.dumps({"tradeTitleId": title_id}),
                         "queued", 0, now, now, now),
                    )
                    inserted += 1
                    print(f"queued: {brief['theme']} ({brief['storyPreset']})")
    finally:
        conn.close()

    return inserted


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    env_path = "/home/openhands/workspace/storycot/.env.local"
    db_url = ""
    try:
        with open(env_path) as f:
            for line in f:
                if line.startswith("storycot_DATABASE_URL="):
                    db_url = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
    except OSError as exc:
        raise RuntimeError(f"Could not read {env_path}: {exc}") from exc

    if not db_url:
        raise RuntimeError("storycot_DATABASE_URL not found in .env.local")

    briefs = pick_briefs(5)
    inserted = insert_briefs(db_url, briefs)
    print(f"\nWeekly trade briefs: {inserted} queued for {week_stamp()}")


if __name__ == "__main__":
    try:
        main()
        fire_callback("COMPLETED")
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        fire_callback("FAILED", str(exc))
        sys.exit(1)
