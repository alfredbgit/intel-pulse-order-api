#!/usr/bin/env python3
"""
Extract YouTube transcripts for The Delta Playbook research.
Video IDs extracted from Ryan Nichols' playlists.
"""

import sys
sys.path.insert(0, '/tmp/yt-env/lib/python3.13/site-packages')

from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import TranscriptsDisabled, NoTranscriptFound
import json
import time
from pathlib import Path

# Video IDs from the playlists (extracted from browser snapshots)
# Playlist 1: Delta - prespawn (20 videos)
# Playlist 2: Delta Stars (24 videos)  
# Playlist 3: California Delta (118 videos)

VIDEO_IDS = [
    # Playlist 1: Delta - prespawn
    "pk6CGgt0GKM", "6GN0kZBWKBU", "MyD72HrjSdc", "IWuAp88QIUw",
    "SIKTy9RtPvE", "f-YgIcb7da4", "-5YghV9Uc-k", "yJSbs8wAJig",
    "7okrR5PXe5c", "hQqCGvHpuFs", "GGr68EYinkc", "e5oGJwVAAR8",
    "qUrMrfDLLmA", "pEnnKVuR79U", "nmJFtZ8Zsko", "gpPVSBmxQKU",
    "OHnncDwzGko", "hrZIA8dSzsQ", "CfWqRPI5iXs",
    
    # Playlist 2: Delta Stars (subset - key videos)
    "2J8VZp1NhsI", "0wfq273rI8U", "8R0b3JXZRVE", "itwNWsXo1ZU",
    "jnVtmR5BUoM", "iTtooq5eHNc", "ipdSQM0rMjU", "yDKSnfiTIoA",
    "geBZ_yEHgJA", "YXHIOLHAeLk", "WbY7KWJk3vU", "b25B3HH-4G8",
    "Z4apifev2WY", "wamNCJ7ODA8", "rAIcThSUS5M", "uDvZaDGPtEI",
    "vJOM1a7F9gA", "NkouFme_rZA", "kGaLqr4s0GQ", "CDsCKTIOavI",
    "BblrplHcuiM",
    
    # Playlist 3: California Delta (key videos - subset for now)
    "j5Zd26fShho", "o53oGVkIQEM", "jobzVxphlxk", "vEk7rr7CPcM",
    "CGOHpVWQ0wM", "1-CLF_o5kD8", "zImLf79ZNQs", "DaCSQW3rMyI",
    "vEtdkIkwwU8", "nbnVHRRu0ZA", "u1lYoSFQH_Y", "iuWn8HbPd5U",
    "ssWofaaI7fo", "Cdf3qn84TXo", "CY_DbZEmAe8", "z9o7BYbJfg8",
    "Yw4qLhkgl00", "Ro6qnwdfsqA", "CjpVRv_vG6g", "cTaH7IewExw",
    "s6Fvdu1GsXg", "sSIihfRj-Mg", "qymNdr1FaEI", "BvxOoxKTpZU",
    "X_Oktah6Lhw", "KceTuQhATUk", "c77RKpA2FsI", "EFr_Nki8Bp0",
    "hvqt47b3mTk", "I4Gl-RwtVR0", "I0oTisvyYDM", "94WTOS_D5tw",
    "BsA2oIRS2SM", "UMMT0RvBaH4", "eaTJBzc_Uss", "VFe9Mhpt0nw",
    "li0hkiZkntc", "WfuKf5uzDkg", "QoNJ7PO3PTg", "z1K-DRKqM_g",
    "D8YUZ1ryA60", "BgW8vv2tthU",
]

OUTPUT_DIR = Path("/Users/alfredbutler/Projects/alfreds-lair/staff/logan/ventures/delta-bass-playbook/research/transcripts")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

def extract_transcript(video_id):
    """Extract transcript for a single video."""
    try:
        api = YouTubeTranscriptApi()
        transcript = api.fetch(video_id, languages=['en'])
        # New API returns FetchedTranscript object, need to iterate properly
        text = " ".join([snippet.text for snippet in transcript])
        return {"success": True, "text": text, "length": len(text)}
    except TranscriptsDisabled:
        return {"success": False, "error": "Transcripts disabled"}
    except NoTranscriptFound:
        return {"success": False, "error": "No transcript found"}
    except Exception as e:
        return {"success": False, "error": str(e)}

def main():
    print(f"Extracting transcripts for {len(VIDEO_IDS)} videos...")
    results = []
    successful = 0
    failed = 0
    
    for i, video_id in enumerate(VIDEO_IDS):
        print(f"[{i+1}/{len(VIDEO_IDS)}] Processing {video_id}...")
        result = extract_transcript(video_id)
        result['video_id'] = video_id
        
        if result['success']:
            successful += 1
            # Save individual transcript
            output_file = OUTPUT_DIR / f"{video_id}.txt"
            with open(output_file, 'w') as f:
                f.write(result['text'])
            print(f"  ✓ Saved to {output_file.name} ({len(result['text'])} chars)")
        else:
            failed += 1
            print(f"  ✗ Failed: {result['error']}")
        
        results.append(result)
        time.sleep(0.5)  # Rate limiting
    
    # Save summary
    summary_file = OUTPUT_DIR / "summary.json"
    with open(summary_file, 'w') as f:
        json.dump({
            "total": len(VIDEO_IDS),
            "successful": successful,
            "failed": failed,
            "results": results
        }, f, indent=2)
    
    print(f"\n=== SUMMARY ===")
    print(f"Total: {len(VIDEO_IDS)}")
    print(f"Successful: {successful}")
    print(f"Failed: {failed}")
    print(f"Output: {OUTPUT_DIR}")
    
    return successful, failed

if __name__ == "__main__":
    main()
