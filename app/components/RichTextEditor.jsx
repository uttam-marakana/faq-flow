import { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";

function normalizeHtml(value) {
  return (value || "").trim();
}

export default function RichTextEditor({
  name,
  label,
  value = "",
  error,
  placeholder = "",
}) {
  const editorRef = useRef(null);
  const initializedRef = useRef(false);
  const [html, setHtml] = useState(normalizeHtml(value));

  useEffect(() => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    const nextValue = normalizeHtml(value);

    if (!initializedRef.current) {
      editor.innerHTML = nextValue;
      initializedRef.current = true;
      setHtml(nextValue);
      return;
    }

    const currentValue = normalizeHtml(editor.innerHTML);

    if (nextValue !== currentValue) {
      editor.innerHTML = nextValue;
      setHtml(nextValue);
    }
  }, [value]);

  const syncEditor = () => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    setHtml(editor.innerHTML);
  };

  const executeCommand = (command, commandValue = null) => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    editor.focus();

    document.execCommand(command, false, commandValue);

    syncEditor();
  };

  const handleLink = () => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    editor.focus();

    const url = window.prompt("Enter URL");

    if (!url) {
      return;
    }

    document.execCommand("createLink", false, url);

    syncEditor();
  };

  const handleInput = () => {
    syncEditor();
  };

  const handlePaste = (event) => {
    event.preventDefault();

    const text = event.clipboardData?.getData("text/plain") || "";

    document.execCommand("insertText", false, text);

    syncEditor();
  };

  return (
    <div className="faqflow-editor">
      <label className="faqflow-editor__label">
        {label}
        <span aria-hidden="true"> *</span>
      </label>

      <div className="faqflow-editor__toolbar">
        <button
          type="button"
          className="faqflow-editor__button"
          onClick={() => executeCommand("bold")}
          aria-label="Bold"
          title="Bold"
        >
          B
        </button>

        <button
          type="button"
          className="faqflow-editor__button faqflow-editor__button--italic"
          onClick={() => executeCommand("italic")}
          aria-label="Italic"
          title="Italic"
        >
          I
        </button>

        <button
          type="button"
          className="faqflow-editor__button faqflow-editor__button--underline"
          onClick={() => executeCommand("underline")}
          aria-label="Underline"
          title="Underline"
        >
          U
        </button>

        <button
          type="button"
          className="faqflow-editor__button"
          onClick={() => executeCommand("insertUnorderedList")}
          aria-label="Bullet list"
          title="Bullet list"
        >
          •
        </button>

        <button
          type="button"
          className="faqflow-editor__button"
          onClick={() => executeCommand("insertOrderedList")}
          aria-label="Numbered list"
          title="Numbered list"
        >
          1.
        </button>

        <button
          type="button"
          className="faqflow-editor__button"
          onClick={handleLink}
          aria-label="Insert link"
          title="Insert link"
        >
          Link
        </button>
      </div>

      <div
        ref={editorRef}
        className={`faqflow-editor__content${
          error ? " faqflow-editor__content--error" : ""
        }`}
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        data-placeholder={placeholder}
        suppressContentEditableWarning
        onInput={handleInput}
        onPaste={handlePaste}
      />

      <input
        className="faqflow-editor__hidden-input"
        type="hidden"
        name={name}
        value={html}
      />

      {error ? <div className="faqflow-editor__error">{error}</div> : null}
    </div>
  );
}

RichTextEditor.propTypes = {
  name: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  value: PropTypes.string,
  error: PropTypes.string,
  placeholder: PropTypes.string,
};
