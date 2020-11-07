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
from typing import Any, List
from recommonmark.transform import AutoStructify

TS_DOC_COMMAND = ["npm", "run", "doc", "--"]

ON_RTD = os.environ.get('READTHEDOCS') == 'True'
SKIP_TYPEDOC = ON_RTD or os.environ.get('SKIP_TYPEDOC') == 'True'


# -- Recommonmark Monkey patch -----------------------------------------------

# https://github.com/rtfd/recommonmark/issues/93#issuecomment-433371240
from functools import wraps

# -- sphinx-js Monkey patch --------------------------------------------------

import os
from pathlib import Path
import sphinx_js
from sphinx_js.typedoc import Analyzer, index_by_id, SuffixTree
from sphinx_js.analyzer_utils import Command
from sphinx_js import ir
import subprocess
from errno import ENOENT
from json import dumps, load, dump
from sphinx.errors import SphinxError
from typing import List


class CustomAnalyzer(Analyzer):

    def __init__(self, base_dir, json, **kwargs) -> None:
        """
        :arg json: The loaded JSON output from typedoc
        :arg base_dir: The absolute path of the dir relative to which to
            construct file-path segments of object paths
        """
        super().__init__(base_dir=base_dir, json=json, **kwargs)

    @classmethod
    def from_disk(cls, abs_source_paths: List[str], app, base_dir: str):
        assert len(abs_source_paths) == 1, "only one project in this repository"
        doc_folder = Path(app.confdir)
        ts_project_folder = Path(abs_source_paths[0])

        json = CustomAnalyzer._load_typedoc_output(ts_project_folder, doc_folder, app.config.jsdoc_config_path)
        return cls(base_dir=base_dir, json=json)

    @staticmethod
    def _load_typedoc_output(abs_source_path: Path, sphinx_conf_dir: Path, jsdoc_config_path):
        command = Command(TS_DOC_COMMAND[0])
        if len(TS_DOC_COMMAND) > 1:
            command.add(*TS_DOC_COMMAND[1:])
        if jsdoc_config_path:
            command.add('--tsconfig', jsdoc_config_path)

        json_path = sphinx_conf_dir / Path('typedoc.json')

        command.add('--json', str(json_path), str(abs_source_path))

        if not SKIP_TYPEDOC:
            try:
                subprocess.call(command.make())
            except OSError as exc:
                if exc.errno == ENOENT:
                    raise SphinxError('%s was not found. Install it using "npm install -g typedoc".' % command.program)
                else:
                    raise

            def sanitize_typedoc_json(typedoc):
                """Make all paths relative to not leak path info to github."""
                if not isinstance(typedoc, dict):
                    return
                for key in typedoc:
                    if isinstance(typedoc[key], dict):
                        sanitize_typedoc_json(typedoc[key])
                    if isinstance(typedoc[key], list):
                        for entry in typedoc[key]:
                            sanitize_typedoc_json(entry)
                    if key == 'originalName':
                        filepath = typedoc[key]
                        if filepath:
                            p = Path(filepath)
                            typedoc[key] = str(p.relative_to(abs_source_path))
            sanitized_doc = {}
            with json_path.open() as typedoc_json:
                typedoc = load(typedoc_json)
                sanitize_typedoc_json(typedoc)
                sanitized_doc = typedoc
            with json_path.open(mode='w') as typedoc_json:
                dump(sanitized_doc, typedoc_json)


        with json_path.open() as typedoc:
            # typedoc emits a valid JSON file even if it finds no TS files in the dir:
            return load(typedoc)


    def _type_name(self, type):
        """Return a string description of a type.

        :arg type: A TypeDoc-emitted type node

        """
        type_of_type = type.get('type')

        if type_of_type == 'reflection':
            declaration = type.get('declaration', {})
            if declaration.get('signatures'):
                names = []
                for signature in declaration.get('signatures'):
                    name = '(' + ', '.join(
                        p.get('name') + ': ' + self._type_name(p.get('type'))
                        for p in signature.get('parameters', [])
                        if p.get('type')
                    ) + ') => ' + self._type_name(signature.get('type'))
                    names.append(name)
                return ' '.join(names)
            elif declaration.get('children'):
                variables = ', '.join(
                    v.get('name') + ': ' + self._type_name(v.get('type'))
                    for v in declaration.get('children')
                    if v.get('type')
                )
                names = []
                if declaration.get('indexSignature'):
                    extras = [variables]
                    for sig in declaration.get('indexSignature'):
                        inner_text = ''
                        if sig.get('parameters'):
                            p = sig.get('parameters')[0]
                            inner_text += p.get('name') + ': ' + self._type_name(p.get('type'))
                        extras.append('[' + inner_text + ']: ' + self._type_name(sig.get('type')))
                    names.append('{' + ', '.join(extras) + '}')
                else:
                    names.append('{' + variables + '}')
                return ''.join(names)
        elif type_of_type == 'typeParameter':
            names = [type.get('name')]
            constraint_type = type.get('constraint').get('type')
            if constraint_type == 'union' or constraint_type == 'reference':
                names.append("extends")
                names.append(self._type_name(type.get('constraint')))
            else:
                print('Encountered unknown constraint type for typeParameter', constraint_type)
            return ' '.join(names)
        return super()._type_name(type)

sphinx_js.TsAnalyzer = CustomAnalyzer

# fix jsrenderer for fields

from sphinx_js.renderers import JsRenderer

old_fields = JsRenderer._fields

def new_fields(self, obj):
    for heads, tail in old_fields(self, obj):
        # also escape spaces in head as typescript types can have spaces...
        yield [h.replace(' ', r'\ ') for h in heads], tail

JsRenderer._fields = new_fields

# -- Load information from config --------------------------------------------

from tomlkit import loads as toml_load

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

with package_path.open() as package:
    package_json = load(package)


doc_package_config = pyproject_toml["tool"]["poetry"]
sphinx_config = pyproject_toml["tool"].get("sphinx", {})

# -- Project information -----------------------------------------------------

project = 'MICO Grapheditor Documentation'
project_urlsafe = 'MICOGrapheditorDocumentation'
author = package_json.get("author", ", ".join(doc_package_config.get("authors", 'MICO Authors')))
copyright_year = sphinx_config.get("copyright-year", 2020)
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
    'recommonmark',
    'sphinx_js',
]

# Add any paths that contain templates here, relative to this directory.
templates_path = []

# Setup markdown parser:
source_suffix = {
    '.rst': 'restructuredtext',
    '.md': 'markdown',
}

# The master toctree document.
master_doc = 'index'

changelog = Path('../CHANGELOG.md')

# The language for content autogenerated by Sphinx. Refer to documentation
# for a list of supported languages.
#
# This is also used if you do content translation via gettext catalogs.
# Usually you set "language" from the command line for these cases.
language = None

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
if ON_RTD:
    html_theme = 'default'
else:
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
    app.add_config_value('recommonmark_config', {
        'auto_toc_tree': True,
        'enable_eval_rst': True,
        'enable_math': True,
        'enable_inline_math': True,
    }, True)
    app.add_config_value('on_rtd', ON_RTD, 'env')
    app.add_transform(AutoStructify)

# -- Options for jsdoc -------------------------------------------------------
js_language = 'typescript'
root_for_relative_js_paths = '.'
js_source_path = '../.'

# -- Copy changelog ----------------------------------------------------------
copyfile(changelog, Path('./changelog.md'))
