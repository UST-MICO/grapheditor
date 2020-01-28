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
from recommonmark.transform import AutoStructify

on_rtd = os.environ.get('READTHEDOCS') == 'True'
skip_typedoc = os.environ.get('SKIP_TYPEDOC') == 'True'

# -- Recommonmark Monkey patch -----------------------------------------------

# https://github.com/rtfd/recommonmark/issues/93#issuecomment-433371240
from functools import wraps

# -- sphinx-js Monkey patch --------------------------------------------------
from sphinx_js import doclets
from sphinx_js.typedoc import TypeDoc
from tempfile import NamedTemporaryFile
import subprocess
from shutil import copyfile
from os.path import relpath, join
from sphinx.errors import SphinxError
from errno import ENOENT
from json import load, dump
from pathlib import Path

# analyzer that makes sure the typescript doc json only contains relative paths
def analyze_typescript(abs_source_paths, app):
    command = doclets.Command('npm')
    command.add('run', 'doc', '--')
    if app.config.jsdoc_config_path:
        command.add('--tsconfig', app.config.jsdoc_config_path)

    json_path = './docs/typedoc.json'

    source = abs_source_paths[0]
    command.add('--json', json_path, *abs_source_paths)
    if not on_rtd and not skip_typedoc:
        # only build typedoc json locally as readthedocs build container does not
        # support it natively (and typedoc process takes a while to finish)
        try:
            subprocess.call(command.make(), cwd=source)
            with open('typedoc.json') as typedoc_json:
                typedoc = load(typedoc_json)

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
                            typedoc[key] = relpath(filepath)
            sanitize_typedoc_json(typedoc)
            with open('typedoc.json', mode='w') as typedoc_json:
                dump(typedoc, typedoc_json)
        except OSError as exc:
            if exc.errno == ENOENT:
                print(exc)
                raise SphinxError('%s was not found. Install it using "npm install -g typedoc".' % command.program)
            else:
                raise
            # typedoc emits a valid JSON file even if it finds no TS files in the dir:
    with open('typedoc.json') as temp:
        return doclets.parse_typedoc(temp)


doclets.ANALYZERS['custom_typescript'] = analyze_typescript


# fix relative path resolution
def new_relpath(path, basedir):
    if Path(path).drive != Path(basedir).drive:
        return path
    return relpath(path, basedir)

doclets.relpath = new_relpath

# fix type name resolution:
old_make_type_name = TypeDoc.make_type_name


def new_make_type_name(self, type):
    if type.get('type') == 'reflection':
        declaration = type.get('declaration', {})
        if declaration.get('signatures'):
            names = []
            for signature in declaration.get('signatures'):
                name = '(' + ', '.join(
                    p.get('name') + ': ' + '|'.join(new_make_type_name(self, p.get('type')))
                    for p in signature.get('parameters', [])
                    if p.get('type')
                ) + ') => ' + '|'.join(new_make_type_name(self, signature.get('type')))
                names.append(name)
            return names
        elif declaration.get('children'):
            variables = ', '.join(
                v.get('name') + ': ' + '|'.join(new_make_type_name(self, v.get('type')))
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
                        inner_text += p.get('name') + ': ' + '|'.join(new_make_type_name(self, p.get('type')))
                    extras.append('[' + inner_text + ']: ' + '|'.join(new_make_type_name(self, sig.get('type'))))
                names.append('{' + ', '.join(extras) + '}')
            else:
                names.append('{' + variables + '}')
            return names
    elif type.get('type') == 'typeParameter':
        names = old_make_type_name(self, type)
        constraint_type = type.get('constraint').get('type')
        if constraint_type == 'union' or constraint_type == 'reference':
            names[-1] = '|'.join(names[-1])
        else:
            print('Encountered unknown constraint type for typeParameter', constraint_type)
        return names
    return old_make_type_name(self, type)


TypeDoc.make_type_name = new_make_type_name

# -- Project information -----------------------------------------------------

project = 'MICO Grapheditor Documentation'
copyright = '2018, MICO Authors'
author = 'MICO Authors'

# The short X.Y version
version = '0.3.1'
# The full version, including alpha/beta/rc tags
release = '0.3.1'


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
if on_rtd:
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
htmlhelp_basename = 'MICOGrapheditorDocumentationdoc'


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
    (master_doc, 'MICOGrapheditorDocumentation.tex', 'MICO Grapheditor Documentation',
     'MICO Authors', 'manual'),
]


# -- Options for manual page output ------------------------------------------

# One entry per manual page. List of tuples
# (source start file, name, description, authors, manual section).
man_pages = [
    (master_doc, 'micographeditordocumentation', 'MICO Grapheditor Documentation',
     [author], 1)
]


# -- Options for Texinfo output ----------------------------------------------

# Grouping the document tree into Texinfo files. List of tuples
# (source start file, target name, title, author,
#  dir menu entry, description, category)
texinfo_documents = [
    (master_doc, 'MICOGrapheditorDocumentation', 'MICO Grapheditor Documentation',
     author, 'MICOGrapheditorDocumentation', 'One line description of project.',
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
todo_include_todos = not on_rtd
todo_emit_warnings = not on_rtd

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
    app.add_config_value('on_rtd', on_rtd, 'env')
    app.add_transform(AutoStructify)

# -- Options for jsdoc -------------------------------------------------------
js_language = 'custom_typescript'
root_for_relative_js_paths = '.'
js_source_path = '../.'

# -- Copy changelog ----------------------------------------------------------
copyfile(changelog, Path('./changelog.md'))
