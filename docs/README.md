# Grapheditor Documentation


## Useful links:

 *  [Sphinx](http://www.sphinx-doc.org/en/master/)

    Sphinx is a tool to compile ReStructuredText documentation into a variety of formats.
 *  [ReStructuredText](http://www.sphinx-doc.org/en/master/usage/restructuredtext/basics.html)
 *  [Getting started (readthedocs)](https://docs.readthedocs.io/en/latest/intro/getting-started-with-sphinx.html#using-markdown-with-sphinx)


## Build the documentation locally:

**Install Graphviz**

Using apt (Ubuntu / Debian):

```bash
sudo apt-get install graphviz
```

Using brew (Mac OS X):

```bash
sudo brew install graphviz
```

**Upgrade pip:**

```bash
sudo -H pip2 install --upgrade pip
sudo -H pip3 install --upgrade pip
```

**Install Typedoc**

```bash
npm install -g typedoc
```

**Install requirements:**

```bash
pip install -r requirements.txt

# using poetry
poetry install
```

Make sure you have the `dot` command from `graphviz`, `typedoc` and a basic `LaTeX` environment in your path!


**Build html:**

```bash
make html

# using poetry
poetry run sphinx-build . _build/html
SKIP_TYPEDOC=True poetry run sphinx-build . _build/html

# force full rebuild
poetry run sphinx-build -a _build/html
```


open `_build/html/index.html` in your browser

If the typescript documentation has changed please build the documentation locally and commit the new `typedoc.json`!

**Search for reference targets**

```bash
poetry run python -m sphinx.ext.intersphinx _build/html/objects.inv | grep search
```

**Update dependencies:**

```bash
poetry export --without-hashes --output=requirements.txt
```


## Enabled Extensions:

 *  sphinx.ext.intersphinx
 *  sphinx.ext.autosectionlabel
 *  sphinx.ext.todo
 *  sphinx.ext.imgmath
 *  sphinx.ext.graphviz
 *  myst (a markdown parser for sphinx)
 *  [sphinx_js](https://github.com/erikrose/sphinx-js)
