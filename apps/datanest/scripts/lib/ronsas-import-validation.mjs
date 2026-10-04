export function validateRonsasLaunchRegistryText(source) {
  const failures = [];
  const launchRegistry = String(source || "");
  const staticLaunches =
    launchRegistry.match(/\{slug:"[^"]+"[^}\n]*launchKind:"datanest-pages"/g) || [];

  if (staticLaunches.length !== 7) {
    failures.push(
      `RONSAS launch registry must expose exactly seven DataNest Pages apps; found ${staticLaunches.length}`
    );
  }

  if (
    !/slug:"youtube-optimizer"[\s\S]*launchKind:"external-ssr"[\s\S]*href:"https:\/\/youtubeoptimizer\.life"/.test(
      launchRegistry
    )
  ) {
    failures.push(
      "YouTube Optimizer must remain a governed external SSR launch at https://youtubeoptimizer.life"
    );
  }

  return failures;
}
