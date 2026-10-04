const glyphs: Record<string,string> = {
  dashboard:"M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  overview:"M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
  ai:"M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z M19 3v4 M17 5h4",
  stakeholder:"M8 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6 M2 21v-4a6 6 0 0 1 12 0v4 M17 5a3 3 0 0 1 0 6 M17 14a5 5 0 0 1 5 5v2",
  sparks:"M13 2L4 14h7l-1 8 10-13h-7z",
  impact:"M4 20h16 M5 16v-5 M12 16V7 M19 16V3",
  thinktank:"M8 17h8 M9 21h6 M8 17v-2a7 7 0 1 1 8 0v2 M12 6v5",
  governance:"M12 2l8 4v6c0 5-8 10-8 10S4 17 4 12V6z M8 12l3 3 5-6",
  products:"M12 2L3 7v10l9 5 9-5V7z M3 7l9 5 9-5 M12 12v10",
  external_auditor:"M9 3H3v18h14v-6 M14 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10 M18 12l4 4 M6 16h6",
  productlab:"M9 2h6 M10 2v7L4 19q-1 3 3 3h10q4 0 3-3L14 9V2 M7 15h10",
  unifi:"M4 5h4v4H4z M4 15h4v4H4z M12 7h8 M12 17h8 M6 9v6",
  scheduler:"M3 5h18v16H3z M7 2v6 M17 2v6 M3 10h18 M7 14h5 M12 17h5",
  runs:"M8 4l12 8-12 8z", checkpoints:"M4 3v19 M4 4h15l-4 5 4 5H4",
  audit:"M5 3h14v18H5z M9 7h6 M9 12h6 M9 17h4",
  transparency:"M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12 M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  settings:"M4 7h16 M4 17h16 M8 4v6 M16 14v6"
};
export default function WorkspaceGlyph({view}:{view:string}) {
  return <svg className="workspaceGlyph" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={glyphs[view]||glyphs.overview}/></svg>;
}
