/* @ds-bundle: {"format":4,"namespace":"CardNews","components":[{"name":"CoverCard"},{"name":"Card"},{"name":"ThoughtCard"},{"name":"OpinionCard"},{"name":"Heading"},{"name":"BodyText"},{"name":"Conclusion"},{"name":"AuthorRow"},{"name":"Figure"},{"name":"Sticker"},{"name":"Tag"},{"name":"QuoteBox"},{"name":"Strong"}]} */
(function () {
  var React = window.React;
  var h = React.createElement;

  function cx() {
    return Array.prototype.filter.call(arguments, Boolean).join(" ");
  }

  // Inline emphasis inside a paragraph: weight 800 + ink, never a bigger size.
  function Strong(props) {
    return h("strong", { className: "cn-strong" }, props.children);
  }

  // A card heading with the mint highlighter. One per card.
  function Heading(props) {
    return h("h2", { className: cx("cn-heading", props.className) },
      h("span", { className: "cn-mark" }, props.children));
  }

  // Paragraphs. Pass `paragraphs` (strings or nodes) or <p> children.
  // A "\n" inside a string is a manual line break.
  function BodyText(props) {
    var items = props.paragraphs
      ? props.paragraphs.map(function (p, i) { return h("p", { key: i }, p); })
      : props.children;
    return h("div", { className: cx("cn-body", props.className) }, items);
  }

  function Conclusion(props) {
    return h("p", { className: "cn-conclusion" }, props.children);
  }

  function AuthorRow(props) {
    return h("div", { className: "cn-author" },
      props.avatarSrc
        ? h("img", { className: "cn-avatar", src: props.avatarSrc, alt: "" })
        : h("span", { className: "cn-avatar", "aria-hidden": "true" }),
      h("span", { className: "cn-meta" }, props.name),
      props.handle ? h("span", { className: "cn-caption cn-author-handle" }, props.handle) : null);
  }

  function Slot(props) {
    return h("div", { className: "cn-slot", style: props.style }, props.label);
  }

  // kind="capture": video/post screenshot at 900 wide, original ratio, source under it.
  // kind="hero": cover image at 900 × 675.
  function Figure(props) {
    var kind = props.kind || "capture";
    var ratio = props.ratio || (kind === "hero" ? 4 / 3 : 16 / 9);
    var slotHeight = Math.round(900 / ratio);
    var label = props.placeholder ||
      (kind === "hero" ? "대표 이미지 900 × 675" : "영상 캡처 900 × " + slotHeight);
    var img = props.src
      ? h("img", { src: props.src, alt: props.alt || "" })
      : h(Slot, { label: label, style: kind === "hero" ? null : { height: slotHeight + "px" } });
    return h("figure", { className: cx("cn-figure", kind === "hero" && "cn-figure-hero") },
      img,
      props.source ? h("figcaption", { className: "cn-caption" }, props.source) : null);
  }

  // A small portrait illustration in a body card's bottom-right corner.
  function Sticker(props) {
    var w = Math.max(190, Math.min(330, props.width || 240));
    var hgt = props.height || Math.round(w * 4 / 3);
    return h("div", { className: "cn-sticker", style: { width: w + "px", height: hgt + "px" } },
      props.src
        ? h("img", { src: props.src, alt: props.alt || "" })
        : h(Slot, { label: "일러스트\n" + w + " × " + hgt, style: { whiteSpace: "pre-line" } }));
  }

  function Tag(props) {
    return h("span", { className: "cn-tag" }, props.children || "in my opinion");
  }

  function QuoteBox(props) {
    return h("blockquote", { className: "cn-quote" },
      h("p", { className: "cn-quote-text" }, props.children),
      props.cite ? h("p", { className: "cn-caption" }, props.cite) : null);
  }

  function Frame(props) {
    return h("section", {
      className: cx("cn-card", props.className),
      "data-screen-label": props.label
    }, props.children);
  }

  // 01 표지
  function CoverCard(props) {
    return h(Frame, { className: "cn-cover", label: props.label || "01 표지" },
      h("h1", { className: "cn-cover-title" }, props.title),
      h(AuthorRow, props.author || {}),
      h("hr", { className: "cn-divider" }),
      props.figure ? h(Figure, props.figure) : null,
      props.intro ? h(BodyText, { paragraphs: [].concat(props.intro) }) : null);
  }

  // One per paragraph where the thought turns: heading, body, one-line conclusion.
  function Card(props) {
    return h(Frame, { label: props.label },
      h(Heading, null, props.heading),
      h(BodyText, { className: "cn-card-body", paragraphs: props.paragraphs }, props.children),
      props.conclusion ? h(Conclusion, null, props.conclusion) : null,
      props.sticker ? h(Sticker, props.sticker) : null);
  }

  // Optional: the essay's core question, large and centred, then one line to the reader.
  function ThoughtCard(props) {
    return h(Frame, { className: "cn-thought", label: props.label },
      h("div", { className: "cn-thought-center" },
        h("p", { className: "cn-statement" }, props.statement)),
      props.emphasis ? h("p", { className: "cn-emphasis" }, props.emphasis) : null);
  }

  // Last card: Tag, question heading, body, QuoteBox, two right-aligned closing lines.
  function OpinionCard(props) {
    return h(Frame, { className: "cn-opinion", label: props.label },
      h(Tag, null, props.tag),
      h(Heading, null, props.heading),
      h(BodyText, { className: "cn-card-body", paragraphs: props.paragraphs }),
      props.quote ? h(QuoteBox, { cite: props.quoteCite }, props.quote) : null,
      props.closing ? h("p", { className: "cn-closing" }, [].concat(props.closing).join("\n")) : null);
  }

  var api = {
    CoverCard: CoverCard, Card: Card, ThoughtCard: ThoughtCard, OpinionCard: OpinionCard,
    Heading: Heading, BodyText: BodyText, Conclusion: Conclusion, AuthorRow: AuthorRow,
    Figure: Figure, Sticker: Sticker, Tag: Tag, QuoteBox: QuoteBox, Strong: Strong
  };
  window.CardNews = Object.assign(window.CardNews || {}, api);
})();
