import { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";

import "../styles/rich-text-editor.css";

const toolbarItems = [
  {
    command: "bold",
    label: "Bold",
    icon: "B",
  },
  {
    command: "italic",
    label: "Italic",
    icon: "I",
  },
  {
    command: "underline",
    label: "Underline",
    icon: "U",
  },
  {
    command: "insertUnorderedList",
    label: "Bulleted list",
    icon: "•",
  },
  {
    command: "insertOrderedList",
    label: "Numbered list",
    icon: "1.",
  },
];

function RichTextEditor({
  name,
  label,
  value,
  error,
  required = false,
  placeholder = "",
  onChange,
}) {
  const editorRef = useRef(null);
  const [html, setHtml] = useState(value || "");

  useEffect(() => {
    setHtml(value || "");

    if (editorRef.current && editorRef.current.innerHTML !== (value || "")) {
      editorRef.current.innerHTML = value || "";
    }
  }, [value]);

  function updateValue(nextHtml) {
    setHtml(nextHtml);
    onChange?.(nextHtml);
  }

  function runCommand(command) {
    editorRef.current?.focus();

    document.execCommand(command, false);

    updateValue(editorRef.current?.innerHTML || "");
  }

  function addLink() {
    editorRef.current?.focus();

    const url = window.prompt("Enter the link URL:");

    if (!url) {
      return;
    }

    document.execCommand("createLink", false, url);

    updateValue(editorRef.current?.innerHTML || "");
  }

  function handleInput(event) {
    updateValue(event.currentTarget.innerHTML);
  }

  return (
    <div className="faqflow-editor">
      <label className="faqflow-editor__label">
        {label}

        {required ? <span aria-hidden="true"> *</span> : null}
      </label>

      <div
        className="faqflow-editor__toolbar"
        role="toolbar"
        aria-label={`${label} formatting`}
      >
        {toolbarItems.map((item) => (
          <button
            key={item.command}
            type="button"
            className={`faqflow-editor__button faqflow-editor__button--${item.command}`}
            aria-label={item.label}
            title={item.label}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => runCommand(item.command)}
          >
            {item.icon}
          </button>
        ))}

        <button
          type="button"
          className="faqflow-editor__button"
          aria-label="Add link"
          title="Add link"
          onMouseDown={(event) => event.preventDefault()}
          onClick={addLink}
        >
          Link
        </button>
      </div>

      <div
        ref={editorRef}
        className={`faqflow-editor__content ${
          error ? "faqflow-editor__content--error" : ""
        }`}
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        data-placeholder={placeholder}
        onInput={handleInput}
        dangerouslySetInnerHTML={{ __html: html }}
      />

      <input type="hidden" name={name} value={html} />

      {error ? (
        <div className="faqflow-editor__error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}

RichTextEditor.propTypes = {
  name: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  value: PropTypes.string,
  error: PropTypes.string,
  required: PropTypes.bool,
  placeholder: PropTypes.string,
  onChange: PropTypes.func,
};

RichTextEditor.defaultProps = {
  value: "",
  error: "",
  required: false,
  placeholder: "",
  onChange: undefined,
};

export default RichTextEditor;
