import { forwardRef } from "react";
import type { AuditResponse } from "@/lib/types";
// Brand pack assets — do not swap for non-brand-pack images.
import resonanceLogo from "@/assets/resonance-logo.png";
import resonanceLockup from "@/assets/resonance-lockup.png";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

const statusLabel: Record<string, string> = {
  great: "★ Great",
  good: "● Good",
  "needs-work": "▲ Needs Work",
  poor: "✕ Poor",
};

interface Props {
  data: AuditResponse;
}

const SectionHeading = ({ num, children }: { num: number; children: React.ReactNode }) => (
  <h2 style={{ fontSize: "13px", fontWeight: 700, borderBottom: "1.5px solid #d1d5db", paddingBottom: "4px", marginBottom: "10px", color: "#111", fontFamily: "'Inter Tight', system-ui, sans-serif", letterSpacing: "-0.01em" }}>
    {num}. {children}
  </h2>
);

const PrintableReport = forwardRef<HTMLDivElement, Props>(({ data }, ref) => {
  const { channelData, audit, videos } = data;
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const topVideos = videos?.length
    ? [...videos].sort((a, b) => b.viewCount - a.viewCount).slice(0, 10)
    : [];
  const bottomVideos = videos?.length && videos.length > 10
    ? [...videos].sort((a, b) => a.viewCount - b.viewCount).slice(0, 10)
    : [];

  const cellStyle: React.CSSProperties = { padding: "5px 6px", border: "1px solid #d1d5db", fontSize: "9.5px", lineHeight: 1.4 };
  const headerCellStyle: React.CSSProperties = { ...cellStyle, fontWeight: 600, backgroundColor: "#f3f4f6", fontSize: "9px", textTransform: "uppercase" as const, letterSpacing: "0.03em" };

  return (
    <div
      ref={ref}
      className="print-report"
      style={{
        width: "210mm",
        minHeight: "297mm",
        margin: "0 auto",
        padding: "12mm",
        background: "white",
        color: "#1a1a1a",
        fontFamily: "'Inter', -apple-system, sans-serif",
        fontSize: "10px",
        lineHeight: 1.55,
      }}
    >
      {/* A4 Border Frame */}
      <div style={{ position: "relative", border: "2px solid #111", borderRadius: "4px", padding: "14mm 16mm", minHeight: "calc(297mm - 24mm)", overflow: "hidden" }}>

        {/* Brand watermark — brand-pack mark, faint, centered, print-safe */}
        <img
          src={resonanceLogo}
          alt=""
          aria-hidden="true"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: "120mm",
            height: "120mm",
            transform: "translate(-50%, -50%) rotate(-20deg)",
            opacity: 0.04,
            objectFit: "contain",
            pointerEvents: "none",
            zIndex: 0,
            // Ensure watermark prints in browsers honoring color-adjust
            WebkitPrintColorAdjust: "exact" as const,
            printColorAdjust: "exact" as const,
          }}
        />

        {/* Content layer above watermark */}
        <div style={{ position: "relative", zIndex: 1 }}>


        {/* Header — brand-pack lockup + mark */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "2.5px solid #111", paddingBottom: "12px", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <img src={resonanceLogo} alt="Resonance" style={{ width: "36px", height: "36px", objectFit: "contain" }} />
            <img src={resonanceLockup} alt="Resonance" style={{ height: "26px", width: "auto", objectFit: "contain" }} />
          </div>
          <div style={{ textAlign: "right", fontSize: "9px", color: "#6b7280" }}>
            <p style={{ margin: 0, fontWeight: 600, fontFamily: "'Inter Tight', system-ui, sans-serif", fontSize: "11px", color: "#111", letterSpacing: "-0.01em" }}>
              Resonance Report
            </p>
            <p style={{ margin: "2px 0 0 0" }}>{today} · Confidential</p>
          </div>
        </div>


        {/* Channel Overview */}
        <section style={{ marginBottom: "16px" }}>
          <SectionHeading num={1}>Channel Overview</SectionHeading>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 24px", fontSize: "10px" }}>
            <p style={{ margin: 0 }}><strong>Channel:</strong> {channelData.name} ({channelData.handle})</p>
            <p style={{ margin: 0 }}><strong>Niche:</strong> {audit.niche}</p>
            <p style={{ margin: 0 }}><strong>Subscribers:</strong> {formatNumber(channelData.subscribers)}</p>
            <p style={{ margin: 0 }}><strong>Total Views:</strong> {formatNumber(channelData.totalViews)}</p>
            <p style={{ margin: 0 }}><strong>Videos:</strong> {channelData.videoCount}</p>
            <p style={{ margin: 0 }}><strong>Country:</strong> {channelData.country}</p>
            <p style={{ margin: 0 }}><strong>Subscriber Growth:</strong> {audit.subscriberGrowth}</p>
            <p style={{ margin: 0 }}><strong>Avg Views:</strong> {audit.avgViews}</p>
            <p style={{ margin: 0 }}><strong>Engagement Rate:</strong> {audit.engagementRate}</p>
            <p style={{ margin: 0 }}><strong>Posting Frequency:</strong> {audit.postingFrequency}</p>
          </div>
        </section>

        {/* Health Score */}
        <section style={{ marginBottom: "16px" }}>
          <SectionHeading num={2}>Health Score: {audit.healthScore}/100</SectionHeading>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
            <div style={{ flex: 1, backgroundColor: "#e5e7eb", height: "8px", borderRadius: "4px", overflow: "hidden" }}>
              <div style={{ height: "8px", borderRadius: "4px", backgroundColor: "#111", width: `${audit.healthScore}%` }} />
            </div>
            <span style={{ fontSize: "13px", fontWeight: 700, fontFamily: "'Inter Tight', system-ui, sans-serif" }}>{audit.healthScore}%</span>
          </div>
          <p style={{ fontSize: "10px", color: "#374151", margin: 0 }}>{audit.channelSummary}</p>
        </section>

        {/* Audit Metrics */}
        <section style={{ marginBottom: "16px", pageBreakInside: "avoid" }}>
          <SectionHeading num={3}>Detailed Audit Metrics</SectionHeading>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...headerCellStyle, textAlign: "left" }}>Metric</th>
                <th style={{ ...headerCellStyle, textAlign: "center", width: "40px" }}>Score</th>
                <th style={{ ...headerCellStyle, textAlign: "center", width: "70px" }}>Status</th>
                <th style={{ ...headerCellStyle, textAlign: "left" }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {audit.auditMetrics.map((m, i) => (
                <tr key={i} style={{ backgroundColor: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                  <td style={{ ...cellStyle, fontWeight: 500 }}>{m.label}</td>
                  <td style={{ ...cellStyle, textAlign: "center", fontWeight: 700 }}>{m.score}</td>
                  <td style={{ ...cellStyle, textAlign: "center" }}>{statusLabel[m.status] || m.status}</td>
                  <td style={cellStyle}>{m.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {audit.auditMetrics.filter(m => m.suggestions?.length).map((m, i) => (
            <div key={i} style={{ marginTop: "6px", marginLeft: "8px" }}>
              <p style={{ fontSize: "9px", fontWeight: 600, color: "#374151", margin: "0 0 2px 0" }}>{m.label} — Suggestions:</p>
              <ul style={{ margin: 0, paddingLeft: "14px", fontSize: "9px", color: "#4b5563" }}>
                {m.suggestions.map((s, j) => <li key={j} style={{ marginBottom: "1px" }}>{s}</li>)}
              </ul>
            </div>
          ))}
        </section>

        {/* Posting Time Analysis */}
        {audit.postingTimeAnalysis && (
          <section style={{ marginBottom: "16px", pageBreakInside: "avoid" }}>
            <SectionHeading num={4}>Optimal Posting Times</SectionHeading>
            <p style={{ fontSize: "10px", color: "#374151", margin: "0 0 8px 0" }}>{audit.postingTimeAnalysis.currentPattern}</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "8px" }}>
              {[
                { label: "Best Days", value: audit.postingTimeAnalysis.bestDays?.join(", ") },
                { label: "Best Times", value: audit.postingTimeAnalysis.bestTimes?.join(", ") },
                { label: "Avoid", value: audit.postingTimeAnalysis.worstTimes?.join(", ") },
              ].map((item, i) => (
                <div key={i} style={{ border: "1px solid #d1d5db", borderRadius: "4px", padding: "6px 8px" }}>
                  <p style={{ fontSize: "8.5px", fontWeight: 600, margin: "0 0 2px 0", textTransform: "uppercase", letterSpacing: "0.04em", color: "#6b7280" }}>{item.label}</p>
                  <p style={{ fontSize: "9.5px", color: "#374151", margin: 0 }}>{item.value}</p>
                </div>
              ))}
            </div>
            <p style={{ fontSize: "9px", color: "#4b5563", margin: 0 }}>{audit.postingTimeAnalysis.reasoning}</p>
            {audit.postingTimeAnalysis.nicheSpecificTips && (
              <p style={{ fontSize: "9px", color: "#374151", fontWeight: 500, margin: "4px 0 0 0" }}>{audit.postingTimeAnalysis.nicheSpecificTips}</p>
            )}
          </section>
        )}

        {/* Top Videos */}
        {topVideos.length > 0 && (
          <section style={{ marginBottom: "16px" }}>
            <SectionHeading num={5}>Top {topVideos.length} Best Performing Videos</SectionHeading>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...headerCellStyle, textAlign: "center", width: "24px" }}>#</th>
                  <th style={{ ...headerCellStyle, textAlign: "left" }}>Title</th>
                  <th style={{ ...headerCellStyle, textAlign: "right", width: "50px" }}>Views</th>
                  <th style={{ ...headerCellStyle, textAlign: "right", width: "50px" }}>Likes</th>
                  <th style={{ ...headerCellStyle, textAlign: "right", width: "55px" }}>Comments</th>
                </tr>
              </thead>
              <tbody>
                {topVideos.map((v, i) => (
                  <tr key={i} style={{ backgroundColor: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                    <td style={{ ...cellStyle, textAlign: "center", fontWeight: 600 }}>{i + 1}</td>
                    <td style={{ ...cellStyle, fontWeight: 500 }}>{v.title}</td>
                    <td style={{ ...cellStyle, textAlign: "right" }}>{formatNumber(v.viewCount)}</td>
                    <td style={{ ...cellStyle, textAlign: "right" }}>{formatNumber(v.likeCount)}</td>
                    <td style={{ ...cellStyle, textAlign: "right" }}>{formatNumber(v.commentCount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Bottom Videos */}
        {bottomVideos.length > 0 && (
          <section style={{ marginBottom: "16px" }}>
            <SectionHeading num={6}>Bottom {bottomVideos.length} Performing Videos</SectionHeading>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...headerCellStyle, textAlign: "center", width: "24px" }}>#</th>
                  <th style={{ ...headerCellStyle, textAlign: "left" }}>Title</th>
                  <th style={{ ...headerCellStyle, textAlign: "right", width: "50px" }}>Views</th>
                  <th style={{ ...headerCellStyle, textAlign: "right", width: "50px" }}>Likes</th>
                  <th style={{ ...headerCellStyle, textAlign: "right", width: "55px" }}>Comments</th>
                </tr>
              </thead>
              <tbody>
                {bottomVideos.map((v, i) => (
                  <tr key={i} style={{ backgroundColor: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                    <td style={{ ...cellStyle, textAlign: "center", fontWeight: 600 }}>{i + 1}</td>
                    <td style={{ ...cellStyle, fontWeight: 500 }}>{v.title}</td>
                    <td style={{ ...cellStyle, textAlign: "right" }}>{formatNumber(v.viewCount)}</td>
                    <td style={{ ...cellStyle, textAlign: "right" }}>{formatNumber(v.likeCount)}</td>
                    <td style={{ ...cellStyle, textAlign: "right" }}>{formatNumber(v.commentCount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Content Ideas */}
        {audit.contentIdeas?.length > 0 && (
          <section style={{ marginBottom: "16px", pageBreakBefore: "auto" }}>
            <SectionHeading num={7}>Content Ideas</SectionHeading>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...headerCellStyle, textAlign: "left" }}>Title</th>
                  <th style={{ ...headerCellStyle, textAlign: "left", width: "55px" }}>Type</th>
                  <th style={{ ...headerCellStyle, textAlign: "left", width: "55px" }}>Potential</th>
                  <th style={{ ...headerCellStyle, textAlign: "left" }}>Hook</th>
                </tr>
              </thead>
              <tbody>
                {audit.contentIdeas.map((idea, i) => (
                  <tr key={i} style={{ backgroundColor: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                    <td style={{ ...cellStyle, fontWeight: 500 }}>{idea.title}</td>
                    <td style={cellStyle}>{idea.type}</td>
                    <td style={cellStyle}>{idea.potential}</td>
                    <td style={{ ...cellStyle, color: "#4b5563" }}>{idea.hook}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Trends */}
        {audit.trendTopics?.length > 0 && (
          <section style={{ marginBottom: "16px", pageBreakInside: "avoid" }}>
            <SectionHeading num={8}>Trending Topics</SectionHeading>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...headerCellStyle, textAlign: "left" }}>Topic</th>
                  <th style={{ ...headerCellStyle, textAlign: "center", width: "55px" }}>Growth</th>
                  <th style={{ ...headerCellStyle, textAlign: "center", width: "60px" }}>Relevance</th>
                  <th style={{ ...headerCellStyle, textAlign: "center", width: "70px" }}>Timeframe</th>
                </tr>
              </thead>
              <tbody>
                {audit.trendTopics.map((t, i) => (
                  <tr key={i} style={{ backgroundColor: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                    <td style={{ ...cellStyle, fontWeight: 500 }}>{t.topic}</td>
                    <td style={{ ...cellStyle, textAlign: "center" }}>{t.growth}</td>
                    <td style={{ ...cellStyle, textAlign: "center" }}>{t.relevance}</td>
                    <td style={{ ...cellStyle, textAlign: "center" }}>{t.timeframe}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Competitors */}
        {audit.competitors?.length > 0 && (
          <section style={{ marginBottom: "16px", pageBreakInside: "avoid" }}>
            <SectionHeading num={9}>Competitor Analysis</SectionHeading>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...headerCellStyle, textAlign: "left" }}>Channel</th>
                  <th style={{ ...headerCellStyle, textAlign: "center", width: "55px" }}>Subs</th>
                  <th style={{ ...headerCellStyle, textAlign: "center", width: "60px" }}>Avg Views</th>
                  <th style={{ ...headerCellStyle, textAlign: "left" }}>Strength</th>
                  <th style={{ ...headerCellStyle, textAlign: "left" }}>Opportunity</th>
                </tr>
              </thead>
              <tbody>
                {audit.competitors.map((c, i) => (
                  <tr key={i} style={{ backgroundColor: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                    <td style={{ ...cellStyle, fontWeight: 500 }}>{c.name}</td>
                    <td style={{ ...cellStyle, textAlign: "center" }}>{c.subscribers}</td>
                    <td style={{ ...cellStyle, textAlign: "center" }}>{c.avgViews}</td>
                    <td style={cellStyle}>{c.strength}</td>
                    <td style={cellStyle}>{c.opportunity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Collaborations */}
        {audit.collaborations?.length > 0 && (
          <section style={{ marginBottom: "16px", pageBreakInside: "avoid" }}>
            <SectionHeading num={10}>Collaboration Opportunities</SectionHeading>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...headerCellStyle, textAlign: "left" }}>Creator</th>
                  <th style={{ ...headerCellStyle, textAlign: "center", width: "55px" }}>Subs</th>
                  <th style={{ ...headerCellStyle, textAlign: "left", width: "65px" }}>Niche</th>
                  <th style={{ ...headerCellStyle, textAlign: "center", width: "45px" }}>Fit</th>
                  <th style={{ ...headerCellStyle, textAlign: "left" }}>Contact</th>
                </tr>
              </thead>
              <tbody>
                {audit.collaborations.map((c, i) => (
                  <tr key={i} style={{ backgroundColor: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                    <td style={{ ...cellStyle, fontWeight: 500 }}>{c.name}</td>
                    <td style={{ ...cellStyle, textAlign: "center" }}>{c.subscribers}</td>
                    <td style={cellStyle}>{c.niche}</td>
                    <td style={{ ...cellStyle, textAlign: "center" }}>{c.compatibility}</td>
                    <td style={cellStyle}>{c.contactType}: {c.contact}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Monetization */}
        {audit.monetizationOpportunities?.length > 0 && (
          <section style={{ marginBottom: "16px", pageBreakInside: "avoid" }}>
            <SectionHeading num={11}>Monetization Opportunities</SectionHeading>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...headerCellStyle, textAlign: "left" }}>Type</th>
                  <th style={{ ...headerCellStyle, textAlign: "center", width: "55px" }}>Status</th>
                  <th style={{ ...headerCellStyle, textAlign: "center", width: "70px" }}>Est. Revenue</th>
                  <th style={{ ...headerCellStyle, textAlign: "left" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {audit.monetizationOpportunities.map((m, i) => (
                  <tr key={i} style={{ backgroundColor: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                    <td style={{ ...cellStyle, fontWeight: 500 }}>{m.type}</td>
                    <td style={{ ...cellStyle, textAlign: "center" }}>{m.readiness}</td>
                    <td style={{ ...cellStyle, textAlign: "center", fontWeight: 600 }}>{m.estimatedRevenue}</td>
                    <td style={cellStyle}>{m.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Weekly Schedule */}
        {audit.weeklySchedule?.length > 0 && (
          <section style={{ marginBottom: "16px", pageBreakInside: "avoid" }}>
            <SectionHeading num={12}>Weekly Posting Schedule</SectionHeading>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...headerCellStyle, textAlign: "left", width: "55px" }}>Day</th>
                  <th style={{ ...headerCellStyle, textAlign: "left", width: "90px" }}>Type</th>
                  <th style={{ ...headerCellStyle, textAlign: "left", width: "55px" }}>Time</th>
                  <th style={{ ...headerCellStyle, textAlign: "left", width: "70px" }}>Platform</th>
                  <th style={{ ...headerCellStyle, textAlign: "left" }}>Note</th>
                </tr>
              </thead>
              <tbody>
                {audit.weeklySchedule.map((d, i) => (
                  <tr key={i} style={{ backgroundColor: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                    <td style={{ ...cellStyle, fontWeight: 500 }}>{d.day}</td>
                    <td style={cellStyle}>{d.type}</td>
                    <td style={cellStyle}>{d.time}</td>
                    <td style={cellStyle}>{d.platform}</td>
                    <td style={{ ...cellStyle, color: "#4b5563" }}>{d.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* 30-Day Action Plan */}
        {audit.actionPlan?.length > 0 && (
          <section style={{ marginBottom: "16px", pageBreakInside: "avoid" }}>
            <SectionHeading num={13}>30-Day Action Plan</SectionHeading>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              {audit.actionPlan.map((week, i) => (
                <div key={i} style={{ border: "1px solid #d1d5db", borderRadius: "4px", padding: "8px 10px" }}>
                  <p style={{ fontSize: "10px", fontWeight: 700, margin: "0 0 4px 0", fontFamily: "'Inter Tight', system-ui, sans-serif" }}>{week.week}</p>
                  <ul style={{ margin: 0, paddingLeft: "14px", fontSize: "9px", color: "#374151" }}>
                    {week.tasks.map((task, j) => <li key={j} style={{ marginBottom: "1px" }}>{task}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Title Templates */}
        {audit.titleTemplates?.length > 0 && (
          <section style={{ marginBottom: "16px", pageBreakInside: "avoid" }}>
            <SectionHeading num={14}>Title Templates</SectionHeading>
            {audit.titleTemplates.map((t, i) => (
              <div key={i} style={{ marginBottom: "4px" }}>
                <p style={{ fontSize: "9.5px", fontWeight: 500, margin: 0 }}>{t.title}</p>
                <p style={{ fontSize: "9px", color: "#6b7280", margin: "1px 0 0 10px" }}>{t.desc}</p>
              </div>
            ))}
          </section>
        )}

        {/* Thumbnail Concepts */}
        {audit.thumbnailConcepts?.length > 0 && (
          <section style={{ marginBottom: "16px", pageBreakInside: "avoid" }}>
            <SectionHeading num={15}>Thumbnail Concepts</SectionHeading>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...headerCellStyle, textAlign: "left" }}>Style</th>
                  <th style={{ ...headerCellStyle, textAlign: "left" }}>Description</th>
                  <th style={{ ...headerCellStyle, textAlign: "center", width: "70px" }}>Expected CTR</th>
                </tr>
              </thead>
              <tbody>
                {audit.thumbnailConcepts.map((c, i) => (
                  <tr key={i} style={{ backgroundColor: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                    <td style={{ ...cellStyle, fontWeight: 500 }}>{c.style}</td>
                    <td style={cellStyle}>{c.desc}</td>
                    <td style={{ ...cellStyle, textAlign: "center" }}>{c.ctr}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Footer */}
        <div style={{ borderTop: "2px solid #111", paddingTop: "10px", marginTop: "20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <img src={resonanceLogo} alt="Resonance" style={{ width: "16px", height: "16px", objectFit: "contain" }} />
            <p style={{ fontSize: "8px", color: "#6b7280", margin: 0, fontFamily: "'Inter Tight', system-ui, sans-serif", fontWeight: 600 }}>
              Resonance — YouTube Growth, Amplified
            </p>
          </div>
          <p style={{ fontSize: "8px", color: "#9ca3af", margin: 0 }}>
            {today} · {channelData.name} · AI-Powered Analysis
          </p>
        </div>
        {/* /content layer */}
        </div>
      </div>
    </div>

  );
});

PrintableReport.displayName = "PrintableReport";

export default PrintableReport;
