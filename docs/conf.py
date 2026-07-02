# -*- coding: utf-8 -*-
#
# Configuration file for the Sphinx documentation builder.
#
# This file does only contain a selection of the most common options. For a
# full list see the documentation:
# http://www.sphinx-doc.org/en/master/config

# -- Path setup --------------------------------------------------------------

# If extensions (or modules to document with autodoc) are in another directory,
# add these directories to sys.path here. If the directory is relative to the
# documentation root, use os.path.abspath to make it absolute, like shown here.
#
# import os
# import sys
# sys.path.insert(0, os.path.abspath('.'))
import os
from pathlib import Path
from shutil import copyfile
from typing import Any, Sequence

ON_RTD = os.environ.get('READTHEDOCS') == 'True'
SKIP_TYPEDOC = ON_RTD or os.environ.get('SKIP_TYPEDOC') == 'True'

PROJECT_PATH = Path(__file__).parent.parent
PROJECT_PATH_STR = str(PROJECT_PATH)

# -- sphinx-js Monkey patch --------------------------------------------------

import os  # noqa: E402
from pathlib import Path  # noqa: E402
from sphinx.util import rst  # noqa: E402
import sphinx_js  # noqa: E402
from sphinx_js import typedoc, renderers  # noqa: E402
from sphinx_js.typedoc import typedoc_output  # noqa: E402
from sphinx_js.analyzer_utils import Command  # noqa: E402
from sphinx_js import ir  # noqa: E402
import subprocess  # noqa: E402
from errno import ENOENT  # noqa: E402
from json import dumps, loads as json_loads  # noqa: E402
from sphinx.errors import SphinxError  # noqa: E402

TYPE_LINK_REPLACERS = {
    'module': ':js:mod:`~{}`',
    'function': ':js:func:`~{}`',
    'method': ':js:meth:`~{}`',
    'class': ':js:class:`~{}`',
    'interface': ':js:class:`~{}`',
    'enumeration': ':js:class:`~{}`',
    'attribute': ':js:attr:`~{}`',
    'property': ':js:attr:`~{}`',
    'accessor': ':js:meth:`~{}`',
}


def patch_javascript():
    js_path = Path(sphinx_js.__path__[0]) / "js" / "convertTopLevel.ts"
    PATCH_START = "// START MONKEYPATCH xdaCb1up"
    PATCH_END = "// END MONKEYPATCH"
    CURRENT_PATCH_VERSION = "2"

    text_content = js_path.read_text(encoding="utf-8").splitlines(keepends=True)

    patch_start_line = None
    patch_end_line = None
    for i, line in enumerate(text_content):
        if patch_start_line is None and line.lstrip().startswith(PATCH_START):
            patch_start_line = i
        if patch_end_line is None and line.lstrip().startswith(PATCH_END):
            patch_end_line = i
    if patch_start_line is not None and patch_end_line is not None and patch_start_line > patch_end_line:
        raise ValueError("Cannot apply patch to a malformed patched file!")
    if patch_start_line is not None and patch_end_line is None:
        raise ValueError("Cannot apply patch to a malformed patched file, missing patch end indicator!")

    CURRENT_PATCH_START = f"{PATCH_START} ({CURRENT_PATCH_VERSION})"
    if patch_start_line and text_content[patch_start_line].lstrip().startswith(CURRENT_PATCH_START):
        return  # patch already applied

    if patch_start_line is None:
        is_in_function = 0
        for i, line in enumerate(text_content):
            if line.startswith("function renderCommentContent("):
                is_in_function = True
            if is_in_function and line.startswith("}"):
                break  # no longer in the correct function
            if is_in_function and line.startswith('    throw new Error("Not implemented'):
                # in the case where the patch is not yet applied, start and end index
                # overlap for the rest of the logic to work the same in all cases
                patch_start_line = i
                patch_end_line = i - 1

    assert patch_start_line is not None
    assert patch_end_line is not None

    patched_content = []
    patched_content.extend(text_content[:patch_start_line])
    patched_content += f"    {CURRENT_PATCH_START}\n"
    patched_content.extend([
        '    if (x.kind === "inline-tag" && x.tag === "@link") {\n',
        '      return { type: "text", text: `{@link ${x.text}}` };\n'
        '    }\n'
    ])
    patched_content += f"    {PATCH_END}\n"
    patched_content.extend(text_content[patch_end_line+1:])

    js_path.write_text("".join(patched_content), encoding="utf-8")


# apply javascript patch
patch_javascript()


old_typedoc_output = typedoc_output


def _sanitize_data_recursive(data, parent_key: str|None = None):
    if isinstance(data, dict):
        sanitized = {
            k: _sanitize_data_recursive(v, k) for k, v in data.items()
        }
        # Fix sphinx_js not being able to properly map default export of grapheditor
        # to its original name
        match sanitized:
            case {"deppath": "grapheditor", "kind": "class", "constructor_": _, "name": "default"}:
                sanitized["name"] = "GraphEditor"
                if sanitized["path"][-1] == "default":
                    sanitized["path"][-1] = "GraphEditor"
                return sanitized
        return sanitized
    if isinstance(data, list):
        if parent_key in ("path", "exported_from"):
            new_path = [_sanitize_data_recursive(v) for v in data]
            if len(new_path) > 2 and new_path[0] == "./" and new_path[1] == "docs/" and new_path[2] == "src/":
                new_path = new_path[3:]
            elif len(new_path) > 1 and new_path[0] == "./" and new_path[1] == "src/":
                new_path = new_path[2:]
            if len(new_path) == 2 and new_path[0] == "grapheditor." and new_path[1] == "default":
                return ["grapheditor.", "GraphEditor"]
            return new_path
        return [_sanitize_data_recursive(v) for v in data]
    if isinstance(data, str):
        if data.startswith(PROJECT_PATH_STR):
            return str(Path(data).relative_to(PROJECT_PATH))
        if data.startswith("./docs/src/"):
            return data.removeprefix("./docs/src/")
        if data.startswith("/home/fabian"):
            raise ValueError(data.startswith(PROJECT_PATH_STR), data)
    return data


def sanitize_json(json_path: Path):
    data = json_loads(json_path.read_text())
    sanitized = _sanitize_data_recursive(data)
    sanitized_text = dumps(sanitized, indent=4)
    if "/home/fabian" in sanitized_text:
        raise ValueError("FAILED")
    json_path.write_text(dumps(sanitized, indent=4))


NAME_TO_KIND = {}


def _typedoc_output(
    abs_source_paths: Sequence[str],
    base_dir: str,
    sphinx_conf_dir: str | Path,
    typedoc_config_path: str | None,
    tsconfig_path: str | None,
    ts_sphinx_js_config: str | None,
) -> tuple[list[ir.TopLevelUnion], dict[str, Any]]:
    if len(abs_source_paths) != 1:
        raise ValueError("Monkeypatch does not work with multiple sources!")
    json_path = Path(sphinx_conf_dir) / "typedoc_output.json"
    TYPEDOC_NODE_MODULES = str(Path('../node_modules').resolve())

    if not SKIP_TYPEDOC:
        env = os.environ.copy()
        env["TYPEDOC_NODE_MODULES"] = TYPEDOC_NODE_MODULES
        command = Command("npx")
        command.add("tsx@4.15.8")
        dir_ = Path(sphinx_js.__path__[0]) / "js"
        command.add("--tsconfig", str(dir_ / "tsconfig.json"))
        command.add("--import", str(dir_ / "registerImportHook.mjs"))
        command.add(str(dir_ / "main.ts"))
        if ts_sphinx_js_config:
            command.add("--sphinxJsConfig", ts_sphinx_js_config)
        command.add("--entryPointStrategy", "expand")

        # hardcoded typedoc config path
        typedoc_config_path = str(
            (Path(sphinx_conf_dir).parent / "typedoc.json").resolve()
        )
        command.add("--options", typedoc_config_path)

        # hardcoded tsconfig path
        tsconfig_path = str(
            (Path(sphinx_conf_dir).parent / "tsconfig.json").resolve()
        )
        command.add("--tsconfig", tsconfig_path)

        command.add("--basePath", base_dir)
        command.add("--excludePrivate", "false")

        # hardcoded output path
        command.add("--json", str(json_path), *abs_source_paths)
        try:
            subprocess.run(command.make(), check=True, env=env)
        except OSError as exc:
            if exc.errno == ENOENT:
                raise SphinxError(
                    f'{command.program} was not found. Install it using "npm install".'
                )
            else:
                raise
        old_typedoc_output(abs_source_paths, base_dir, sphinx_conf_dir, typedoc_config_path, tsconfig_path, ts_sphinx_js_config)

        sanitize_json(json_path)

    typedoc_json = json_path.read_text()
    json_ir, extra_data = json_loads(typedoc_json)

    not_unique = set()

    def extract_names(json_data):
        for entry in json_data:
            if not isinstance(entry, dict):
                continue
            if "path" not in entry and "kind" not in entry:
                continue
            path = entry["path"]
            kind = entry["kind"]
            if kind == "typeAlias":
                continue  # Ignore type aliases
            if NAME_TO_KIND.get(("".join(path)).replace("#", "."), None) == kind:
                continue  # already pocessed this entry
            for i in range(len(path), 0, -1):
                key = ("".join(path[-i:])).replace("#", ".")
                if key in NAME_TO_KIND:
                    not_unique.add(key)
                else:
                    NAME_TO_KIND[key] = kind
            if "members" in entry:
                extract_names(entry["members"])

    extract_names(json_ir)

    for key in not_unique:
        del NAME_TO_KIND[key]

    return ir.json_to_ir(json_ir), extra_data


typedoc.typedoc_output = _typedoc_output

old_render_description = renderers.render_description


def _render_description(description: ir.Description):
    if isinstance(description, str):
        return old_render_description(description)

    description_items = []

    for item in description:
        if item.type == "text" and item.text.startswith("{@link ") and item.text.endswith("}"):
            link_target: str = item.text[7:-1].strip()

            new_item: ir.DescriptionText

            if link_target in NAME_TO_KIND:
                new_item = ir.DescriptionText(
                    TYPE_LINK_REPLACERS[NAME_TO_KIND[link_target]].format(link_target)
                )
            else:
                new_item = ir.DescriptionText(f"``{link_target}``")

            description_items.append(new_item)
            continue
        if item.type == "code" and item.code.startswith("`") and item.code.endswith("`"):
            link_target: str = item.code[1:-1].strip()
            if "`" in link_target:
                description_items.append(item)
                continue

            if link_target in NAME_TO_KIND:
                new_item = ir.DescriptionText(
                    TYPE_LINK_REPLACERS[NAME_TO_KIND[link_target]].format(link_target)
                )
                description_items.append(new_item)
                continue

        description_items.append(item)

    return old_render_description(description_items)


renderers.render_description = _render_description


def ts_type_xref_formatter(config, xref: ir.TypeXRef):
    if isinstance(xref, ir.TypeXRefInternal):
        name = xref.name
        kind = xref.kind
        if kind is None:
            kind = NAME_TO_KIND.get(name, None)
        if kind is None:
            name = "".join(xref.path)
            kind = NAME_TO_KIND.get(name, None)
        if kind is None:
            return f"``{rst.escape(xref.name)}``"
        return f":js:{kind}:`{rst.escape(name)}`"
    else:
        # Otherwise, don't insert a xref
        return f"``{rst.escape(xref.name)}``"

# -- Load information from config --------------------------------------------

from tomli import loads as toml_load  # noqa: E402

current_path = Path(".").absolute()

project_root: Path
pyproject_path: Path
package_path: Path

if current_path.name == "docs":
    project_root = current_path.parent
    pyproject_path = current_path / Path("pyproject.toml")
    package_path = current_path / Path("../package.json")
else:
    project_root = current_path
    pyproject_path = current_path / Path("docs/pyproject.toml")
    package_path = current_path / Path("package.json")

pyproject_toml: Any

with pyproject_path.open() as pyproject:
    content = '\n'.join(pyproject.readlines())
    pyproject_toml = toml_load(content)

package_json: Any

package_json = json_loads(package_path.read_text())


doc_package_config = pyproject_toml["tool"]["poetry"]
sphinx_config = pyproject_toml["tool"].get("sphinx", {})

# -- Project information -----------------------------------------------------

project = 'MICO Grapheditor Documentation'
project_urlsafe = 'MICOGrapheditorDocumentation'
author = package_json.get("author", ", ".join(doc_package_config.get("authors", 'Fabian Bühler')))
copyright_year = sphinx_config.get("copyright-year", 2021)
copyright = '{year}, {authors}'.format(year=copyright_year, authors=author)

# The short X.Y version
version = package_json.get("version", doc_package_config.get("version"))
# The full version, including alpha/beta/rc tags
release = sphinx_config.get("release", version)


# -- General configuration ---------------------------------------------------

# If your documentation needs a minimal Sphinx version, state it here.
#
# needs_sphinx = '1.0'

# Add any Sphinx extension module names here, as strings. They can be
# extensions coming with Sphinx (named 'sphinx.ext.*') or your custom
# ones.
extensions = [
    'sphinx.ext.intersphinx',
    'sphinx.ext.ifconfig',
    'sphinx.ext.autosectionlabel',
    'sphinx.ext.todo',
    'sphinx.ext.imgmath',
    'sphinx.ext.graphviz',
    "myst_parser",
    'sphinx_js',
]

# Add any paths that contain templates here, relative to this directory.
templates_path = []

# Setup markdown parser:
source_suffix = {
    '.rst': 'restructuredtext',
    '.md': 'markdown',
}

# myst markdown parsing
myst_heading_anchors = 2
myst_enable_extensions = [
    "colon_fence",
    "deflist",
    "dollarmath",
    "html_admonition",
    "html_image",
    "replacements",
    "smartquotes",
    "tasklist",
]

# The master toctree document.
master_doc = 'index'

changelog = Path('../CHANGELOG.md')

# The language for content autogenerated by Sphinx. Refer to documentation
# for a list of supported languages.
#
# This is also used if you do content translation via gettext catalogs.
# Usually you set "language" from the command line for these cases.
language = "en"

# List of patterns, relative to source directory, that match files and
# directories to ignore when looking for source files.
# This pattern also affects html_static_path and html_extra_path .
exclude_patterns = ['_build', 'Thumbs.db', '.DS_Store', 'README.md']

# The name of the Pygments (syntax highlighting) style to use.
pygments_style = 'sphinx'


# -- Options for HTML output -------------------------------------------------

# The theme to use for HTML and HTML Help pages.  See the documentation for
# a list of builtin themes.
#
html_theme = 'sphinx_rtd_theme'

# Theme options are theme-specific and customize the look and feel of a theme
# further.  For a list of options available for each theme, see the
# documentation.
#
# html_theme_options = {}

# Add any paths that contain custom static files (such as style sheets) here,
# relative to this directory. They are copied after the builtin static files,
# so a file named "default.css" will overwrite the builtin "default.css".
html_static_path = []

# Custom sidebar templates, must be a dictionary that maps document names
# to template names.
#
# The default sidebars (for documents that don't match any pattern) are
# defined by theme itself.  Builtin themes are using these templates by
# default: ``['localtoc.html', 'relations.html', 'sourcelink.html',
# 'searchbox.html']``.
#
# html_sidebars = {}


# -- Options for HTMLHelp output ---------------------------------------------

# Output file base name for HTML help builder.
htmlhelp_basename = project_urlsafe


# -- Options for LaTeX output ------------------------------------------------

latex_elements = {
    # The paper size ('letterpaper' or 'a4paper').
    #
    # 'papersize': 'letterpaper',

    # The font size ('10pt', '11pt' or '12pt').
    #
    # 'pointsize': '10pt',

    # Additional stuff for the LaTeX preamble.
    #
    # 'preamble': '',

    # Latex figure (float) alignment
    #
    # 'figure_align': 'htbp',
}

# Grouping the document tree into LaTeX files. List of tuples
# (source start file, target name, title,
#  author, documentclass [howto, manual, or own class]).
latex_documents = [
    (master_doc, '{}.tex'.format(project_urlsafe), project,
     author, 'manual'),
]


# -- Options for manual page output ------------------------------------------

# One entry per manual page. List of tuples
# (source start file, name, description, authors, manual section).
man_pages = [
    (master_doc, project_urlsafe.lower(), project,
     [author], 1)
]


# -- Options for Texinfo output ----------------------------------------------

# Grouping the document tree into Texinfo files. List of tuples
# (source start file, target name, title, author,
#  dir menu entry, description, category)
texinfo_documents = [
    (master_doc, project_urlsafe, project,
     author, project_urlsafe, package_json.get("description", ""),
     'Miscellaneous'),
]


# -- Extension configuration -------------------------------------------------

# -- Options for intersphinx extension ---------------------------------------

# Example configuration for intersphinx: refer to the Python standard library.
intersphinx_mapping = {
    'python': ('https://docs.python.org/3/', None),
}

# -- Options for todo extension ----------------------------------------------

# If true, `todo` and `todoList` produce output, else they produce nothing.
todo_include_todos = not ON_RTD
todo_emit_warnings = not ON_RTD

# -- Options for recommonmark ------------------------------------------------
autosectionlabel_prefix_document = True


# app setup hook
def setup(app):
    app.add_config_value('on_rtd', ON_RTD, 'env')


# -- Options for jsdoc -------------------------------------------------------
js_language = 'typescript'
root_for_relative_js_paths = str(Path('..').resolve().absolute())
js_source_path = str(Path('..').resolve().absolute())

# -- Copy changelog ----------------------------------------------------------
copyfile(changelog, Path('./changelog.md'))
