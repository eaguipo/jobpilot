import { describe, expect, it } from "vitest";
import { decodeEntities, htmlToText, tidy } from "./html-text";

describe("decodeEntities", () => {
  it("decodes named, decimal and hex entities", () => {
    expect(decodeEntities("Tom &amp; Jerry&#39;s &#x2019;café&#8217; &lt;b&gt; &nbsp;&mdash;")).toBe("Tom & Jerry's ’café’ <b>  —");
  });
  it("leaves unknown or invalid entities alone", () => {
    expect(decodeEntities("&bogus; &#0; &#xD800; &#99999999;")).toBe("&bogus; &#0; &#xD800; &#99999999;");
  });
});

describe("htmlToText", () => {
  it("keeps paragraphs, headings and list items readable", () => {
    const html = "<h2>About us</h2><p>We build <strong>things</strong>.<br>Fast.</p><ul><li>TypeScript</li><li>Postgres</li></ul><p>Apply&nbsp;now</p>";
    expect(htmlToText(html)).toBe("About us\n\nWe build things.\nFast.\n\n- TypeScript\n- Postgres\n\nApply now");
  });
  it("drops scripts, styles and comments", () => {
    expect(htmlToText("<style>p{}</style><p>Hi</p><script>alert(1)</script><!-- x -->")).toBe("Hi");
  });
  it("turns escaped HTML back into tags on the first pass, text on the second (Greenhouse)", () => {
    const escaped = "&lt;p&gt;Rust &amp;amp; Go&lt;/p&gt;";
    expect(htmlToText(escaped)).toBe("<p>Rust &amp; Go</p>");
    expect(htmlToText(htmlToText(escaped))).toBe("Rust & Go");
  });
});

describe("tidy", () => {
  it("collapses spaces, trims lines and keeps one blank line at most", () => {
    expect(tidy("  a \t b \r\n\n\n\n  c  ")).toBe("a b\n\nc");
  });
});
