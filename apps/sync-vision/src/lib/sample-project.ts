import { supabase } from "@/integrations/supabase/client";

/**
 * Seeds the "Neon Rain — Sample Treatment" demo project for the current user.
 * Creates a coherent analysis, character, and five-scene storyboard so first-run
 * users can explore the workflow without uploading audio or calling paid providers.
 *
 * Returns the new project id, or throws.
 */
export async function seedSampleProject(userId: string): Promise<string> {
  const lyrics = [
    "City lights bleed through the rain",
    "I hear your voice inside the noise",
    "We were built for the storm",
    "Every heartbeat lights the sky",
    "Neon rain — carry me home",
  ].join("\n");

  const { data: project, error: projectErr } = await supabase
    .from("projects")
    .insert({
      name: "Neon Rain — Sample Treatment",
      user_id: userId,
      status: "draft",
      current_step: 3, // Land users on the Storyboard step so they see the workspace
      mood: "moody, cinematic, neon-noir",
      bpm: 96,
      music_key: "Am",
      energy: "medium-high",
      lyrics,
      reference_transcript: lyrics,
      transcript_lock_status: "verified",
      transcript_quality_status: "accepted",
      source_of_truth: "reference",
      instruments: ["synthesizer", "electronic drums", "bass", "vocals"],
      segment_count: 5,
      track_details: {
        song_title: "Neon Rain",
        artist_name: "Sync Vision Demo",
        visual_style: "cinematic neon-noir",
        mood: "moody, electric, resolute",
        aspect_ratio: "16:9",
        pasted_lyrics: lyrics,
      },
    })
    .select("id")
    .single();

  if (projectErr || !project) {
    throw new Error(projectErr?.message || "Failed to create sample project");
  }

  const projectId = project.id as string;

  const scenes = [
    {
      scene_number: 1,
      time_start: "0:00",
      time_end: "0:12",
      lyric_segment: "City lights bleed through the rain",
      mood: "atmospheric",
      location: "Empty downtown crosswalk under a rain-soaked traffic light",
      camera_style: "Slow dolly-in, low angle, 35mm anamorphic",
      action_description:
        "A lone silhouette stands beneath a flickering neon sign. Cyan and magenta reflections shimmer on wet asphalt as rain streaks the frame.",
      visual_prompt:
        "Cinematic neo-noir wide shot, rainy midnight street, neon signage glowing cyan and magenta reflecting on wet pavement, lone hooded figure silhouette, anamorphic lens flares, moody haze, film grain",
      section_type: "intro",
      section_index: 1,
    },
    {
      scene_number: 2,
      time_start: "0:12",
      time_end: "0:28",
      lyric_segment: "I hear your voice inside the noise",
      mood: "yearning",
      location: "Rooftop overlooking a neon-lit skyline",
      camera_style: "Handheld orbit, shallow depth of field",
      action_description:
        "Character looks out over the skyline as rain intensifies. Skyline glows with rippling holographic billboards. Camera orbits slowly.",
      visual_prompt:
        "Cinematic rooftop scene, protagonist facing neon skyline at night, rain, glowing holographic billboards in the distance, moody rim light, shallow depth of field, filmic",
      section_type: "verse",
      section_index: 1,
    },
    {
      scene_number: 3,
      time_start: "0:28",
      time_end: "0:44",
      lyric_segment: "We were built for the storm",
      mood: "defiant",
      location: "Alley with flickering vapor and steam",
      camera_style: "Tracking shot, wide-to-close, 24fps",
      action_description:
        "Character walks forward through steam and vapor as neon signs flare in sync with the beat. Reflections split the frame into color bands.",
      visual_prompt:
        "Cinematic tracking shot through steamy alley, neon signs pulsing in rhythm, protagonist walking forward with confidence, saturated cyan and magenta color grade, atmospheric haze, cinematic",
      section_type: "chorus",
      section_index: 1,
    },
    {
      scene_number: 4,
      time_start: "0:44",
      time_end: "1:02",
      lyric_segment: "Every heartbeat lights the sky",
      mood: "electric",
      location: "Rain-soaked rooftop with pulsing city lights below",
      camera_style: "Crane pull-back with slow spin",
      action_description:
        "Wide crane shot pulls back to reveal the character on a rooftop as lightning cracks across the skyline. The city glows in sync with the drop.",
      visual_prompt:
        "Cinematic aerial crane shot, neon city skyline at night with lightning, silhouetted figure on rooftop, rain, dramatic color contrast, wide vista, filmic",
      section_type: "chorus",
      section_index: 2,
    },
    {
      scene_number: 5,
      time_start: "1:02",
      time_end: "1:18",
      lyric_segment: "Neon rain — carry me home",
      mood: "resolute",
      location: "Neon-lit tunnel with rain falling from the entrance",
      camera_style: "Pull-out reveal, symmetrical composition",
      action_description:
        "Character walks toward camera through a tunnel bathed in neon. Rain falls at the tunnel mouth behind them. Freeze on final beat as color drains to silver.",
      visual_prompt:
        "Cinematic symmetrical shot, protagonist walking toward camera through neon-lit tunnel, rain visible at tunnel mouth, dramatic vanishing point, cinematic color grade, final hero shot",
      section_type: "outro",
      section_index: 1,
    },
  ];

  const rows = scenes.map((s) => ({
    ...s,
    project_id: projectId,
    user_id: userId,
  }));

  const words = scenes.flatMap((scene) => {
    const start = Number(scene.time_start.split(":")[0]) * 60 + Number(scene.time_start.split(":")[1]);
    const end = Number(scene.time_end.split(":")[0]) * 60 + Number(scene.time_end.split(":")[1]);
    const tokens = scene.lyric_segment.split(/\s+/);
    const duration = (end - start) / tokens.length;
    return tokens.map((text, index) => ({
      text,
      start: Number((start + index * duration).toFixed(2)),
      end: Number((start + (index + 1) * duration).toFixed(2)),
      confidence: 1,
    }));
  });

  const [scenesResult, transcriptResult, characterResult] = await Promise.all([
    supabase.from("scenes").insert(rows),
    supabase.from("transcript_versions").insert({
      project_id: projectId,
      user_id: userId,
      version_number: 1,
      type: "edited",
      status: "accepted",
      full_text: lyrics,
      notes: "Built-in sample transcript; no audio file is included.",
      raw_payload: {
        text: lyrics,
        words,
        audio_events: [],
        quality: {
          has_content: true,
          has_timestamps: true,
          word_count: words.length,
          char_count: lyrics.length,
          final_status: "good",
        },
      },
    }),
    supabase.from("characters").insert({
      project_id: projectId,
      user_id: userId,
      name: "Nova",
      gender: "androgynous",
      age_range: "20s",
      outfit: "Black raincoat with reflective cyan piping and silver boots",
      hairstyle: "Short dark hair, rain-swept",
      vibe: "resilient, introspective, electric",
      extra_details: "Cinematic neo-noir lead, consistent face, magenta rim light, cyan reflections",
      confirmed: true,
    }),
  ]);

  const seedError = scenesResult.error || transcriptResult.error || characterResult.error;
  if (seedError) {
    // Best-effort cleanup keeps retries deterministic if any related row fails.
    await Promise.all([
      supabase.from("scenes").delete().eq("project_id", projectId),
      supabase.from("transcript_versions").delete().eq("project_id", projectId),
      supabase.from("characters").delete().eq("project_id", projectId),
    ]);
    await supabase.from("projects").delete().eq("id", projectId);
    throw new Error(seedError.message);
  }

  return projectId;
}
