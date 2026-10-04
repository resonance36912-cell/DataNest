/**
 * Client-side mirror of the edge function's prompt composition for
 * generate-scene-image. Used by ScenePromptPreview so users can see
 * exactly how their Scene Director choices will be sent to the model.
 *
 * Keep this in sync with supabase/functions/generate-scene-image/index.ts
 * (buildDirectorDirective + prompt templates).
 */
import type { Scene } from "@/contexts/ProjectContext";

const labelize = (s: string) => String(s).replace(/_/g, " ");

const REALISM =
  "REALISM: real-world physics in hair/fabric/light, motivated lighting only (visible practicals where the scene supports it), no studio backdrop unless required, no over-sharpened edges, no waxy skin, no symmetric AI face, no plastic eyes. Reference look: A24 / Hiro Murai / Bradford Young music-video cinematography.";

export interface ScenePromptPreview {
  shotRole: string;
  isAroll: boolean;
  isBroll: boolean;
  directorDirective: string;
  finalPrompt: string;
  hasCharacterReference: boolean;
}

export function buildScenePromptPreview(
  scene: Scene,
  opts: {
    style?: string;
    character?: { name?: string; description?: string; outfit?: string; vibe?: string; imageUrl?: string } | null;
    keepCharacterConsistent?: boolean;
  } = {},
): ScenePromptPreview {
  const s = scene as any;
  const shotRole: string =
    s.shot_role || (scene.is_broll ? "B_ROLL_STORY" : "A_ROLL_LIP_SYNC");
  const isBroll = shotRole.startsWith("B_ROLL") || scene.is_broll === true;
  const isAroll =
    !isBroll &&
    (shotRole === "A_ROLL_LIP_SYNC" ||
      shotRole === "PERFORMANCE_CLOSEUP" ||
      scene.isAroll !== false);

  /* ---------- director directive ---------- */
  const parts: string[] = [];
  parts.push(`SHOT ROLE: ${labelize(shotRole)}`);

  const perf = s.performance_direction || {};
  const perfBits: string[] = [];
  if (perf.emotion) perfBits.push(`emotion ${labelize(perf.emotion)}`);
  if (typeof perf.intensity === "number") perfBits.push(`intensity ${perf.intensity}/5`);
  if (perf.eyeLine) perfBits.push(`eye-line ${labelize(perf.eyeLine)}`);
  if (perf.posture) perfBits.push(`posture ${labelize(perf.posture)}`);
  if (perf.gestureStyle) perfBits.push(`gesture ${labelize(perf.gestureStyle)}`);
  if (perf.headMotion) perfBits.push(`head motion ${labelize(perf.headMotion)}`);
  if (perfBits.length) parts.push(`PERFORMANCE: ${perfBits.join(", ")}`);

  const cam = s.camera_direction || {};
  const camBits: string[] = [];
  if (cam.shotSize) camBits.push(`${labelize(cam.shotSize)} framing`);
  if (cam.lens) camBits.push(`${cam.lens} lens`);
  if (cam.cameraHeight) camBits.push(`${labelize(cam.cameraHeight)}`);
  if (cam.movement) camBits.push(`camera ${labelize(cam.movement)}`);
  if (cam.depthOfField) camBits.push(`${labelize(cam.depthOfField)} depth of field`);
  if (camBits.length) parts.push(`CAMERA: ${camBits.join(", ")}`);

  if (s.lighting_direction) parts.push(`LIGHTING: ${labelize(s.lighting_direction)}`);
  if (s.scene_location) parts.push(`LOCATION: ${s.scene_location}`);
  if (s.vfx_level) {
    const vfxDetail =
      s.vfx_level === "none"
        ? "no post-effects, purely practical"
        : s.vfx_level === "subtle"
          ? "minor accents only"
          : s.vfx_level === "moderate"
            ? "stylized accents, restrained"
            : "stronger VFX accents, still grounded";
    parts.push(`VFX LEVEL: ${labelize(s.vfx_level)} (${vfxDetail})`);
  }

  const safety = s.lip_sync_safety || {};
  const safetyBits: string[] = [];
  if (safety.mouth_clear !== false) safetyBits.push("mouth fully visible and unobstructed");
  if (safety.face_clear !== false) safetyBits.push("face fully visible front-on");
  if (safety.no_obstruction !== false) safetyBits.push("nothing covering the lower face");
  if (safetyBits.length && (shotRole === "A_ROLL_LIP_SYNC" || shotRole === "PERFORMANCE_CLOSEUP")) {
    parts.push(`LIP-SYNC SAFETY: ${safetyBits.join("; ")}`);
  }

  const directorDirective = `SCENE DIRECTOR — ${parts.join(" | ")}. `;

  /* ---------- final composed prompt ---------- */
  const artStyle =
    opts.style === "animated"
      ? "stylized animated 3D Pixar/Disney style, vibrant colors"
      : "photoreal cinema, shot on ARRI Alexa with a 35mm anamorphic lens, shallow depth of field (f/2.0), natural film grain, accurate skin texture with visible pores and fine hair, realistic subsurface scattering, natural color grade, no plastic skin, no airbrush, no AI gloss";

  const visualPrompt = scene.visual_prompt || "(visual_prompt is empty)";
  const sceneNumber = scene.scene_number;
  const character = opts.character || null;
  const hasCharacterReference = !isBroll && !!character?.imageUrl;

  let finalPrompt = "";

  if (isBroll) {
    const brollDirective = (scene as any).broll_prompt || visualPrompt;
    finalPrompt = `${directorDirective}Generate a cinematic music-video B-ROLL still — NO performer, NO singer, NO lipsync subject in frame. ${brollDirective}. ${REALISM} Composition implies motion (textures, environment, light play, abstract movement, objects). Style: ${artStyle}. 16:9 widescreen. No text, watermarks, captions, or logos. Make this image visually DISTINCT from any other scene — vary lens, angle, palette, and subject.`;
  } else {
    const outfitDesc = (scene as any).attire_override || character?.outfit || "casual clothes";
    const consistencyRule = (opts.keepCharacterConsistent ?? true)
      ? `CHARACTER IDENTITY LOCK: same face, skin tone, hair color, hairstyle, body type, and wardrobe (${outfitDesc}) across scenes. Pose, expression, BACKGROUND, lighting, and mood SHOULD change between scenes — only the person stays identical. `
      : "";
    const characterDesc = character
      ? `Main character "${character.name || "(unnamed)"}": ${character.description || ""}, wearing ${outfitDesc}, vibe: ${character.vibe || "confident"}. Face clearly visible (no silhouette / no back-of-head). ${consistencyRule}`
      : "(no character payload — character description will be omitted)";

    const arollRule = isAroll
      ? "LIPSYNC-READY A-ROLL: 1) ONLY the main character in frame — no extras, no crowd. 2) Medium close-up portrait, head-and-shoulders, face 35-55% of frame height, 16:9. 3) Front-facing or very slight 3/4 angle, never profile. 4) NEUTRAL CLOSED MOUTH, lips relaxed, no teeth, no smile — required for lipsync overlay. 5) Head centered, minimal motion blur on the face. 6) Soft motivated key light keeps the face evenly lit, BUT the OVERALL environment, palette, and atmosphere MUST follow the per-scene visual_prompt below (do NOT default to a generic blurred studio background). Every A-Roll scene must look like a different shot from the same music video, not a duplicate of the last frame."
      : "Hero framing: medium or medium-close shot, character clearly visible, face well-lit toward camera, no extreme wides, no obscured faces. Background and lighting follow the scene's visual_prompt and should differ from previous scenes.";

    if (hasCharacterReference) {
      finalPrompt = isAroll
        ? `${directorDirective}Create music-video A-Roll scene ${sceneNumber} featuring this EXACT character. ${arollRule} ${REALISM} SCENE-SPECIFIC SETTING (drives background, lighting, palette, atmosphere): ${visualPrompt}. ${characterDesc} Style: ${artStyle}. 16:9 widescreen. Keep face/skin/hair/features identical to the reference — vary pose, mood, environment, and lighting per the scene. No text, no watermarks.`
        : `${directorDirective}Create music-video scene ${sceneNumber} featuring this EXACT character. ${arollRule} ${REALISM} Scene: ${visualPrompt}. ${characterDesc} Style: ${artStyle}. 16:9 widescreen. Keep face/skin/hair/features identical to the reference; vary pose, expression, background, and lighting per the scene. No text, no watermarks.`;
    } else {
      finalPrompt = isAroll
        ? `${directorDirective}Generate music-video A-Roll scene ${sceneNumber}. ${arollRule} ${REALISM} Scene-specific setting: ${visualPrompt}. ${characterDesc} Style: ${artStyle}. 16:9 widescreen. No text, no watermarks.`
        : `${directorDirective}Generate music-video scene ${sceneNumber}. ${arollRule} ${REALISM} Scene: ${visualPrompt}. ${characterDesc} Style: ${artStyle}. 16:9 widescreen. No text, no watermarks.`;
    }
  }

  return { shotRole, isAroll, isBroll, directorDirective, finalPrompt, hasCharacterReference };
}
