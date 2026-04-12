#!/usr/bin/env python3
# -*- coding: utf-8 -*-
#
# This creates a Qt resources XML file.
#
# Usage:
#
# build-qt-resources.py output.qrc virtualpath1=realpath1 virtualpath2=realpath2 ...
#
# "output.qrc" will be overwritten. Each argument after the output file
# consists of a virtual path, which defines the resource prefix, and a real
# path (i.e. an actual file system path), which sets the source file or
# directory. If the real path is a file, the virtual path sets the full
# virtual file name. If the real path is a directory, the directory is
# scanned recursively, and all files are added, using the virtual path as
# prefix.

import os
import sys
from collections import OrderedDict
from xml.sax.saxutils import escape


def norm_prefix(path: str) -> str:
    path = path.replace("\\", "/")
    if not path.startswith("/"):
        path = "/" + path
    return os.path.normpath(path).replace("\\", "/")


def norm_fs(path: str) -> str:
    return os.path.normpath(path)


def split_virtual_path(virtual_path: str):
    virtual_path = virtual_path.replace("\\", "/")
    dirname, fname = os.path.split(virtual_path)
    dirname = dirname.replace("\\", "/")
    if not dirname.startswith("/"):
        dirname = "/" + dirname if dirname else "/"
    return dirname, fname


def collect_entries(virtual_path: str, real_path: str, entries: list):
    real_path = norm_fs(real_path)

    if not os.path.exists(real_path):
        print(f"warning: resource path does not exist: {real_path}", file=sys.stderr)
        return

    if os.path.isdir(real_path):
        for item in sorted(os.listdir(real_path)):
            child_real = os.path.join(real_path, item)
            child_virtual = os.path.join(virtual_path, item).replace("\\", "/")
            collect_entries(child_virtual, child_real, entries)
    else:
        prefix, alias = split_virtual_path(virtual_path)
        entries.append((prefix, alias, real_path))


def build_qrc(entries: list) -> bytes:
    grouped = OrderedDict()

    for prefix, alias, real_path in entries:
        grouped.setdefault(prefix, [])
        grouped[prefix].append((alias, real_path))

    lines = ["<RCC>"]
    for prefix, files in grouped.items():
        lines.append(f'<qresource prefix="{escape(prefix)}">')
        for alias, real_path in sorted(files, key=lambda x: x[0].lower()):
            lines.append(
                f' <file alias="{escape(alias)}">{escape(real_path)}</file>'
            )
        lines.append("</qresource>")
    lines.append("</RCC>")
    lines.append("")

    return "\n".join(lines).encode("utf-8")


def main():
    if len(sys.argv) < 2:
        print("usage: build-qt-resources.py output.qrc virtual=real [...]", file=sys.stderr)
        sys.exit(1)

    output_file = sys.argv[1]
    mappings = sys.argv[2:]

    entries = []

    for item in mappings:
        if "=" not in item:
            print(f"warning: skipping invalid argument (missing '='): {item}", file=sys.stderr)
            continue

        virtual_path, real_path = item.split("=", 1)
        virtual_path = norm_prefix(virtual_path)
        collect_entries(virtual_path, real_path, entries)

    result = build_qrc(entries)

    try:
        with open(output_file, "rb") as infile:
            if infile.read() == result:
                sys.exit(0)
    except IOError:
        pass

    with open(output_file, "wb") as outfile:
        outfile.write(result)


if __name__ == "__main__":
    main()