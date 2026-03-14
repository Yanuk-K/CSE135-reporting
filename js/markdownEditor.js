window.Dashboard = window.Dashboard || {};

Dashboard.commentEditors = Dashboard.commentEditors || new Map();

Dashboard.destroyCommentEditors = function () {
  Dashboard.commentEditors.forEach((editor) => {
    if (editor && typeof editor.toTextArea === "function") {
      editor.toTextArea();
    }
  });
  Dashboard.commentEditors.clear();
};

Dashboard.initCommentEditors = function () {
  if (typeof EasyMDE === "undefined") return;
  if (!Dashboard.canEditComments || !Dashboard.canEditComments()) return;

  const inputs = document.querySelectorAll("textarea.analyst-comment-input");
  inputs.forEach((input) => {
    if (!input.id || Dashboard.commentEditors.has(input.id)) return;
    const editor = new EasyMDE({
      element: input,
      spellChecker: false,
      status: false,
      minHeight: "120px",
      toolbar: [
        "bold",
        "italic",
        "heading",
        "|",
        "quote",
        "unordered-list",
        "ordered-list",
        "|",
        "link",
        "preview",
        "guide",
      ],
    });
    Dashboard.commentEditors.set(input.id, editor);
  });
};

Dashboard.getCommentValue = function (element) {
  if (!element) return "";
  if (element.id && Dashboard.commentEditors.has(element.id)) {
    return Dashboard.commentEditors.get(element.id).value().trim();
  }
  if (element.tagName === "TEXTAREA") {
    return element.value.trim();
  }
  return String(element.textContent || "").trim();
};

Dashboard.renderMarkdown = function (text) {
  const raw = String(text || "");
  if (!raw.trim()) return "";
  if (typeof marked === "undefined" || typeof DOMPurify === "undefined") {
    const div = document.createElement("div");
    div.textContent = raw;
    return div.innerHTML;
  }
  return DOMPurify.sanitize(marked.parse(raw));
};
