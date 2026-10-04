/**
 * Above-the-fold critical CSS, inlined into <head> so first paint never waits
 * on the async main stylesheet (see src/routes/__root.tsx). Keep this tiny and
 * limited to design tokens + shell/hero primitives; everything else ships in
 * styles.css, which is loaded non-blocking.
 */
export const CRITICAL_CSS = `
:root{--background:222 47% 6%;--foreground:0 0% 98%;--card:222 47% 9%;--primary:295 90% 60%;--primary-foreground:0 0% 100%;--primary-glow:325 90% 65%;--secondary:222 30% 14%;--muted:222 30% 14%;--muted-foreground:0 0% 70%;--accent:0 84% 60%;--accent-foreground:0 0% 100%;--border:222 30% 16%;--ring:295 90% 60%;--radius:0.75rem;--glass:222 47% 9%;--glass-border:222 30% 20%;--resonance-cyan:190 90% 60%;--resonance-violet:265 85% 65%;--resonance-magenta:295 90% 60%;--glow-primary:295 90% 60%;--font-display:"Inter Tight",system-ui,sans-serif;--font-body:"Inter",system-ui,sans-serif;--font-accent:"Instrument Serif","Times New Roman",serif;--font-mono:"JetBrains Mono",ui-monospace,monospace}
*,::before,::after{box-sizing:border-box;border:0 solid hsl(var(--border))}
html{-webkit-text-size-adjust:100%;line-height:1.5;font-family:var(--font-body)}
body{margin:0;min-height:100vh;background-color:hsl(var(--background));color:hsl(var(--foreground));-webkit-font-smoothing:antialiased;font-family:var(--font-body)}
h1,h2,h3,h4,h5,h6{font-family:var(--font-display);letter-spacing:-.02em;margin:0}
p{margin:0}
img,svg,video{display:block;max-width:100%;height:auto}
a{color:inherit;text-decoration:inherit}
button{font:inherit;color:inherit;background:0 0;cursor:pointer}
.label-mono{font-family:var(--font-mono);text-transform:uppercase;letter-spacing:.2em;font-size:.625rem;font-weight:600}
.accent-italic{font-family:var(--font-accent);font-style:italic;font-weight:400}
.glass-card{background-color:hsl(var(--card)/.7);backdrop-filter:blur(24px);border:1px solid hsl(var(--glass-border));border-radius:.75rem}
.gradient-text{background:linear-gradient(135deg,hsl(var(--primary)),hsl(var(--accent)));-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.gradient-primary{background:linear-gradient(135deg,hsl(var(--primary)),hsl(var(--accent)))}
.container{width:100%;margin-inline:auto;padding-inline:2rem}
@media(min-width:640px){.container{max-width:640px}}
@media(min-width:768px){.container{max-width:768px}}
@media(min-width:1024px){.container{max-width:1024px}}
@media(min-width:1280px){.container{max-width:1280px}}
@media(min-width:1536px){.container{max-width:1400px}}
`.trim();

/**
 * Flips the async stylesheets (rendered with media="print") to media="all"
 * as soon as they finish downloading, so they never block first paint.
 */
export const ASYNC_CSS_SWAP = `
(function(){function s(l){if(l.media!=="all"){l.media="all"}}function r(){var n=document.querySelectorAll('link[data-async-css="true"]');for(var i=0;i<n.length;i++){var l=n[i];if(l.sheet){s(l)}else{l.addEventListener("load",function(){s(this)},{once:true});l.addEventListener("error",function(){s(this)},{once:true})}}}r();if(document.readyState!=="complete"){window.addEventListener("DOMContentLoaded",r);window.addEventListener("load",r)}})();
`.trim();
