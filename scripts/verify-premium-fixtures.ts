#!/usr/bin/env bun
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

type ManifestApp = {
  id: string;
  generative?: boolean;
  minimum_fixtures?: number;
  fixture_directory: string;
  required_checks?: string[];
};

type Manifest = {
  representative_categories: string[];
  apps: ManifestApp[];
};

type Fixture = {
  schema?: string;
  id?: string;
  app?: string;
  category?: string;
  review_status?: string;
  review_basis?: string;
  input?: unknown;
  expected_checks?: string[];
  provenance?: string[];
};

const manifest = JSON.parse(
  readFileSync("qa/premium-readiness/fixture-manifest.json", "utf8"),
) as Manifest;

const allowedReview = new Set(["source-derived-reviewed", "human-reviewed"]);
const prohibited = /(\bTODO\b|\bTBD\b|lorem ipsum|placeholder fixture|dummy fixture)/i;
const failures: string[] = [];
const allIds = new Set<string>();

for (const app of manifest.apps) {
  const dir = app.fixture_directory;
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .filter((name) => statSync(join(dir, name)).isFile())
    .sort();

  const minimum = Number(app.minimum_fixtures ?? 0);
  if (app.generative && files.length < minimum) {
    failures.push(`${app.id}: expected >= ${minimum} JSON fixtures, found ${files.length}`);
  }
  if (app.id === "hub-billing" && files.length < 10) {
    failures.push(`${app.id}: expected at least 10 billing/recovery scenarios, found ${files.length}`);
  }

  const categoryCounts = new Map<string, number>();
  const checkCoverage = new Set<string>();

  for (const file of files) {
    const rel = join(dir, file);
    let fixture: Fixture;
    try {
      fixture = JSON.parse(readFileSync(rel, "utf8")) as Fixture;
    } catch (error) {
      failures.push(`${rel}: invalid JSON: ${String(error)}`);
      continue;
    }

    if (fixture.schema !== "ronsas.premium-fixture.v1") {
      failures.push(`${rel}: schema must be ronsas.premium-fixture.v1`);
    }
    if (!fixture.id || allIds.has(fixture.id)) {
      failures.push(`${rel}: fixture id is missing or duplicated`);
    } else {
      allIds.add(fixture.id);
    }
    if (fixture.app !== app.id) {
      failures.push(`${rel}: app must equal ${app.id}`);
    }
    if (!fixture.category || !manifest.representative_categories.includes(fixture.category)) {
      failures.push(`${rel}: category is not in representative_categories`);
    } else {
      categoryCounts.set(fixture.category, (categoryCounts.get(fixture.category) ?? 0) + 1);
    }
    if (!fixture.review_status || !allowedReview.has(fixture.review_status)) {
      failures.push(`${rel}: review_status must be source-derived-reviewed or human-reviewed`);
    }
    if (!fixture.review_basis || fixture.review_basis.trim().length < 30) {
      failures.push(`${rel}: review_basis is missing or too weak`);
    }
    if (!fixture.provenance || fixture.provenance.length === 0 || fixture.provenance.some((p) => !p.trim())) {
      failures.push(`${rel}: at least one source/test provenance path is required`);
    }
    const inputText = JSON.stringify(fixture.input ?? null);
    if (inputText === "null" || inputText === "{}" || inputText === "\"\"" || prohibited.test(inputText)) {
      failures.push(`${rel}: input is empty or looks like placeholder content`);
    }
    if (!Array.isArray(fixture.expected_checks) || fixture.expected_checks.length === 0) {
      failures.push(`${rel}: expected_checks is required`);
    } else {
      for (const check of fixture.expected_checks) checkCoverage.add(check);
    }
  }

  if (app.generative) {
    const expectedPerCategory = Math.floor(minimum / manifest.representative_categories.length);
    for (const category of manifest.representative_categories) {
      const count = categoryCounts.get(category) ?? 0;
      if (count < expectedPerCategory) {
        failures.push(
          `${app.id}: category ${category} requires >= ${expectedPerCategory} fixtures, found ${count}`,
        );
      }
    }
  }

  for (const required of app.required_checks ?? []) {
    if (!checkCoverage.has(required)) {
      failures.push(`${app.id}: required check ${required} is not covered by any fixture`);
    }
  }

  console.log(
    `✓ ${app.id}: ${files.length} fixtures; categories ${manifest.representative_categories
      .map((c) => `${c}=${categoryCounts.get(c) ?? 0}`)
      .join(", ")}`,
  );
}

if (failures.length) {
  console.error("\nPremium fixture validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`\n✓ premium fixture corpus validated: ${allIds.size} unique fixtures.`);
