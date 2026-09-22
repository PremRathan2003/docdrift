import argparse
import logging

from .sync import sync


def main():
    parser = argparse.ArgumentParser(prog="dirsync")
    parser.add_argument("source")
    parser.add_argument("target")
    parser.add_argument("--dry-run", action="store_true", help="show what would change")
    parser.add_argument("--verbose", action="store_true", help="print every file")
    args = parser.parse_args()
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO)
    sync(args.source, args.target, dry_run=args.dry_run)
