"""Settings package. Deliberately empty: submodules (`dev`, `test`, `prod`) are
always selected explicitly via DJANGO_SETTINGS_MODULE.

Importing anything here (e.g. `from .dev import *`) would execute
`base.py`'s `.env` loading as a side effect of resolving *any* settings
module — including `test`, whose whole job is deciding whether the process
environment (CI) or a local `.env` file provides the database. Keep it empty.
"""
