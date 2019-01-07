with import <nixpkgs> {};

let
  python-requirements = ps: with ps; let
    sphinx-js = with ps; buildPythonPackage rec {
      pname = "sphinx-js";
      version = "2.7";
      propagatedBuildInputs = [
          setuptools_scm
          sphinx
          parsimonious
      ];
      src = fetchPypi {
        inherit pname version;
        sha256 = "1hg7yc4kqz21wnvxkyzgwr78gy6zrvvpn16h7a322722xhv2xqpp";
      };
      doCheck = false;
    };
  in [
    docutils
    pygments
    sphinx
    recommonmark
    sphinx_rtd_theme
    sphinx-js
  ];

in buildEnv {
  name = "mico-docs-env";
  paths = [
    (python3.withPackages (ps: python-requirements ps))
    gnumake
    nodePackages.jsdoc
    #nodePackages.typedoc
  ];
}
